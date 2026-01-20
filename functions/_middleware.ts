export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ✅ Always allow API + auth callback routes (no login redirect)
  if (path.startsWith("/api/")) return next();
  if (path.startsWith("/auth/")) return next();

  // ✅ Always allow the login page itself + obvious public assets
  if (path === "/login") return next();
  if (path === "/") return next(); // optional: only if you want homepage public
  if (path.includes(".")) return next(); // css/js/png/favicon etc.

  // --- your existing auth gating logic below ---
  // if not logged in -> redirect to /login
  // else -> return next()
}

import { createServerClient } from "@supabase/ssr";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(v.join("=") || "");
  }
  return out;
}

function serializeCookie(name: string, value: string, options: any = {}) {
  const attrs: string[] = [];
  attrs.push(`${name}=${encodeURIComponent(value)}`);
  attrs.push(`Path=${options.path ?? "/"}`);
  if (options.httpOnly) attrs.push("HttpOnly");
  if (options.secure) attrs.push("Secure");
  attrs.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.maxAge) attrs.push(`Max-Age=${options.maxAge}`);
  return attrs.join("; ");
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Allow login + callback to be public
  if (path.startsWith("/login") || path.startsWith("/auth/callback")) {
    return context.next();
  }

  const requestCookies = parseCookies(context.request.headers.get("Cookie"));
  const setCookies: string[] = [];

  const supabase = createServerClient(
    context.env.SUPABASE_URL as string,
    context.env.SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get: (name) => requestCookies[name],
        set: (name, value, options) =>
          setCookies.push(serializeCookie(name, value, { ...options, httpOnly: true, secure: true })),
        remove: (name, options) =>
          setCookies.push(serializeCookie(name, "", { ...options, maxAge: 0, httpOnly: true, secure: true })),
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return Response.redirect(`${url.origin}/login/`, 302);
  }

  const res = await context.next();
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
};
