# FAFO — Fork About and Find Out

Interview series in tech / AI / company creation. Live site: https://forkaboutandfindout.co.uk/. Repo: github.com/ForkAboutandFindOut/FAFO. Status: live, mostly maintenance.

## What I'll usually ask for help with

- Adding new episodes (`episodes.yml`, `docs/`, portraits, RSS).
- Frontend tweaks (HTML/CSS in `docs/`, mobile behavior, visuals).

## Layout

- `docs/` — static site (custom domain + GitHub Pages style). Entry is `docs/index.html`; the inline script at the top calls `/api/gate` and redirects to `/login/` if the visitor isn't allowed in.
- `docs/desktop/windows.css` + `docs/desktop/desktop.js` — desktop windowed sim (Win98-style desktop with icons + draggable, focusable, scale-animated windows). Both linked from `index.html`. See "Desktop windowed sim" below.
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

## Desktop windowed sim

Files: `docs/index.html` (markup), `docs/desktop/windows.css` (style), `docs/desktop/desktop.js` (window manager, ~150 lines, vanilla, no deps).

**Structure.** `<main class="desktop">` contains: ambient spinning logo (`<video class="ambient-logo">`, transparent VP8-alpha webm, 80vmin, opacity 0.35); icon strip top-left (`<ul class="desktop-icons">`, currently Episodes + Solitaire); three `<section class="app-window" data-window="…" hidden>` (Welcome, Solitaire, Episodes). Icons unhide the corresponding window on click. Welcome auto-opens on first visit.

**Window chrome classes**: `.dw-titlebar` / `.dw-menubar` / `.dw-toolbar` / `.dw-content` / `.dw-statusbar` / `.dw-ctrl`. Same system as the prior E.1.

**JS behaviour (`desktop.js`):**

- Bails entirely on `<880px` viewport (mobile path handled by CSS).
- Welcome auto-opens unless `localStorage.fafo_welcome_closed` is set; closing Welcome writes that flag.
- Open/close zoom: `setOriginFromIcon()` sets `transform-origin` to the icon's centre relative to the window. `.is-opening` instantly snaps to `scale(0.08) opacity(0)` via `transition: none`; rAF removes the class → CSS transitions back to scale(1) opacity(1). `.is-closing` does the reverse; `setTimeout(180ms)` then sets `hidden=true` and runs side-effects (pause Solitaire video, persist Welcome close).
- Drag from `.dw-titlebar[data-drag-handle]` (ignored if click hits `.dw-titlebar-controls`). Mousedown reads `getBoundingClientRect`, writes inline `left`/`top`, **and clears `right`/`bottom`** — without that, the window only moves on one axis because the CSS pin still applies. Constraint: ≥80px of titlebar visible horizontally; titlebar can't go above y=0.
- Focus on mousedown anywhere inside a window: monotonic `topZ` counter (starts at CSS baseline z-index 10) writes to inline `z-index`. `.is-focused` class on focused window; `:not(.is-focused) .dw-titlebar` dims to flat grey (`--w98-shadow`).

**Mobile (<880px).** Desktop chrome (icons, ambient logo, Solitaire window) hidden via `display: none`. Welcome and Episodes wrappers `display: contents` so their inner content flows in normal document flow; titlebar/menubar hidden. **Welcome's `display: contents` selector must out-specify UA's `[hidden]`** (`.app-window[data-window="welcome"]` is 0,0,2,0 vs 0,0,1,0) because `desktop.js` bails before unhiding Welcome — otherwise mobile visitors see no intro text.

**Squeeze resilience.** Episodes is the only window wide enough to crowd narrow desktop viewports. Uses `width: clamp(420px, 80vw, 720px)` and `left: clamp(40px, 10vw, 140px)` — original 720/140 at 1440px design target; shrinks to 704/88 at 880px (bumps right margin from 16 → 84). Solitaire and Welcome are right-pinned, no width fluidity needed.

**Cache-bust.** `index.html` references `windows.css?v=phase-X` and `desktop.js?v=phase-X`. Bump the version label when iterating locally — Python's http.server sends no useful cache headers and browsers will hold onto stale scripts. Production deploys via Cloudflare don't need this (their cache is keyed differently); the `?v=` is harmless either way.

**Win98 palette `--w98-*` is duplicated in three files** (`docs/index.html`, `docs/login/index.html`, `docs/desktop/windows.css`). Still worth extracting to `docs/assets/w98.css` if a fourth file needs them.

**Assets used by the sim:**

- `docs/assets/fafo-spin-transparent.webm` — 1.8 MB, VP8 alpha (`alpha_mode=1` matroska tag). `libvpx-vp9` silently dropped alpha; only `libvpx` (VP8) preserves it: `ffmpeg -i src.mov -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 -an out.webm`. Source is `FAFO_SpinningLogo.mov` (ProRes 4444, yuva444p12le) in Drive's `Brand Assets/`.
- `docs/assets/solitaire.webm` — 805 KiB, VP9, 25s loop, no alpha. Inside the Solitaire window's `.dw-content` with `object-fit: cover`.
- `docs/assets/cursor.png` — pristine 32×32 from commit `bf9a4f5`. Earlier rescaling 32→19→21→32 via PIL had softened the pixel art; restore via `git show bf9a4f5:docs/assets/cursor.png > docs/assets/cursor.png` if it gets blurry again.

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

Visit `http://localhost:8000/`. The gate's `/api/gate` call will 404; bypass once by visiting `/login/` (gate doesn't auto-redirect that page), opening DevTools, and running `localStorage.setItem("fafo_access","1")`, then navigating to `/`. The flag persists.

For testing functions/auth locally, set up `wrangler` with a `.dev.vars` file (not done yet). For "is this actually working in prod" checks, push the working branch and use Cloudflare Pages' auto-deployed preview URL.

**Cache-bust during JS iteration.** Python http.server sends no cache-control headers; browsers will serve stale `desktop.js` / `windows.css` for as long as they feel like it. `index.html` references those files with a `?v=phase-X` query — bump the label any time the file changes and the URL changes too, so the browser refetches. Alternative: keep DevTools open with "Disable cache" ticked.

**Preview-tool gotcha:** macOS sandboxes Claude's Python subprocesses from `~/Desktop/`, so the Claude Preview MCP can't serve files from this repo directly. To use `preview_start` / `preview_screenshot`, copy `docs/` to `/tmp/fafo-preview/` first and point `~/.claude/launch.json` at `--directory /tmp/fafo-preview`. The Bash `python3 -m http.server` invocation above is unaffected. Also: the headless preview tab is treated as `document.hidden`, which **pauses CSS transitions and throttles `requestAnimationFrame` to ~0Hz** — animations and rAF-driven code (boot sequence, desktop sim open/close zoom) won't visibly run in the preview. Verify the DOM state at the end; trust the math; eyeball in a real browser for animation polish.

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
