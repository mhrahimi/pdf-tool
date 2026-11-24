// ---------------------------------------------------------------------------
// Object editor shared by Sign and Edit: place, move, resize and delete text,
// images, boxes and ink on pages, then write them into the PDF.
// ---------------------------------------------------------------------------
function objectEditor(ctx, f, { onSelect, onChange } = {}) {
  const items = [];
  let selId = null, mode = 'select', drawStyle = { color: '#1f3fbf', width: 2.5 };
  const st = pageStage(ctx, f, { onShow: () => renderAll() });
  const ed = { items, st, get mode() { return mode; } };

  ed.setMode = m => { mode = m; st.stage.classList.toggle('drawing', m !== 'select'); if (m !== 'select') select(null); };
  ed.setDrawStyle = s => Object.assign(drawStyle, s);
  ed.selected = () => items.find(x => x.id === selId);
  ed.add = (it, { selectIt = true } = {}) => { it.id = it.id || uid(); if (it.page == null) it.page = st.cur; items.push(it); renderAll(); if (selectIt) select(it.id); onChange && onChange(); return it; };
  ed.remove = id => { const i = items.findIndex(x => x.id === id); if (i >= 0) items.splice(i, 1); if (selId === id) select(null); renderAll(); onChange && onChange(); };
  ed.update = (it, props) => { Object.assign(it, props); renderAll(); onChange && onChange(); };
  ed.refresh = () => renderAll();
  function select(id) { selId = id; for (const el of st.layer.children) el.classList.toggle('sel', el.dataset.id === id); onSelect && onSelect(ed.selected()); }
  ed.select = select;

  function renderAll() {
    const s = st.scale;
    st.layer.replaceChildren();
    for (const it of items.filter(x => x.page === st.cur)) {
      const el = h('div', { class: 'obj' + (it.id === selId ? ' sel' : ''), 'data-id': it.id, tabindex: '0', 'aria-label': it.type === 'text' ? 'Text: ' + it.text : it.label || it.type,
        style: `left:${it.u * s}px;top:${it.v * s}px;width:${it.w * s}px;height:${it.h * s}px` });
      if (it.type === 'image') el.append(h('img', { src: it.url, alt: '', style: `opacity:${it.opacity ?? 1}` }));
      if (it.type === 'text') {
        const tx = h('div', { class: 'tx', text: it.text, style: `font:${it.italic ? 'italic ' : ''}${it.bold ? '700 ' : ''}${it.size * s}px/1.2 ${FONT_CSS[it.family] || FONT_CSS.Helvetica};color:${it.color}` });
        el.append(tx);
        el.addEventListener('dblclick', () => editInline(it, tx));
      }
      if (it.type === 'rect') Object.assign(el.style, { background: it.fill ? hexA(it.fill, it.fillOpacity ?? 1) : 'transparent', boxShadow: it.stroke ? `inset 0 0 0 ${Math.max(1, it.sw * s)}px ${it.stroke}` : '', mixBlendMode: it.blend ? 'multiply' : '' });
      if (it.type === 'ink') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `${it.u} ${it.v} ${it.w} ${it.h}`); svg.setAttribute('preserveAspectRatio', 'none');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', inkPath(it.points)); path.setAttribute('fill', 'none'); path.setAttribute('stroke', it.color);
        path.setAttribute('stroke-width', it.width); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
        svg.append(path); el.append(svg);
      }
      el.append(h('div', { class: 'rs', 'aria-hidden': 'true' }),
        h('button', { class: 'del', type: 'button', 'aria-label': 'Remove', onpointerdown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); ed.remove(it.id); } }, icon('x')));
      el.addEventListener('pointerdown', e => onObjDown(e, it));
      el.addEventListener('keydown', e => onObjKey(e, it));
      st.layer.append(el);
    }
  }
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  function editInline(it, tx) {
    tx.contentEditable = 'plaintext-only'; tx.style.pointerEvents = 'auto'; tx.style.cursor = 'text'; tx.focus();
    document.getSelection().selectAllChildren(tx);
    tx.addEventListener('blur', () => { tx.contentEditable = 'false'; const t = tx.innerText.replace(/\n$/, ''); ed.update(it, { text: t || it.text }); fitText(it); renderAll(); onSelect && onSelect(it); }, { once: true });
    tx.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') tx.blur(); });
  }
  function onObjDown(e, it) {
    if (e.target.closest('.del')) return;
    if (e.target.isContentEditable) return;
    select(it.id);
    const s = st.scale, o = { u: it.u, v: it.v, w: it.w, h: it.h, size: it.size, points: it.points && it.points.map(p => [...p]) };
    const resize = e.target.classList.contains('rs');
    const W = st.size.w, H = st.size.h;
    dragging(e, (dx, dy) => {
      dx /= s; dy /= s;
      if (resize) {
        let nw = Math.max(8, o.w + dx), nh = Math.max(8, o.h + dy);
        if (it.type === 'image' || it.type === 'text' || it.type === 'ink') { const k = Math.max(nw / o.w, nh / o.h, 0.05); nw = o.w * k; nh = o.h * k; if (it.type === 'text') it.size = Math.max(4, o.size * k); if (it.type === 'ink') it.points = o.points.map(([pu, pv]) => [o.u + (pu - o.u) * k, o.v + (pv - o.v) * k]); }
        it.w = Math.min(nw, W - it.u); it.h = Math.min(nh, H - it.v);
      } else {
        it.u = clamp(o.u + dx, -it.w * 0.5, W - it.w * 0.5); it.v = clamp(o.v + dy, -it.h * 0.5, H - it.h * 0.5);
        if (it.type === 'ink') it.points = o.points.map(([pu, pv]) => [pu + it.u - o.u, pv + it.v - o.v]);
      }
      const el = st.layer.querySelector(`[data-id="${it.id}"]`);
      if (el) Object.assign(el.style, { left: it.u * s + 'px', top: it.v * s + 'px', width: it.w * s + 'px', height: it.h * s + 'px' });
      if (el && it.type === 'text') el.firstChild.style.fontSize = it.size * s + 'px';
      if (el && it.type === 'ink') el.querySelector('svg').setAttribute('viewBox', `${it.u} ${it.v} ${it.w} ${it.h}`), el.querySelector('path').setAttribute('d', inkPath(it.points));
    }, () => { onSelect && onSelect(it); onChange && onChange(); });
  }
  function onObjKey(e, it) {
    if (e.target.isContentEditable) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed.remove(it.id); return; }
    const d = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (mv) { e.preventDefault(); it.u += mv[0]; it.v += mv[1]; if (it.points) it.points = it.points.map(([a, b]) => [a + mv[0], b + mv[1]]); renderAll(); st.layer.querySelector(`[data-id="${it.id}"]`).focus(); }
    if (e.key === 'Enter' && it.type === 'text') { e.preventDefault(); const el = st.layer.querySelector(`[data-id="${it.id}"]`); editInline(it, el.querySelector('.tx')); }
  }

  // creating objects by pointer on the page
  st.stage.addEventListener('pointerdown', e => {
    if (mode === 'select' && e.target.closest('.obj')) return;
    if (e.target.isContentEditable) return;
    const r = st.stage.getBoundingClientRect(), s = st.scale;
    const pu = (e.clientX - r.left) / s, pv = (e.clientY - r.top) / s;
    if (mode === 'select') { select(null); return; }
    if (mode === 'text') { const it = ed.makeText ? ed.makeText(pu, pv) : null; if (it) { ed.add(it); ed.setMode('select'); onModeReset && onModeReset(); setTimeout(() => { const el = st.layer.querySelector(`[data-id="${it.id}"]`); el && editInline(it, el.querySelector('.tx')); }, 30); } return; }
    if (mode === 'draw') {
      const pts = [[pu, pv]];
      const tmp = h('div', { class: 'obj' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${st.size.w} ${st.size.h}`); svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', drawStyle.color); path.setAttribute('stroke-width', drawStyle.width); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      svg.append(path); tmp.style.cssText = 'left:0;top:0;width:100%;height:100%'; tmp.append(svg); st.layer.append(tmp);
      dragging(e, (dx, dy) => { pts.push([pu + dx / s, pv + dy / s]); path.setAttribute('d', inkPath(pts)); }, () => {
        tmp.remove();
        if (pts.length < 2) return;
        const simple = pts.filter((p, i) => i === 0 || i === pts.length - 1 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.6);
        const xs = simple.map(p => p[0]), ys = simple.map(p => p[1]), pad = drawStyle.width;
        const u = Math.min(...xs) - pad, v = Math.min(...ys) - pad;
        ed.add({ type: 'ink', points: simple, color: drawStyle.color, width: drawStyle.width, u, v, w: Math.max(...xs) - u + pad, h: Math.max(...ys) - v + pad }, { selectIt: false });
      });
      return;
    }
    if (ed.makeRect && ['whiteout', 'highlight', 'box'].includes(mode)) {
      const box = h('div', { class: 'obj sel' }); st.layer.append(box);
      let end = [pu, pv];
      dragging(e, (dx, dy) => {
        end = [pu + dx / s, pv + dy / s];
        Object.assign(box.style, { left: Math.min(pu, end[0]) * s + 'px', top: Math.min(pv, end[1]) * s + 'px', width: Math.abs(end[0] - pu) * s + 'px', height: Math.abs(end[1] - pv) * s + 'px' });
      }, () => {
        box.remove();
        let u = Math.min(pu, end[0]), v = Math.min(pv, end[1]), w = Math.abs(end[0] - pu), hh = Math.abs(end[1] - pv);
        if (w < 4 || hh < 4) { w = mode === 'highlight' ? 140 : 120; hh = mode === 'highlight' ? 16 : 40; u = pu - w / 2; v = pv - hh / 2; }
        ed.add(ed.makeRect(mode, u, v, w, hh));
      });
    }
  });
  let onModeReset = null;
  ed.onModeReset = fn => { onModeReset = fn; };

  async function paintItemOnCanvas(c, it, scale) {
    if (it.type === 'rect' || it.redact) {
      c.save();
      if (it.blend) c.globalCompositeOperation = 'multiply';
      c.globalAlpha = it.fillOpacity ?? 1;
      c.fillStyle = it.fill || '#000000';
      c.fillRect(it.u * scale, it.v * scale, it.w * scale, it.h * scale);
      if (it.stroke) { c.globalAlpha = 1; c.strokeStyle = it.stroke; c.lineWidth = (it.sw || 1) * scale; c.strokeRect(it.u * scale, it.v * scale, it.w * scale, it.h * scale); }
      c.restore();
    } else if (it.type === 'text') {
      c.font = `${it.italic ? 'italic ' : ''}${it.bold ? '700 ' : ''}${it.size * scale}px ${FONT_CSS[it.family] || FONT_CSS.Helvetica}`;
      c.fillStyle = it.color || '#111';
      c.textBaseline = 'top';
      String(it.text).split('\n').forEach((line, li) => c.fillText(line, it.u * scale, it.v * scale + li * it.size * 1.2 * scale));
    } else if (it.type === 'image' && it.url) {
      const im = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = it.url; });
      c.globalAlpha = it.opacity ?? 1;
      c.drawImage(im, it.u * scale, it.v * scale, it.w * scale, it.h * scale);
      c.globalAlpha = 1;
    } else if (it.type === 'ink' && it.points) {
      c.strokeStyle = it.color; c.lineWidth = it.width * scale; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      it.points.forEach((p, idx) => idx ? c.lineTo(p[0] * scale, p[1] * scale) : c.moveTo(p[0] * scale, p[1] * scale));
      c.stroke();
    }
  }

  ed.apply = async (doc, progress) => {
    const imgCache = new Map();
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (progress) progress(k / items.length, 'Writing changes…');
      if (k % 10 === 0) await tick();
      const page = doc.getPage(it.page), g = pageGeom(page);
      if (it.type === 'image') {
        let img = imgCache.get(it.bytes);
        if (!img) { img = await doc.embedPng(it.bytes); imgCache.set(it.bytes, img); }
        const [x, y] = g.toUser(it.u, it.v + it.h);
        page.drawImage(img, { x, y, width: it.w, height: it.h, rotate: degrees(g.r), opacity: it.opacity ?? 1 });
      } else if (it.type === 'rect') {
        const [x, y] = g.toUser(it.u, it.v + it.h);
        page.drawRectangle({ x, y, width: it.w, height: it.h, rotate: degrees(g.r),
          color: it.fill ? hexToRgb(it.fill) : undefined, opacity: it.fill ? (it.fillOpacity ?? 1) : undefined,
          borderColor: it.stroke ? hexToRgb(it.stroke) : undefined, borderWidth: it.stroke ? it.sw : 0, blendMode: it.blend ? PDFLib.BlendMode.Multiply : undefined });
      } else if (it.type === 'text') {
        await drawTextVisual(doc, page, it.text, { u: it.u, v: it.v, size: it.size, family: it.family, bold: it.bold, italic: it.italic, color: it.color });
      } else if (it.type === 'ink') {
        const [x, y] = g.toUser(0, 0);
        page.drawSvgPath(inkPath(it.points), { x, y, rotate: degrees(g.r), borderColor: hexToRgb(it.color), borderWidth: it.width, borderLineCap: PDFLib.LineCapStyle.Round });
      }
    }
  };

  /** Build a new PDF, burning pages that contain redactions into images so content is gone. */
  ed.applyBurning = async (file, progress, { dpi = 150 } = {}) => {
    const burn = new Set(items.filter(x => x.redact).map(x => x.page));
    if (!burn.size) {
      const doc = await libDoc(file);
      await ed.apply(doc, progress);
      return doc;
    }
    const src = await libDoc(file);
    const out = await PDFDocument.create();
    for (let i = 0; i < file.pages; i++) {
      if (progress) progress(i / file.pages, burn.has(i) ? `Redacting page ${i + 1}…` : `Copying page ${i + 1}…`);
      if (!burn.has(i)) {
        const pageItems = items.filter(x => x.page === i);
        if (pageItems.length) {
          // Apply overlays on a one-page temp doc then copy — simpler: copy then apply via shared helper on out
        }
        const [copied] = await out.copyPages(src, [i]);
        out.addPage(copied);
        const page = out.getPage(out.getPageCount() - 1);
        const g = pageGeom(page);
        for (const it of items.filter(x => x.page === i)) {
          if (it.type === 'image') {
            const img = await out.embedPng(it.bytes);
            const [x, y] = g.toUser(it.u, it.v + it.h);
            page.drawImage(img, { x, y, width: it.w, height: it.h, rotate: degrees(g.r), opacity: it.opacity ?? 1 });
          } else if (it.type === 'rect') {
            const [x, y] = g.toUser(it.u, it.v + it.h);
            page.drawRectangle({ x, y, width: it.w, height: it.h, rotate: degrees(g.r),
              color: it.fill ? hexToRgb(it.fill) : undefined, opacity: it.fill ? (it.fillOpacity ?? 1) : undefined,
              borderColor: it.stroke ? hexToRgb(it.stroke) : undefined, borderWidth: it.stroke ? it.sw : 0, blendMode: it.blend ? PDFLib.BlendMode.Multiply : undefined });
          } else if (it.type === 'text') {
            await drawTextVisual(out, page, it.text, { u: it.u, v: it.v, size: it.size, family: it.family, bold: it.bold, italic: it.italic, color: it.color });
          } else if (it.type === 'ink') {
            const [x, y] = g.toUser(0, 0);
            page.drawSvgPath(inkPath(it.points), { x, y, rotate: degrees(g.r), borderColor: hexToRgb(it.color), borderWidth: it.width, borderLineCap: PDFLib.LineCapStyle.Round });
          }
        }
        continue;
      }
      const size = await pageSize(file, i);
      let scale = dpi / 72;
      if (size.w * size.h * scale * scale > 4e6) scale = Math.sqrt(4e6 / (size.w * size.h));
      const cv = await renderPage(file, i, { scale });
      const c = cv.getContext('2d');
      for (const it of items.filter(x => x.page === i)) await paintItemOnCanvas(c, it, scale);
      const bytes = await canvasToBytes(cv, 'image/jpeg', 0.88);
      cv.width = cv.height = 0;
      const img = await out.embedJpg(bytes);
      out.addPage([size.w, size.h]).drawImage(img, { x: 0, y: 0, width: size.w, height: size.h });
      await tick();
    }
    return out;
  };
  return ed;
}

/** Load selectable text runs for a page (visual coords). */
async function pageTextRuns(f, pageIndex) {
  const page = await f.pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const runs = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const tr = pdfjs.Util.transform(viewport.transform, it.transform);
    const fontHeight = Math.hypot(tr[2], tr[3]) || 12;
    const width = it.width || (it.str.length * fontHeight * 0.5);
    const u = tr[4], v = viewport.height - tr[5] - fontHeight * 0.15;
    runs.push({ text: it.str, u, v, w: Math.max(width, 4), h: Math.max(fontHeight * 1.15, 8), size: fontHeight });
  }
  return runs;
}
function inkPath(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`; }
  const l = pts[pts.length - 1]; d += ` L${l[0].toFixed(2)} ${l[1].toFixed(2)}`;
  return d;
}
// size a text item's box to its content
function fitText(it) {
  const c = fitText.cv || (fitText.cv = document.createElement('canvas').getContext('2d'));
  c.font = `${it.italic ? 'italic ' : ''}${it.bold ? '700 ' : ''}${it.size}px ${FONT_CSS[it.family] || FONT_CSS.Helvetica}`;
  const lines = String(it.text).split('\n');
  it.w = Math.max(10, ...lines.map(l => c.measureText(l).width)) + 2;
  it.h = it.size * 1.2 * lines.length;
}

// ---------- signatures ----------
const SIG_FONTS = [['Dancing Script', 'folio-dancing'], ['Great Vibes', 'folio-vibes'], ['Caveat', 'folio-caveat']];
function loadSigs() { try { return JSON.parse(localStorage.getItem('folio:sigs') || '[]'); } catch (e) { return []; } }
function saveSigs(list) { try { localStorage.setItem('folio:sigs', JSON.stringify(list.slice(0, 8))); } catch (e) { /* storage full or blocked */ } }
function dataURLBytes(u) { const b = atob(u.split(',')[1]); return Uint8Array.from(b, c => c.charCodeAt(0)); }
function trimCanvas(cv, pad = 6) {
  const c = cv.getContext('2d'), { width: W, height: H } = cv, d = c.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
async function signatureDialog() {
  let tab = 'draw', color = '#111111', width = 3, fontIdx = 0, uploaded = null;
  const body = h('div');
  // draw
  const pad = h('canvas', { class: 'pad', 'aria-label': 'Signature pad — draw with mouse, finger or pen' });
  const strokes = [];
  const drawPane = h('div', null, pad, h('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' },
    swatches(color, c => { color = c; redraw(); }, ['#111111', '#1f3fbf', '#0b5a8a']),
    h('div', { class: 'row' }, h('label', { class: 'help', text: 'Pen' }), h('input', { type: 'range', min: '1.5', max: '7', step: '0.5', value: String(width), style: 'width:110px', 'aria-label': 'Pen width', oninput: e => { width = +e.target.value; redraw(); } }),
      btn('Clear', () => { strokes.length = 0; redraw(); }, { cls: 'sm ghost' }))));
  const ctx2 = () => pad.getContext('2d');
  function sizePad() { const r = pad.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); pad.width = Math.max(1, r.width * dpr); pad.height = Math.max(1, r.height * dpr); redraw(); }
  function redraw() {
    const c = ctx2(), k = pad.width / (pad.getBoundingClientRect().width || 1);
    c.clearRect(0, 0, pad.width, pad.height);
    c.strokeStyle = color; c.lineWidth = width * k; c.lineCap = c.lineJoin = 'round';
    for (const s of strokes) { const p = new Path2D(inkPath(s.map(([x, y]) => [x * k, y * k]))); c.stroke(p); }
  }
  pad.addEventListener('pointerdown', e => {
    const r = pad.getBoundingClientRect(), s = [[e.clientX - r.left, e.clientY - r.top]]; strokes.push(s);
    dragging(e, (dx, dy, ev) => { s.push([ev.clientX - r.left, ev.clientY - r.top]); redraw(); });
  });
  // type
  const nameInp = h('input', { class: 'inp', placeholder: 'Type your name', 'aria-label': 'Your name', value: (loadPrefs('signname', { n: '' })).n });
  const fontBtns = h('div', { class: 'sigfonts' });
  const typePane = h('div', null, nameInp, fontBtns, h('div', { style: 'margin-top:8px' }, swatches(color, c => { color = c; drawFonts(); }, ['#111111', '#1f3fbf', '#0b5a8a'])));
  function drawFonts() {
    fontBtns.replaceChildren(...SIG_FONTS.map(([label, fam], i) => h('button', { type: 'button', 'aria-pressed': String(i === fontIdx), title: label, style: `font-family:'${fam}',cursive;color:${color}`, onclick: () => { fontIdx = i; drawFonts(); } }, nameInp.value || 'Your name')));
  }
  nameInp.addEventListener('input', drawFonts);
  // upload
  const upPrev = h('div', { style: 'min-height:120px;display:grid;place-items:center;border:1px dashed var(--line);border-radius:10px;background:#fff;margin-top:10px' }, h('span', { class: 'help', text: 'No image yet' }));
  let removeBg = true;
  const upPane = h('div', null, btn('Choose image', () => pickFiles('image/*', false, async fl => { uploaded = await createImageBitmap(fl[0]); renderUpload(); }), { ic: 'upload' }),
    h('div', { style: 'margin-top:10px' }, checkbox('Remove white background', true, v => { removeBg = v; renderUpload(); }, 'Makes paper white transparent so the signature sits naturally on the page.')), upPrev);
  let upCanvas = null;
  function renderUpload() {
    if (!uploaded) return;
    const k = Math.min(1, 1200 / Math.max(uploaded.width, uploaded.height));
    const cv = document.createElement('canvas'); cv.width = uploaded.width * k; cv.height = uploaded.height * k;
    const c = cv.getContext('2d'); c.drawImage(uploaded, 0, 0, cv.width, cv.height);
    if (removeBg) { const id = c.getImageData(0, 0, cv.width, cv.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 200) d[i + 3] = Math.max(0, Math.round((255 - l) * 255 / 55)); } c.putImageData(id, 0, 0); }
    upCanvas = cv;
    cv.style.cssText = 'max-width:100%;max-height:160px'; upPrev.replaceChildren(cv);
  }
  const panes = { draw: drawPane, type: typePane, upload: upPane };
  const tabs = seg([['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']], tab, v => { tab = v; for (const k in panes) panes[k].hidden = k !== v; if (v === 'draw') setTimeout(sizePad, 0); if (v === 'type') drawFonts(); }, 'Signature method');
  tabs.classList.add('sigtabs');
  body.append(tabs, drawPane, typePane, upPane);
  typePane.hidden = upPane.hidden = true;
  setTimeout(sizePad, 60); drawFonts();
  await document.fonts.ready.catch(() => {});
  const res = await dialog({ title: 'Create your signature', body: [body], actions: [{ label: 'Cancel', value: null }, { label: 'Use signature', value: 1, primary: true }], wide: true });
  if (!res) return null;
  let cv;
  if (tab === 'draw') {
    if (!strokes.length) return null;
    const k = 3, r = pad.getBoundingClientRect();
    cv = document.createElement('canvas'); cv.width = r.width * k; cv.height = r.height * k;
    const c = cv.getContext('2d'); c.strokeStyle = color; c.lineWidth = width * k; c.lineCap = c.lineJoin = 'round';
    for (const s of strokes) c.stroke(new Path2D(inkPath(s.map(([x, y]) => [x * k, y * k]))));
  } else if (tab === 'type') {
    const name = nameInp.value.trim(); if (!name) return null;
    savePrefs('signname', { n: name });
    const fam = SIG_FONTS[fontIdx][1]; await document.fonts.load(`120px '${fam}'`).catch(() => {});
    cv = document.createElement('canvas'); const c0 = cv.getContext('2d'); c0.font = `120px '${fam}', cursive`;
    cv.width = c0.measureText(name).width + 80; cv.height = 220;
    const c = cv.getContext('2d'); c.font = `120px '${fam}', cursive`; c.fillStyle = color; c.textBaseline = 'middle'; c.fillText(name, 40, 115);
  } else { if (!upCanvas) return null; cv = upCanvas; }
  const t = trimCanvas(cv);
  if (!t) return null;
  const url = t.toDataURL('image/png');
  return { url, w: t.width, h: t.height };
}
