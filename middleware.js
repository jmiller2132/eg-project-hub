/* Vercel Routing Middleware: checks Microsoft sign-in before any page loads.
   All the logic is in auth/gate.js. Sign-in stays off until AUTH_CLIENT_ID is set in Vercel.
   Returning nothing lets the request continue to the page. */
import projects from "./auth/projects.gen.js";
import { gate } from "./auth/gate.js";

export const config = {
  matcher: ["/((?!api/auth/|signed-out\\.html|favicon\\.ico|favicon\\.svg|apple-touch-icon\\.png).*)"],
};

export default async function middleware(request) {
  const blocked = await gate(request, process.env, projects);
  if (blocked) return blocked;
}
