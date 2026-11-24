// ---------------------------------------------------------------------------
// Shell: tool registry, routing, home dashboard, tool frame, run bar, results.
// ---------------------------------------------------------------------------
const TOOLS = [];
const GROUPS = [
  ['read', 'Read & fill'],
  ['organize', 'Organize'],
  ['edit', 'Edit & sign'],
  ['convert', 'Convert & optimize'],
];
function defineTool(t) { TOOLS.push(Object.assign({ input: 'pdf', side: true, run: true }, t)); }
const toolById = id => TOOLS.find(t => t.id === id);
let active = null; // current tool context

function go(id) { if (location.hash.slice(1) !== id) location.hash = id; else route(); }
function route() {
  const id = location.hash.slice(1);
  const t = toolById(id);
  if (active && active.destroy) active.destroy();
  active = null;
  for (const a of $$('.rail a')) if (a.dataset.id === (t ? t.id : 'home')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  const view = $('#view');
  view.replaceChildren();
  view.scrollTop = 0;
  if (!t) { renderHome(view); document.title = 'The PDF Tool'; return; }
  document.title = t.name + ' · The PDF Tool';
  mountTool(t, view);
}

function buildRail() {
  const rail = $('.rail');
  rail.append(h('a', { href: '#home', 'data-id': 'home' }, icon('home'), 'Home'));
  for (const [g, label] of GROUPS) {
    rail.append(h('h3', { text: label }));
    for (const t of TOOLS.filter(t => t.group === g)) rail.append(h('a', { href: '#' + t.id, 'data-id': t.id }, icon(t.icon), t.name));
  }
}

// ---------- home ----------
function dropZone({ title, sub, accept = '.pdf,application/pdf,image/*', multiple = true, onfiles, compact }) {
  const input = h('input', { type: 'file', accept, multiple, class: 'sr', tabindex: '-1', onchange: () => { onfiles([...input.files]); input.value = ''; } });
  const z = h('div', { class: 'drop' + (compact ? ' compact' : '') },
    icon('upload', 'i big'), h('strong', { text: title }), sub ? h('p', { text: sub }) : null,
    h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, btn('Choose files', () => input.click(), { cls: 'primary', ic: 'files' })), input);
  z.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); z.classList.remove('over'); onfiles([...e.dataTransfer.files]); });
  z.pick = () => input.click();
  return z;
}
function fileChip(d, onclick) {
  return h('button', { class: 'chipfile', type: 'button', onclick, title: d.name },
    d.kind === 'pdf' ? thumbImg(d, 0, 60) : h('img', { src: (d.url || (d.url = URL.createObjectURL(new Blob([d.bytes], { type: d.mime })))), alt: '' }),
    h('span', null, h('b', { text: d.name }), h('small', { text: (d.kind === 'pdf' ? plural(d.pages, 'page') + ' · ' : `${d.w}×${d.h} · `) + fmtBytes(d.size) })));
}
function renderHome(view) {
  const wrap = h('div', { class: 'home' });
  wrap.append(h('h1', { text: 'Everything you need to do with a PDF, right here.' }),
    h('p', { class: 'lede', text: 'Read, merge, split, compress, convert, sign, watermark, crop, edit and fill forms. The PDF Tool runs entirely in your browser — your files never leave this device.' }));
  wrap.append(dropZone({
    title: 'Drop PDFs or images here', sub: 'PDFs open in the viewer · images go to Image → PDF',
    onfiles: async files => {
      const added = await addFiles(files);
      if (!added.length) return;
      if (added.every(d => d.kind === 'image')) go('fromimage');
      else if (added.filter(d => d.kind === 'pdf').length > 1) go('merge');
      else go('view');
    },
  }));
  if (store.files.length) {
    wrap.append(h('div', { class: 'recent', 'aria-label': 'Open files' }, store.files.slice().reverse().map(d => fileChip(d, () => { setCurrent(d); go(d.kind === 'pdf' ? 'view' : 'fromimage'); }))));
  }
  const groups = h('div', { class: 'groups' });
  for (const [g, label] of GROUPS) {
    groups.append(h('section', { class: 'group' }, h('h2', { text: label }),
      h('div', { class: 'tiles' }, TOOLS.filter(t => t.group === g).map(t =>
        h('a', { class: 'tile', href: '#' + t.id }, h('div', { class: 'ic' }, icon(t.icon)), h('div', null, h('b', { text: t.name }), h('span', { text: t.desc })))))));
  }
  wrap.append(groups);
  view.append(wrap);
}

// ---------- tool frame ----------
function mountTool(t, view) {
  const prefs = loadPrefs(t.id, t.defaults || {});
  const runBtn = btn(t.runLabel || t.name, () => doRun(ctx), { cls: 'primary', ic: t.runIcon || 'download' });
  runBtn.append(h('kbd', { text: navigator.platform && /Mac/.test(navigator.platform) ? '⌘↵' : 'Ctrl↵', 'aria-hidden': 'true' }));
  const status = h('div', { class: 'status', 'aria-live': 'polite' });
  const outInput = h('input', { class: 'inp', id: 'outname', autocomplete: 'off', spellcheck: 'false' });
  const outWrap = h('div', { class: 'outname' }, h('label', { for: 'outname', text: t.outLabel || 'Save as' }), outInput);
  const optBtn = t.side ? btn('Options', () => side.scrollIntoView({ behavior: 'smooth', block: 'start' }), { cls: 'ghost sm narrow-only', ic: 'down' }) : null;
  const runbar = h('div', { class: 'runbar' }, outWrap, status, optBtn, runBtn);
  const result = h('div', { class: 'result', hidden: true });
  const work = h('div', { class: 'work' }), side = h('aside', { class: 'side', 'aria-label': 'Settings' });
  const headExtra = h('div', { class: 'row' });
  const sec = h('section', { class: 'tool' + (t.side ? '' : ' noside'), 'aria-labelledby': 'tool-title' },
    h('div', { class: 'tool-head' }, h('div', { class: 'grow' }, h('h1', { id: 'tool-title', text: t.title || t.name }), h('p', { text: t.desc })), headExtra),
    h('div', { class: 'tool-body' }, work, side),
    h('div', null, result, runbar));
  view.append(sec);

  const cleanups = [];
  const ctx = {
    tool: t, prefs, work, side, headExtra, runbar, runBtn, result, status, sec,
    save: () => savePrefs(t.id, prefs),
    on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); },
    destroy() { ctx.dead = true; cleanups.forEach(f => f()); ctx.cleanup && ctx.cleanup(); },
    runnable: true,
    setRunnable(ok, why, isError) { ctx.runnable = ok; runBtn.disabled = !ok || ctx.busy; runBtn.title = ok ? '' : (why || ''); if (!ok && why) setStatus(why, isError ? 'error' : 'hint'); else if (ok && status.dataset.warn) setStatus(''); },
    set outName(v) { outInput.value = v; }, get outName() { return outInput.value.trim(); },
    progress(frac, text) { setStatus(text || '', false, frac); },
    remount() { route(); },
    showRun(show) { runbar.hidden = !show; },
    showOutName(show) { outWrap.hidden = !show; },
  };
  function setStatus(text, warn, frac) {
    status.replaceChildren();
    status.dataset.warn = warn ? '1' : '';
    status.style.color = warn === 'error' || warn === true ? 'var(--danger)' : '';
    if (frac != null) status.append(h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(clamp(frac, 0, 1) * 100)}%` })));
    if (text) status.append(h('span', { text }));
  }
  ctx.setStatus = setStatus;
  active = ctx;
  outInput.addEventListener('input', () => { ctx.outEdited = true; });

  if (t.input === 'pdf') {
    const f = currentPdf();
    if (!f) {
      sec.classList.add('noside'); runbar.hidden = true;
      work.append(pickerFor(t));
      return;
    }
    ctx.file = f;
    if (store.current !== f.id) store.current = f.id;
    work.append(fileBar(f, t));
    if (t.outName) ctx.outName = t.outName(f, prefs);
  } else if (t.outName) ctx.outName = t.outName(null, prefs);
  try { t.mount(ctx); } catch (e) { console.error(e); toast('This tool hit a problem: ' + friendlyError(e), 'error'); }
  if (!t.run) runbar.hidden = true;
}

function pickerFor(t) {
  const pdfs = store.files.filter(f => f.kind === 'pdf');
  return h('div', { class: 'pick' },
    dropZone({ title: t.pickTitle || `Choose a PDF to ${t.verb || 'open'}`, sub: 'Drop it here or browse. Nothing is uploaded.', accept: '.pdf,application/pdf', multiple: false,
      onfiles: async files => { const a = await addFiles(files); if (a.some(d => d.kind === 'pdf')) route(); } }),
    pdfs.length ? h('div', { class: 'open' }, h('h4', { text: 'Or use a file you already opened' }),
      h('div', { class: 'recent' }, pdfs.slice().reverse().map(d => fileChip(d, () => { setCurrent(d); route(); })))) : null);
}
function fileBar(f, t) {
  const change = btn('Change file', e => {
    const others = store.files.filter(x => x.kind === 'pdf' && x !== f);
    popMenu(e.currentTarget, [
      ...others.map(o => ({ label: o.name, icon: 'file', onclick: () => { setCurrent(o); route(); } })),
      others.length ? null : undefined,
      { label: 'Open another PDF…', icon: 'files', onclick: () => pickFiles('.pdf,application/pdf', false, async files => { const a = await addFiles(files); if (a.length) route(); }) },
    ].filter(x => x !== undefined));
  }, { cls: 'sm' });
  return h('div', { class: 'filebar' }, icon(f.encrypted ? 'lock' : 'file'), h('span', { class: 'nm', text: f.name, title: f.name }),
    h('small', { text: `${plural(f.pages, 'page')} · ${fmtBytes(f.size)}` }), change);
}
function pickFiles(accept, multiple, cb) {
  const input = h('input', { type: 'file', accept, multiple, style: 'display:none', onchange: () => { cb([...input.files]); input.remove(); } });
  document.body.append(input); input.click();
}

// ---------- running ----------
async function doRun(ctx) {
  if (!ctx || ctx.busy || !ctx.runnable || !ctx.onRun) return;
  ctx.busy = true; ctx.runBtn.disabled = true; ctx.result.hidden = true;
  const t0 = performance.now();
  ctx.progress(0, 'Working…');
  try {
    const res = await ctx.onRun((f, txt) => ctx.progress(f, txt));
    if (res && !ctx.dead) await presentResult(ctx, res, performance.now() - t0);
    else ctx.setStatus('');
  } catch (e) {
    console.error(e);
    ctx.setStatus('');
    toast('Something went wrong: ' + friendlyError(e), 'error');
  } finally {
    ctx.busy = false; ctx.runBtn.disabled = !ctx.runnable;
  }
}
async function presentResult(ctx, res, ms) {
  const outs = res.outputs;
  const r = ctx.result;
  r.replaceChildren();
  ctx.setStatus('');
  const total = outs.reduce((s, o) => s + o.data.length, 0);
  let doc = null;
  if (outs.length === 1 && outs[0].pdf && res.keep !== false) {
    doc = await addBytes(outs[0].data, outs[0].name, 'application/pdf', { select: false, derivedFrom: ctx.file && ctx.file.id });
  }
  const acts = h('div', { class: 'acts' });
  if (!outs.length) { /* nothing to download */ } else if (outs.length === 1) {
    acts.append(btn('Download', () => saveFile(outs[0].name, outs[0].data), { cls: 'primary', ic: 'download' }));
  } else {
    const zipName = safeName(res.zipName || baseName(ctx.outName || 'files'), 'zip');
    acts.append(btn(`Download all (.zip)`, () => saveFile(zipName, zipFiles(outs)), { cls: 'primary', ic: 'download' }));
    acts.append(btn('One by one', e => popMenu(e.currentTarget, outs.map(o => ({ label: `${o.name} · ${fmtBytes(o.data.length)}`, icon: 'download', onclick: () => saveFile(o.name, o.data) }))), { ic: 'chev' }));
  }
  if (doc) {
    acts.append(btn('View', () => { setCurrent(doc); go('view'); }, { ic: 'view' }));
    acts.append(btn('Continue with', e => popMenu(e.currentTarget, TOOLS.filter(t => t.input === 'pdf' || t.id === 'merge').map(t => ({ label: t.name, icon: t.icon, onclick: () => { setCurrent(doc); if (t.id === 'merge') mergeAdd(doc); go(t.id); if (t.id === ctx.tool.id) route(); } }))), { ic: 'chev' }));
  }
  r.append(h('div', { class: 'ok' }, icon('check')),
    h('div', { class: 'txt' }, h('b', { text: res.summary || 'Done' }), h('small', { text: res.detail || (!outs.length ? '' : outs.length === 1 ? `${outs[0].name} · ${fmtBytes(total)}` : `${plural(outs.length, 'file')} · ${fmtBytes(total)}`) })),
    acts);
  r.hidden = false;
  r.querySelector('.ok').style.background = outs.length ? '' : 'var(--muted)';
  if (acts.firstChild) acts.firstChild.focus();
}

// ---------- top bar: files menu ----------
function filesMenu(anchor) {
  const items = store.files.slice().reverse().map(d => ({ label: `${d.name} — ${d.kind === 'pdf' ? plural(d.pages, 'page') : 'image'}, ${fmtBytes(d.size)}`, icon: d.kind === 'pdf' ? 'file' : 'toimage', onclick: () => { setCurrent(d); go(d.kind === 'pdf' ? 'view' : 'fromimage'); } }));
  if (items.length) items.push(null, { label: 'Close all files', icon: 'trash', onclick: () => { store.files.slice().forEach(removeFile); route(); } });
  items.unshift({ label: 'Open files…', icon: 'files', onclick: () => pickFiles('.pdf,application/pdf,image/*', true, async f => { const a = await addFiles(f); if (a.length) { if (active && active.tool.input === 'pdf') route(); else if (!active) go(a.every(d => d.kind === 'image') ? 'fromimage' : 'view'); else active.onFiles && active.onFiles(a); } }) }, items.length ? null : undefined);
  popMenu(anchor, items.filter(x => x !== undefined));
}
function updateFilesButton() {
  const b = $('#filesbtn'); if (!b) return;
  b.lastChild.textContent = store.files.length ? `Files (${store.files.length})` : 'Open';
}

// ---------- global drag & drop and shortcuts ----------
function initGlobalDrop() {
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('dropzone-over'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dropzone-over'); });
  window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async e => {
    depth = 0; document.body.classList.remove('dropzone-over');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const added = await addFiles([...e.dataTransfer.files], { select: false });
    if (!added.length) return;
    if (active && active.onFiles) return active.onFiles(added);
    const pdf = added.find(d => d.kind === 'pdf');
    if (active && active.tool.input === 'pdf' && pdf) { setCurrent(pdf); return route(); }
    if (!active) { setCurrent(pdf || added[0]); go(pdf ? (added.filter(d => d.kind === 'pdf').length > 1 ? 'merge' : 'view') : 'fromimage'); }
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && active && !active.runbar.hidden) { e.preventDefault(); doRun(active); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#filesbtn') && filesMenu($('#filesbtn')); }
  });
}
