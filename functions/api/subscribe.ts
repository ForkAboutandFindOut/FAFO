import type { PagesFunction } from "@cloudflare/workers-types";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const onRequestGet: PagesFunction = async () => {
  return json({ ok: false, error: "Use POST" }, 405);
};

const textEncoder = new TextEncoder();

function base64url(bytes: ArrayBuffer) {
  let str = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(msg));
  return base64url(sig);
}

async function makeGateToken(secret: string, email: string) {
  const payload = {
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180
  };
  const payloadB64 = base64url(textEncoder.encode(JSON.stringify(payload)).buffer);
  const sigB64 = await hmacSha256(secret, payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export const onRequestPost: PagesFunction = async (context) => {
  const SUPABASE_URL = (context.env.SUPABASE_URL as string | undefined)?.trim();
  const SERVICE_KEY = (context.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined)?.trim();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
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
    return json({ ok: false, error: `Supabase insert failed (${res.status})`, details: text }, 502);
  }

  const secret = (context.env.GATE_COOKIE_SECRET as string | undefined)?.trim();
  if (!secret) return json({ ok: false, error: "Missing GATE_COOKIE_SECRET" }, 500);

  const token = await makeGateToken(secret, email);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `fafo_gate=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`,
    },
  });

