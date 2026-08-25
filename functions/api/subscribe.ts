import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

const json = (data: unknown, status = 200) => {
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ ok: false, error: "Use POST" }, 405);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
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

    const marketingOptIn = !!body?.marketing_opt_in;
    const consentVersionRaw = String(body?.consent_version || "").trim();
    const consentVersion = consentVersionRaw || "mailing_list_v1";

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
        marketing_opt_in: marketingOptIn,
        consent_version: consentVersion,
        marketing_opt_in_at: marketingOptIn ? nowIso : null,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return json({ ok: false, error: `Supabase insert failed (${res.status})`, details: text }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    // Catch-all so the frontend sees a real JSON error instead of Cloudflare's
    // plain-text 502 (common when the upstream fetch to Supabase throws — e.g.
    // free-tier project paused after a week of inactivity).
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: "Subscribe handler crashed", details: message }, 500);
  }
};
