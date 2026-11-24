// ---------------------------------------------------------------------------
// Shared: drag-to-reorder for lists and grids (with keyboard/button fallbacks).
// ---------------------------------------------------------------------------
function sortable(container, selector, onMove, { horizontal = false } = {}) {
  let from = null;
  container.addEventListener('dragstart', e => {
    const el = e.target.closest(selector);
    if (!el || e.target.closest('input,textarea,select')) return;
    from = +el.dataset.idx; el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/x-folio', String(from)); } catch (err) { /* ok */ }
  });
  const clear = () => $$('.drop-before,.drop-after', container).forEach(n => n.classList.remove('drop-before', 'drop-after'));
  container.addEventListener('dragover', e => {
    if (from == null) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.target.closest(selector); clear();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    if (after) { const nx = el.nextElementSibling; nx && nx.matches(selector) ? nx.classList.add('drop-before') : el.classList.add('drop-after'); }
    else el.classList.add('drop-before');
  });
  container.addEventListener('drop', e => {
    if (from == null) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.target.closest(selector);
    let to = null;
    if (el) { const r = el.getBoundingClientRect(); const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; to = +el.dataset.idx + (after ? 1 : 0); }
    clear();
    const f = from; from = null;
    if (to != null && to !== f && to !== f + 1) onMove(f, to > f ? to - 1 : to);
  });
  container.addEventListener('dragend', () => { from = null; clear(); $$('.dragging', container).forEach(n => n.classList.remove('dragging')); });
}
const moveItem = (arr, from, to) => { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); };

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------
let mergeItems = [];
function mergeAdd(doc) { if (!mergeItems.some(m => m.doc === doc)) mergeItems.push({ key: uid(), doc, range: '' }); }

defineTool({
  id: 'merge', name: 'Merge', icon: 'merge', group: 'organize', input: 'none', runLabel: 'Merge', runIcon: 'merge',
  desc: 'Combine PDFs and images into one file. Drag to reorder and pick pages from each.',
  defaults: { bookmarks: 'keep', blankOdd: false, imgSize: 'fit', forms: 'keep' },
  outName: () => 'merged.pdf',
  mount(ctx) {
    const P = ctx.prefs;
    mergeItems = mergeItems.filter(m => store.files.includes(m.doc));
    if (!mergeItems.length) store.files.forEach(d => mergeAdd(d));
    const list = h('div', { class: 'rows', 'aria-label': 'Files to merge' });
    const count = h('span', { class: 'count' });
    const add = files => { files.forEach(d => mergeItems.push({ key: uid(), doc: d, range: '' })); draw(); };
    ctx.onFiles = add;
    const addInput = () => pickFiles('.pdf,application/pdf,image/*', true, async fl => add(await addFiles(fl, { select: false })));
    const bar = h('div', { class: 'toolbar' },
      btn('Add files', addInput, { cls: 'sm primary', ic: 'plus' }),
      btn('Sort A–Z', () => { mergeItems.sort((a, b) => a.doc.name.localeCompare(b.doc.name, undefined, { numeric: true })); draw(); }, { cls: 'sm', ic: 'sort' }),
      btn('Reverse', () => { mergeItems.reverse(); draw(); }, { cls: 'sm', ic: 'reverse' }),
      btn('Clear', () => { mergeItems = []; draw(); }, { cls: 'sm ghost danger', ic: 'trash' }), count);
    const more = h('div', { class: 'addmore' }, 'Drop more PDFs or images here, or ', h('a', { href: '#', onclick: e => { e.preventDefault(); addInput(); }, text: 'browse' }), '.');
    ctx.work.append(bar, list, more);
    sortable(list, '.frow', (a, b) => { moveItem(mergeItems, a, b); draw(); });

    const imgOpt = field('Image pages', seg([['fit', 'Fit image'], ['a4', 'A4'], ['letter', 'Letter']], P.imgSize, v => { P.imgSize = v; ctx.save(); }, 'Image page size'), 'Page size used for images you add to the merge.');
    ctx.side.append(
      h('h4', { text: 'Bookmarks' }),
      choices('bm', [
        { v: 'keep', title: 'One per file, keep originals', sub: 'Each file gets a bookmark; its own bookmarks nest inside.' },
        { v: 'files', title: 'One per file', sub: 'A simple table of contents from file names.' },
        { v: 'none', title: 'No bookmarks' },
      ], P.bookmarks, v => { P.bookmarks = v; ctx.save(); }),
      h('h4', { text: 'Form fields' }),
      choices('forms', [
        { v: 'keep', title: 'Keep fillable', sub: 'Fields stay editable. Duplicate names get a suffix so they don’t share values.' },
        { v: 'flatten', title: 'Flatten', sub: 'Bake current values into the page.' },
      ], P.forms, v => { P.forms = v; ctx.save(); }),
      checkbox('Add a blank page after files with an odd page count', P.blankOdd, v => { P.blankOdd = v; ctx.save(); }, 'Keeps every file starting on a front side when printing double-sided.'),
      imgOpt);

    function draw() {
      list.replaceChildren();
      mergeItems.forEach((m, i) => {
        const d = m.doc, isPdf = d.kind === 'pdf';
        const rf = isPdf ? rangeField({ label: '', value: m.range, total: d.pages, placeholder: `All ${d.pages} pages`, help: '', onchange: () => { m.range = rf.value; validate(); } }) : null;
        if (rf) { rf.input.setAttribute('aria-label', `Pages from ${d.name}`); rf.el.style.margin = '0'; rf.check(); }
        const row = h('div', { class: 'frow', draggable: 'true', 'data-idx': String(i) },
          h('div', { class: 'grip', title: 'Drag to reorder' }, icon('grip')),
          h('div', { class: 'th' }, isPdf ? thumbImg(d, 0, 60) : h('img', { src: d.url || (d.url = URL.createObjectURL(new Blob([d.bytes], { type: d.mime }))), alt: '' })),
          h('div', { class: 'meta' }, h('b', { text: d.name, title: d.name }), h('small', { text: isPdf ? `${plural(d.pages, 'page')} · ${fmtBytes(d.size)}` : `Image · ${d.w}×${d.h}` }), rf ? rf.el : null),
          h('div', { class: 'acts' },
            iconBtn('up', 'Move up', () => { if (i > 0) { moveItem(mergeItems, i, i - 1); draw(); } }),
            iconBtn('down', 'Move down', () => { if (i < mergeItems.length - 1) { moveItem(mergeItems, i, i + 1); draw(); } }),
            iconBtn('copy', 'Duplicate', () => { mergeItems.splice(i + 1, 0, { key: uid(), doc: d, range: m.range }); draw(); }),
            iconBtn('x', 'Remove', () => { mergeItems.splice(i, 1); draw(); })));
        list.append(row);
      });
      if (!mergeItems.length) list.append(h('div', { class: 'empty', text: 'No files yet. Add two or more PDFs (or images) to merge them.' }));
      imgOpt.hidden = !mergeItems.some(m => m.doc.kind === 'image');
      if (!ctx.outEdited && mergeItems[0]) ctx.outName = baseName(mergeItems[0].doc.name) + '-merged.pdf';
      validate();
    }
    function validate() {
      let pages = 0, bad = null;
      for (const m of mergeItems) {
        if (m.doc.kind === 'image') { pages++; continue; }
        const r = parseRanges(m.range, m.doc.pages);
        if (r.error) bad = bad || `${m.doc.name}: ${r.error}`; else pages += r.pages.length;
      }
      count.textContent = `${plural(mergeItems.length, 'file')} · ${plural(pages, 'page')}`;
      if (bad) ctx.setRunnable(false, bad, true);
      else if (mergeItems.length < 1) ctx.setRunnable(false, 'Add files to merge.');
      else ctx.setRunnable(true);
      if (!bad && mergeItems.length === 1) ctx.setStatus('Tip: add another file — or use this to pull pages out of one PDF.');
    }
    draw();

    ctx.onRun = async progress => {
      const out = await PDFDocument.create();
      const tree = [], cache = new Map(), usedNames = new Map();
      for (let k = 0; k < mergeItems.length; k++) {
        const m = mergeItems[k], d = m.doc, start = out.getPageCount();
        progress(k / mergeItems.length, `Adding ${d.name}…`);
        if (d.kind === 'image') {
          const img = await embedImageFile(out, d);
          addImagePage(out, img, { size: P.imgSize, margin: P.imgSize === 'fit' ? 0 : 28 });
          tree.push({ title: baseName(d.name), pageIndex: start, children: [] });
        } else {
          let src = cache.get(d.id);
          if (!src) { src = await libDoc(d); cache.set(d.id, src); }
          const sel = parseRanges(m.range, d.pages).pages;
          if (P.forms === 'flatten') { try { src.getForm().flatten(); } catch (e) { /* no form */ } }
          const copied = await out.copyPages(src, sel);
          copied.forEach(p => out.addPage(p));
          let children = [];
          if (P.bookmarks === 'keep') {
            const pos = new Map(); sel.forEach((pi, j) => { if (!pos.has(pi)) pos.set(pi, start + j); });
            const remap = list => list.map(n => ({ title: n.title, pageIndex: pos.has(n.pageIndex) ? pos.get(n.pageIndex) : null, children: remap(n.children) }));
            children = remap(await readOutline(d));
          }
          tree.push({ title: baseName(d.name), pageIndex: start, children });
          if (P.forms === 'keep') collectFields(out, copied, usedNames, k);
        }
        const n = out.getPageCount() - start;
        if (P.blankOdd && n % 2 === 1) { const last = out.getPage(out.getPageCount() - 1).getSize(); out.addPage([last.width, last.height]); }
        await tick();
      }
      if (P.bookmarks !== 'none') writeOutline(out, tree);
      progress(0.95, 'Saving…');
      const o = await pdfOutput(out, ctx.outName || 'merged.pdf');
      return { outputs: [o], summary: `Merged ${plural(mergeItems.length, 'file')}`, detail: `${o.name} · ${plural(out.getPageCount(), 'page')} · ${fmtBytes(o.data.length)}` };
    };
  },
});

// Re-register copied form fields so they stay fillable in the merged file.
function collectFields(out, pages, usedNames, fileIdx) {
  const ctx = out.context, N = k => PDFName.of(k);
  let af = out.catalog.lookup(N('AcroForm'));
  if (!(af instanceof PDFDict)) { af = ctx.obj({ Fields: [] }); out.catalog.set(N('AcroForm'), ctx.register(af)); }
  let fields = af.lookup(N('Fields'));
  if (!(fields instanceof PDFArray)) { fields = ctx.obj([]); af.set(N('Fields'), fields); }
  const seen = new Set();
  for (const p of pages) {
    const annots = p.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i), a = ctx.lookup(ref);
      if (!(a instanceof PDFDict) || pdfNameText(a.get(N('Subtype'))) !== 'Widget') continue;
      let topRef = ref, top = a;
      while (top.get(N('Parent'))) { const pr = top.get(N('Parent')); const pd = ctx.lookup(pr); if (!(pd instanceof PDFDict)) break; topRef = pr; top = pd; }
      const key = topRef.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      const t = top.lookup(N('T'));
      const name = t && t.decodeText ? t.decodeText() : '';
      if (name) {
        const owner = usedNames.get(name);
        if (owner != null && owner !== fileIdx) top.set(N('T'), PDFHexString.fromText(`${name}_${fileIdx + 1}`));
        else usedNames.set(name, fileIdx);
      }
      fields.push(topRef);
    }
  }
}
