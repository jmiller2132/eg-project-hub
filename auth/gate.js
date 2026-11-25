/* Runs before every page request (see middleware.js). Returns a Response to stop the request,
   or null to let it through to the page. Does nothing while sign-in is turned off. */
import { config, configProblems, readSession, filterProjects, protectedPaths, canSee, errorPage, safeNext } from "./core.js";

const PUBLIC = [/^\/api\/auth\//, /^\/signed-out\.html$/, /^\/favicon\.(ico|svg)$/, /^\/apple-touch-icon\.png$/];

export async function gate(request, env, projects, now = Date.now()) {
  const c = config(env);
  if (!c.enabled) return null;
  const url = new URL(request.url), path = url.pathname;
  if (PUBLIC.some(rx => rx.test(path))) return null;

  const problems = configProblems(c);
  if (problems.length) return errorPage("Sign-in isn't set up correctly yet: " + problems.join(" "), 500);

  /* One address for everyone, so the Microsoft redirect and sign-in cookie always match. */
  if (c.canonicalHost && c.production && url.host.toLowerCase() !== c.canonicalHost && !url.host.includes("-git-")) {
    return Response.redirect(`https://${c.canonicalHost}${path}${url.search}`, 308);
  }

  const session = await readSession(request, c, now);
  if (!session) {
    const wantsPage = (request.headers.get("accept") || "").includes("text/html") || path === "/" || path.endsWith(".html");
    if (!wantsPage) return new Response(JSON.stringify({ error: "signed out" }), { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const login = new URL("/api/auth/login", url);
    login.searchParams.set("next", safeNext(path + url.search));
    return Response.redirect(login.toString(), 302);
  }

  if (path === "/projects.json") {
    return new Response(JSON.stringify(filterProjects(projects, session.roles)), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  /* Match the locked-tool list however the address is spelled (%-encoding, //, trailing slash, no .html). */
  let clean = path;
  try { clean = decodeURIComponent(path); } catch { return errorPage("That address isn't valid.", 400); }
  clean = clean.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  const locked = protectedPaths(projects);
  const need = locked[clean] || locked[clean + ".html"];
  if (need && !canSee(session.roles, need)) {
    return errorPage("Your account doesn't have access to this tool. If you need it, ask Jeff to add you.", 403);
  }
  return null;
}
