import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GATE_COOKIE_SECRET: string;
};

const json = (data: unknown, status = 200, extraHeaders?: HeadersInit) => {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
};

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ ok: false, error: "Use POST" }, 405);

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const SUPABASE_URL = (context.env.SUPABASE_URL as string | undefined)?.trim();
  const SERVICE_KEY = (context.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined)?.trim();
  const COOKIE_SECRET = (context.env.GATE_COOKIE_SECRET as string | undefined)?.trim();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500
    );
  }
  if (!COOKIE_SECRET) {
    return json({ ok: false, error: "Missing GATE_COOKIE_SECRET" }, 500);
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON" }, 400);
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();

  if (!email || !email.includes("@")) return json({ ok: false, error: "Invalid email" }, 400);
  if (name.length > 120) return json({ ok: false, error: "Name too long" }, 400);

  // Upsert into Supabase
  const url = `${SUPABASE_URL}/rest/v1/mailing_list?on_conflict=email`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ email, name: name || null }),
  });

  if (!res.ok) {
    const text = await res.text();
    return json(
      { ok: false, error: `Supabase insert failed (${res.status})`, details: text },
      502
    );
  }

  // ---- Cookie signing (HMAC-SHA256) ----
  const te = new TextEncoder();

  const base64url = (bytes: ArrayBuffer) => {
    let str = "";
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const hmacSha256 = async (secret: string, msg: string) => {
    const key = await crypto.subtle.importKey(
      "raw",
      te.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, te.encode(msg));
    return base64url(sig);
  };

  const makeGateToken = async (secret: string, emailAddr: string) => {
    const payload = {
      email: emailAddr,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180, // 180 days
    };
    const payloadB64 = base64url(te.encode(JSON.stringify(payload)).buffer);
    const sigB64 = await hmacSha256(secret, payloadB64);
    return `${payloadB64}.${sigB64}`;
  };

  const token = await makeGateToken(COOKIE_SECRET, email);

  // Build response headers (important: append Set-Cookie)
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-fafo-subscribe-version", "cookie-v3"); // debug: proves deploy

headers.append(
  "Set-Cookie",
  `fafo_gate=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`
);

// TEMP: prove deploy is live
return new Response(JSON.stringify({ ok: true, v: "cookie-v3" }), { status: 200, headers });
  status: 200,
  headers,
});

