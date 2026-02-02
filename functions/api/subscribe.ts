import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GATE_COOKIE_SECRET: string;
};

const te = new TextEncoder();

const json = (data: unknown, status = 200) => {
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
};

function base64url(bytes: ArrayBuffer) {
  let str = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(msg));
  return base64url(sig);
}

async function makeGateToken(secret: string, email: string) {
  const payload = {
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180, // 180 days
  };
  const payloadB64 = base64url(te.encode(JSON.stringify(payload)).buffer);
  const sigB64 = await hmacSha256(secret, payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ ok: false, error: "Use POST" }, 405);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const SUPABASE_URL = (context.env.SUPABASE_URL as string | undefined)?.trim();
  const SERVICE_KEY = (context.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined)?.trim();
  const COOKIE_SECRET = (context.env.GATE_COOKIE_SECRET as string | undefined)?.trim();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
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

  // NEW: marketing opt-in + consent version
  const marketingOptIn = !!body?.marketing_opt_in;
  const consentVersionRaw = String(body?.consent_version || "").trim();
  const consentVersion = consentVersionRaw || "login_updates_v1";

  if (!email || !email.includes("@")) return json({ ok: false, error: "Invalid email" }, 400);
  if (name.length > 120) return json({ ok: false, error: "Name too long" }, 400);
  if (consentVersion.length > 64) return json({ ok: false, error: "Consent version too long" }, 400);

  const url = `${SUPABASE_URL}/rest/v1/mailing_list?on_conflict=email`;

  const nowIso = new Date().toISOString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      email,
      name: name || null,

      // NEW columns
      marketing_opt_in: marketingOptIn,
      consent_version: consentVersion,

      // If they opt-in now, store a timestamp; if not, leave it null.
      // (If you’d rather preserve old opt-in timestamps, tell me and I’ll tweak this.)
      marketing_opt_in_at: marketingOptIn ? nowIso : null,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return json({ ok: false, error: `Supabase insert failed (${res.status})`, details: text }, 502);
  }

  const token = await makeGateToken(COOKIE_SECRET, email);

  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-fafo-subscribe-version", "cookie-v4"); // bump for deploy debug

  headers.append(
    "Set-Cookie",
    `fafo_gate=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`
  );

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
