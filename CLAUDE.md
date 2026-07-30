# FAFO — Fork About and Find Out

Interview series in tech / AI / company creation. Live site: https://forkaboutandfindout.co.uk/. Repo: github.com/ForkAboutandFindOut/FAFO. Status: live, mostly maintenance.

## What I'll usually ask for help with

- Adding new episodes (`episodes.yml`, `docs/`, portraits, RSS, R2 upload, newsletter send).
- Frontend tweaks (HTML/CSS in `docs/`, mobile behavior, visuals).
- Newsletter sends from `tools/send_newsletter.py` (see Newsletter pipeline below).

## Layout

- `docs/` — static site (custom domain + GitHub Pages style). Entry is `docs/index.html`; the inline script at the top calls `/api/gate` and redirects to `/login/` if the visitor isn't allowed in.
- `docs/desktop/windows.css` + `docs/desktop/desktop.js` — desktop windowed sim (Win98-style desktop with icons + draggable, focusable, scale-animated windows). Both linked from `index.html`. See "Desktop windowed sim" below.
- `functions/` — Cloudflare Pages Functions (TypeScript). API routes: `gate`, `send-otp`, `subscribe`, `unsubscribe`, `episodes/`. Auth callback at `auth/callback.ts`. Site-wide `_middleware.ts`.
- `episodes.yml` — source of truth for the podcast feed.
- `tools/generate_feed.py` — generates `docs/feed.xml` from `episodes.yml`.
- `tools/transcribe.py` — transcribes a guest MP3 via AssemblyAI (see Transcription section).
- `tools/send_newsletter.py` — sends a per-episode newsletter via Resend (see Newsletter pipeline below).
- `tools/md_to_pdf.py` — renders a markdown file to PDF via headless Chrome. Used to produce the recording-day Live Sheet PDF (see Interview prep).
- `package.json` — only dep is `@supabase/ssr` (used by the functions).

## Auth gate — how it actually works

Despite the filename `send-otp.ts`, there is **no real OTP**. Live flow:

1. `/login/` form → `POST /api/subscribe` with email + name.
2. `/api/subscribe` upserts to Supabase `mailing_list` table, then sets a HMAC-signed cookie `fafo_gate` (180 days).
3. Homepage inline script calls `/api/gate` to verify the cookie; on success caches `localStorage.fafo_access=1`.

So the gate is mailing-list capture, not authentication — anyone can type any email and get in. Don't break the "returning visitor skips login" path.

**Dead code:** `functions/api/send-otp.ts` and `functions/auth/callback.ts` aren't reached by the live login form. Either old or future. Don't delete without asking.

**Env vars (Cloudflare Pages dashboard):** `GATE_COOKIE_SECRET` (signs cookies — critical), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (used by `/api/subscribe` — full DB admin), `UNSUBSCRIBE_SECRET` (HMAC for `/api/unsubscribe` tokens — deliberately separate from `GATE_COOKIE_SECRET` so the two trust domains don't overlap), `RESEND_API_KEY` (newsletter sends).

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

Path to the "Aesthetic direction" desktop-sim goal:

- **Login as Win98 dialog.** Done, deployed. See Login dialog above.
- **Boot sequence transition.** Done, deployed. See Boot sequence below.
- **Intro copy as Win98 system text.** Done. Lived briefly in the hero window; now lives inside the Welcome window in the desktop sim.
- **E.1 — Hero/Episodes/Solitaire fixed-position layout.** Superseded by the full desktop sim — the `.hero-wrap` markup and always-visible windows are gone.
- **E.2 — Real Solitaire video.** Done. `docs/assets/solitaire.webm` (25s VP9 loop, 805 KiB), displayed inside the Solitaire app-window.
- **Desktop sim Phases A–F.** Done and live. Skeleton + open/close + Welcome auto-open + drag + focus/z-index + open-close zoom animations + mobile + squeeze-resilient layout. See "Desktop windowed sim".
- **Playable Solitaire game** (deferred). User explored; verdict was to vendor an MIT-licensed JS Klondike clone (~30–50 KB) into the Solitaire window, keeping the video as the idle-state aesthetic. Hold until after the desktop sim ships.
- **MS Paint window** (deferred, was Phase E original-scope). Wraps `/assets/fafo-logo.png` in Paint chrome with a fake toolbar/palette.

## Boot sequence

Plays once between login-submit success and the homepage redirect. ~3.5s total. Lives entirely in `docs/login/index.html` — CSS `.boot-screen` + JS `runBootSequence(firstName)`. Returning visitors are caught by the existing `checkGate()` IIFE at the top of the file and never see it (no `sessionStorage` flag needed).

- **Font:** Pixel Operator 8 (already in `/assets/`) at 16px — clean 2× of its native 8px so it stays crisp. `text-shadow: 1px 0 0 currentColor` simulates bold without faux-bolding the pixel glyphs, which would look terrible.
- **Typing uses `requestAnimationFrame`, not `setTimeout`.** Per-char `setTimeout(fn, ~11ms)` gets clamped to ~16ms+ on most browsers and aggressively throttled in background tabs — would stretch a 3.5s sequence to 15s+. rAF runs at the display refresh rate and adds however many chars the requested `cps` requires per frame.
- **No fade-out.** The boot screen stays at `opacity: 1` right up until `window.location.assign(next)` fires, so the login dialog underneath never flashes through during the transition. A fade-out version was tried; it visibly leaked the dialog for ~300ms.
- **Tuning knobs** are the `lines` array inside `runBootSequence`: `cps` (chars/sec per line) and `gapAfter` (post-line pause in ms). Bumping all three POST-line `cps` by +20 shaves ~225ms.
- **On viewports narrower than ~880px** the 54-char POST lines clip on the right. Intentional — desktop-first per Aesthetic direction; mobile "just needs to not break" and clipped text isn't broken.

**Preview-tool caveat:** Claude Preview / headless Chrome heavily throttles `requestAnimationFrame` when the tab isn't focused, making the sequence appear 5–10× slower than reality. Trust the math (sum of `text.length/cps + gapAfter`), not preview wall-clock timings. The DOM state after the Promise resolves is reliable; per-frame timing isn't.

**Hand-off to homepage intro.** The login form sets `sessionStorage.fafo_just_logged_in = "1"` right before `window.location.assign(next)` fires. The homepage reads + consumes that flag to trigger its own post-login intro choreography — see "Post-login intro choreography" below.

## Post-login intro choreography

Plays on the homepage, *after* the boot sequence, on the visitor's first arrival post-login. ~3.5s total. Returning visitors skip it entirely (their `sessionStorage` flag isn't set).

- Pre-flag: inline `<script>` in `docs/index.html` `<head>` reads `sessionStorage.fafo_just_logged_in` and adds `html.fafo-intro` **before first paint**. Pattern is *FOUC prevention* — without this, the deferred `desktop.js` would only run after the first paint, so the logo would flash at full opacity before snapping to 0 and fading in.
- `windows.css` rules under `html.fafo-intro` set `.ambient-logo` and `.desktop-icons` to `opacity: 0` with `transition: opacity 3s` and `0.4s` respectively. `.fafo-intro-logo-in` / `.fafo-intro-icons-in` flip them to `opacity: 1`.
- `desktop.js` orchestrates: read + clear the sessionStorage flag → `requestAnimationFrame` → add `fafo-intro-logo-in` (3s CSS fade kicks in) → `setTimeout(3000)` → add `fafo-intro-icons-in` AND call `openWindow('welcome')` (unless previously closed).

## Desktop windowed sim

Files: `docs/index.html` (markup), `docs/desktop/windows.css` (style), `docs/desktop/desktop.js` (window manager, ~150 lines, vanilla, no deps).

**Structure.** `<main class="desktop">` contains: ambient spinning logo (`<video class="ambient-logo">`, transparent VP8-alpha webm, 80vmin, opacity 1 — was 0.35, bumped for hero presence); icon strip top-left (`<ul class="desktop-icons">`, three icons: Welcome / Episodes / Solitaire); three `<section class="app-window" data-window="…" hidden>` (Welcome, Solitaire, Episodes). Icons **toggle** the corresponding window on click — open if hidden, close if visible (closing Welcome via icon still writes `fafo_welcome_closed`, matching the X-button behaviour). Welcome auto-opens on first visit *unless* the intro choreography is running, in which case it opens after the 3s logo fade.

**Browser-edge resize buffer.** `.desktop { inset: 16px }` exposes a 16px frame of teal `<html>` background at the viewport edge. The cursor declarations are scoped to `body *` (not `*`), so `html` keeps the system cursor — and the browser's window-resize cursor can take over cleanly when you slide toward the Chrome tab edge. The teal-on-teal frame is visually invisible.

**Window chrome classes**: `.dw-titlebar` / `.dw-menubar` / `.dw-toolbar` / `.dw-content` / `.dw-statusbar` / `.dw-ctrl`. Same system as the prior E.1.

**JS behaviour (`desktop.js`):**

- Bails entirely on `<880px` viewport (mobile path handled by CSS).
- Welcome auto-opens unless `localStorage.fafo_welcome_closed` is set; closing Welcome writes that flag. Auto-open is deferred when the post-login intro choreography is running.
- **Episodes window statusbar text is dynamic** — read from `.episode-card` count by `desktop.js`, written to `.episodes-window .dw-status-cell`. Replaces the previous "remember to bump `6 episode(s)`" footgun.
- Open/close zoom: `setOriginFromIcon()` sets `transform-origin` to the icon's centre relative to the window. `.is-opening` instantly snaps to `scale(0.08) opacity(0)` via `transition: none`; rAF removes the class → CSS transitions back to scale(1) opacity(1). `.is-closing` does the reverse; `setTimeout(180ms)` then sets `hidden=true` and runs side-effects (pause Solitaire video, persist Welcome close).
- Drag from `.dw-titlebar[data-drag-handle]` (ignored if click hits `.dw-titlebar-controls`). Mousedown reads `getBoundingClientRect`, converts to **offsetParent-relative** coords (subtract `offsetParent.getBoundingClientRect()`), writes inline `left`/`top`, **and clears `right`/`bottom`**. Without the offsetParent subtraction the window snaps 16px down-right on mousedown because `.desktop { inset: 16px }` shifts the containing block; without clearing right/bottom the window only moves on one axis because the CSS pin still applies. Constraint: ≥80px of titlebar visible horizontally; titlebar can't go above y=0.
- Focus on mousedown anywhere inside a window: monotonic `topZ` counter (starts at CSS baseline z-index 10) writes to inline `z-index`. `.is-focused` class on focused window; `:not(.is-focused) .dw-titlebar` dims to flat grey (`--w98-shadow`).

**Mobile (<880px).** Desktop chrome (icons, ambient logo, Solitaire window) hidden via `display: none`. Welcome and Episodes wrappers `display: contents` so their inner content flows in normal document flow; titlebar/menubar hidden. **Welcome's `display: contents` selector must out-specify UA's `[hidden]`** (`.app-window[data-window="welcome"]` is 0,0,2,0 vs 0,0,1,0) because `desktop.js` bails before unhiding Welcome — otherwise mobile visitors see no intro text. **Welcome's `.dw-content` on mobile uses a Win98 panel** (grey face + 2px black border + 2px drop shadow), matching the visual language of the episode portrait boxes below it — replaces an earlier transparent/bare-text rendering.

**Squeeze resilience.** Episodes is the only window wide enough to crowd narrow desktop viewports. Uses `width: clamp(420px, 80vw, 720px)` and `left: clamp(40px, 10vw, 140px)` — original 720/140 at 1440px design target; shrinks to 704/88 at 880px (bumps right margin from 16 → 84). Solitaire and Welcome are right-pinned, no width fluidity needed.

**Cache-bust.** `index.html` references `windows.css?v=intro-N` and `desktop.js?v=intro-N` (the label evolved from `phase-X` once Phases A–F shipped). Bump the version any time those files change so local Python http.server doesn't serve stale scripts. Production deploys via Cloudflare don't need this (their cache is keyed differently); the `?v=` is harmless either way. **Portrait images use the same `?v=N` pattern** — bump on `.episode-portrait` `src` when the underlying file changes.

**Win98 palette `--w98-*` is duplicated in three files** (`docs/index.html`, `docs/login/index.html`, `docs/desktop/windows.css`). Still worth extracting to `docs/assets/w98.css` if a fourth file needs them.

**Assets used by the sim:**

- `docs/assets/fafo-spin-transparent.webm` — 1.8 MB, VP8 alpha (`alpha_mode=1` matroska tag). `libvpx-vp9` silently dropped alpha; only `libvpx` (VP8) preserves it: `ffmpeg -i src.mov -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 -an out.webm`. Source is `FAFO_SpinningLogo.mov` (ProRes 4444, yuva444p12le) in Drive's `Brand Assets/`.
- `docs/assets/solitaire.webm` — 805 KiB, VP9, 25s loop, no alpha. Inside the Solitaire window's `.dw-content` with `object-fit: cover`.
- `docs/assets/cursor.png` — pristine 32×32 from commit `bf9a4f5`. Earlier rescaling 32→19→21→32 via PIL had softened the pixel art; restore via `git show bf9a4f5:docs/assets/cursor.png > docs/assets/cursor.png` if it gets blurry again.

## Workflow facts

- Audio lives in Cloudflare R2; download endpoint streams from there. R2 keys follow `episodes/epNNN.mp3`; `functions/_episodes.ts` maps id → r2_key + display filename.
- Visitor flow: land → enter email → site → download. The mailing list is now actually sent to — one newsletter per new episode via `tools/send_newsletter.py` (see Newsletter pipeline below).
- Episode-add automation was written by Codex.
- Deploy: Cloudflare Pages connected to this GitHub repo, auto-builds on push to `main`.

### Adding a new episode — end-to-end checklist

1. Move portrait into `docs/assets/portraits/<FirstName>.png`.
2. Add the `<article class="episode-card">` block at the top of the grid in `docs/index.html` (newest first). Bump the portrait's `?v=` if reusing a filename. Description follows `EPISODE_DESCRIPTIONS.md` style.
3. Add the episode entry to `functions/_episodes.ts` (`id`, `title`, `r2_key`, `filename`).
4. Upload the MP3 to R2 under the key declared in step 3.
5. Commit + push. Verify on live: click portrait, confirm MP3 download streams (gate cookie required).
6. Edit `SUBJECT` + `BODY_TEXT` in `tools/send_newsletter.py`, run `--to-self` to eyeball, then `--schedule "<ISO UTC time>"` for the real send.

### Temporarily hiding an episode

When a guest wants revisions post-publish, or an MP3 needs a swap:

1. Wrap the `<article class="episode-card">` in `docs/index.html` with `<!-- ... -->` (leave the markup in place for easy restore — leave a one-line note in the comment pointing at the `_episodes.ts` twin).
2. Comment out the matching entry in `functions/_episodes.ts` so `/api/episodes/epNNN/download` 404s. Without this, the R2 object stays streamable to anyone who knows the URL — the card disappearing from the grid isn't enough.
3. R2 object stays untouched. Overwrite it at the same key when the revised MP3 lands, then uncomment both blocks.
4. **Before rerunning `send_newsletter.py` after a hide period,** refresh any date references in the body — a hide can last weeks and *"three weeks ago Prince dropped out"* stops being true. Also double-check via the Resend dashboard whether the original send actually fired before the hide (the send-scoped API key can't check for you).

## Newsletter pipeline

Sends one email per new episode from `sasha@forkaboutandfindout.co.uk` via Resend. Recipient list is Supabase `mailing_list` filtered to `marketing_opt_in = true`. Free tier: 100 sends/day, 3,000/month.

**Files:**
- `tools/send_newsletter.py` — Python stdlib only, runs locally.
- `functions/api/unsubscribe.ts` — Cloudflare Function. Two-step flow: `GET` shows a Win98-styled confirmation page (no DB write — Apple Mail Privacy Protection prefetches links and would otherwise silently unsubscribe people), `POST` sets `marketing_opt_in = false` (preserves the gate cookie row so they're not booted from the site).

**HMAC secret:** unsubscribe URLs are signed with `UNSUBSCRIBE_SECRET`, **deliberately separate** from `GATE_COOKIE_SECRET`. Don't reuse the gate secret — separation of trust domains.

**Local `.env`** at repo root (gitignored):
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=re_...
UNSUBSCRIBE_SECRET=...   # same value as the CF Pages secret
```

**Script modes:**
- `--dry-run` — list recipients + planned send, no API calls. Always run this first.
- `--to-self` — single test send to the hardcoded `TEST_EMAIL` (defaults to ~2 min from now). Verify deliverability + unsubscribe flow.
- `--schedule "2026-MM-DDTHH:MM:SSZ"` — full send, queues all emails at Resend. Prompts `yes` to confirm. Scheduled emails can be cancelled in Resend dashboard until they fire.

**Gotchas:**
- **Resend's API sits behind Cloudflare WAF.** Python's default `urllib` User-Agent (`Python-urllib/3.x`) gets blocked with error code 1010. The script sends a custom `user-agent: FAFO-newsletter/1.0`. Don't strip it.
- **Gmail collapses content under `---`** as a perceived signature delimiter (RFC says `-- ` with trailing space; Gmail's heuristic is more aggressive). Use inline `P.S.` style for the unsubscribe footer, not a `---` separator — otherwise everything below the separator gets hidden under Gmail's "..." trimmed-content control.
- Script sets `List-Unsubscribe` + `List-Unsubscribe-Post` headers for Gmail/Yahoo bulk-sender (2024+) compliance — gives a native one-click Unsubscribe button next to the sender name.
- **Past `scheduled_at` fails 422 for every recipient before any email is queued.** Fail-fast is a feature — safe to retry immediately with a corrected time. Compute the UTC target with `date -u` first when working across timezones; the local clock and Resend's server clock can also drift enough to trip the check by a couple of minutes.
- **`RESEND_API_KEY` here is send-scoped (restricted).** All read endpoints (`GET /emails`, `/domains`, `/broadcasts`, `/audiences`, `/api-keys`) return 401 `restricted_api_key`. Claude can't check what was actually sent via API — use the Resend dashboard, or check `sashavarp7@gmail.com`'s inbox (the `TEST_EMAIL` address is on the live mailing list, so every real send lands there too).

**Per-send workflow:** edit the `SUBJECT` and `BODY_TEXT` constants near the top of `send_newsletter.py`. `BODY_TEXT` uses `{first_name}`, `{public_url}`, `{unsubscribe_url}` placeholders. The script's edits are usually uncommitted between sends — fine, the script runs locally.

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

Visit `http://localhost:8000/`. The gate's `/api/gate` call will 404; bypass once by visiting `/login/` (gate doesn't auto-redirect that page), opening DevTools, and running `localStorage.setItem("fafo_access","1")`, then navigating to `/`. The flag persists.

For testing functions/auth locally, set up `wrangler` with a `.dev.vars` file (not done yet). For "is this actually working in prod" checks, push the working branch and use Cloudflare Pages' auto-deployed preview URL.

**Cache-bust during JS iteration.** Python http.server sends no cache-control headers; browsers will serve stale `desktop.js` / `windows.css` for as long as they feel like it. `index.html` references those files with a `?v=intro-N` query — bump the label any time the file changes and the URL changes too, so the browser refetches. Alternative: keep DevTools open with "Disable cache" ticked.

**Preview-tool gotcha:** macOS sandboxes Claude's Python subprocesses from `~/Desktop/`, so the Claude Preview MCP can't serve files from this repo directly. To use `preview_start` / `preview_screenshot`, copy `docs/` to `/tmp/fafo-preview/` first and point `~/.claude/launch.json` at `--directory /tmp/fafo-preview`. The Bash `python3 -m http.server` invocation above is unaffected. Also: the headless preview tab is treated as `document.hidden`, which **pauses CSS transitions and throttles `requestAnimationFrame` to ~0Hz** — animations and rAF-driven code (boot sequence, desktop sim open/close zoom) won't visibly run in the preview. Verify the DOM state at the end; trust the math; eyeball in a real browser for animation polish.

## Conventions

- Commits: short imperative subjects, no Conventional Commit prefixes (e.g. `Add ep006 Aarin episode and download metadata`).
- Branch: work on `main` directly unless I say otherwise.
- Media (logos, raw video, .xcf, .mov) lives in a sibling folder `~/Desktop/FAFO/`, not in this repo.
- Master media + interview files live in Google Drive: `~/Library/CloudStorage/GoogleDrive-sashavarp7@gmail.com/My Drive/FAFO/` (`Brand Assets/`, `Guests/`, `Sound Assets/`, `Windows Templates/`).
- Article/essay projects derived from the interviews live in a sibling Drive folder `~/Library/CloudStorage/.../My Drive/Journalism/` — one folder per article, each with its own `CLAUDE.md`. First piece: `Journalism/hackathon-article/`.
- Drive filing convention: guest folders are `epNNN <GuestNameNoSpace>/`, files inside are `epNNN_<GuestNameNoSpace>_<FullInterview|ClipNN|Transcript|AssemblyAI>.<ext>`. Unreleased guests keep a plain `<GuestNameNoSpace>/` folder until they're assigned a number.
- New scripts in `tools/` should be stdlib-only Python where possible (match `generate_feed.py` and `transcribe.py`) so no `pip install` is needed.

## Interview prep

Per-guest prep follows the template at `~/Library/CloudStorage/.../FAFO/Guests/_Interview_Template.md`. Three-topic structure (Topic 1 = current work, Topic 2 = past/pivot, Topic 3 = broader theme), three `[ANCHOR]` questions that can't be cut, and the closer must cash in the cold-open hook. Read the "Rules" block at the bottom of the template before every recording.

A retrospective audit lives at `~/Library/CloudStorage/.../FAFO/Guests/_Interview_Analysis.md`.

### Prep workflow (per-guest Notes)

Workflow patterns from ep008 and ep009 prep:

- **Confirm topics before deep prep.** For each new guest, present 3–5 candidate Topic 3 options with one-line rationale each, and get explicit confirmation before researching or drafting. Sasha pivots — ep009 went defence-pilled → chess → no-third-topic in a single session. Confirm to save rework.
- **Three topics is the template default; two is fine.** If the guest's published content doesn't support a strong third broader theme, ship a tighter two-topic structure (~20 min per topic) rather than forcing one. Keep three anchors regardless — promote a second anchor from one of the existing topics rather than dropping the anchor count.
- **Cold open names the main topic.** Sasha's preferred form announces the central topic up front ("…which will be the main topic of discussion in this interview") rather than teasing it abstractly. Cleaner for the listener.
- **Topics get signed off independently.** When Sasha says "happy with Topic X", treat that topic as locked — apply requested tweaks only to the un-signed-off topics, don't drift back into the approved one.
- **Track sign-off with a STATUS block at the top of the Notes.** Format: `**STATUS (yyyy-mm-dd):** Topic 1 signed off. Topic 2 needs rewrite to focus on X — drop Y, deepen Z. Cold open, on-ramp, anchors, closer are Sasha's current preferred versions — don't touch without asking.` The "don't touch without asking" marker on signed-off sections is load-bearing; respect it on subsequent passes.
- **Verification pass before recording.** For every question that depends on a specific quote, number, or date, cross-check against ≥2 independent sources. Nested search-result summaries can propagate transcription errors — a paraphrase-of-a-paraphrase can move a number by an order of magnitude (real case in ep010 prep: `$19M` should have been `$90M`, caught by a second-source pass). Flag unverified items inline with `[VERIFY]`; clear or explicitly downgrade to "surfacing consistently but unconfirmed" before recording. Document the pass in the STATUS block.
- **Crash course file for technically dense topics.** When the guest's domain needs vocab Sasha doesn't have (finance/VC, crypto, hard sciences), draft a companion `crash_course.md` in the guest folder. Modular (Module 0 = calibration questions → progressive vocab and mental-model modules → mock interview at the end). Sasha answers Check Yourself questions in chat between modules; Claude grades and pushes back. Ends with a mock-interview role-play where Claude plays the guest. Precedents: ep009 Diya (`topic1_crash_course.md`), ep010 Konoplyasty (`crash_course.md`).
- **Single-topic-with-coda structure.** A valid variant of the "two topics is fine" rule: one deep-dive topic plus a broader/philosophical coda at the end (~3–5 questions). Topic 1 can carry more sub-arcs than usual (six labelled 1a–1f is fine — pace ~4 min each). Anchors: one in the framing sub-arc, one late in Topic 1, one in the coda. Precedent: Theo Bui ep009 (8x + AI-and-human-labor coda).

### Re-records

When a guest is re-recorded — guest-requested cuts, a full redo, or a follow-up months later — the new prep treats them as a first appearance. **No "you told me last time," no "in May you said."** The old transcript stays in the folder as Sasha-eyes-only prep material. Cold open should not reference that the previous recording happened. First instance: Theo Bui, re-recording as ep009 in July 2026 after the original May cut was superseded.

### Sasha's question-wording preferences

Apply when drafting per-guest Notes (especially the cold open and on-ramp). These are calibrations from his post-draft edits on ep008 and ep009.

- **Spell out organisation names** in the cold open. "Entrepreneurs First", not "EF"; "University College Dublin", not "UCD" on first mention. Reads cleaner aloud.
- **Understated over sharp.** Kill rhetorical flourish in the cold open and on-ramp. Let the facts carry the weight. *"He also recently became a dropout"* lands better than *"he's the case study walking around in the week the column is being written."* If you write a hook with a 🥁-roll feel to it, cut it.
- **No meta-framing inside questions.** Drop `[OPTIONAL WARM-UP]`-style markers and preambles like "Before any of the AI stuff —" or "Stand back —" inside the question text. Just ask the question.
- **Split stacked questions.** Multi-clause questions get split: primary in the `[QUESTION]` line, the second half as a separate indented `[FOLLOW UP]` bullet. One thing at a time.
- **Use real mutual context when it exists** (shared workplaces, mutual connections) as the on-ramp rather than a generic biographical opener. Anecdotal first ("what's the most ridiculous pitch you saw…"), analytical work goes in Topic 2/3. **Don't put "we were both there" questions inside analytical topics** — they read as fishing for shared gossip or making the topic about the host. Shared-observation questions belong in the on-ramp only.
- **Don't put the guest's own CV on trial.** Questions framed as "your CV reads like X, how do you square that?" get softened to "is that where Y came from?" — connect the topic to the interview's arc rather than surface a contradiction. Guest interviews are exploration, not accountability journalism.
- **Don't leave `[VERIFY]` on facts Sasha has personally confirmed.** The marker is for anything Claude couldn't cross-check independently. Once Sasha's checked with the guest directly (text, DMs, in-person) and OK'd it for on-air use, strip the marker — leaving it in on a resolved item adds noise. Don't over-flag either: when the host is in direct contact with the guest, source-strictness relaxes.
- **Don't tease the coda / broader-theme topic in the cold open.** The cold open names Topic 1 only. The end-of-interview zoom-out questions surface naturally when Sasha pivots to them — pre-announcing them front-loads the cold open. (Learned on Theo ep009: draft included a coda tease, Sasha stripped it.)
- **Prefer conversational phrasing over analytical framing, even when it costs specificity.** "When did you feel the company really started growing?" lands better than "where did the growth curve actually bend?" Sasha trims tight, MBA-adjacent phrasings on every pass. Give questions room for the guest to interpret.

### Live Sheet PDF (recording-day cheat sheet)

Once `epNNN_<GuestName>_Notes.md` is recording-ready, strip it to a sibling `epNNN_<GuestName>_LiveSheet.md` containing only what's needed live: cold open, on-ramp, topic questions (no "context — don't read" paragraphs, no Appendix), three-anchor reminder, closer, pre-flight checklist. Then render to PDF:

```
python3 tools/md_to_pdf.py <input.md> <output.pdf>
```

`md_to_pdf.py` is stdlib-only and shells out to `/Applications/Google Chrome.app` headless (macOS path is hard-coded). Renderer supports h1-h3, bold/italic, bulleted + numbered lists with one level of nesting, blockquotes, `---` rules, `- [ ]` checkboxes, and an `[ANCHOR]` highlight. It is **not** a general-purpose markdown converter — tables, code blocks, and links aren't supported. The Notes.md file stays untouched as the research record.

**LiveSheet pass also cleans scratch artifacts** the Notes tolerate but the read-live cheat sheet shouldn't: rich-text paste escapes (`*\*[FOLLOW UP] \*\*` → `**[FOLLOW UP]**`), missing terminal question marks, escaped asterisks. **Date-sensitive anchor questions** use `x days ago` as a placeholder in Notes; fill in the actual value on the LiveSheet pass (or, if recording date isn't locked, keep the placeholder and add a pre-flight checkbox reminding Sasha to fill it in).

## Episode descriptions

Style guide at `EPISODE_DESCRIPTIONS.md` (repo root). Read it before writing any new `data-desc` text on an `.episode-card` in `docs/index.html`. Three-act shape, 60–90 words, earnest (no hype), and the cold-open hook from the prep notes should inform the description's framing.

## LinkedIn per-clip promo

For the LinkedIn post that goes up alongside an episode video clip:

- **~40 words**, hook-first. LinkedIn videos autoplay muted, so the first line has to work without audio.
- **Journalistic voice** — same tone as the episode-card descriptions. No emojis, no exclamation marks. Setup-then-reveal beats hot-take framing.
- **End with the link on its own line:** `Ep NNN of Fork About and Find Out — forkaboutandfindout.co.uk`. LinkedIn de-prioritises external links, so keep them at the end, not the top.
- **Tags on their own line at the end.** Type `@GuestName` and `@Company` in the composer — LinkedIn auto-suggests correct profiles. End-tags read cleaner than inline tags and the tagged party still gets notified.
- **Timing.** If a per-episode newsletter is also going out, aim for both to land within the same hour — `--schedule` the newsletter to match the LinkedIn drop.

Precedent — ep008 Prince clip01 (Jul 2026):

> Before he worked at Entrepreneurs First, Prince Kumar wasn't thinking about dropping out of Oxford. A year later, he did.
>
> Ep008 of Fork About and Find Out — forkaboutandfindout.co.uk

## Transcription

**Two pipelines coexist in practice.**

- Eps 001–006 + Theo Bui (unreleased): originally transcribed via **WhisperX** (run elsewhere, not via this repo). Outputs live in `Guests/epNNN <GuestNameNoSpace>/whisperx/*.{txt,srt,vtt,json,tsv}`. The `.txt` is the human-readable transcript; the `.srt`/`.vtt` are timed subtitle formats. The WhisperX JSON does have `[SPEAKER_00]` / `[SPEAKER_01]` segment tags, but the older runs have noticeable hallucination artefacts (random guest/company names dropped into mid-sentence). **Don't share WhisperX-era transcripts externally without a clean-up pass — better to re-transcribe.**
- Ep 007+ and any back-fills you need to share: transcribed via **AssemblyAI** through `tools/transcribe.py`. Output is `_AssemblyAI.json` + speaker-labelled `_Transcript.md` at the guest folder root (not under `whisperx/`).

**If you need to back-fill a WhisperX-era episode for sharing** (Theo Bui was the first instance, 2026-06-23): re-run via AssemblyAI — `python3 tools/transcribe.py path/to/<Guest>_FullInterview.mp3`. The `_Transcript.md` gets overwritten cleanly. AssemblyAI labels speakers "Speaker A / Speaker B" by default; do a one-off remap pass to rename to "Sasha / <Guest>" and merge any over-split IDs (host = A, guest sometimes split across B+C). Cost ≈ $0.20 per ~45-min interview, ~1 min wall-clock.

For article/quote research, prefer the `.txt` files under `whisperx/` for older un-shared episodes and `_Transcript.md` for anything that's been through AssemblyAI.

**Going forward — use `tools/transcribe.py` (AssemblyAI):**

1. `export ASSEMBLYAI_API_KEY="..."` — keep in `~/.zshrc`, never paste in chat.
2. `python3 tools/transcribe.py <path-to-mp3>` — uploads, runs `universal-2` with `speaker_labels`, polls until done, writes `<base>_AssemblyAI.json` (raw, for analysis) + `<base>_Transcript.md` (speaker-labelled, shareable). ~45-min interview = ~$0.20, ~1 min wall-clock.
3. **AssemblyAI often over-splits one speaker into multiple IDs** (e.g. host = A, guest gets split across B and C). After the script runs, do a one-off Python pass to remap speakers to real names and merge consecutive same-speaker turns. See ep007 for the pattern.
4. Hand-pass for mishears before sharing with the guest — proper nouns and in-jokes are where the model misses. Spot-check by reading end-to-end at least once.
5. Send raw to the guest unless they ask for a cleaned version — let them flag their own preferred edits.

**Re-transcribing after guest-requested cuts:** before rerunning `transcribe.py` on a revised MP3, rename the existing `_Transcript.md` + `_AssemblyAI.json` with a `_precut` suffix (the script overwrites both by default, and the pre-cut version is the reference for "what was said originally"). After rerunning + remapping, verify the cuts landed by phrase-searching the new transcript against the guest's cut list (regex per flagged phrase → "still present" vs. "cut"). Also read the transcript around each seam — cuts can leave dangling references or non-sequiturs that the guest won't notice on playback but a listener will. Cheap sanity check: `new_mp3_bytes / old_mp3_bytes × old_duration ≈ new_duration` (CBR mp3 duration scales with file size).
