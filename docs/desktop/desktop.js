/* ------------------------------------------------------------------
   Phase 2 — desktop sim window manager.

   - Each .app-window starts hidden in HTML.
   - On load: Welcome auto-opens on first visit, closed state persists
     in localStorage (so returning visitors get the bare desktop).
   - Desktop icons (.desktop-icon[data-opens]) open their window on
     click.
   - Close button (.dw-ctrl[data-close]) closes the window it belongs
     to. Closing Welcome also remembers the close.
   - Solitaire video pauses on close, plays on open (saves CPU).

   Phase 3 (drag), Phase 4 (focus / z-index), Phase 5 (animations) and
   Phase 6 (polish) are deferred — this file is intentionally small.
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

  function openWindow(id) {
    const el = windows[id];
    if (!el) return;
    el.hidden = false;
    if (id === 'solitaire') {
      const v = el.querySelector('video');
      // .play() returns a promise that rejects if autoplay is blocked
      // (muted + playsinline normally lets it through). Silence the
      // rejection so it doesn't end up in DevTools as an uncaught error.
      if (v) v.play().catch(() => {});
    }
  }

  function closeWindow(id) {
    const el = windows[id];
    if (!el) return;
    el.hidden = true;
    if (id === 'solitaire') {
      const v = el.querySelector('video');
      if (v) v.pause();
    }
    if (id === 'welcome') {
      // Best-effort persistence — Safari private mode throws on
      // localStorage.setItem. If it fails, Welcome will simply auto-open
      // again next visit; we don't surface the error.
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    }
  }

  // First-paint state. Welcome auto-opens unless the user has closed it
  // before (localStorage flag). Episodes / Solitaire start hidden.
  let welcomeWasClosed = false;
  try {
    welcomeWasClosed = !!localStorage.getItem(STORAGE_KEY);
  } catch (e) {}
  if (!welcomeWasClosed) openWindow('welcome');

  // Wire desktop icons.
  document.querySelectorAll('.desktop-icon[data-opens]').forEach((btn) => {
    btn.addEventListener('click', () => openWindow(btn.dataset.opens));
  });

  // Wire close buttons inside windows.
  document.querySelectorAll('.app-window [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const win = btn.closest('.app-window');
      if (win) closeWindow(win.dataset.window);
    });
  });
})();
