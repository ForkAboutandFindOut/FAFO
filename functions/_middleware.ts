import type { PagesFunction } from "@cloudflare/workers-types";
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
  if (options.domain) attrs.push(`Domain=${options.domain}`);
  if (options.httpOnly) attrs.push("HttpOnly");
  if (options.secure) attrs.push("Secure");
  attrs.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.maxAge) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.expires) attrs.push(`Expires=${new Date(options.expires).toUTCString()}`);
  return attrs.join("; ");
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Public allowlist
  if (
    path === "/login" ||
    path === "/login/" ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/") ||
    path.match(/\.[a-zA-Z0-9]+$/) // assets: .css .js .png .ico etc
  ) {
    return next();
  }

  const requestCookies = parseCookies(request.headers.get("Cookie"));
  const setCookies: string[] = [];

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      get: (name) => requestCookies[name],
      set: (name, value, options) => setCookies.push(serializeCookie(name, value, options)),
      remove: (name, options) => setCookies.push(serializeCookie(name, "", { ...options, maxAge: 0 })),
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // IMPORTANT: even on redirect, forward any Set-Cookie headers (refresh etc.)
  if (!user) {
    const res = Response.redirect(new URL("/login", url.origin), 302);
    for (const c of setCookies) res.headers.append("Set-Cookie", c);
    return res;
  }

  const res = await next();
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
};

