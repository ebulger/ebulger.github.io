/* Website theme toggle | November 2026 | Eli Bulger.
 * Steps: Read the saved theme; switch between light and dark on request.
 * Inputs: Theme button; optional localStorage preference.
 * Outputs: Updated color theme and button label.
 */
(() => {
  const toggle = document.querySelector('#theme-toggle');
  if (!toggle) return;
  const updateLabel = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    toggle.textContent = dark ? 'Light' : 'Dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  updateLabel();
  toggle.addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('site-theme', document.documentElement.dataset.theme); } catch (_) {}
    updateLabel();
  });
})();
