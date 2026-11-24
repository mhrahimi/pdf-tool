// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  try { localStorage.setItem('folio:theme', theme || 'system'); } catch (e) { /* ok */ }
  const dark = (theme === 'dark') || ((!theme || theme === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
  const btn = $('#themebtn');
  if (btn) {
    btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    btn.setAttribute('aria-label', btn.title);
    btn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0b1220' : '#1240e0';
}
function initTheme() {
  let theme = 'system';
  try { theme = localStorage.getItem('folio:theme') || 'system'; } catch (e) { /* ok */ }
  applyTheme(theme === 'system' ? null : theme);
  const btn = $('#themebtn');
  if (btn) btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
    applyTheme(next);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) applyTheme(null);
  });
}

buildRail();
initHost();
initGlobalDrop();
initTheme();
$('#filesbtn').addEventListener('click', e => filesMenu(e.currentTarget));
store.listeners.add(updateFilesButton);
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (store.files.length) { e.preventDefault(); e.returnValue = ''; } });
window.folio = { store, addBytes, go, TOOLS, get active() { return active; } }; // handy for scripting & tests
if ((location.protocol === 'http:' || location.protocol === 'https:') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
setupPdfjsWorker().finally(() => { document.body.dataset.ready = '1'; route(); });
