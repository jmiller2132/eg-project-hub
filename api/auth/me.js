/* Who's signed in, for the hub header. Always answers 200 so the browser console stays clean. */
import { config, readSession } from "../../auth/core.js";
export default {
  async fetch(request) {
    const c = config();
    const h = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    const s = c.enabled ? await readSession(request, c) : null;
    const body = s ? { enabled: true, signedIn: true, name: s.name, email: s.email, tenant: s.tenant, roles: s.roles }
                   : { enabled: c.enabled, signedIn: false };
    return new Response(JSON.stringify(body), { headers: h });
  },
};
