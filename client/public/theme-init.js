/*
 * Sets data-theme before the first paint, so the page never flashes the wrong
 * palette while the bundle loads. Loaded as a plain, blocking <script src> in
 * <head> (not inline, so the Content Security Policy needs no 'unsafe-inline'
 * or hash; not a module, which would run after paint).
 *
 * Deliberately duplicated from src/utils/theme.js (resolveInitialTheme)
 * rather than imported, for the same reason. Keep the two in step.
 */
(function () {
  var theme;
  try {
    var stored = localStorage.getItem('bugsense:theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch {
    /* blocked site data -- fall through to the system preference */
  }
  if (!theme) {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
