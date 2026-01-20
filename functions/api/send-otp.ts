export const onRequestPost: PagesFunction = async (context) => {
  const SUPABASE_URL = context.env.SUPABASE_URL as string | undefined;
  const SUPABASE_ANON_KEY = context.env.SUPABASE_ANON_KEY as string | undefined;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Cloudflare.", { status: 500 });
  }

  let body: any = {};
  try {
    body = await context.request.json();
  } catch {}

  const email = (body?.email || "").toString().trim();
  if (!email || !email.includes("@")) {
    return new Response("Invalid email.", { status: 400 });
  }

  const origin = new URL(context.request.url).origin;
  const redirectTo = `${origin}/auth/callback`; // keep it fixed (no querystring)

  const otpUrl = `${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`;

  const res = await fetch(otpUrl, {
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

  // Supabase intentionally returns success even if user exists/doesn't exist (anti-enumeration)
  if (!res.ok) {
    return new Response(`Supabase error (${res.status}): ${text}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
