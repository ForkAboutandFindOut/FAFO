#!/usr/bin/env python3
"""
Send the FAFO newsletter via Resend.

Stdlib-only (no pip install) — matches tools/ convention.

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, UNSUBSCRIBE_SECRET
from a `.env` file at the repo root, OR from real environment variables (env
beats .env if both are set).

Pulls recipients from Supabase mailing_list WHERE marketing_opt_in = true,
builds an HMAC-signed unsubscribe URL per recipient (matches the format
verified by functions/api/unsubscribe.ts), and POSTs each one to Resend
with a scheduled_at timestamp.

Usage:
  # Dry run — print what would be sent, no network calls to Resend.
  python3 tools/send_newsletter.py --dry-run

  # Test send — single recipient, scheduled 2 min from now.
  python3 tools/send_newsletter.py --to-self
  # (defaults --to-self recipient to whatever email you hardcode in TEST_EMAIL)

  # Production send — full list, scheduled at the canonical UTC time.
  python3 tools/send_newsletter.py --schedule "2026-06-04T09:00:00Z"
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"

# Hardcoded for --to-self test sends. Override via --to flag.
TEST_EMAIL = "sashavarp7@gmail.com"
TEST_NAME = "Sasha"

# Public URL the unsubscribe link points to. Must match the deployed
# Cloudflare Function path. Change only if you move the function.
PUBLIC_URL = "https://forkaboutandfindout.co.uk"

# Sender identity. Domain must be verified in Resend.
FROM_ADDRESS = "Sasha <sasha@forkaboutandfindout.co.uk>"
REPLY_TO = "sasha@forkaboutandfindout.co.uk"

# Subject + body. Edit before each new episode. Body is plain text with
# {first_name} and {unsubscribe_url} placeholders — formatted per recipient.
SUBJECT = "'Dropping Out of Oxford' — ep 8 of Fork About and Find Out"

BODY_TEXT = """\
Hi {first_name},

Episode 8 is up: 'Dropping Out of Oxford' with Prince Kumar.

Three weeks ago Prince dropped out of Oxford in his first year to join microagi, a robotics startup building embodied AI. We opened on the dropout decision itself, dissecting his statement that Oxford lacks 'original thinking.' This led to a discussion on why UK startup ambition sits behind the US, or the Tall Poppy Syndrome as Prince labels it. We also touched on Prince's time at Entrepreneurs First, confirming the origins of his dropout mentality.

To listen to the full interview:

{public_url}/

lots of love :)
"""


# --- env loading -------------------------------------------------------

def load_env_file(path: pathlib.Path) -> dict[str, str]:
    """Bare-bones .env parser. Handles KEY=value, ignores blank lines and
    # comments, strips quotes. No interpolation."""
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        out[k] = v
    return out


def get_env(key: str, file_env: dict[str, str]) -> str:
    """Real env beats .env file."""
    return os.environ.get(key) or file_env.get(key, "")


# --- HMAC unsubscribe token (must match unsubscribe.ts verifyToken) ---

def base64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def make_unsubscribe_token(secret: str, email: str) -> str:
    """Mirrors hmacSha256 in functions/api/unsubscribe.ts."""
    sig = hmac.new(secret.encode("utf-8"), email.lower().encode("utf-8"), hashlib.sha256).digest()
    return base64url(sig)


def make_unsubscribe_url(public_url: str, email: str, token: str) -> str:
    qs = urllib.parse.urlencode({"e": email, "t": token})
    return f"{public_url}/api/unsubscribe?{qs}"


# --- Supabase ---------------------------------------------------------

def fetch_recipients(supabase_url: str, service_key: str) -> list[dict]:
    """SELECT email, name FROM mailing_list WHERE marketing_opt_in = true."""
    url = (
        f"{supabase_url}/rest/v1/mailing_list"
        f"?select=email,name&marketing_opt_in=eq.true"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "authorization": f"Bearer {service_key}",
            "accept": "application/json",
            "user-agent": "FAFO-newsletter/1.0 (+https://forkaboutandfindout.co.uk)",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


# --- Resend -----------------------------------------------------------

def resend_send_one(
    api_key: str,
    to: str,
    subject: str,
    text: str,
    unsubscribe_url: str,
    scheduled_at: str | None = None,
) -> dict:
    """POST one email to Resend. Returns the parsed JSON response.

    The List-Unsubscribe + List-Unsubscribe-Post headers signal one-click
    unsubscribe to mailbox providers (Gmail/Yahoo require this for bulk
    senders since 2024)."""
    payload = {
        "from": FROM_ADDRESS,
        "to": [to],
        "subject": subject,
        "text": text,
        "reply_to": REPLY_TO,
        "headers": {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }
    if scheduled_at:
        payload["scheduled_at"] = scheduled_at

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
            # Resend sits behind Cloudflare; the default urllib UA
            # ("Python-urllib/3.x") trips Cloudflare's WAF (error 1010).
            # A descriptive UA identifies the script and passes the check.
            "user-agent": "FAFO-newsletter/1.0 (+https://forkaboutandfindout.co.uk)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend {e.code}: {body}") from e


# --- main -------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Send FAFO newsletter via Resend.")
    p.add_argument(
        "--schedule",
        help="ISO8601 UTC time to deliver (e.g. '2026-06-04T09:00:00Z'). Omit to send immediately.",
    )
    p.add_argument(
        "--to-self",
        action="store_true",
        help=f"Send only to {TEST_EMAIL}, scheduled 2 min from now if --schedule omitted.",
    )
    p.add_argument(
        "--to",
        help="Override the test recipient (only meaningful with --to-self).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be sent without calling Resend.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    file_env = load_env_file(ENV_FILE)
    SUPABASE_URL = get_env("SUPABASE_URL", file_env)
    SERVICE_KEY = get_env("SUPABASE_SERVICE_ROLE_KEY", file_env)
    RESEND_API_KEY = get_env("RESEND_API_KEY", file_env)
    UNSUBSCRIBE_SECRET = get_env("UNSUBSCRIBE_SECRET", file_env)

    missing = [
        name for name, val in [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
            ("RESEND_API_KEY", RESEND_API_KEY),
            ("UNSUBSCRIBE_SECRET", UNSUBSCRIBE_SECRET),
        ] if not val
    ]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}", file=sys.stderr)
        print(f"  Put them in {ENV_FILE} or export them in your shell.", file=sys.stderr)
        return 2

    # Recipient list
    if args.to_self:
        recipients = [{"email": args.to or TEST_EMAIL, "name": TEST_NAME}]
        if not args.schedule:
            args.schedule = (datetime.now(timezone.utc) + timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
            print(f"  (--to-self with no --schedule: defaulting to +2 min → {args.schedule})")
    else:
        print(f"Fetching recipients from {SUPABASE_URL} ...")
        recipients = fetch_recipients(SUPABASE_URL, SERVICE_KEY)
        print(f"  {len(recipients)} opted-in recipients found.")

    if not recipients:
        print("No recipients. Aborting.")
        return 0

    print(f"From:      {FROM_ADDRESS}")
    print(f"Subject:   {SUBJECT}")
    print(f"Scheduled: {args.schedule or 'immediately'}")
    print(f"Recipients ({len(recipients)}):")
    for r in recipients:
        print(f"  - {r.get('email')}  ({r.get('name') or 'no name'})")

    if args.dry_run:
        print("\n(dry run — no Resend calls)")
        return 0

    if not args.to_self:
        confirm = input(f"\nProceed with sending to {len(recipients)} recipient(s)? Type 'yes' to confirm: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return 1

    print()
    ok = 0
    fail = 0
    for r in recipients:
        email = (r.get("email") or "").strip().lower()
        first_name = (r.get("name") or "there").split(" ")[0]
        if not email:
            continue
        token = make_unsubscribe_token(UNSUBSCRIBE_SECRET, email)
        unsub_url = make_unsubscribe_url(PUBLIC_URL, email, token)
        text = BODY_TEXT.format(
            first_name=first_name,
            public_url=PUBLIC_URL,
            unsubscribe_url=unsub_url,
        )
        try:
            res = resend_send_one(
                RESEND_API_KEY,
                to=email,
                subject=SUBJECT,
                text=text,
                unsubscribe_url=unsub_url,
                scheduled_at=args.schedule,
            )
            print(f"  OK  {email}  id={res.get('id', '?')}")
            ok += 1
        except Exception as e:
            print(f"  FAIL {email}  {e}")
            fail += 1

    print(f"\nDone. {ok} sent, {fail} failed.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
