import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  GATE_COOKIE_SECRET: string;
};

const te = new TextEncoder();

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}

function base64urlToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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

async function verifyGateToken(token: string | null, secret: string) {
  if (!token) return false;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return false;

  const expected = await hmacSha256(secret, payloadB64);
  if (expected !== sigB64) return false;

  const payloadJson = new TextDecoder().decode(base64urlToBytes(payloadB64));
  let payload: any;
  try { payload = JSON.parse(payloadJson); } catch { return false; }

  if (typeof payload?.exp !== "number") return false;
  if (Math.floor(Date.now() / 1000) > payload.exp) return false;

  return true;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const secret = (env.GATE_COOKIE_SECRET as string | undefined)?.trim();
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: "Missing GATE_COOKIE_SECRET" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const token = getCookie(request, "fafo_gate");
  const ok = await verifyGateToken(token, secret);

  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 401,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};
