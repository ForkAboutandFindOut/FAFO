/* ------------------------------------------------------------------
   Phases B–D — desktop sim window manager.

   B (open/close):
   - Each .app-window starts hidden in HTML.
   - On load: Welcome auto-opens on first visit, closed state persists
     in localStorage (so returning visitors get the bare desktop).
   - Desktop icons (.desktop-icon[data-opens]) open their window on
     click.
   - Close button (.dw-ctrl[data-close]) closes the window it belongs
     to. Closing Welcome also remembers the close.
   - Solitaire video pauses on close, plays on open (saves CPU).

   C (drag):
   - mousedown on .dw-titlebar[data-drag-handle] (but NOT on its
     min/max/close buttons) starts a drag. Window's CSS position is
     converted to inline top/left so subsequent moves have a consistent
     anchor (some windows are CSS-positioned via right/bottom).
   - Constraint: ≥80px of titlebar stays in the viewport horizontally,
     and titlebar can't move above y=0 — so the user can always grab
     it back.
   - Drag position survives close + reopen within a session (we don't
     clear inline styles on close). Refresh resets to the CSS preset.

   D (focus / z-index):
   - Mousedown anywhere inside a window focuses it. Only one window has
     .is-focused at a time. Visual: inactive titlebars dim to grey (see
     :not(.is-focused) CSS rule).
   - Each focus bumps a monotonic z-index counter so the focused window
     paints over all others. The same window keeps its z on subsequent
     mousedowns (no churn).
   - Opening a window via icon or auto-open focuses it.

   E (open/close animations):
   - On open: transform-origin is set to the icon's centre (relative to
     the window's top-left), the window starts at scale(0.08) opacity(0)
     with no transition, then transitions to scale(1) opacity(1) on the
     next frame. End result: the window "explodes out" of its icon.
   - On close: transform-origin same trick; window transitions from full
     size to scale(0.08) opacity(0), then hidden=true after the
     transition finishes (180ms timeout).
   - Welcome has no icon → falls back to default centre-origin (looks
     like a centred fade-zoom on itself).

   Phase F (mobile polish) deferred — this file is intentionally small.
   ------------------------------------------------------------------ */

(function () {
  // Bail on mobile — there's no desktop sim there (see windows.css
  // mobile rules), so this script has nothing to do.
  if (window.matchMedia('(max-width: 879.98px)').matches) return;

  const STORAGE_KEY = 'fafo_welcome_closed';

  // Index every .app-window by its data-window id.
  const windows = {};
  document.querySelectorAll('.app-window[data-window]').forEach((el) => {
    windows[el.dataset.window] = el;
  });

  // --- Phase D: focus / z-index. topZ starts above the CSS baseline
  // (z-index:10) so the first focus bump (11) clears every default. ----
  let topZ = 10;

  function focusWindow(el) {
    if (el.classList.contains('is-focused')) return;
    document.querySelectorAll('.app-window.is-focused').forEach((w) => {
      w.classList.remove('is-focused');
    });
    el.classList.add('is-focused');
    topZ += 1;
    el.style.zIndex = String(topZ);
  }

  // --- Phase E: animation helpers -----------------------------------
  const ANIM_MS = 180; // must match CSS transition duration

  // Set transform-origin to the icon's centre, expressed relative to the
  // window's top-left. So the scale animation pivots around the icon —
  // the window grows out of (or collapses into) that point.
  // Must be called while the window is at scale(1) (no animation class
  // applied), otherwise getBoundingClientRect returns the scaled rect.
  function setOriginFromIcon(el, iconEl) {
    if (!iconEl) { el.style.transformOrigin = ''; return; }
    const i = iconEl.getBoundingClientRect();
    const w = el.getBoundingClientRect();
    const ox = (i.left + i.width / 2) - w.left;
    const oy = (i.top + i.height / 2) - w.top;
    el.style.transformOrigin = ox + 'px ' + oy + 'px';
  }

  function openWindow(id, iconEl) {
    const el = windows[id];
    if (!el) return;
    if (!iconEl) iconEl = document.querySelector('.desktop-icon[data-opens="' + id + '"]');

    // Unhide first so layout is committed; window appears at scale(1)
    // for a single JS turn (no paint yet, this is synchronous DOM work).
    el.hidden = false;

    // Measure-then-set origin BEFORE applying the .is-opening class,
    // because the class sets scale(0.08) which would change the measured
    // rect via getBoundingClientRect.
    setOriginFromIcon(el, iconEl);

    // Jump to the small/invisible starting state with no transition.
    el.classList.add('is-opening');

    // Force a sync layout so the start state is fully committed before
    // we remove the class — without this, browser would batch both
    // changes and the transition wouldn't fire.
    void el.offsetWidth;

    // Next frame, remove the class → transition kicks in, window grows
    // to default scale(1) opacity(1).
    requestAnimationFrame(function () {
      el.classList.remove('is-opening');
    });

    focusWindow(el); // newly-opened window jumps to the front
    if (id === 'solitaire') {
      const v = el.querySelector('video');
      // .play() returns a promise that rejects if autoplay is blocked
      // (muted + playsinline normally lets it through). Silence the
      // rejection so it doesn't end up in DevTools as an uncaught error.
      if (v) v.play().catch(function () {});
    }
  }

  function closeWindow(id) {
    const el = windows[id];
    if (!el) return;

    // Set origin so the window collapses TOWARD its icon.
    const icon = document.querySelector('.desktop-icon[data-opens="' + id + '"]');
    setOriginFromIcon(el, icon);

    // Trigger close animation (transitions to scale(0.08) opacity(0)).
    el.classList.add('is-closing');

    // After the transition, actually hide and run the side-effects.
    // Timeout matches the CSS duration; using transitionend is fragile
    // because it fires once per animated property (transform AND opacity).
    setTimeout(function () {
      el.classList.remove('is-closing');
      el.style.transformOrigin = '';
      el.hidden = true;
      if (id === 'solitaire') {
        const v = el.querySelector('video');
        if (v) v.pause();
      }
      if (id === 'welcome') {
        // Best-effort persistence — Safari private mode throws on
        // localStorage.setItem. If it fails, Welcome will simply
        // auto-open again next visit; we don't surface the error.
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      }
    }, ANIM_MS);
  }

  // First-paint state. Welcome auto-opens unless the user has closed it
  // before (localStorage flag). Episodes / Solitaire start hidden.
  let welcomeWasClosed = false;
  try {
    welcomeWasClosed = !!localStorage.getItem(STORAGE_KEY);
  } catch (e) {}

  // Intro choreography. The inline head script in index.html set
  // html.fafo-intro if the visitor just came through the login flow.
  // If so: logo fades in over 3s, then icons fade in and Welcome opens
  // with its existing zoom animation.
  const justLoggedIn = document.documentElement.classList.contains('fafo-intro');
  try { sessionStorage.removeItem('fafo_just_logged_in'); } catch (e) {}

  if (justLoggedIn) {
    // Force a layout pass so the initial opacity:0 state is committed
    // before we flip the class — otherwise the browser would batch both
    // changes and skip the transition.
    void document.documentElement.offsetWidth;
    requestAnimationFrame(function () {
      document.documentElement.classList.add('fafo-intro-logo-in');
    });
    setTimeout(function () {
      document.documentElement.classList.add('fafo-intro-icons-in');
      if (!welcomeWasClosed) openWindow('welcome');
    }, 3000);
  } else if (!welcomeWasClosed) {
    openWindow('welcome');
  }

  // Wire desktop icons. Pass the icon element so the open animation knows
  // where to scale-from.
  document.querySelectorAll('.desktop-icon[data-opens]').forEach((btn) => {
    btn.addEventListener('click', () => openWindow(btn.dataset.opens, btn));
  });

  // Wire close buttons inside windows.
  document.querySelectorAll('.app-window [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const win = btn.closest('.app-window');
      if (win) closeWindow(win.dataset.window);
    });
  });

  // --- Phase C: drag windows by their titlebar -----------------------
  function makeDraggable(win) {
    const handle = win.querySelector('[data-drag-handle]');
    if (!handle) return;

    let startMouseX, startMouseY, startLeft, startTop;

    handle.addEventListener('mousedown', function (e) {
      // Ignore drags that start on the min/max/close button cluster.
      if (e.target.closest('.dw-titlebar-controls')) return;
      if (e.button !== 0) return; // primary button only

      e.preventDefault(); // suppress text selection while dragging

      // Snapshot the window's CURRENT viewport rect. This works even when
      // the window was positioned via right/bottom in CSS — we just read
      // the computed left/top and use them as the drag anchor.
      const r = win.getBoundingClientRect();
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startLeft = r.left;
      startTop = r.top;

      // Convert to inline left/top so the CSS right/bottom rules don't
      // fight us as we move. Clearing right/bottom is essential — without
      // it the window would only move in one direction.
      win.style.left = startLeft + 'px';
      win.style.top = startTop + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';

      win.classList.add('is-dragging');

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
    });

    function onMove(e) {
      let nx = startLeft + (e.clientX - startMouseX);
      let ny = startTop + (e.clientY - startMouseY);

      // Constrain: keep ≥80px of titlebar in the viewport so the user
      // can always grab it back, and don't let titlebar go above y=0.
      const minVisible = 80;
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const handleH = handle.offsetHeight;
      const winW = win.offsetWidth;

      nx = Math.max(minVisible - winW, Math.min(vpW - minVisible, nx));
      ny = Math.max(0, Math.min(vpH - handleH, ny));

      win.style.left = nx + 'px';
      win.style.top = ny + 'px';
    }

    function onUp() {
      win.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
    }
  }

  document.querySelectorAll('.app-window').forEach(makeDraggable);

  // --- Phase D: focus on mousedown ----------------------------------
  // Listening on the window itself catches every interaction (titlebar,
  // content, controls). mousedown fires before click, so the focused
  // window is already on top by the time the click handler runs.
  document.querySelectorAll('.app-window').forEach((win) => {
    win.addEventListener('mousedown', () => focusWindow(win));
  });
})();
