import type { PagesFunction } from "@cloudflare/workers-types";

/* ------------------------------------------------------------------
   /api/unsubscribe — newsletter unsubscribe endpoint.

   URL shape: /api/unsubscribe?e=<email>&t=<base64url HMAC-SHA256(email, UNSUBSCRIBE_SECRET)>

   Two-step flow:
   - GET: verify the token and show a confirmation page with a button.
     Does NOT mutate the database — important because Apple Mail Privacy
     Protection and other email clients prefetch links, which would
     otherwise silently unsubscribe people who only opened the email.
   - POST: actually removes the row from mailing_list (or flips
     marketing_opt_in to false — see DELETE_VS_FLAG below).

   The HMAC uses UNSUBSCRIBE_SECRET — a dedicated secret separate from
   GATE_COOKIE_SECRET, so the two trust domains don't overlap. Tokens
   carry no expiry — unsubscribe links should work forever, even on
   year-old emails.

   Stateless: no tokens table. Forwarding your unsubscribe email to a
   friend would let them unsubscribe you — not a real security concern.
   ------------------------------------------------------------------ */

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  UNSUBSCRIBE_SECRET: string;
};

// Flip to "flag" to keep the row but set marketing_opt_in=false
// (preserves the gate cookie consent + email-known state). "delete"
// fully removes them — cleanest for a true unsubscribe.
const DELETE_VS_FLAG: "delete" | "flag" = "flag";

const te = new TextEncoder();

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

/* Constant-time string compare. Plain `===` would short-circuit on the
   first mismatched byte, leaking timing info about the secret. crypto
   has no built-in for browser/Workers, so this is the pattern. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyToken(secret: string, email: string, token: string): Promise<boolean> {
  if (!email || !token) return false;
  const expected = await hmacSha256(secret, email.toLowerCase());
  return timingSafeEqual(expected, token);
}

/* Win98-styled confirmation page. Inline HTML so the function has zero
   asset dependencies — works even if the static site is mid-deploy. */
function page(opts: {
  status: "confirm" | "done" | "error";
  email?: string;
  token?: string;
  message?: string;
}): Response {
  const { status, email = "", token = "", message = "" } = opts;
  const title =
    status === "confirm" ? "Unsubscribe?" :
    status === "done"    ? "Unsubscribed" :
                           "Something went wrong";
  const body =
    status === "confirm"
      ? `
        <p>You're about to unsubscribe <b>${escapeHtml(email)}</b> from the Fork About and Find Out mailing list.</p>
        <p>Click the button below to confirm.</p>
        <form method="POST">
          <input type="hidden" name="e" value="${escapeHtml(email)}" />
          <input type="hidden" name="t" value="${escapeHtml(token)}" />
          <button class="btn" type="submit">Unsubscribe</button>
        </form>
      `
      : status === "done"
      ? `<p><b>${escapeHtml(email)}</b> has been removed from the mailing list.</p><p>Sorry to see you go.</p>`
      : `<p>${escapeHtml(message || "Invalid unsubscribe link.")}</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} — Fork About and Find Out</title>
<style>
  :root {
    --w98-bg: #008080;
    --w98-face: #c0c0c0;
    --w98-shadow: #808080;
    --w98-hilite: #ffffff;
    --w98-title: #000080;
    --w98-title-text: #ffffff;
  }
  html, body { margin: 0; padding: 0; background: var(--w98-bg); font-family: "MS Sans Serif", Tahoma, Verdana, Arial, sans-serif; color: #000; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
  .card {
    width: 100%;
    max-width: 480px;
    background: var(--w98-face);
    border: 2px solid var(--w98-hilite);
    box-shadow: inset -2px -2px 0 var(--w98-shadow), inset 2px 2px 0 var(--w98-hilite), 2px 2px 0 #000;
  }
  .titlebar {
    background: var(--w98-title); color: var(--w98-title-text);
    padding: 4px 8px; font-weight: 700; font-size: 13px;
  }
  .content { padding: 18px 22px; font-size: 13px; line-height: 1.5; }
  .content p { margin: 0 0 12px; }
  .btn {
    font-family: inherit; font-size: 13px;
    background: var(--w98-face); padding: 6px 18px; cursor: pointer;
    border: 2px solid; border-color: var(--w98-hilite) #000 #000 var(--w98-hilite);
    box-shadow: inset -1px -1px 0 var(--w98-shadow), inset 1px 1px 0 var(--w98-hilite);
  }
  .btn:active {
    border-color: #000 var(--w98-hilite) var(--w98-hilite) #000;
    box-shadow: inset 1px 1px 0 var(--w98-shadow);
  }
</style>
</head>
<body>
  <main class="card">
    <header class="titlebar">${title}</header>
    <div class="content">${body}</div>
  </main>
</body>
</html>`;

  const statusCode = status === "error" ? 400 : 200;
  return new Response(html, {
    status: statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* GET: verify token, show confirmation page. No DB writes. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const SECRET = (context.env.UNSUBSCRIBE_SECRET as string | undefined)?.trim();
    if (!SECRET) return page({ status: "error", message: "Server misconfigured." });

    const url = new URL(context.request.url);
    const email = (url.searchParams.get("e") || "").toLowerCase().trim();
    const token = (url.searchParams.get("t") || "").trim();

    if (!email || !token) return page({ status: "error", message: "Invalid unsubscribe link." });

    const valid = await verifyToken(SECRET, email, token);
    if (!valid) return page({ status: "error", message: "This unsubscribe link is invalid or has been tampered with." });

    return page({ status: "confirm", email, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return page({ status: "error", message: `Unexpected error: ${message}` });
  }
};

/* POST: re-verify token, mutate the DB. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const SUPABASE_URL = (context.env.SUPABASE_URL as string | undefined)?.trim();
    const SERVICE_KEY = (context.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined)?.trim();
    const SECRET = (context.env.UNSUBSCRIBE_SECRET as string | undefined)?.trim();
    if (!SUPABASE_URL || !SERVICE_KEY || !SECRET) {
      return page({ status: "error", message: "Server misconfigured." });
    }

    /* Accept either form-encoded (browser <form> submit) or JSON body. */
    let email = "";
    let token = "";
    const ct = context.request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await context.request.json().catch(() => ({} as any));
      email = String((body as any)?.e || "").toLowerCase().trim();
      token = String((body as any)?.t || "").trim();
    } else {
      const form = await context.request.formData();
      email = String(form.get("e") || "").toLowerCase().trim();
      token = String(form.get("t") || "").trim();
    }

    if (!email || !token) return page({ status: "error", message: "Invalid unsubscribe request." });

    const valid = await verifyToken(SECRET, email, token);
    if (!valid) return page({ status: "error", message: "This unsubscribe link is invalid or has been tampered with." });

    /* Call Supabase REST. Encode the email match value for the URL. */
    const filter = `email=eq.${encodeURIComponent(email)}`;

    let res: Response;
    if (DELETE_VS_FLAG === "delete") {
      res = await fetch(`${SUPABASE_URL}/rest/v1/mailing_list?${filter}`, {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
          prefer: "return=minimal",
        },
      });
    } else {
      res = await fetch(`${SUPABASE_URL}/rest/v1/mailing_list?${filter}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          marketing_opt_in: false,
          marketing_opt_in_at: null,
        }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      return page({ status: "error", message: `Database error (${res.status}): ${text}` });
    }

    return page({ status: "done", email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return page({ status: "error", message: `Unexpected error: ${message}` });
  }
};
