/* Theme toggle | November 2026 | Eli Bulger
 * Steps: Read stored preference, update the button, toggle light/dark mode.
 * Inputs: Optional saved preference and button clicks.
 * Outputs: Color theme.
 */
(() => {
  'use strict';
  const button = document.querySelector('#theme-toggle');
  if (!button) return;
  const root = document.documentElement;
  const update = () => {
    const dark = root.dataset.theme === 'dark';
    button.textContent = dark ? 'Light' : 'Dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  update();
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('site-theme', root.dataset.theme); } catch (_) {}
    update();
  });
})();
