/* Microsoft (Entra ID) sign-in for the Eagle Graphics hub.
 *
 * Login is OFF until AUTH_CLIENT_ID is set in Vercel, so this file can ship before setup is finished.
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   AUTH_CLIENT_ID      Application (client) ID of the "Eagle Hub" app registration
 *   AUTH_CLIENT_SECRET  Client secret value from that app registration
 *   AUTH_TENANTS        Allowed Microsoft tenants as alias=tenant-id pairs, comma separated:
 *                         eg=11111111-...,ef=22222222-...
 *                       The alias becomes a role ("tenant:eg") so cards can be limited to one company.
 *   AUTH_SECRET         Long random string (40+ characters) used to sign the sign-in cookie
 *   AUTH_CANONICAL_HOST Optional, e.g. hub.egpromo.com. Production visits to any other address
 *                       (like eg-project-hub.vercel.app) are sent there.
 *
 * Roles come from Entra "app roles" assigned to people or groups in each tenant (claim: roles).
 * In projects.json, a section or card with "roles": ["sales"] is only shown to, and only opens for,
 * people with one of those roles. People with the "admin" role see everything.
 */

export const SESSION_COOKIE = "__Host-eg_session";
export const STATE_COOKIE = "__Host-eg_auth";
export const SESSION_HOURS = 12;
const AUTHORITY = "https://login.microsoftonline.com";

const enc = new TextEncoder(), dec = new TextDecoder();

export function config(env = process.env) {
  const tenants = {};
  for (const part of String(env.AUTH_TENANTS || "").split(",")) {
    const [alias, id] = part.split("=").map(s => (s || "").trim());
    if (alias && id) tenants[id.toLowerCase()] = alias.toLowerCase();
  }
  return {
    enabled: !!env.AUTH_CLIENT_ID,
    clientId: env.AUTH_CLIENT_ID || "",
    clientSecret: env.AUTH_CLIENT_SECRET || "",
    secret: env.AUTH_SECRET || "",
    tenants,
    canonicalHost: (env.AUTH_CANONICAL_HOST || "").toLowerCase(),
    production: env.VERCEL_ENV === "production",
  };
}

/* Setup mistakes that would make sign-in fail or be unsafe. Empty array = ready. */
export function configProblems(c) {
  const p = [];
  if (!c.clientSecret) p.push("AUTH_CLIENT_SECRET is not set.");
  if (c.secret.length < 32) p.push("AUTH_SECRET must be at least 32 characters.");
  if (!Object.keys(c.tenants).length) p.push("AUTH_TENANTS has no tenants (format: eg=tenant-id,ef=tenant-id).");
  return p;
}

/* ---------- small helpers ---------- */
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = s => b64url(enc.encode(s));
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
/* Signed, expiring value: base64url(json).base64url(hmac). */
export async function seal(obj, secret) {
  const body = b64urlText(JSON.stringify(obj));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64url(sig);
}
export async function unseal(token, secret, now = Date.now()) {
  if (!token || !secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(sig), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  let obj; try { obj = JSON.parse(dec.decode(unb64url(body))); } catch { return null; }
  if (!obj || typeof obj.exp !== "number" || obj.exp * 1000 < now) return null;
  return obj;
}

export function getCookie(request, name) {
  const h = request.headers.get("cookie") || "";
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
export function setCookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/* Only same-site relative paths, so the sign-in page can't be used to bounce people to another site. */
export function safeNext(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\r\n]/.test(next) || next.startsWith("/api/auth/")) return "/";
  return next;
}

export function originOf(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
export const redirectUri = request => originOf(request) + "/api/auth/callback";

/* ---------- sign-in flow ---------- */
async function pkceChallenge(verifier) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
}

export async function startLogin(request, c, now = Date.now()) {
  const url = new URL(request.url);
  const state = randomToken(), nonce = randomToken(), verifier = randomToken(48);
  const next = safeNext(url.searchParams.get("next") || "/");
  const sealed = await seal({ state, nonce, verifier, next, exp: Math.floor(now / 1000) + 600 }, c.secret);
  const auth = new URL(`${AUTHORITY}/organizations/oauth2/v2.0/authorize`);
  auth.search = new URLSearchParams({
    client_id: c.clientId, response_type: "code", response_mode: "query",
    redirect_uri: redirectUri(request), scope: "openid profile email",
    state, nonce, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return new Response(null, { status: 302, headers: { Location: auth.toString(), "Set-Cookie": setCookie(STATE_COOKIE, sealed, 600), "Cache-Control": "no-store" } });
}

export function decodeJwtPayload(jwt) {
  const part = String(jwt || "").split(".")[1];
  if (!part) throw new Error("No ID token returned.");
  return JSON.parse(dec.decode(unb64url(part)));
}

/* Checks the ID token. It comes straight from Microsoft's token endpoint over HTTPS in exchange for
   our client secret, so (per OpenID Connect) its claims are trusted without fetching signing keys. */
export function checkIdToken(claims, c, nonce, now = Date.now()) {
  const tid = String(claims.tid || "").toLowerCase();
  if (!c.tenants[tid]) return "Your Microsoft account isn't from an Eagle Graphics company. Sign in with your work account.";
  if (claims.iss !== `${AUTHORITY}/${tid}/v2.0`) return "Sign-in token came from an unexpected issuer.";
  if (claims.aud !== c.clientId) return "Sign-in token was issued for a different app.";
  if (!claims.nonce || claims.nonce !== nonce) return "Sign-in expired or was started in another tab. Try again.";
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now - 60000) return "Sign-in token expired. Try again.";
  return null;
}

export function sessionFromClaims(claims, c, now = Date.now()) {
  const tid = String(claims.tid).toLowerCase();
  const roles = [...new Set([...(Array.isArray(claims.roles) ? claims.roles : []).map(r => String(r).toLowerCase()), "tenant:" + c.tenants[tid]])];
  return {
    name: claims.name || claims.preferred_username || "Signed in",
    email: claims.preferred_username || claims.email || "",
    tenant: c.tenants[tid], tid, oid: claims.oid || "", roles,
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_HOURS * 3600,
  };
}

export async function finishLogin(request, c, fetchImpl = fetch, now = Date.now()) {
  const url = new URL(request.url);
  const flow = await unseal(getCookie(request, STATE_COOKIE), c.secret, now);
  const clearState = setCookie(STATE_COOKIE, "", 0);
  const fail = (msg, status = 400) => errorPage(msg, status, clearState);
  if (url.searchParams.get("error")) return fail(friendlyAadError(url.searchParams.get("error"), url.searchParams.get("error_description")), 403);
  if (!flow) return fail("Sign-in took too long or cookies are blocked. Try again.");
  if (!url.searchParams.get("state") || url.searchParams.get("state") !== flow.state) return fail("Sign-in was started in another tab. Try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Microsoft didn't return a sign-in code. Try again.");

  const res = await fetchImpl(`${AUTHORITY}/organizations/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code",
      code, redirect_uri: redirectUri(request), code_verifier: flow.verifier, scope: "openid profile email",
    }).toString(),
  });
  let tok; try { tok = await res.json(); } catch { tok = {}; }
  if (!res.ok || !tok.id_token) return fail(friendlyAadError(tok.error, tok.error_description), 502);

  let claims; try { claims = decodeJwtPayload(tok.id_token); } catch { return fail("Microsoft returned an unreadable sign-in token.", 502); }
  const problem = checkIdToken(claims, c, flow.nonce, now);
  if (problem) return fail(problem, 403);

  const session = await seal(sessionFromClaims(claims, c, now), c.secret);
  const headers = new Headers({ Location: safeNext(flow.next), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearState);
  headers.append("Set-Cookie", setCookie(SESSION_COOKIE, session, SESSION_HOURS * 3600));
  return new Response(null, { status: 302, headers });
}

function friendlyAadError(code, desc) {
  const d = String(desc || "");
  if (/AADSTS50105/.test(d)) return "You haven't been given access to the hub yet. Ask Jeff to add you.";
  if (/AADSTS65001|AADSTS90094/.test(d)) return "An administrator needs to approve the hub for your company's Microsoft account first.";
  if (/AADSTS50011/.test(d)) return "The hub's address isn't registered with Microsoft yet (redirect URI mismatch). Tell Jeff.";
  if (/AADSTS7000215|AADSTS7000222/.test(d)) return "The hub's Microsoft client secret is wrong or expired. Tell Jeff.";
  if (code === "access_denied") return "Sign-in was cancelled or access was denied.";
  return "Microsoft sign-in failed" + (code ? ` (${code})` : "") + ". Try again, and tell Jeff if it keeps happening.";
}

export async function readSession(request, c, now = Date.now()) {
  return unseal(getCookie(request, SESSION_COOKIE), c.secret, now);
}

export function logout() {
  return new Response(null, { status: 302, headers: { Location: "/signed-out.html", "Set-Cookie": setCookie(SESSION_COOKIE, "", 0), "Cache-Control": "no-store" } });
}

/* ---------- roles ---------- */
export function canSee(userRoles, needed) {
  if (!Array.isArray(needed) || !needed.length) return true;
  const have = new Set((userRoles || []).map(r => String(r).toLowerCase()));
  if (have.has("admin")) return true;
  return needed.some(r => have.has(String(r).toLowerCase()));
}

/* projects.json with only the sections and cards this person may see. */
export function filterProjects(data, roles) {
  return {
    ...data,
    sections: (data.sections || []).filter(s => canSee(roles, s.roles)).map(s => ({
      ...s, items: (s.items || []).filter(x => canSee(roles, x.roles)),
    })),
  };
}

/* Hosted file path -> roles needed to open it, from projects.json. A card's own roles win over its section's. */
export function protectedPaths(data) {
  const map = {};
  for (const s of data.sections || []) for (const x of s.items || []) {
    const need = (x.roles && x.roles.length) ? x.roles : s.roles;
    if (x.url && x.url.startsWith("/") && need && need.length) map[x.url.split(/[?#]/)[0]] = need;
  }
  return map;
}

/* ---------- pages ---------- */
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
export function errorPage(message, status = 400, setCookieHeader) {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);
  const title = status === 403 ? "No Access" : "Sign-In Problem";
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Eagle Graphics</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#2a2d2e;font:400 15px/1.7 "Open Sans",Arial,sans-serif;color:#e1e3e4;padding:24px}main{max-width:480px;background:#3a3e40;border:1px solid #53585a;border-radius:4px;padding:32px}h1{margin:0 0 4px;font:800 22px/1.2 "Jost","Century Gothic",sans-serif;text-transform:uppercase;letter-spacing:.02em;color:#fff}.bar{width:48px;height:3px;background:#76bd1d;margin:12px 0 16px}p{margin:0 0 20px}a{display:inline-block;background:#4a7812;color:#fff;text-decoration:none;font:700 12px/1 "Jost",sans-serif;text-transform:uppercase;letter-spacing:.1em;padding:14px 18px;border-radius:3px;margin-right:8px}a.alt{background:transparent;border:1px solid #7d8183}a:hover{background:#365711}</style></head>
<body><main><h1>${title}</h1><div class="bar"></div><p>${esc(message)}</p><a href="/">Back to the Hub</a><a class="alt" href="/api/auth/logout">Sign Out</a></main></body></html>`, { status, headers });
}
