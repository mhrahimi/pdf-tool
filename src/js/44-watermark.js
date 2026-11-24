// ---------------------------------------------------------------------------
// Watermark & page numbers, with an exact live preview (the real output page
// is generated and rendered).
// ---------------------------------------------------------------------------
const POS9 = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Centre'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];
const NUM_FORMATS = [['{n}', '1, 2, 3'], ['Page {n}', 'Page 1'], ['Page {n} of {total}', 'Page 1 of 9'], ['{n} / {total}', '1 / 9'], ['- {n} -', '- 1 -']];

defineTool({
  id: 'watermark', name: 'Watermark', icon: 'watermark', group: 'edit', verb: 'watermark', runLabel: 'Apply', runIcon: 'watermark',
  desc: 'Stamp text or a logo across pages, or add page numbers — with a live preview.',
  defaults: { kind: 'text', text: 'CONFIDENTIAL', family: 'Helvetica', bold: true, size: 64, color: '#c8291c', opacity: 0.25, rot: 45, pos: 'mc', tile: false, behind: false, imgScale: 30,
    numFmt: 'Page {n} of {total}', numPos: 'bc', numSize: 10, numStart: 1, skipFirst: false, range: '' },
  outName: f => baseName(f.name) + '-watermarked.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    let logo = null, cur = 0, token = 0, srcLib = null, tmr;
    const cv = h('canvas', { class: 'pagecv' });
    const stage = h('div', { class: 'stage' }, cv);
    const of = h('span', { class: 'of' });
    const prev = iconBtn('left', 'Previous page', () => show(cur - 1), ''), next = iconBtn('right', 'Next page', () => show(cur + 1), '');
    const spin = h('div', { class: 'spinner', hidden: true });
    ctx.work.append(h('div', { class: 'stagewrap' }, h('div', { class: 'stagebar' }, prev, of, next, spin), stage, h('p', { class: 'help', style: 'color:var(--muted);font-size:12.5px;margin:0', text: 'Preview shows the exact result.' })));

    // --- settings
    const textPane = h('div'), imgPane = h('div'), numPane = h('div'), common = h('div');
    const kindSeg = seg([['text', 'Text'], ['image', 'Image'], ['numbers', 'Page numbers']], P.kind, v => { P.kind = v; sync(); changed(); }, 'Watermark type');
    const posGrid = (key) => {
      const g = h('div', { role: 'group', 'aria-label': 'Position', style: 'display:grid;grid-template-columns:repeat(3,44px);gap:4px' });
      const set = () => { for (const b of g.children) b.setAttribute('aria-pressed', String(b.dataset.p === P[key])); };
      for (const [p, l] of POS9) g.append(h('button', { type: 'button', class: 'btn sm icon', 'data-p': p, title: l, 'aria-label': l, onclick: () => { P[key] = p; set(); changed(); } }, h('span', { style: 'width:8px;height:8px;border-radius:50%;background:currentColor;display:block' })));
      set(); return g;
    };
    const textInp = h('input', { class: 'inp', value: P.text, 'aria-label': 'Watermark text', oninput: () => { P.text = textInp.value; changed(); } });
    textPane.append(field('Text', textInp),
      field('Font', seg([['Helvetica', 'Sans'], ['Times', 'Serif'], ['Courier', 'Mono']], P.family, v => { P.family = v; changed(); }, 'Font')),
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('span', { class: 'help', text: 'Size' }), numInput(P.size, { min: 6, max: 300, label: 'Font size', onchange: v => { P.size = v; changed(); } }), checkbox('Bold', P.bold, v => { P.bold = v; changed(); })),
      field('Colour', swatches(P.color, c => { P.color = c; changed(); }, ['#c8291c', '#1f3fbf', '#000000', '#7a7f8c', '#0b7a46'])));
    imgPane.append(field('Image', h('div', { class: 'row' }, btn('Choose image', () => pickFiles('image/*', false, async fl => { await loadLogo(fl[0]); changed(); }), { cls: 'sm', ic: 'upload' }), h('span', { class: 'help', id: 'logoname', text: 'PNG with transparency works best.' }))),
      field('Size', h('div', null, h('input', { type: 'range', min: '5', max: '100', value: String(P.imgScale), 'aria-label': 'Image size, percent of page width', oninput: e => { P.imgScale = +e.target.value; changed(); } })), '% of page width'));
    const tileBox = checkbox('Repeat across the page', P.tile, v => { P.tile = v; changed(); });
    common.append(
      field('Opacity', h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(P.opacity), 'aria-label': 'Opacity', oninput: e => { P.opacity = +e.target.value; changed(); } })),
      field('Rotation', seg([[0, '0°'], [45, '45°'], [90, '90°'], [-45, '−45°']], P.rot, v => { P.rot = v; changed(); }, 'Rotation')),
      field('Position', posGrid('pos')), tileBox,
      checkbox('Put it behind the page content', P.behind, v => { P.behind = v; changed(); }, 'Text stays readable on top. Won’t show through scanned or full-page images.'));
    numPane.append(
      field('Format', h('select', { class: 'inp', onchange: e => { P.numFmt = e.target.value; changed(); } }, NUM_FORMATS.map(([v, l]) => h('option', { value: v, selected: P.numFmt === v }, l)))),
      field('Position', posGrid('numPos')),
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('span', { class: 'help', text: 'Start at' }), numInput(P.numStart, { min: 0, max: 99999, label: 'First number', onchange: v => { P.numStart = Math.round(v); changed(); } }),
        h('span', { class: 'help', text: 'Size' }), numInput(P.numSize, { min: 6, max: 48, label: 'Font size', onchange: v => { P.numSize = v; changed(); } })),
      checkbox('Don’t number the first page', P.skipFirst, v => { P.skipFirst = v; changed(); }, 'Handy for cover pages.'));
    const rf = rangeField({ label: 'Pages', value: P.range, total: f.pages, onchange: () => { P.range = rf.value; changed(); } });
    ctx.side.append(field('Type', kindSeg), textPane, imgPane, common, numPane, rf.el);
    function sync() { textPane.hidden = P.kind !== 'text'; imgPane.hidden = P.kind !== 'image'; common.hidden = P.kind === 'numbers'; numPane.hidden = P.kind !== 'numbers'; }
    async function loadLogo(file) {
      if (!file) return;
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      logo = { bytes: await canvasToBytes(c, 'image/png'), w: c.width, h: c.height, name: file.name };
      $('#logoname').textContent = file.name;
    }
    function changed() {
      ctx.save();
      const r = rf.check();
      if (r.error) ctx.setRunnable(false, r.error, true);
      else if (P.kind === 'image' && !logo) ctx.setRunnable(false, 'Choose an image to use as the watermark.');
      else if (P.kind === 'text' && !P.text.trim()) ctx.setRunnable(false, 'Type the watermark text.');
      else ctx.setRunnable(true);
      clearTimeout(tmr); tmr = setTimeout(preview, 220);
    }
    async function show(i) { cur = clamp(i, 0, f.pages - 1); of.textContent = `Page ${cur + 1} of ${f.pages}`; prev.disabled = cur === 0; next.disabled = cur === f.pages - 1; preview(); }
    async function preview() {
      const my = ++token; spin.hidden = false;
      try {
        srcLib = srcLib || await libDoc(f);
        const doc = await PDFDocument.create();
        const [p] = await doc.copyPages(srcLib, [cur]); doc.addPage(p);
        const sel = new Set(parseRanges(rf.value, f.pages).pages || []);
        if (sel.has(cur)) await stampPages(doc, [{ page: doc.getPage(0), index: cur }], P, logo, f.pages);
        const bytes = await doc.save();
        if (my !== token) return;
        const { doc: pdf } = await openPdfjs(bytes, 'preview');
        const tmp = { pdf };
        const s = await pageSize(f, cur);
        const narrow = matchMedia('(max-width:860px)').matches;
        const top = stage.getBoundingClientRect().top - ctx.work.getBoundingClientRect().top + ctx.work.scrollTop;
        const scale = Math.min(Math.min((ctx.work.clientWidth || innerWidth) - (narrow ? 28 : 48), 900) / s.w, narrow ? 9 : Math.max(360, ctx.work.clientHeight - top - 40) / s.h);
        const c = await renderPage(tmp, 0, { scale: scale * Math.min(2, devicePixelRatio || 1) });
        pdf.loadingTask.destroy();
        if (my !== token || ctx.dead) return;
        stage.style.width = s.w * scale + 'px'; stage.style.height = s.h * scale + 'px';
        c.className = 'pagecv'; stage.replaceChildren(c);
      } catch (e) { console.warn(e); } finally { if (my === token) spin.hidden = true; }
    }
    sync(); show(0); changed();

    ctx.onRun = async progress => {
      const doc = await libDoc(f);
      const idx = parseRanges(rf.value, f.pages).pages;
      await stampPages(doc, [...new Set(idx)].map(i => ({ page: doc.getPage(i), index: i })), P, logo, f.pages, progress);
      const o = await pdfOutput(doc, ctx.outName);
      return { outputs: [o], summary: P.kind === 'numbers' ? 'Page numbers added' : 'Watermark applied', detail: `${plural(idx.length, 'page')} · ${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});

async function stampPages(doc, targets, P, logo, total, progress) {
  const font = await doc.embedFont(stdFontName(P.kind === 'numbers' ? 'Helvetica' : P.family, P.kind !== 'numbers' && P.bold, false));
  let img = null, tw = 0, th = 0;
  const color = hexToRgb(P.kind === 'numbers' ? '#333333' : P.color);
  if (P.kind === 'image' && logo) { img = await doc.embedPng(logo.bytes); }
  if (P.kind === 'text' && !canEncode(font, P.text)) {
    const t = await textToPng(P.text, { size: P.size, family: P.family, bold: P.bold, color: P.color });
    img = await doc.embedPng(t.bytes); tw = t.w; th = t.h;
  }
  for (let k = 0; k < targets.length; k++) {
    const { page, index } = targets[k];
    if (progress && k % 10 === 0) { progress(k / targets.length, 'Stamping pages…'); await tick(); }
    const g = pageGeom(page), W = g.W, H = g.H, m = 28;
    const before = contentRefs(page);
    if (P.kind === 'numbers') {
      if (P.skipFirst && index === 0) continue;
      const n = P.numStart + index - (P.skipFirst ? 1 : 0);
      const label = P.numFmt.replace('{n}', n).replace('{total}', total - (P.skipFirst ? 1 : 0) + P.numStart - 1);
      const w = font.widthOfTextAtSize(label, P.numSize);
      const [cu, cv] = anchor(P.numPos, W, H, w, P.numSize, m);
      const [x, y] = g.toUser(cu - w / 2, cv + P.numSize * 0.35);
      page.drawText(label, { x, y, size: P.numSize, font, color, rotate: degrees(g.r) });
      continue;
    }
    let w, hh;
    if (img) {
      if (P.kind === 'image') { w = W * P.imgScale / 100; hh = w * img.height / img.width; } else { w = tw; hh = th; }
    } else { w = font.widthOfTextAtSize(P.text, P.size); hh = P.size; }
    const th0 = P.rot * Math.PI / 180, cos = Math.cos(th0), sin = Math.sin(th0);
    const centers = [];
    if (P.tile) {
      const sx = Math.abs(w * cos) + Math.abs(hh * sin) + 60, sy = Math.abs(w * sin) + Math.abs(hh * cos) + 60;
      for (let cy = sy / 2 - sy; cy < H + sy; cy += sy) for (let cx = sx / 2 - sx, row = 0; cx < W + sx; cx += sx, row++) centers.push([cx + ((Math.round(cy / sy) % 2) ? sx / 2 : 0), cy]);
    } else {
      const bw = Math.abs(w * cos) + Math.abs(hh * sin), bh = Math.abs(w * sin) + Math.abs(hh * cos);
      centers.push(anchor(P.pos, W, H, bw, bh, 36));
    }
    for (const [cu, cvv] of centers) {
      // visual-up frame: X right, Y up
      const X = cu, Y = H - cvv, dX = cos, dY = sin, nX = -sin, nY = cos;
      const lift = img ? hh / 2 : P.size * 0.33;
      const sX = X - (w / 2) * dX - lift * nX, sY = Y - (w / 2) * dY - lift * nY;
      const [x, y] = g.toUser(sX, H - sY);
      const opts = { x, y, rotate: degrees(g.r + P.rot), opacity: P.opacity };
      if (img) page.drawImage(img, { ...opts, width: w, height: hh });
      else page.drawText(P.text, { ...opts, size: P.size, font, color });
    }
    if (P.behind) sendToBack(page, before);
  }
}
function anchor(pos, W, H, w, hh, m) {
  const col = pos[1], row = pos[0];
  const cu = col === 'l' ? m + w / 2 : col === 'r' ? W - m - w / 2 : W / 2;
  const cv = row === 't' ? m + hh / 2 : row === 'b' ? H - m - hh / 2 : H / 2;
  return [cu, cv];
}
function contentRefs(page) {
  const c = page.node.get(PDFName.of('Contents'));
  if (c instanceof PDFArray) return new Set(c.asArray().map(String));
  return new Set(c ? [String(c)] : []);
}
function sendToBack(page, before) {
  const c = page.node.lookup(PDFName.of('Contents'));
  if (!(c instanceof PDFArray)) return;
  const all = c.asArray();
  const ours = all.filter(r => !before.has(String(r)) && !isWrapper(page, r));
  const rest = all.filter(r => !ours.includes(r));
  page.node.set(PDFName.of('Contents'), page.doc.context.obj([...ours, ...rest]));
}
function isWrapper(page, ref) {
  const c = page.doc.context, k = String(ref);
  return k === String(c.pushGraphicsStateContentStreamRef) || k === String(c.popGraphicsStateContentStreamRef);
}
