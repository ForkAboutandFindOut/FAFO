# FAFO — Fork About and Find Out

Interview series in tech / AI / company creation. Live site: https://forkaboutandfindout.co.uk/. Repo: github.com/ForkAboutandFindOut/FAFO. Status: live, mostly maintenance.

## What I'll usually ask for help with

- Adding new episodes (`episodes.yml`, `docs/`, portraits, RSS).
- Frontend tweaks (HTML/CSS in `docs/`, mobile behavior, visuals).

## Layout

- `docs/` — static site (custom domain + GitHub Pages style). Entry is `docs/index.html`; the inline script at the top calls `/api/gate` and redirects to `/login/` if the visitor isn't allowed in.
- `functions/` — Cloudflare Pages Functions (TypeScript). API routes: `gate`, `send-otp`, `subscribe`, `episodes/`. Auth callback at `auth/callback.ts`. Site-wide `_middleware.ts`.
- `episodes.yml` — source of truth for the podcast feed.
- `tools/generate_feed.py` — generates `docs/feed.xml` from `episodes.yml`.
- `tools/transcribe.py` — transcribes a guest MP3 via AssemblyAI (see Transcription section).
- `package.json` — only dep is `@supabase/ssr` (used by the functions).

## Auth gate — how it actually works

Despite the filename `send-otp.ts`, there is **no real OTP**. Live flow:

1. `/login/` form → `POST /api/subscribe` with email + name.
2. `/api/subscribe` upserts to Supabase `mailing_list` table, then sets a HMAC-signed cookie `fafo_gate` (180 days).
3. Homepage inline script calls `/api/gate` to verify the cookie; on success caches `localStorage.fafo_access=1`.

So the gate is mailing-list capture, not authentication — anyone can type any email and get in. Don't break the "returning visitor skips login" path.

**Dead code:** `functions/api/send-otp.ts` and `functions/auth/callback.ts` aren't reached by the live login form. Either old or future. Don't delete without asking.

**Env vars (Cloudflare Pages dashboard):** `GATE_COOKIE_SECRET` (signs cookies — critical), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (used by `/api/subscribe` — full DB admin).

## Aesthetic direction

90s "windowcore", vibes-based (not strict Win98). Goal: full desktop simulation (taskbar, multiple windows, possibly Start menu) with modern UX underneath — no fake loading delays, no ironic gimmicks. Reference points: 98.css, 7.gui, aesthetic.computer. Done-state = "first friend reaction is 'whoa'". Desktop-first; mobile just needs to not break.

## Workflow facts

- Audio lives in Cloudflare R2; download endpoint streams from there.
- Visitor flow: land → enter email → site → download. Mailing list is collected, not yet sent to.
- Episode-add automation was written by Codex.
- Deploy: Cloudflare Pages connected to this GitHub repo, auto-builds on push to `main`.

## Don't blow it up

User is happy with how the site *functions* today. Don't propose functional changes unless there's a real issue or clear improvement — and even then, raise it first, don't just do it. Style/visual changes are in scope; behaviour changes are not.

## Scope license

- `docs/` HTML/CSS — refactor freely, split into separate files if helpful.
- Functions / auth — propose first.

## Local dev

Static-only preview (enough for styling, no functions):

```
cd docs && python3 -m http.server 8000
```

Visit `http://localhost:8000/`. The gate's `/api/gate` call will 404; bypass once via DevTools console: `localStorage.setItem("fafo_access","1"); location.reload();`.

For testing functions/auth locally, set up `wrangler` with a `.dev.vars` file (not done yet).

## Conventions

- Commits: short imperative subjects, no Conventional Commit prefixes (e.g. `Add ep006 Aarin episode and download metadata`).
- Branch: work on `main` directly unless I say otherwise.
- Media (logos, raw video, .xcf, .mov) lives in a sibling folder `~/Desktop/FAFO/`, not in this repo.
- Master media + interview files live in Google Drive: `~/Library/CloudStorage/GoogleDrive-sashavarp7@gmail.com/My Drive/FAFO/` (`Brand Assets/`, `Guests/`, `Sound Assets/`, `Windows Templates/`).
- Drive filing convention: guest folders are `epNNN <GuestNameNoSpace>/`, files inside are `epNNN_<GuestNameNoSpace>_<FullInterview|ClipNN|Transcript|AssemblyAI>.<ext>`. Unreleased guests keep a plain `<GuestNameNoSpace>/` folder until they're assigned a number.
- New scripts in `tools/` should be stdlib-only Python where possible (match `generate_feed.py` and `transcribe.py`) so no `pip install` is needed.

## Interview prep

Per-guest prep follows the template at `~/Library/CloudStorage/.../FAFO/Guests/_Interview_Template.md`. Three-topic structure (Topic 1 = current work, Topic 2 = past/pivot, Topic 3 = broader theme), three `[ANCHOR]` questions that can't be cut, and the closer must cash in the cold-open hook. Read the "Rules" block at the bottom of the template before every recording.

A retrospective audit lives at `~/Library/CloudStorage/.../FAFO/Guests/_Interview_Analysis.md`.

## Transcription

For each new episode MP3:

1. `export ASSEMBLYAI_API_KEY="..."` — keep in `~/.zshrc`, never paste in chat.
2. `python3 tools/transcribe.py <path-to-mp3>` — uploads, runs `universal-2` with `speaker_labels`, polls until done, writes `<base>_AssemblyAI.json` (raw, for analysis) + `<base>_Transcript.md` (speaker-labelled, shareable). ~45-min interview = ~$0.20, ~1 min wall-clock.
3. **AssemblyAI often over-splits one speaker into multiple IDs** (e.g. host = A, guest gets split across B and C). After the script runs, do a one-off Python pass to remap speakers to real names and merge consecutive same-speaker turns. See ep007 for the pattern.
4. Hand-pass for mishears before sharing with the guest — proper nouns and in-jokes are where the model misses. Spot-check by reading end-to-end at least once.
5. Send raw to the guest unless they ask for a cleaned version — let them flag their own preferred edits.
