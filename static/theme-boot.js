/* Sets <html data-theme> before the first paint so the page never flashes the wrong theme.
   A classic blocking script (CSP: script-src 'self'); keep it in step with src/lib/theme/theme.ts. */
(function () {
  var preference = 'system';
  var prefersLight = false;

  try {
    var stored = localStorage.getItem('harness-test-portal:theme');

    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch {
    /* storage blocked: treat as "system" */
  }

  if (preference === 'system') {
    try {
      prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch {
      /* no matchMedia: dark */
    }
  }

  try {
    document.documentElement.dataset.theme = preference === 'system' ? (prefersLight ? 'light' : 'dark') : preference;
  } catch {
    /* nothing to set it on */
  }
})();
