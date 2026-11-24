// ---------------------------------------------------------------------------
// Compress: structural clean-up (unused objects, duplicates, uncompressed
// streams, app data), image re-encoding, or full rasterisation.
// ---------------------------------------------------------------------------
const LEVELS = {
  lossless: { title: 'Clean up (lossless)', sub: 'Removes unused and duplicate data. Looks identical.' },
  balanced: { title: 'Balanced', sub: 'Images to ~150 dpi, good quality. Best for sharing.', dpi: 150, q: 0.72 },
  strong: { title: 'Strong', sub: 'Images to ~100 dpi. Smallest that still reads well.', dpi: 100, q: 0.55 },
  flatten: { title: 'Flatten to images', sub: 'Every page becomes a picture. Big savings for scans; text stops being selectable.', dpi: 110, q: 0.6 },
};

defineTool({
  id: 'compress', name: 'Compress', icon: 'compress', group: 'convert', verb: 'compress', runLabel: 'Compress', runIcon: 'compress',
  desc: 'Make PDFs smaller for email and upload — from lossless clean-up to strong image compression.',
  defaults: { level: 'balanced', strip: true },
  outName: f => baseName(f.name) + '-compressed.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const info = h('div', { class: 'note' });
    ctx.work.append(h('div', { class: 'pages', style: 'max-width:760px' }, [...Array(Math.min(f.pages, 8)).keys()].map(i =>
      h('div', { class: 'pg', style: 'cursor:default' }, h('div', { class: 'thumb' }, thumbImg(f, i, 150)), h('span', { class: 'num', text: String(i + 1) })))),
    f.pages > 8 ? h('p', { class: 'help', style: 'color:var(--muted)', text: `…and ${f.pages - 8} more pages` }) : null);
    ctx.side.append(h('h4', { text: 'Compression level' }),
      choices('level', Object.entries(LEVELS).map(([v, l]) => ({ v, title: l.title, sub: l.sub })), P.level, v => { P.level = v; ctx.save(); }),
      checkbox('Strip metadata and app data', P.strip, v => { P.strip = v; ctx.save(); }, 'Removes XMP metadata, embedded page thumbnails and Illustrator/Photoshop private data.'),
      info);
    info.textContent = `Current size: ${fmtBytes(f.size)}. The PDF Tool keeps the original untouched — you get a new copy.`;
    ctx.setRunnable(true);

    ctx.onRun = async progress => {
      const L = LEVELS[P.level];
      let doc;
      if (P.level === 'flatten') doc = await rasterize(f, L, progress);
      else {
        doc = await libDoc(f);
        if (P.strip) stripExtras(doc);
        if (L.dpi) await recompressImages(doc, L, progress);
        progress(0.85, 'Removing duplicates…');
        dedupeStreams(doc); removeUnused(doc); deflateRaw(doc);
      }
      progress(0.93, 'Saving…');
      const o = await pdfOutput(doc, ctx.outName, { useObjectStreams: true });
      const pct = Math.round((1 - o.data.length / f.size) * 100);
      if (o.data.length >= f.size * 0.98) {
        return { outputs: [], summary: 'This PDF is already well compressed', detail: `The best this level could do was ${fmtBytes(o.data.length)} (original ${fmtBytes(f.size)}). ${P.level !== 'strong' && P.level !== 'flatten' ? 'Try “Strong”, or “Flatten” for scans.' : 'Nothing more to gain here.'}` };
      }
      return { outputs: [o], summary: `${pct}% smaller`, detail: `${fmtBytes(f.size)} → ${fmtBytes(o.data.length)} · ${o.name}` };
    };
  },
});

const N_ = k => PDFName.of(k);
function stripExtras(doc) {
  const ctx = doc.context;
  doc.catalog.delete(N_('Metadata'));
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const d = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : null;
    if (!d) continue;
    d.delete(N_('PieceInfo')); d.delete(N_('Thumb')); d.delete(N_('Metadata'));
  }
}

function colorKind(ctx, cs) {
  cs = cs instanceof PDFRef ? ctx.lookup(cs) : cs;
  const n = pdfNameText(cs instanceof PDFArray ? cs.get(0) : cs);
  if (n === 'DeviceRGB' || n === 'CalRGB') return 'rgb';
  if (n === 'DeviceGray' || n === 'CalGray') return 'gray';
  if (n === 'ICCBased') {
    const s = ctx.lookup(cs.get(1));
    const comps = s instanceof PDFStream ? s.dict.lookup(N_('N')) : null;
    const v = comps ? comps.asNumber() : 0;
    return v === 3 ? 'rgb' : v === 1 ? 'gray' : null;
  }
  return null;
}
function pngUnpredict(data, cols, colors) {
  const rl = cols * colors, rows = Math.floor(data.length / (rl + 1)), out = new Uint8Array(rows * rl);
  let prev = new Uint8Array(rl);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rl + 1)], src = data.subarray(r * (rl + 1) + 1, (r + 1) * (rl + 1)), cur = out.subarray(r * rl, (r + 1) * rl);
    for (let i = 0; i < rl; i++) {
      const a = i >= colors ? cur[i - colors] : 0, b = prev[i], c = i >= colors ? prev[i - colors] : 0;
      let p;
      if (ft === 0) p = 0; else if (ft === 1) p = a; else if (ft === 2) p = b; else if (ft === 3) p = (a + b) >> 1;
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (src[i] + p) & 255;
    }
    prev = cur;
  }
  return out;
}
async function recompressImages(doc, L, progress) {
  const ctx = doc.context;
  let maxPt = 0;
  for (const p of doc.getPages()) { const s = p.getSize(); maxPt = Math.max(maxPt, s.width, s.height); }
  const maxPx = Math.ceil((maxPt / 72) * L.dpi);
  const objs = ctx.enumerateIndirectObjects();
  const masks = new Set();
  for (const [, o] of objs) if (o instanceof PDFStream) for (const k of ['SMask', 'Mask']) { const r = o.dict.get(N_(k)); if (r instanceof PDFRef) masks.add(r.toString()); }
  const imgs = objs.filter(([ref, o]) => o instanceof PDFRawStream && pdfNameText(o.dict.get(N_('Subtype'))) === 'Image' && !masks.has(ref.toString()));
  let done = 0;
  for (const [ref, o] of imgs) {
    progress(0.05 + 0.75 * (done++ / Math.max(1, imgs.length)), `Compressing images (${done} of ${imgs.length})…`);
    try {
      const d = o.dict;
      if (d.get(N_('ImageMask')) === PDFBool.True || d.get(N_('Decode'))) continue;
      const w = d.lookup(N_('Width')).asNumber(), hh = d.lookup(N_('Height')).asNumber();
      const bpc = d.lookup(N_('BitsPerComponent')); if (!bpc || bpc.asNumber() !== 8) continue;
      if (w * hh > 50e6 || w * hh < 4096) continue;
      const kind = colorKind(ctx, d.get(N_('ColorSpace')));
      if (!kind) continue;
      const dec = decodeChain(d, o.contents, kind === 'rgb' ? 3 : 1, w);
      if (!dec) continue;
      let source;
      if (dec.jpeg) source = await createImageBitmap(new Blob([dec.data], { type: 'image/jpeg' }), { colorSpaceConversion: 'none' });
      else {
        const raw = dec.data, comps = kind === 'rgb' ? 3 : 1;
        if (raw.length < w * hh * comps) continue;
        const id = new ImageData(w, hh);
        for (let i = 0, j = 0; i < w * hh; i++, j += comps) { id.data[i * 4] = raw[j]; id.data[i * 4 + 1] = raw[j + (comps === 3 ? 1 : 0)]; id.data[i * 4 + 2] = raw[j + (comps === 3 ? 2 : 0)]; id.data[i * 4 + 3] = 255; }
        source = await createImageBitmap(id);
      }
      const k = Math.min(1, maxPx / Math.max(w, hh));
      const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(hh * k));
      const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
      const c2 = cv.getContext('2d'); c2.imageSmoothingQuality = 'high'; c2.drawImage(source, 0, 0, nw, nh);
      source.close && source.close();
      const bytes = await canvasToBytes(cv, 'image/jpeg', L.q);
      cv.width = cv.height = 0;
      if (bytes.length >= o.contents.length * 0.9) continue;
      const nd = d.clone(ctx);
      for (const key of ['Filter', 'DecodeParms', 'Length', 'Width', 'Height', 'BitsPerComponent']) nd.delete(N_(key));
      nd.set(N_('Width'), PDFNumber.of(nw)); nd.set(N_('Height'), PDFNumber.of(nh));
      nd.set(N_('BitsPerComponent'), PDFNumber.of(8)); nd.set(N_('Filter'), N_('DCTDecode'));
      if (kind === 'gray') nd.set(N_('ColorSpace'), N_('DeviceRGB'));
      ctx.assign(ref, PDFRawStream.of(nd, bytes));
    } catch (e) { console.warn('image skipped', e); }
    if (done % 3 === 0) await tick();
  }
}
// Undo a stream's filter chain. Returns { data, jpeg } or null if unsupported.
function decodeChain(d, contents, comps, cols) {
  let f = d.lookup(N_('Filter')), parms = d.lookup(N_('DecodeParms'));
  const names = f instanceof PDFArray ? f.asArray().map(x => pdfNameText(x)) : f ? [pdfNameText(f)] : [];
  const parmAt = i => parms instanceof PDFArray ? (parms.lookup(i) instanceof PDFDict ? parms.lookup(i) : null) : (parms instanceof PDFDict ? parms : null);
  let data = contents;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (n === 'ASCII85Decode' || n === 'A85') data = ascii85(data);
    else if (n === 'ASCIIHexDecode' || n === 'AHx') data = asciiHex(data);
    else if (n === 'FlateDecode' || n === 'Fl') {
      data = fflate.unzlibSync(data);
      const p = parmAt(i), pr = p && p.lookup(N_('Predictor')), pv = pr ? pr.asNumber() : 1;
      if (pv >= 10) data = pngUnpredict(data, cols, comps); else if (pv > 1) return null;
    } else if ((n === 'DCTDecode' || n === 'DCT') && i === names.length - 1) return { data, jpeg: true };
    else return null;
  }
  return { data, jpeg: false };
}
function ascii85(b) {
  let i = 0; while (i < b.length && b[i] <= 32) i++;
  if (b[i] === 0x3c && b[i + 1] === 0x7e) i += 2;
  let zs = 0; for (let k = i; k < b.length; k++) if (b[k] === 0x7a) zs++;
  const out = new Uint8Array(Math.ceil((b.length - i) * 4 / 5) + zs * 4 + 8); let o = 0, t = 0, c = 0;
  for (; i < b.length; i++) {
    const ch = b[i];
    if (ch === 0x7e) break;
    if (ch <= 32) continue;
    if (ch === 0x7a && c === 0) { o += 4; continue; }
    t = t * 85 + (ch - 33); c++;
    if (c === 5) { out[o++] = (t / 16777216) & 255; out[o++] = (t >>> 16) & 255; out[o++] = (t >>> 8) & 255; out[o++] = t & 255; t = 0; c = 0; }
  }
  if (c) { for (let k = c; k < 5; k++) t = t * 85 + 84; const q = [(t / 16777216) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255]; for (let k = 0; k < c - 1; k++) out[o++] = q[k]; }
  return out.subarray(0, o);
}
function asciiHex(b) {
  const out = new Uint8Array(Math.ceil(b.length / 2)); let o = 0, hi = -1;
  for (const ch of b) {
    if (ch === 0x3e) break;
    const v = ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - 55 : ch >= 97 && ch <= 102 ? ch - 87 : -1;
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out[o++] = hi * 16 + v; hi = -1; }
  }
  if (hi >= 0) out[o++] = hi * 16;
  return out.subarray(0, o);
}
function hashBytes(b) { let x = 2166136261; for (let i = 0; i < b.length; i += (b.length > 65536 ? 7 : 1)) { x ^= b[i]; x = Math.imul(x, 16777619); } return (x >>> 0).toString(36) + ':' + b.length; }
function sameBytes(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function replaceRefs(ctx, map) {
  const fix = v => (v instanceof PDFRef && map.has(v.toString()) ? map.get(v.toString()) : v);
  const walk = o => {
    if (o instanceof PDFDict) for (const [k, v] of o.entries()) { const n = fix(v); if (n !== v) o.set(k, n); else if (!(v instanceof PDFRef)) walk(v); }
    else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) { const v = o.get(i), n = fix(v); if (n !== v) o.set(i, n); else if (!(v instanceof PDFRef)) walk(v); }
    else if (o instanceof PDFStream) walk(o.dict);
  };
  for (const [, o] of ctx.enumerateIndirectObjects()) walk(o);
}
function dedupeStreams(doc) {
  const ctx = doc.context;
  for (let pass = 0; pass < 2; pass++) {
    const buckets = new Map(), map = new Map();
    for (const [ref, o] of ctx.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream) || o.contents.length < 256) continue;
      const dictKey = o.dict.entries().filter(([k]) => k.decodeText() !== 'Length').map(([k, v]) => k.decodeText() + '=' + v.toString()).sort().join(';');
      const key = hashBytes(o.contents) + '|' + dictKey;
      const list = buckets.get(key) || [];
      const twin = list.find(([, x]) => sameBytes(x.contents, o.contents));
      if (twin) map.set(ref.toString(), twin[0]); else { list.push([ref, o]); buckets.set(key, list); }
    }
    if (!map.size) break;
    replaceRefs(ctx, map);
    for (const k of map.keys()) { const [n, g] = k.split(' '); ctx.delete(PDFRef.of(+n, +g)); }
  }
}
function removeUnused(doc) {
  const ctx = doc.context, seen = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    const v = stack.pop();
    if (v instanceof PDFRef) { const k = v.toString(); if (seen.has(k)) continue; seen.add(k); const o = ctx.lookup(v); if (o) stack.push(o); }
    else if (v instanceof PDFDict) for (const [, x] of v.entries()) stack.push(x);
    else if (v instanceof PDFArray) for (let i = 0; i < v.size(); i++) stack.push(v.get(i));
    else if (v instanceof PDFStream) stack.push(v.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.toString())) ctx.delete(ref);
}
function deflateRaw(doc) {
  const ctx = doc.context;
  for (const [ref, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.dict.get(N_('Filter')) || o.contents.length < 200) continue;
    const z = fflate.zlibSync(o.contents, { level: 9 });
    if (z.length < o.contents.length * 0.9) {
      const nd = o.dict.clone(ctx); nd.set(N_('Filter'), N_('FlateDecode')); nd.delete(N_('DecodeParms'));
      ctx.assign(ref, PDFRawStream.of(nd, z));
    }
  }
}
async function rasterize(f, L, progress) {
  const out = await PDFDocument.create();
  for (let i = 0; i < f.pages; i++) {
    progress(0.05 + 0.85 * i / f.pages, `Flattening page ${i + 1} of ${f.pages}…`);
    const s = await pageSize(f, i);
    // Cap pixel count so large image pages don't OOM the tab during flatten.
    let scale = L.dpi / 72;
    if (s.w * s.h * scale * scale > 4e6) scale = Math.sqrt(4e6 / (s.w * s.h));
    const cv = await renderPage(f, i, { scale });
    const bytes = await canvasToBytes(cv, 'image/jpeg', L.q);
    cv.width = cv.height = 0;
    const img = await out.embedJpg(bytes);
    out.addPage([s.w, s.h]).drawImage(img, { x: 0, y: 0, width: s.w, height: s.h });
    await tick();
  }
  return out;
}
