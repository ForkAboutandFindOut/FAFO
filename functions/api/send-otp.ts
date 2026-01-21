import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction = async () => {
  return new Response("Use POST /api/send-otp", { status: 405 });
};

export const onRequestPost: PagesFunction = async (context) => {
  const SUPABASE_URL = (context.env.SUPABASE_URL as string | undefined)?.trim();
  const SUPABASE_ANON_KEY = (context.env.SUPABASE_ANON_KEY as string | undefined)?.trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in Cloudflare Pages env." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!SUPABASE_URL.startsWith("https://")) {
    return new Response(
      JSON.stringify({ ok: false, error: "SUPABASE_URL must start with https://", SUPABASE_URL }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any = {};
  try {
    body = await context.request.json();
  } catch {
    // ignore
  }

  const email = (body?.email || "").toString().trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid email." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = new URL(context.request.url).origin;
  const redirectTo = `${origin}/auth/callback`;

  // Build: https://<project>.supabase.co/auth/v1/otp?redirect_to=...
  const otpUrl = new URL("/auth/v1/otp", SUPABASE_URL);
  otpUrl.searchParams.set("redirect_to", redirectTo);

  try {
    const res = await fetch(otpUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        create_user: true,
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      // Surface Supabase's actual error back to the browser
      return new Response(
        JSON.stringify({ ok: false, status: res.status, supabase: text }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // This is the key: instead of Cloudflare generic 502, you get the real reason
    return new Response(
      JSON.stringify({ ok: false, error: "Fetch to Supabase failed", detail: String(err?.message || err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};
