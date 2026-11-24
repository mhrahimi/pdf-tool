// ---------------------------------------------------------------------------
// Shared single-page stage: renders one page to fit, with page navigation and
// an overlay layer for interactive tools (crop, sign, edit, watermark, forms).
// ---------------------------------------------------------------------------
function pageStage(ctx, f, { onShow, extra, maxW = 980, annotationMode } = {}) {
  let cur = 0, scale = 1, size = { w: 612, h: 792 }, token = 0;
  const layer = h('div', { class: 'layer' });
  let cv = h('canvas', { class: 'pagecv' });
  const stage = h('div', { class: 'stage' }, cv, layer);
  const of = h('span', { class: 'of', 'aria-live': 'polite' });
  const prev = iconBtn('left', 'Previous page', () => show(cur - 1), ''), next = iconBtn('right', 'Next page', () => show(cur + 1), '');
  const bar = h('div', { class: 'stagebar' }, prev, of, next, extra || null);
  const el = h('div', { class: 'stagewrap' }, bar, stage);
  async function show(i) {
    i = clamp(i, 0, f.pages - 1); cur = i;
    of.textContent = `Page ${i + 1} of ${f.pages}`;
    prev.disabled = i === 0; next.disabled = i === f.pages - 1;
    size = await pageSize(f, i);
    const narrow = matchMedia('(max-width:860px)').matches;
    const availW = Math.min((ctx.work.clientWidth || innerWidth) - (narrow ? 28 : 48), maxW);
    const top = stage.getBoundingClientRect().top - ctx.work.getBoundingClientRect().top + ctx.work.scrollTop;
    const availH = narrow ? Infinity : Math.max(360, ctx.work.clientHeight - top - 24);
    scale = Math.min(availW / size.w, availH / size.h);
    stage.style.width = Math.round(size.w * scale) + 'px'; stage.style.height = Math.round(size.h * scale) + 'px';
    onShow && onShow(i, scale, size);
    const my = ++token, dpr = Math.min(2, devicePixelRatio || 1);
    const ncv = await renderPage(f, i, { scale: scale * dpr, annotationMode });
    if (my !== token || ctx.dead) return;
    ncv.className = 'pagecv'; cv.replaceWith(ncv); cv = ncv;
  }
  let rt;
  ctx.on(window, 'resize', () => { clearTimeout(rt); rt = setTimeout(() => show(cur), 150); });
  return { el, layer, stage, show, get cur() { return cur; }, get scale() { return scale; }, get size() { return size; }, get canvas() { return cv; } };
}

// Pointer drag helper: calls move(dx, dy) in CSS px relative to start.
function dragging(e, move, end) {
  e.preventDefault(); e.stopPropagation();
  const sx = e.clientX, sy = e.clientY, t = e.currentTarget;
  try { t.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  const mv = ev => move(ev.clientX - sx, ev.clientY - sy, ev);
  const up = ev => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); end && end(ev); };
  t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
}

// Find the bounding box of non-white content on a rendered page (in visual points).
async function detectContent(f, i) {
  const size = await pageSize(f, i);
  const cv = await renderPage(f, i, { width: 700 });
  const { width: W, height: H } = cv, data = cv.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    if (data[k] < 235 || data[k + 1] < 235 || data[k + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const k = size.w / W;
  return { left: x0 * k, top: y0 * k, right: (W - 1 - x1) * k, bottom: (H - 1 - y1) * k };
}

// ---------------------------------------------------------------------------
// Crop
// ---------------------------------------------------------------------------
defineTool({
  id: 'crop', name: 'Crop', icon: 'crop', group: 'organize', verb: 'crop', runLabel: 'Crop', runIcon: 'crop',
  desc: 'Trim page margins by dragging a box, typing exact sizes, or detecting content automatically.',
  defaults: { unit: 'mm', apply: 'all', pad: 6 },
  outName: f => baseName(f.name) + '-cropped.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const m = { top: 0, right: 0, bottom: 0, left: 0 };
    const box = h('div', { class: 'cropbox', tabindex: '0', 'aria-label': 'Crop area — drag to move, drag handles to resize' });
    const HANDLES = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
    for (const [k, [x, y]] of Object.entries(HANDLES)) box.append(h('div', { class: 'hd', 'data-h': k, style: `left:${x}%;top:${y}%;cursor:${k}-resize` }));
    const st = pageStage(ctx, f, { onShow: () => place() });
    const hole = h('div', { style: 'position:absolute;box-shadow:0 0 0 9999px rgb(8 14 40/.45)' });
    st.layer.append(h('div', { style: 'position:absolute;inset:0;overflow:hidden;pointer-events:none' }, hole), box);
    ctx.work.append(st.el);

    const inputs = {};
    const unitK = () => PT_PER[P.unit];
    const fmt = v => String(Math.round((v / unitK()) * (P.unit === 'in' ? 100 : 10)) / (P.unit === 'in' ? 100 : 10));
    const grid = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px' });
    for (const side of ['top', 'bottom', 'left', 'right']) {
      inputs[side] = numInput(0, { min: 0, step: P.unit === 'in' ? 0.05 : 1, width: '100%', label: side, onchange: v => { m[side] = Math.max(0, v * unitK()); place(false); } });
      grid.append(h('label', { class: 'field', style: 'margin:0' }, h('span', { class: 'lbl', style: 'font-size:13px;font-weight:600', text: side[0].toUpperCase() + side.slice(1) }), inputs[side]));
    }
    const rf = rangeField({ label: '', value: P.range || '', total: f.pages, placeholder: 'e.g. 2-10', help: '', emptyIsAll: false, onchange: () => { P.range = rf.value; ctx.save(); validate(); } });
    const sizeInfo = h('div', { class: 'help', style: 'margin-bottom:14px' });
    ctx.side.append(
      h('h4', { text: 'Margins to remove' }),
      field('Units', seg([['mm', 'mm'], ['in', 'inches'], ['pt', 'points']], P.unit, v => { P.unit = v; ctx.save(); place(false); }, 'Units')),
      grid, sizeInfo,
      h('div', { class: 'row', style: 'margin-bottom:16px' },
        btn('Detect content', autoDetect, { cls: 'sm', ic: 'wand', title: 'Find the printed area on this page and crop to it' }),
        btn('Reset', () => { Object.assign(m, { top: 0, right: 0, bottom: 0, left: 0 }); place(); }, { cls: 'sm ghost' })),
      h('h4', { text: 'Apply to' }),
      choices('apply', [
        { v: 'all', title: 'All pages', sub: 'Same margins on every page.' },
        { v: 'current', title: 'This page only' },
        { v: 'range', title: 'Some pages', extra: rf.el },
      ], P.apply, v => { P.apply = v; ctx.save(); validate(); }),
      h('p', { class: 'note', text: 'Cropping hides the area outside the box in every PDF reader. The hidden content stays in the file — use Compress → Flatten if it must be removed.' }));

    function place(syncInputs = true) {
      const s = st.scale, W = st.size.w, H = st.size.h;
      m.left = clamp(m.left, 0, W - 10 - m.right); m.right = clamp(m.right, 0, W - 10 - m.left);
      m.top = clamp(m.top, 0, H - 10 - m.bottom); m.bottom = clamp(m.bottom, 0, H - 10 - m.top);
      Object.assign(box.style, { left: m.left * s + 'px', top: m.top * s + 'px', width: (W - m.left - m.right) * s + 'px', height: (H - m.top - m.bottom) * s + 'px' });
      Object.assign(hole.style, { left: box.style.left, top: box.style.top, width: box.style.width, height: box.style.height });
      for (const k in inputs) if (syncInputs || document.activeElement !== inputs[k]) inputs[k].value = fmt(m[k]);
      for (const k in inputs) inputs[k].step = P.unit === 'in' ? '0.05' : '1';
      sizeInfo.textContent = `Result on this page: ${fmt(W - m.left - m.right)} × ${fmt(H - m.top - m.bottom)} ${P.unit}`;
      validate();
    }
    function validate() {
      if (!m.top && !m.right && !m.bottom && !m.left) return ctx.setRunnable(false, 'Drag the box edges or type margins to crop.');
      if (P.apply === 'range') { const r = rf.check(); if (r.error) return ctx.setRunnable(false, r.error, true); }
      ctx.setRunnable(true); ctx.setStatus('');
    }
    box.addEventListener('pointerdown', e => {
      const hd = e.target.dataset.h, s = st.scale, W = st.size.w, H = st.size.h, o = { ...m };
      dragging(e, (dx, dy) => {
        dx /= s; dy /= s;
        if (!hd) {
          const w = W - o.left - o.right, hh = H - o.top - o.bottom;
          m.left = clamp(o.left + dx, 0, W - w); m.right = W - w - m.left;
          m.top = clamp(o.top + dy, 0, H - hh); m.bottom = H - hh - m.top;
        } else {
          if (hd.includes('w')) m.left = clamp(o.left + dx, 0, W - o.right - 10);
          if (hd.includes('e')) m.right = clamp(o.right - dx, 0, W - o.left - 10);
          if (hd.includes('n')) m.top = clamp(o.top + dy, 0, H - o.bottom - 10);
          if (hd.includes('s')) m.bottom = clamp(o.bottom - dy, 0, H - o.top - 10);
        }
        place();
      });
    });
    box.addEventListener('keydown', e => {
      const d = e.shiftKey ? 10 : 1, k = { ArrowLeft: ['left', -d, 'right', d], ArrowRight: ['left', d, 'right', -d], ArrowUp: ['top', -d, 'bottom', d], ArrowDown: ['top', d, 'bottom', -d] }[e.key];
      if (!k) return; e.preventDefault();
      if (m[k[0]] + k[1] < 0 || m[k[2]] + k[3] < 0) return;
      m[k[0]] += k[1]; m[k[2]] += k[3]; place();
    });
    async function autoDetect() {
      ctx.setStatus('Looking for content…');
      const b = await detectContent(f, st.cur);
      if (!b) { ctx.setStatus(''); return toast('This page looks blank — nothing to detect.', 'error'); }
      const pad = 6;
      Object.assign(m, { top: Math.max(0, b.top - pad), right: Math.max(0, b.right - pad), bottom: Math.max(0, b.bottom - pad), left: Math.max(0, b.left - pad) });
      place(); toast('Cropped to the content on this page, with a small border.');
    }
    st.show(0);

    ctx.onRun = async progress => {
      const doc = await libDoc(f), n = doc.getPageCount();
      const targets = P.apply === 'all' ? [...Array(n).keys()] : P.apply === 'current' ? [st.cur] : parseRanges(rf.value, n).pages;
      let skipped = 0;
      for (const i of new Set(targets)) {
        const page = doc.getPage(i);
        const b = marginsToBox(page, m);
        if (b.width < 2 || b.height < 2) { skipped++; continue; }
        page.setCropBox(b.x, b.y, b.width, b.height);
        page.setMediaBox(b.x, b.y, b.width, b.height);
        for (const k of ['TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(PDFName.of(k));
      }
      progress(0.9, 'Saving…');
      const o = await pdfOutput(doc, ctx.outName);
      const done = new Set(targets).size - skipped;
      return { outputs: [o], summary: `Cropped ${plural(done, 'page')}`, detail: (skipped ? `${skipped} smaller pages were left as they were · ` : '') + `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});
