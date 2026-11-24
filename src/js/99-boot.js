// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildRail();
initHost();
initGlobalDrop();
$('#filesbtn').addEventListener('click', e => filesMenu(e.currentTarget));
store.listeners.add(updateFilesButton);
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (store.files.length) { e.preventDefault(); e.returnValue = ''; } });
window.folio = { store, addBytes, go, TOOLS, get active() { return active; } }; // handy for scripting & tests
if ((location.protocol === 'http:' || location.protocol === 'https:') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
setupPdfjsWorker().finally(() => { document.body.dataset.ready = '1'; route(); });
