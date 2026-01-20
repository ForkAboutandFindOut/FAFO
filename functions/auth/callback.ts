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
  if (options.httpOnly) attrs.push("HttpOnly");
  if (options.secure) attrs.push("Secure");
  attrs.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.maxAge) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.expires) attrs.push(`Expires=${new Date(options.expires).toUTCString()}`);
  return attrs.join("; ");
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Optional redirect target after auth
  const next = url.searchParams.get("next") ?? "/";

  // Supabase sends ?code=... for PKCE exchange
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing auth code", { status: 400 });
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
          setCookies.push(
            serializeCookie(name, value, { ...options, httpOnly: true, secure: true })
          ),
        remove: (name, options) =>
          setCookies.push(
            serializeCookie(name, "", { ...options, maxAge: 0, httpOnly: true, secure: true })
          ),
      },
    }
  );

  // ✅ Correct: exchange the *code* for a session
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return new Response(`Auth exchange failed: ${error.message}`, { status: 400 });
  }

  const res = Response.redirect(new URL(next, url.origin).toString(), 302);
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
};

