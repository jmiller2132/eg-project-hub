import { config, configProblems, finishLogin, errorPage } from "../../auth/core.js";
export default {
  async fetch(request) {
    const c = config();
    if (!c.enabled) return Response.redirect(new URL("/", request.url).toString(), 302);
    const p = configProblems(c);
    if (p.length) return errorPage("Sign-in isn't set up correctly yet: " + p.join(" "), 500);
    return finishLogin(request, c);
  },
};
