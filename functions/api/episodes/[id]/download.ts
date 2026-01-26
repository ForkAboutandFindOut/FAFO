import type { PagesFunction } from "@cloudflare/workers-types";
import { EPISODES } from "../../../_episodes";

type Env = {
  EPISODES_BUCKET: R2Bucket;
  GATE_COOKIE_SECRET: string;
};

const te = new TextEncoder();

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}

function base64url(bytes: ArrayBuffer) {
  let str = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

async function requireGate(req: Request, secret: string) {
  const token = getCookie(req, "fafo_gate");
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

function parseRange(rangeHeader: string, size: number) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!m) return null;

  const startStr = m[1];
  const endStr = m[2];

  if (startStr === "" && endStr !== "") {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0) return null;

  if (endStr === "") return { start, end: size - 1 };

  const end = Number(endStr);
  if (!Number.isFinite(end) || end < start) return null;

  return { start, end: Math.min(end, size - 1) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const ok = await requireGate(request, env.GATE_COOKIE_SECRET);
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const id = String(params.id || "");
  const ep = EPISODES.find((e) => e.id === id);
  if (!ep) return new Response("Not found", { status: 404 });

  const head = await env.EPISODES_BUCKET.head(ep.r2_key);
  if (!head) return new Response("Missing file", { status: 404 });

  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Content-Disposition": `attachment; filename="${ep.filename}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    const r = parseRange(rangeHeader, head.size);
    if (!r) return new Response("Range Not Satisfiable", { status: 416 });

    const length = r.end - r.start + 1;
    const obj = await env.EPISODES_BUCKET.get(ep.r2_key, { range: { offset: r.start, length } });
    if (!obj?.body) return new Response("Range Not Satisfiable", { status: 416 });

    return new Response(obj.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${r.start}-${r.end}/${head.size}`,
        "Content-Length": String(length),
      },
    });
  }

  const obj = await env.EPISODES_BUCKET.get(ep.r2_key);
  if (!obj?.body) return new Response("Missing file", { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(head.size),
    },
  });
};
