// ---------------------------------------------------------------------------
// Viewer: continuous pages with selectable text, zoom, thumbnails, bookmarks,
// search, document details (fonts & encodings), text export, metadata edit.
// ---------------------------------------------------------------------------
defineTool({
  id: 'view', name: 'View', icon: 'view', group: 'read', verb: 'read', side: false, run: false,
  desc: 'Read any PDF — including CJK and other encodings — with search, bookmarks and document details.',
  mount: mountViewer,
});

const ENC_LABELS = [
  [/^WinAnsiEncoding/, 'Windows Latin (WinAnsi)'], [/^MacRomanEncoding/, 'Mac Roman'], [/^MacExpertEncoding/, 'Mac Expert'],
  [/^StandardEncoding/, 'Adobe Standard'], [/^PDFDocEncoding/, 'PDFDoc'], [/^Identity-[HV]/, 'Identity (glyph IDs)'],
  [/^Uni.*-UTF16-[HV]/, 'Unicode UTF-16'], [/^Uni.*-UCS2-(H|V|HW-H|HW-V)/, 'Unicode UCS-2'], [/^Uni.*-UTF8-[HV]/, 'Unicode UTF-8'],
  [/RKSJ/, 'Shift-JIS'], [/^(EUC|H|V)$|^EUC-[HV]/, 'EUC-JP / JIS'], [/^GBK|^GBpc|^GB-EUC|^GBT/, 'GB (Chinese)'],
  [/^B5|^ETen|^HKscs|^CNS/, 'Big5 (Chinese)'], [/^KSC|^UHC|^KSCms/, 'KS X 1001 (Korean)'],
];
const SCRIPT_BY_ORDERING = { Japan1: 'Japanese', GB1: 'Chinese (Simplified)', CNS1: 'Chinese (Traditional)', Korea1: 'Korean', Identity: 'Any (Identity)', KR: 'Korean', UCS: 'Unicode' };
const pdfNameText = n => (n instanceof PDFName ? n.decodeText() : n && n.decodeText ? n.decodeText() : n ? String(n) : '');

async function analyzeFonts(f) {
  const doc = await libDoc(f);
  const ctx = doc.context, seen = new Map(), N = k => PDFName.of(k);
  const describe = fd => {
    const sub = pdfNameText(fd.get(N('Subtype')));
    const base = pdfNameText(fd.get(N('BaseFont'))).replace(/^[A-Z]{6}\+/, '') || '(unnamed)';
    const enc = fd.lookup(N('Encoding'));
    let encoding, cid = '', desc = fd.lookup(N('FontDescriptor')), type = sub;
    if (enc instanceof PDFName) encoding = enc.decodeText();
    else if (enc instanceof PDFDict) { const b = enc.get(N('BaseEncoding')); encoding = (b ? pdfNameText(b) : 'Built-in') + (enc.get(N('Differences')) ? ' + Differences' : ''); }
    else if (enc instanceof PDFStream) { const nm = enc.dict.get(N('CMapName')); encoding = 'Embedded CMap' + (nm ? ' (' + pdfNameText(nm) + ')' : ''); }
    else encoding = sub === 'Type3' ? 'Custom (Type 3)' : 'Font’s built-in';
    if (sub === 'Type0') {
      const df = fd.lookup(N('DescendantFonts'));
      const d0 = df instanceof PDFArray ? df.lookup(0) : null;
      if (d0 instanceof PDFDict) {
        desc = d0.lookup(N('FontDescriptor'));
        type = 'Type0 / ' + pdfNameText(d0.get(N('Subtype')));
        const csi = d0.lookup(N('CIDSystemInfo'));
        if (csi instanceof PDFDict) cid = pdfNameText(csi.lookup(N('Registry'))) + '-' + pdfNameText(csi.lookup(N('Ordering')));
      }
    }
    const embedded = desc instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some(k => desc.get(N(k)));
    const label = (ENC_LABELS.find(([re]) => re.test(encoding)) || [, ''])[1];
    const ord = cid.split('-').pop();
    return { base, type, encoding, label, cid, script: SCRIPT_BY_ORDERING[ord] || '', embedded, toUnicode: !!fd.get(N('ToUnicode')) };
  };
  const visit = (res, depth) => {
    if (!(res instanceof PDFDict)) return;
    const fonts = res.lookup(N('Font'));
    if (fonts instanceof PDFDict) for (const [k, ref] of fonts.entries()) {
      const key = ref instanceof PDFRef ? ref.toString() : 'd' + seen.size + k;
      if (seen.has(key)) continue;
      const fd = ctx.lookup(ref);
      if (fd instanceof PDFDict) seen.set(key, describe(fd));
    }
    const xo = res.lookup(N('XObject'));
    if (depth < 4 && xo instanceof PDFDict) for (const [, ref] of xo.entries()) {
      const s = ctx.lookup(ref);
      if (s instanceof PDFStream && pdfNameText(s.dict.get(N('Subtype'))) === 'Form') visit(s.dict.lookup(N('Resources')), depth + 1);
    }
  };
  for (const p of doc.getPages()) visit(p.node.Resources(), 0);
  const af = doc.catalog.lookup(N('AcroForm'));
  if (af instanceof PDFDict) visit(af.lookup(N('DR')), 0);
  return [...seen.values()];
}

async function extractText(f, onProgress) {
  const parts = [];
  for (let i = 1; i <= f.pages; i++) {
    const page = await f.pdf.getPage(i);
    const tc = await page.getTextContent();
    let s = '';
    for (const it of tc.items) s += (it.str || '') + (it.hasEOL ? '\n' : '');
    parts.push(s.trim());
    onProgress && onProgress(i / f.pages);
  }
  return parts;
}

function mountViewer(ctx) {
  const f = ctx.file;
  ctx.work.replaceChildren();
  ctx.work.classList.add('flush');
  ctx.headExtra.append(
    btn('Download', () => saveFile(safeName(f.name, 'pdf'), f.bytes), { ic: 'download', cls: 'sm' }),
    btn('Use in', e => popMenu(e.currentTarget, TOOLS.filter(t => t.id !== 'view' && (t.input === 'pdf' || t.id === 'merge')).map(t => ({ label: t.name, icon: t.icon, onclick: () => { if (t.id === 'merge') mergeAdd(f); go(t.id); } }))), { ic: 'chev', cls: 'sm' }),
    btn('Change file', e => popMenu(e.currentTarget, [
      ...store.files.filter(x => x.kind === 'pdf' && x !== f).map(o => ({ label: o.name, icon: 'file', onclick: () => { setCurrent(o); route(); } })),
      { label: 'Open another PDF…', icon: 'files', onclick: () => pickFiles('.pdf,application/pdf', true, async fl => { const a = await addFiles(fl); if (a.length) route(); }) },
    ]), { cls: 'sm', ic: 'files' }));
  $('#tool-title').textContent = f.name;
  $('#tool-title').nextSibling.textContent = `${plural(f.pages, 'page')} · ${fmtBytes(f.size)}${f.encrypted ? ' · unlocked with password' : ''}`;

  let scale = 1, fitMode = 'width', cur = 0, query = '';
  const pageDivs = [], state = [];
  const scroller = h('div', { class: 'vscroll', tabindex: '0', 'aria-label': 'Document pages' });
  const pageInp = h('input', { class: 'inp', value: '1', 'aria-label': 'Page number', inputmode: 'numeric' });
  const zoomLbl = h('span', { class: 'zoom', 'aria-live': 'polite' });
  const vbar = h('div', { class: 'vbar' },
    iconBtn('left', 'Previous page', () => jump(cur - 1)), pageInp, h('span', { class: 'of', text: `of ${f.pages}` }), iconBtn('right', 'Next page', () => jump(cur + 1)),
    h('span', { class: 'sep', style: 'width:1px;height:22px;background:var(--line);margin:0 4px' }),
    iconBtn('zout', 'Zoom out', () => setZoom(scale / 1.2)), zoomLbl, iconBtn('zin', 'Zoom in', () => setZoom(scale * 1.2)),
    btn('Fit width', () => { fitMode = 'width'; fit(); }, { cls: 'sm ghost', ic: 'fit' }),
    btn('Whole page', () => { fitMode = 'page'; fit(); }, { cls: 'sm ghost' }));
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'tabpanel', role: 'tabpanel' });
  const vside = h('aside', { class: 'vside', 'aria-label': 'Document panel' }, tabsEl, panel);
  ctx.work.append(h('div', { class: 'viewer' }, h('div', { class: 'vmain' }, vbar, scroller), vside));

  // placeholders
  for (let i = 0; i < f.pages; i++) {
    const d = h('div', { class: 'vpage', 'data-i': String(i), 'aria-label': `Page ${i + 1}` }, h('span', { class: 'pnum', text: String(i + 1) }));
    pageDivs.push(d); state.push({ rendered: 0, task: null });
    scroller.append(d);
  }
  const sizes = [];
  const sizeOf = i => sizes[i] || sizes[0] || { w: 612, h: 792 };
  const layout = () => {
    for (let i = 0; i < f.pages; i++) { const s = sizeOf(i); pageDivs[i].style.width = s.w * scale + 'px'; pageDivs[i].style.height = s.h * scale + 'px'; pageDivs[i].style.setProperty('--total-scale-factor', scale); }
    zoomLbl.textContent = Math.round(scale * 100) + '%';
  };
  const fit = () => {
    const avail = Math.max(200, scroller.clientWidth - 70), s0 = sizeOf(cur);
    scale = fitMode === 'page' ? Math.min(avail / s0.w, (scroller.clientHeight - 40) / s0.h) : Math.min(avail / s0.w, 2.2);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    relayout();
  };
  const setZoom = s => { fitMode = null; scale = clamp(s, 0.25, 5); relayout(); };
  function relayout() {
    const anchor = cur, off = pageDivs[anchor] ? (scroller.scrollTop - pageDivs[anchor].offsetTop) / (pageDivs[anchor].offsetHeight || 1) : 0;
    layout();
    state.forEach(s => { s.dirty = true; });
    if (pageDivs[anchor]) scroller.scrollTop = pageDivs[anchor].offsetTop + off * pageDivs[anchor].offsetHeight;
    io.disconnect(); pageDivs.forEach(d => io.observe(d));
  }

  async function renderOne(i) {
    const st = state[i];
    if (st.task || (st.rendered && !st.dirty)) return;
    const myScale = scale;
    st.task = (async () => {
      const page = await f.pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: myScale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cv = h('canvas');
      cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
      await page.render({ canvas: cv, canvasContext: cv.getContext('2d'), viewport: page.getViewport({ scale: myScale * dpr }) }).promise;
      if (ctx.dead) return;
      const div = pageDivs[i];
      div.querySelectorAll('canvas,.textLayer').forEach(n => n.remove());
      const tl = h('div', { class: 'textLayer' });
      div.append(cv, tl);
      st.rendered = myScale; st.dirty = myScale !== scale;
      try {
        await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render();
        markHits(tl);
      } catch (e) { /* text layer optional */ }
    })().catch(e => console.warn('render', i, e)).finally(() => { st.task = null; if (st.dirty && visible.has(i)) renderOne(i); });
  }
  function unrender(i) {
    const st = state[i];
    if (st.task || !st.rendered) return;
    pageDivs[i].querySelectorAll('canvas,.textLayer').forEach(n => { if (n.tagName === 'CANVAS') { n.width = n.height = 0; } n.remove(); });
    st.rendered = 0;
  }
  const visible = new Set();
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const i = +e.target.dataset.i;
      if (e.isIntersecting) { visible.add(i); renderOne(i); } else { visible.delete(i); unrender(i); }
    }
  }, { root: matchMedia('(max-width:860px)').matches ? null : scroller, rootMargin: '900px 0px' });

  const onScroll = () => {
    const top = (matchMedia('(max-width:860px)').matches ? window.scrollY - scroller.offsetTop + 120 : scroller.scrollTop + 60);
    let i = cur;
    // binary search over page offsets
    let lo = 0, hi = f.pages - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pageDivs[mid].offsetTop <= top) lo = mid; else hi = mid - 1; }
    i = lo;
    if (i !== cur) { cur = i; pageInp.value = String(i + 1); highlightThumb(); }
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  ctx.on(window, 'scroll', onScroll, { passive: true });
  function jump(i) {
    i = clamp(i, 0, f.pages - 1); cur = i; pageInp.value = String(i + 1);
    if (matchMedia('(max-width:860px)').matches) window.scrollTo({ top: pageDivs[i].getBoundingClientRect().top + window.scrollY - 110 });
    else scroller.scrollTop = pageDivs[i].offsetTop - 12;
    highlightThumb();
  }
  pageInp.addEventListener('keydown', e => { if (e.key === 'Enter') { const n = parseInt(pageInp.value, 10); if (n) jump(n - 1); } });
  pageInp.addEventListener('focus', () => pageInp.select());
  scroller.addEventListener('keydown', e => {
    if (e.target !== scroller) return;
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.shiftKey)) { e.preventDefault(); jump(cur + 1); }
    if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); jump(cur - 1); }
    if (e.key === '+' || e.key === '=') setZoom(scale * 1.2);
    if (e.key === '-') setZoom(scale / 1.2);
  });
  ctx.on(window, 'resize', () => { if (fitMode) fit(); });

  // ---- side panel tabs ----
  let thumbBtns = [];
  const highlightThumb = () => thumbBtns.forEach((b, i) => b.classList.toggle('cur', i === cur));
  const TABS = [['pages', 'Pages'], ['outline', 'Bookmarks'], ['search', 'Search'], ['info', 'Details']];
  let tab = 'pages';
  const showTab = id => {
    tab = id;
    for (const b of tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.t === id));
    panel.replaceChildren();
    ({ pages: tabPages, outline: tabOutline, search: tabSearch, info: tabInfo })[id]();
  };
  for (const [id, l] of TABS) tabsEl.append(h('button', { role: 'tab', 'data-t': id, onclick: () => showTab(id) }, l));

  function tabPages() {
    const grid = h('div', { class: 'vthumbs' });
    thumbBtns = [];
    for (let i = 0; i < f.pages; i++) {
      const s = sizeOf(i);
      const b = h('button', { type: 'button', onclick: () => jump(i), style: `--ar:${(s.w / s.h).toFixed(3)}` }, thumbImg(f, i, 130), String(i + 1));
      thumbBtns.push(b); grid.append(b);
    }
    panel.append(grid); highlightThumb();
  }
  let outlineCache = null;
  async function tabOutline() {
    panel.append(h('div', { class: 'empty' }, h('div', { class: 'spinner', style: 'margin:0 auto' })));
    outlineCache = outlineCache || await readOutline(f);
    if (tab !== 'outline') return;
    panel.replaceChildren();
    if (!outlineCache.length) return panel.append(h('div', { class: 'empty', text: 'This PDF has no bookmarks.' }));
    const build = list => h('ul', { class: 'outline' }, list.map(n => h('li', null,
      h('button', { type: 'button', onclick: () => n.pageIndex != null && jump(n.pageIndex), title: n.pageIndex != null ? `Page ${n.pageIndex + 1}` : '' }, n.title),
      n.children.length ? build(n.children) : null)));
    panel.append(build(outlineCache));
  }
  let textCache = null;
  function tabSearch() {
    const inp = h('input', { class: 'inp', type: 'search', placeholder: 'Find in document', value: query, 'aria-label': 'Find in document' });
    const res = h('div');
    const runSearch = async () => {
      query = inp.value.trim();
      pageDivs.forEach(d => { const tl = d.querySelector('.textLayer'); if (tl) markHits(tl); });
      res.replaceChildren();
      if (!query) return;
      res.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'spinner' }), h('span', { text: 'Searching…', style: 'font-size:13px;color:var(--muted)' })));
      textCache = textCache || await extractText(f);
      const q = query.toLowerCase(), hits = [];
      textCache.forEach((t, i) => {
        const low = t.toLowerCase(); let at = low.indexOf(q);
        while (at >= 0 && hits.length < 300) { hits.push({ i, at, t }); at = low.indexOf(q, at + q.length); }
      });
      res.replaceChildren(h('div', { style: 'font-size:13px;color:var(--muted);margin-top:10px', text: hits.length ? `${hits.length}${hits.length === 300 ? '+' : ''} matches` : 'No matches.' }));
      res.append(h('ul', { class: 'hits' }, hits.map(x => {
        const a = Math.max(0, x.at - 40), pre = x.t.slice(a, x.at).replace(/\s+/g, ' '), m = x.t.slice(x.at, x.at + query.length), post = x.t.slice(x.at + query.length, x.at + query.length + 50).replace(/\s+/g, ' ');
        return h('li', null, h('button', { type: 'button', onclick: () => jump(x.i) }, h('b', { text: `Page ${x.i + 1}  ` }), (a ? '…' : '') + pre, h('mark', { text: m }), post + '…'));
      })));
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    panel.append(h('div', { class: 'row' }, inp, iconBtn('search', 'Search', runSearch, '')), res);
    setTimeout(() => inp.focus(), 20);
  }
  function markHits(tl) {
    const q = query.toLowerCase();
    for (const s of tl.querySelectorAll('span')) s.classList.toggle('hit', !!q && s.textContent.toLowerCase().includes(q));
  }
  async function tabInfo() {
    panel.append(h('div', { class: 'empty' }, h('div', { class: 'spinner', style: 'margin:0 auto' })));
    const [meta, fonts] = await Promise.all([f.pdf.getMetadata().catch(() => ({ info: {} })), analyzeFonts(f).catch(e => { console.warn(e); return null; })]);
    if (tab !== 'info') return;
    panel.replaceChildren();
    const info = meta.info || {};
    const ver = (new TextDecoder('latin1').decode(f.bytes.subarray(0, 1024)).match(/%PDF-(\d\.\d)/) || [])[1];
    const dt = s => { try { const d = pdfjs.PDFDateString.toDateObject(s); return d ? d.toLocaleString() : ''; } catch (e) { return ''; } };
    const s0 = sizeOf(0);
    const paper = Object.entries(PAPER).find(([, [w, hh]]) => (Math.abs(w - s0.w) < 3 && Math.abs(hh - s0.h) < 3) || (Math.abs(hh - s0.w) < 3 && Math.abs(w - s0.h) < 3));
    const rows = [
      ['Pages', String(f.pages)], ['Size', fmtBytes(f.size)],
      ['Page size', `${(s0.w / PT_PER.mm).toFixed(0)} × ${(s0.h / PT_PER.mm).toFixed(0)} mm${paper ? ' (' + paper[0].toUpperCase().replace('LETTER', 'Letter').replace('LEGAL', 'Legal') + ')' : ''}`],
      ['PDF version', ver || '—'], ['Title', info.Title], ['Author', info.Author], ['Subject', info.Subject], ['Keywords', info.Keywords],
      ['Created with', info.Creator], ['Produced by', info.Producer], ['Created', dt(info.CreationDate)], ['Modified', dt(info.ModDate)],
      ['Security', f.encrypted ? 'Password protected (unlocked here; copies you save aren’t encrypted)' : (info.IsEncrypted || info.EncryptFilterName ? 'Owner restrictions (ignored for editing)' : 'None')],
      ['Forms', info.IsAcroFormPresent ? 'Has fillable fields' : info.IsXFAPresent ? 'XFA form' : 'None'],
    ].filter(r => r[1]);
    panel.append(h('dl', { class: 'props' }, rows.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
    panel.append(h('div', { class: 'row', style: 'margin-bottom:16px' },
      btn('Edit details', () => editMeta(info), { cls: 'sm', ic: 'edit' })));
    panel.append(h('h4', { text: 'Text & encodings' }));
    if (fonts) {
      const tags = new Set();
      fonts.forEach(x => { if (x.script) tags.add(x.script); if (x.label) tags.add(x.label); });
      panel.append(h('div', null, [...tags].map(t => h('span', { class: 'tag', text: t }))));
      if (!fonts.length) panel.append(h('p', { class: 'note', text: 'No fonts — this PDF has no real text (likely a scan or images). Text can’t be selected or searched.' }));
      else panel.append(h('table', { class: 'fonts' }, h('thead', null, h('tr', null, h('th', { text: 'Font' }), h('th', { text: 'Encoding' }), h('th', { text: 'Embedded', style: 'width:64px' }))),
        h('tbody', null, fonts.map(x => h('tr', null,
          h('td', null, x.base, h('div', { style: 'color:var(--muted)', text: x.type + (x.cid ? ' · ' + x.cid : '') })),
          h('td', null, x.encoding, x.label ? h('div', { style: 'color:var(--muted)', text: x.label }) : null, x.toUnicode ? null : h('div', { style: 'color:var(--warn)', text: 'no Unicode map' })),
          h('td', { text: x.embedded ? 'Yes' : 'No' }))))));
      if (fonts.some(x => !x.embedded && x.cid)) panel.append(h('p', { class: 'note', text: 'Some Asian fonts aren’t embedded. The PDF Tool displays them with built-in character maps; other apps may substitute a different typeface.' }));
    }
    panel.append(h('div', { class: 'row' },
      btn('Copy all text', async () => {
        try { textCache = textCache || await extractText(f); await navigator.clipboard.writeText(textCache.join('\n\n')); toast('Text copied.'); }
        catch (e) { toast('Copy was blocked by the browser — use “Save as .txt”.', 'error'); }
      }, { cls: 'sm', ic: 'copy' }),
      btn('Save as .txt', async () => {
        textCache = textCache || await extractText(f);
        const txt = textCache.map((t, i) => `— Page ${i + 1} —\n${t}`).join('\n\n');
        saveFile(safeName(baseName(f.name), 'txt'), new TextEncoder().encode('﻿' + txt));
      }, { cls: 'sm', ic: 'download' })));
  }
  async function editMeta(info) {
    const fields = [['Title', info.Title], ['Author', info.Author], ['Subject', info.Subject], ['Keywords', info.Keywords]].map(([k, v]) => {
      const inp = h('input', { class: 'inp', value: v || '' }); return [k, inp];
    });
    const ok = await dialog({ title: 'Document details', body: [h('p', { text: 'These show up in “Document properties” in PDF readers and in search.' }), fields.map(([k, inp]) => field(k, inp))], actions: [{ label: 'Cancel', value: null }, { label: 'Save copy', value: 1, primary: true }] });
    if (!ok) return;
    const doc = await libDoc(f);
    const val = k => fields.find(x => x[0] === k)[1].value.trim();
    doc.setTitle(val('Title')); doc.setAuthor(val('Author')); doc.setSubject(val('Subject'));
    doc.setKeywords(val('Keywords') ? val('Keywords').split(/\s*[,;]\s*/) : []); doc.setModificationDate(new Date());
    const out = await pdfOutput(doc, f.name);
    await presentResult(ctx, { outputs: [out], summary: 'Details updated', detail: 'Saved as a new copy — download it or keep working.' });
  }

  // init
  layout();
  showTab('pages');
  (async () => {
    const first = await pageSize(f, 0);
    sizes[0] = first; fit();
    for (let i = 1; i < f.pages && !ctx.dead; i++) {
      sizes[i] = await pageSize(f, i);
      if (i % 50 === 0 || i === f.pages - 1) { layout(); await tick(); }
    }
    if (!ctx.dead) { layout(); if (tab === 'pages') { thumbBtns.forEach((b, i) => b.style.setProperty('--ar', (sizeOf(i).w / sizeOf(i).h).toFixed(3))); } }
  })();
  pageDivs.forEach(d => io.observe(d));
  ctx.cleanup = () => io.disconnect();
  setTimeout(() => scroller.focus({ preventScroll: true }), 50);
}
