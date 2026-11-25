import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../auth/core.js";
import { gate } from "../auth/gate.js";
import mw from "../middleware.js";

const TID_EG = "11111111-1111-1111-1111-111111111111", TID_EF = "22222222-2222-2222-2222-222222222222";
const env = { AUTH_CLIENT_ID: "app-123", AUTH_CLIENT_SECRET: "shh", AUTH_SECRET: "x".repeat(40), AUTH_TENANTS: `eg=${TID_EG}, ef=${TID_EF}` };
const c = A.config(env);
const projects = { sections: [
  { id: "apps", title: "Ops", items: [
    { name: "Open", url: "/tools/open.html" },
    { name: "SalesOnly", url: "/tools/sales.html", roles: ["sales"] },
    { name: "EF only", url: "/tools/ef.html", roles: ["tenant:ef"] } ] },
  { id: "mgmt", title: "Mgmt", roles: ["manager"], items: [
    { name: "Numbers", url: "/tools/numbers.html" },
    { name: "Override", url: "/tools/override.html", roles: ["sales"] } ] },
]};
const jwt = claims => "h." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig";
const req = (url, headers = {}) => new Request(url, { headers: { accept: "text/html", ...headers } });
const cookieFrom = (res, name) => {
  for (const h of res.headers.getSetCookie()) if (h.startsWith(name + "=")) return decodeURIComponent(h.split(";")[0].slice(name.length + 1));
};
async function sessionCookie(roles = [], tid = TID_EG) {
  return `${A.SESSION_COOKIE}=${encodeURIComponent(await A.seal(A.sessionFromClaims({ tid, name: "Pat", preferred_username: "pat@x", roles }, c), c.secret))}`;
}

/* Full round trip: login -> Microsoft -> callback, with a fake token endpoint. */
async function roundTrip(claimsFn, { tamperState = false } = {}) {
  const start = await A.startLogin(req("https://hub.example.com/api/auth/login?next=/tools/open.html%3Fa=1"), c);
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get("location"));
  assert.equal(auth.origin + auth.pathname, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("redirect_uri"), "https://hub.example.com/api/auth/callback");
  const state = auth.searchParams.get("state"), nonce = auth.searchParams.get("nonce");
  const flow = cookieFrom(start, A.STATE_COOKIE);
  let sentBody;
  const fakeFetch = async (u, o) => { sentBody = new URLSearchParams(o.body); return Response.json({ id_token: jwt(claimsFn(nonce)) }); };
  const cb = req(`https://hub.example.com/api/auth/callback?code=abc&state=${tamperState ? "evil" : state}`, { cookie: `${A.STATE_COOKIE}=${encodeURIComponent(flow)}` });
  const res = await A.finishLogin(cb, c, fakeFetch);
  return { res, sentBody };
}
const good = (tid = TID_EG, extra = {}) => nonce => ({ tid, iss: `https://login.microsoftonline.com/${tid}/v2.0`, aud: "app-123", nonce, exp: Math.floor(Date.now() / 1000) + 3600, name: "Pat Smith", preferred_username: "pat@eg.com", oid: "o1", roles: ["Sales"], ...extra });

test("sign-in off: gate lets everything through", async () => {
  assert.equal(await gate(req("https://x.com/"), {}, projects), null);
  assert.equal(await gate(req("https://x.com/tools/sales.html"), {}, projects), null);
  assert.equal(await mw(req("https://x.com/")), undefined);
});

test("misconfigured: clear error page instead of an open site", async () => {
  const r = await gate(req("https://x.com/"), { AUTH_CLIENT_ID: "a" }, projects);
  assert.equal(r.status, 500);
  assert.match(await r.text(), /AUTH_SECRET/);
});

test("good round trip sets a session and returns to the page", async () => {
  const { res, sentBody } = await roundTrip(good());
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/tools/open.html?a=1");
  assert.ok(sentBody.get("code_verifier").length > 40);
  const s = await A.unseal(cookieFrom(res, A.SESSION_COOKIE), c.secret);
  assert.equal(s.name, "Pat Smith"); assert.equal(s.tenant, "eg");
  assert.deepEqual(s.roles.sort(), ["sales", "tenant:eg"]);
  assert.ok(res.headers.getSetCookie().some(h => h.startsWith("__Host-eg_session=") && /HttpOnly; Secure; SameSite=Lax/.test(h)));
});

test("second tenant works and gets its own tenant role", async () => {
  const { res } = await roundTrip(good(TID_EF));
  const s = await A.unseal(cookieFrom(res, A.SESSION_COOKIE), c.secret);
  assert.equal(s.tenant, "ef"); assert.ok(s.roles.includes("tenant:ef"));
});

test("callback rejects: wrong tenant, issuer, audience, nonce, expired, state", async () => {
  const cases = [
    [good("33333333-3333-3333-3333-333333333333"), /isn't from an Eagle Graphics/],
    [n => ({ ...good()(n), iss: "https://evil/v2.0" }), /issuer/],
    [n => ({ ...good()(n), aud: "other-app" }), /different app/],
    [() => good()("wrong-nonce"), /another tab/],
    [n => ({ ...good()(n), exp: 1000 }), /expired/],
  ];
  for (const [fn, rx] of cases) {
    const { res } = await roundTrip(fn);
    assert.equal(res.status, 403); assert.match(await res.text(), rx);
    assert.equal(cookieFrom(res, A.SESSION_COOKIE), undefined);
  }
  const { res } = await roundTrip(good(), { tamperState: true });
  assert.equal(res.status, 400);
});

test("callback without the flow cookie fails safely", async () => {
  const r = await A.finishLogin(req("https://h.com/api/auth/callback?code=a&state=b"), c, async () => { throw new Error("should not call"); });
  assert.equal(r.status, 400);
});

test("Microsoft 'not assigned' error gets a plain message", async () => {
  const r = await A.finishLogin(req("https://h.com/api/auth/callback?error=access_denied&error_description=AADSTS50105:+x"), c);
  assert.match(await r.text(), /Ask Jeff to add you/);
});

test("tampered, forged and expired session cookies are refused", async () => {
  const real = await A.seal({ name: "a", roles: ["admin"], exp: Math.floor(Date.now() / 1000) + 99 }, c.secret);
  const [body, sig] = real.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ name: "a", roles: ["admin"], exp: 9e9 })).toString("base64url");
  assert.ok(await A.unseal(real, c.secret));
  assert.equal(await A.unseal(forgedBody + "." + sig, c.secret), null);
  assert.equal(await A.unseal(body + "." + sig.slice(0, -2) + "AA", c.secret), null);
  assert.equal(await A.unseal(real, "y".repeat(40)), null);
  assert.equal(await A.unseal(await A.seal({ exp: 1 }, c.secret), c.secret), null);
  assert.equal(await A.unseal("garbage", c.secret), null);
});

test("next= can't send people to another site", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/a\r\nSet-Cookie:x", "/api/auth/logout", null])
    assert.equal(A.safeNext(bad), "/");
  assert.equal(A.safeNext("/tools/a.html?x=1"), "/tools/a.html?x=1");
});

test("signed out: pages redirect to login, data gets 401, public pages stay open", async () => {
  const r = await gate(req("https://h.com/tools/open.html"), env, projects);
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get("location")).searchParams.get("next"), "/tools/open.html");
  const j = await gate(new Request("https://h.com/projects.json", { headers: { accept: "*/*" } }), env, projects);
  assert.equal(j.status, 401);
  for (const p of ["/signed-out.html", "/favicon.svg", "/api/auth/login"]) assert.equal(await gate(req("https://h.com" + p), env, projects), null);
});

test("roles: cards filtered and blocked by direct URL", async () => {
  const plain = await sessionCookie([]);
  const list = await (await gate(req("https://h.com/projects.json", { cookie: plain }), env, projects)).json();
  assert.deepEqual(list.sections.map(s => s.id), ["apps"]);
  assert.deepEqual(list.sections[0].items.map(x => x.name), ["Open"]);
  assert.equal(await gate(req("https://h.com/tools/open.html", { cookie: plain }), env, projects), null);
  for (const p of ["/tools/sales.html", "/tools/numbers.html", "/tools/ef.html"])
    assert.equal((await gate(req("https://h.com" + p, { cookie: plain }), env, projects)).status, 403, p);

  for (const p of ["/tools/%73ales.html", "//tools//sales.html", "/tools/sales.html/", "/tools/sales"])
    assert.equal((await gate(req("https://h.com" + p, { cookie: plain }), env, projects)).status, 403, p);
  assert.equal((await gate(req("https://h.com/tools/%E0%A4%A.html", { cookie: plain }), env, projects)).status, 400);

  const sales = await sessionCookie(["sales"]);
  assert.equal(await gate(req("https://h.com/tools/sales.html", { cookie: sales }), env, projects), null);
  assert.equal(await gate(req("https://h.com/tools/override.html", { cookie: sales }), env, projects), null, "card roles beat section roles for direct URL");
  assert.equal((await gate(req("https://h.com/tools/numbers.html", { cookie: sales }), env, projects)).status, 403);

  const ef = await sessionCookie([], TID_EF);
  assert.equal(await gate(req("https://h.com/tools/ef.html", { cookie: ef }), env, projects), null);

  const admin = await sessionCookie(["Admin"]);
  const all = await (await gate(req("https://h.com/projects.json", { cookie: admin }), env, projects)).json();
  assert.equal(all.sections.flatMap(s => s.items).length, 5);
});

test("canonical host redirect only in production, not on branch previews", async () => {
  const e = { ...env, AUTH_CANONICAL_HOST: "hub.egpromo.com", VERCEL_ENV: "production" };
  const r = await gate(req("https://eg-project-hub.vercel.app/tools/a.html?x=1"), e, projects);
  assert.equal(r.status, 308); assert.equal(r.headers.get("location"), "https://hub.egpromo.com/tools/a.html?x=1");
  assert.equal((await gate(req("https://eg-project-hub-git-microsoft-login-eagle-graphics.vercel.app/"), e, projects)).status, 302);
  assert.equal((await gate(req("https://eg-project-hub.vercel.app/"), { ...e, VERCEL_ENV: "preview" }, projects)).status, 302);
});

test("logout clears the session", () => {
  const r = A.logout();
  assert.equal(r.headers.get("location"), "/signed-out.html");
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
});

test("real projects.json: nothing role-limited yet, so everyone sees all 16 cards", async () => {
  const { default: real } = await import("../auth/projects.gen.js");
  const f = A.filterProjects(real, ["tenant:eg"]);
  assert.equal(f.sections.flatMap(s => s.items).filter(x => !x.hidden).length, 16);
});
