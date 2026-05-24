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

**Supabase free-tier auto-pause:** the project pauses after ~1 week of inactivity. Symptom: `POST /api/subscribe` returns Cloudflare's plain-text `502` (not the function's JSON), so the login form shows the generic "Something went wrong." fallback. Fix: Supabase dashboard → Restore project, wait ~1 min, retry. `subscribe.ts` wraps its body in a top-level try/catch so other runtime errors return a real JSON `{ok:false, error, details}` instead of falling through to Cloudflare's 502 — but a paused project still won't accept writes. Prevention: `.github/workflows/keepalive-supabase.yml` pings the REST API every 3 days (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set as GitHub Actions secrets).

## Aesthetic direction

90s "windowcore", vibes-based (not strict Win98). Goal: full desktop simulation (taskbar, multiple windows, possibly Start menu) with modern UX underneath — no fake loading delays, no ironic gimmicks. Reference points: 98.css, 7.gui, aesthetic.computer. Done-state = "first friend reaction is 'whoa'". Desktop-first; mobile just needs to not break.

## Login dialog

`/login/index.html` is a Win98 "Enter Network Password" dialog (~480px). Empty navy titlebar (intentional — no title, no controls), spinning logo (96px) as the left icon, three fields on the right (**First name**, **Last name**, **Email**), mailing-list checkbox, single **OK** (no Cancel).

- First/last name fields are **concatenated client-side** into a single `name` string before POST to `/api/subscribe`. The Supabase `mailing_list` table still stores `name`. Splitting into `first_name`/`last_name` columns is a propose-first change to `subscribe.ts` + schema.
- Checkbox is 18×18 with `accent-color: #000080`. A JS click handler on `.checkrow` toggles the box from clicks **anywhere on the row** (label, gap, emoji); clicks on the checkbox itself fall through to native — no double-toggle.
- Custom FAFO cursor everywhere via `*{ cursor: url(...) 0 0, auto }`. Don't override with `pointer` — visual consistency wins over click affordance.
- On successful submit, `runBootSequence(firstName)` plays before the redirect (see Boot sequence below).

## Wow-factor roadmap

Path to the "Aesthetic direction" desktop-sim goal. Phased:

- **A — Login as Win98 dialog.** Done, deployed (see Login dialog above).
- **B — Boot sequence transition.** Done, deployed (see Boot sequence below).
- **E — Floating decorative desktop windows** (deferred). Ambient windows scattered behind main content (Solitaire auto-playing, MS Paint of logo, Notepad with guest quote). Pairs with the eventual full desktop sim.

## Boot sequence

Plays once between login-submit success and the homepage redirect. ~3.5s total. Lives entirely in `docs/login/index.html` — CSS `.boot-screen` + JS `runBootSequence(firstName)`. Returning visitors are caught by the existing `checkGate()` IIFE at the top of the file and never see it (no `sessionStorage` flag needed).

- **Font:** Pixel Operator 8 (already in `/assets/`) at 16px — clean 2× of its native 8px so it stays crisp. `text-shadow: 1px 0 0 currentColor` simulates bold without faux-bolding the pixel glyphs, which would look terrible.
- **Typing uses `requestAnimationFrame`, not `setTimeout`.** Per-char `setTimeout(fn, ~11ms)` gets clamped to ~16ms+ on most browsers and aggressively throttled in background tabs — would stretch a 3.5s sequence to 15s+. rAF runs at the display refresh rate and adds however many chars the requested `cps` requires per frame.
- **No fade-out.** The boot screen stays at `opacity: 1` right up until `window.location.assign(next)` fires, so the login dialog underneath never flashes through during the transition. A fade-out version was tried; it visibly leaked the dialog for ~300ms.
- **Tuning knobs** are the `lines` array inside `runBootSequence`: `cps` (chars/sec per line) and `gapAfter` (post-line pause in ms). Bumping all three POST-line `cps` by +20 shaves ~225ms.
- **On viewports narrower than ~880px** the 54-char POST lines clip on the right. Intentional — desktop-first per Aesthetic direction; mobile "just needs to not break" and clipped text isn't broken.

**Preview-tool caveat:** Claude Preview / headless Chrome heavily throttles `requestAnimationFrame` when the tab isn't focused, making the sequence appear 5–10× slower than reality. Trust the math (sum of `text.length/cps + gapAfter`), not preview wall-clock timings. The DOM state after the Promise resolves is reliable; per-frame timing isn't.

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

**Preview-tool gotcha:** macOS sandboxes Claude's Python subprocesses from `~/Desktop/`, so the Claude Preview MCP can't serve files from this repo directly. To use `preview_start` / `preview_screenshot`, copy `docs/` to `/tmp/fafo-preview/` first and point `~/.claude/launch.json` at `--directory /tmp/fafo-preview`. The Bash `python3 -m http.server` invocation above is unaffected.

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

## Episode descriptions

Style guide at `EPISODE_DESCRIPTIONS.md` (repo root). Read it before writing any new `data-desc` text on an `.episode-card` in `docs/index.html`. Three-act shape, 60–90 words, earnest (no hype), and the cold-open hook from the prep notes should inform the description's framing.

## Transcription

For each new episode MP3:

1. `export ASSEMBLYAI_API_KEY="..."` — keep in `~/.zshrc`, never paste in chat.
2. `python3 tools/transcribe.py <path-to-mp3>` — uploads, runs `universal-2` with `speaker_labels`, polls until done, writes `<base>_AssemblyAI.json` (raw, for analysis) + `<base>_Transcript.md` (speaker-labelled, shareable). ~45-min interview = ~$0.20, ~1 min wall-clock.
3. **AssemblyAI often over-splits one speaker into multiple IDs** (e.g. host = A, guest gets split across B and C). After the script runs, do a one-off Python pass to remap speakers to real names and merge consecutive same-speaker turns. See ep007 for the pattern.
4. Hand-pass for mishears before sharing with the guest — proper nouns and in-jokes are where the model misses. Spot-check by reading end-to-end at least once.
5. Send raw to the guest unless they ask for a cleaned version — let them flag their own preferred edits.
