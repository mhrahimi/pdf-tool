// ---------------------------------------------------------------------------
// The PDF Tool core: DOM helpers, icons, file library, PDF loading, rendering,
// page ranges, naming, downloads, toasts, dialogs and the run framework.
// ---------------------------------------------------------------------------
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, PDFStream, PDFNumber,
  PDFString, PDFHexString, PDFBool, PDFNull, StandardFonts, degrees, rgb } = PDFLib;
const pdfjs = window.pdfjsLib;

// ---------- DOM ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, a, ...kids) {
  const el = document.createElement(tag);
  if (a) for (const k in a) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // trusted constants only
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (!k.includes('-') && k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);

const ICONS = {
  logo: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  view: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
  merge: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><path d="M6.5 12v2.5h11V12M12 14.5V21M9.5 18.5 12 21l2.5-2.5"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  organize: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  toimage: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  fromimage: '<rect x="2" y="5" width="11" height="11" rx="1.5"/><path d="M2 13l3-3 4 4"/><path d="M15 3h4l3 3v15h-9v-2"/>',
  sign: '<path d="M3 21c3-1 4-4 6-4s1 3 3 3 3-2 5-2"/><path d="M14.5 3.5l5 5L10 18l-5 1 1-5z"/>',
  watermark: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  form: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 14h4"/><path d="M14 9l1.5 1.5L18 8"/><rect x="14" y="13" width="4" height="3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  rotl: '<path d="M4 4v5h5"/><path d="M4.6 9A8 8 0 1 1 6 17"/>',
  rotr: '<path d="M20 4v5h-5"/><path d="M19.4 9A8 8 0 1 0 18 17"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  whiteout: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8M8 14h5"/>',
  highlight: '<path d="M9 11l-4 4v4h4l4-4"/><path d="M9 11l6-6 4 4-6 6z"/><path d="M14 21h7"/>',
  draw: '<path d="M3 17c3-6 5 4 8-2s5-8 8-3"/><path d="M17 20h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  blank: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  reverse: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  files: '<path d="M8 3h7l4 4v11H8z"/><path d="M15 3v4h4"/><path d="M5 7v14h11"/>',
  sort: '<path d="M4 6h10M4 12h7M4 18h4M17 4v16M14 17l3 3 3-3"/>',
  wand: '<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20 14 10"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  pen: '<path d="M14.5 3.5l5 5L10 18l-5 1 1-5z"/>',
  dots: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
};
function icon(name, cls = 'i') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || ''; return s;
}
const btn = (label, onclick, { ic, cls = '', title, disabled, type = 'button' } = {}) =>
  h('button', { type, class: 'btn ' + cls, onclick, title: title || null, 'aria-label': (!label && title) ? title : null, disabled: !!disabled }, ic ? icon(ic) : null, label || null);
const iconBtn = (ic, title, onclick, cls = 'ghost') => btn('', onclick, { ic, title, cls: 'icon ' + cls });

// ---------- formatting ----------
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
}
const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;
const baseName = n => (n || 'document').replace(/\.[a-z0-9]{2,5}$/i, '');
function safeName(n, ext) {
  n = String(n || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180) || 'document';
  if (ext && !n.toLowerCase().endsWith('.' + ext)) n += '.' + ext;
  return n;
}
function fillPattern(pattern, vars) {
  return String(pattern).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const PT_PER = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1 };

// ---------- page ranges (PDFsam style: 2, 5-23, 12-, -4, last, odd, even, all) ----------
function parseRangeParts(input, total) {
  const s = String(input || '').toLowerCase().replace(/[–—]/g, '-').replace(/\bto\b/g, '-').trim();
  if (!s) return { groups: [] };
  const groups = [];
  for (let part of s.split(/[,;]+/)) {
    part = part.replace(/\s+/g, '');
    if (!part) continue;
    const all = [...Array(total).keys()];
    if (part === 'all') { groups.push(all); continue; }
    if (part === 'odd') { groups.push(all.filter(i => i % 2 === 0)); continue; }
    if (part === 'even') { groups.push(all.filter(i => i % 2 === 1)); continue; }
    const m = part.match(/^(\d+|last)?(-)?(\d+|last)?$/);
    if (!m || (!m[1] && !m[3])) return { error: `“${part}” isn’t a page or range. Try 1-3, 5, 8-` };
    const num = t => (t === 'last' ? total : parseInt(t, 10));
    let a = m[1] ? num(m[1]) : 1, b = m[2] ? (m[3] ? num(m[3]) : total) : a;
    for (const n of [a, b]) {
      if (n < 1) return { error: 'Page numbers start at 1.' };
      if (n > total) return { error: `Page ${n} doesn’t exist — this file has ${plural(total, 'page')}.` };
    }
    const g = [];
    if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1); else for (let i = a; i >= b; i--) g.push(i - 1);
    groups.push(g);
  }
  return { groups };
}
function parseRanges(input, total, { emptyIsAll = true } = {}) {
  const r = parseRangeParts(input, total);
  if (r.error) return r;
  if (!r.groups.length) return emptyIsAll ? { pages: [...Array(total).keys()] } : { pages: [], error: 'Choose at least one page.' };
  return { pages: r.groups.flat() };
}
function rangesFromSet(indices) { // [0,1,2,5] -> "1-3, 6"
  const s = [...new Set(indices)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`); i = j;
  }
  return out.join(', ');
}
// A text input that validates a page selection as you type.
function rangeField({ label = 'Pages', value = '', total, placeholder = 'All pages', help = 'e.g. 1-3, 5, 8-  ·  odd, even, last', onchange, emptyIsAll = true }) {
  const id = 'r' + uid();
  const inp = h('input', { class: 'inp', id, value, placeholder, autocomplete: 'off', spellcheck: 'false' });
  const err = h('div', { class: 'err', hidden: true });
  const wrap = h('div', { class: 'field' }, label ? h('label', { for: id, text: label }) : null, inp, err, help ? h('div', { class: 'help', text: help }) : null);
  const api = {
    el: wrap, input: inp, total,
    get value() { return inp.value; },
    set value(v) { inp.value = v; api.check(); },
    check() {
      const r = parseRanges(inp.value, api.total, { emptyIsAll });
      inp.classList.toggle('bad', !!r.error); err.hidden = !r.error; err.textContent = r.error || '';
      return r;
    },
  };
  inp.addEventListener('input', () => { const r = api.check(); onchange && onchange(r, inp.value); });
  return api;
}

// ---------- assets (cmaps, symbol fonts, wasm, worker) ----------
async function gunzipB64(b64) {
  const bin = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
let assetsPromise = null;
function loadAssets() {
  if (!assetsPromise) assetsPromise = (async () => {
    const el = document.getElementById('folio-assets');
    let json;
    if (el) json = new TextDecoder().decode(await gunzipB64(el.textContent));
    else json = await (await fetch('assets.json')).text();
    return JSON.parse(json);
  })().catch(e => { assetsPromise = null; throw e; });
  return assetsPromise;
}
class EmbeddedDataFactory {
  constructor() {}
  async fetch({ kind, filename }) {
    const key = { cMapUrl: 'cmaps/', standardFontDataUrl: 'fonts/', wasmUrl: 'wasm/' }[kind] + filename;
    const a = await loadAssets();
    if (!a[key]) throw new Error('Missing data: ' + key);
    return Uint8Array.from(atob(a[key]), c => c.charCodeAt(0));
  }
}
async function setupPdfjsWorker() {
  const el = document.getElementById('folio-worker');
  const src = el ? await gunzipB64(el.textContent) : null;
  try {
    const url = src ? URL.createObjectURL(new Blob([src], { type: 'text/javascript' })) : 'pdf.worker.js';
    const w = new Worker(url);
    const ok = await new Promise(res => {
      const t = setTimeout(() => res(false), 8000);
      w.addEventListener('message', () => { clearTimeout(t); res(true); }, { once: true });
      w.addEventListener('error', () => { clearTimeout(t); res(false); }, { once: true });
    });
    if (!ok) { w.terminate(); throw new Error('worker did not start'); }
    pdfjs.GlobalWorkerOptions.workerPort = w;
  } catch (e) {
    console.warn('PDF worker unavailable — parsing on the main thread.', e);
    if (src) { const s = document.createElement('script'); s.textContent = new TextDecoder().decode(src); document.head.append(s); }
    else await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'pdf.worker.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
  }
}

// ---------- file library ----------
const store = { files: [], current: null, listeners: new Set() };
const emit = () => store.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
const IMG_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|avif|svg\+xml)$/;

function sniff(bytes, name, mime) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (head.includes('%PDF')) return 'pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image';
  if (head.startsWith('GIF8') || head.startsWith('BM') || head.slice(8, 12) === 'WEBP') return 'image';
  if (IMG_TYPES.test(mime || '')) return 'image';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return null;
}
function imageMime(bytes, fallback) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  if (head.startsWith('GIF8')) return 'image/gif';
  if (head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (head.startsWith('BM')) return 'image/bmp';
  return fallback || 'image/png';
}

async function askPassword(name, wrong) {
  const inp = h('input', { class: 'inp', type: 'password', autocomplete: 'off', 'aria-label': 'Password' });
  const res = await dialog({
    title: 'This PDF is protected',
    body: [h('p', { text: wrong ? `That password didn’t work for “${name}”. Try again.` : `Enter the password to open “${name}”. It stays on this device.` }), inp],
    actions: [{ label: 'Skip file', value: null }, { label: 'Unlock', value: 'ok', primary: true }],
    focus: inp,
  });
  return res === 'ok' ? inp.value : null;
}

async function openPdfjs(bytes, name, password) {
  let pw = password;
  const task = pdfjs.getDocument({
    data: bytes.slice(), password: pw || undefined,
    BinaryDataFactory: EmbeddedDataFactory, useWorkerFetch: false,
    cMapUrl: 'cmaps/', cMapPacked: true, standardFontDataUrl: 'fonts/', wasmUrl: 'wasm/',
    isEvalSupported: false, enableXfa: false,
  });
  task.onPassword = async (update, reason) => {
    pw = await askPassword(name, reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    if (pw == null) task.destroy(); else update(pw);
  };
  const doc = await task.promise;
  return { doc, password: pw };
}

async function addFiles(fileList, { select = true } = {}) {
  const added = [];
  for (const f of fileList) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      added.push(await addBytes(bytes, f.name, f.type, { select: false }));
    } catch (e) {
      if (e && e.name === 'AbortException') continue; // skipped password
      if (e && /Worker was destroyed|Loading aborted/i.test(e.message || '')) continue;
      console.error(e);
      toast(`Couldn’t open “${f.name}”: ${friendlyError(e)}`, 'error');
    }
  }
  if (select && added.length) setCurrent(added.find(d => d.kind === 'pdf') || added[0]);
  emit();
  return added;
}
async function addBytes(bytes, name, mime, { select = true, derivedFrom } = {}) {
  const kind = sniff(bytes, name, mime);
  if (!kind) throw new Error('Not a PDF or image file.');
  const d = { id: uid(), name: name || (kind === 'pdf' ? 'document.pdf' : 'image'), size: bytes.length, kind, bytes, thumbs: new Map(), derivedFrom };
  if (kind === 'pdf') {
    const { doc, password } = await openPdfjs(bytes, d.name);
    d.pdf = doc; d.pages = doc.numPages; d.password = password || '';
    d.encrypted = !!password;
    d.sizes = [];
  } else {
    d.mime = imageMime(bytes, mime);
    const bmp = await createImageBitmap(new Blob([bytes], { type: d.mime }));
    d.w = bmp.width; d.h = bmp.height; bmp.close && bmp.close();
    d.pages = 1;
  }
  store.files.push(d);
  if (select) setCurrent(d);
  emit();
  return d;
}
function setCurrent(d) { store.current = d ? d.id : null; emit(); }
function getFile(id) { return store.files.find(f => f.id === id); }
function currentPdf() { const f = getFile(store.current); return f && f.kind === 'pdf' ? f : store.files.slice().reverse().find(f => f.kind === 'pdf'); }
function removeFile(d) {
  store.files = store.files.filter(f => f !== d);
  if (d.pdf) d.pdf.loadingTask.destroy().catch(() => {});
  if (store.current === d.id) store.current = (store.files.find(f => f.kind === 'pdf') || {}).id || null;
  emit();
}
function friendlyError(e) {
  const m = (e && (e.message || String(e))) || 'Unknown error';
  if (/password/i.test(m)) return 'it needs a password.';
  if (/Invalid PDF|No PDF header|Failed to parse/i.test(m)) return 'it doesn’t look like a valid PDF.';
  if (/WinAnsi cannot encode/i.test(m)) return 'some characters can’t be written with the built-in fonts.';
  return m.length > 160 ? m.slice(0, 160) + '…' : m;
}

// Load a fresh, editable pdf-lib document for a library file.
async function libDoc(d) {
  try {
    return await PDFDocument.load(d.bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (e) {
    if (e && /encrypted/i.test(e.message || '')) {
      return await PDFDocument.load(d.bytes, { password: d.password || '', updateMetadata: false });
    }
    throw e;
  }
}
async function pageSize(d, i) { // visual (rotated) size in points
  if (d.sizes[i]) return d.sizes[i];
  const p = await d.pdf.getPage(i + 1);
  const vp = p.getViewport({ scale: 1 });
  return (d.sizes[i] = { w: vp.width, h: vp.height, rotate: p.rotate });
}

// ---------- rendering ----------
const renderQueue = [];
let renderActive = 0;
function queued(fn) {
  return new Promise((res, rej) => { renderQueue.push({ fn, res, rej }); pump(); });
}
function pump() {
  while (renderActive < 2 && renderQueue.length) {
    const j = renderQueue.shift(); renderActive++;
    j.fn().then(j.res, j.rej).finally(() => { renderActive--; pump(); });
  }
}
async function renderPage(d, i, { scale, width, rotation = 0, canvas, background, annotationMode } = {}) {
  const page = await d.pdf.getPage(i + 1);
  let vp = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  const s = width ? width / vp.width : (scale || 1);
  vp = page.getViewport({ scale: s, rotation: (page.rotate + rotation) % 360 });
  const cv = canvas || document.createElement('canvas');
  cv.width = Math.max(1, Math.round(vp.width)); cv.height = Math.max(1, Math.round(vp.height));
  const ctx = cv.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, cv.width, cv.height); }
  await page.render({ canvas: cv, canvasContext: ctx, viewport: vp, background: background || 'rgb(255,255,255)', annotationMode: annotationMode ?? pdfjs.AnnotationMode.ENABLE }).promise;
  return cv;
}
function thumbURL(d, i, width = 180) {
  const key = i + '@' + width;
  if (d.kind === 'image') {
    if (!d.url) d.url = URL.createObjectURL(new Blob([d.bytes], { type: d.mime }));
    return Promise.resolve(d.url);
  }
  if (!d.thumbs.has(key)) d.thumbs.set(key, queued(async () => {
    const cv = await renderPage(d, i, { width: width * Math.min(2, devicePixelRatio || 1) });
    return cv.toDataURL('image/jpeg', 0.82);
  }));
  return d.thumbs.get(key);
}
// <img> that fills in lazily when scrolled into view
const lazyIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { lazyIO.unobserve(e.target); e.target._load && e.target._load(); }
}, { rootMargin: '300px' }) : null;
function thumbImg(d, i, width = 180, extra = {}) {
  const img = h('img', { alt: `Page ${i + 1}`, class: 'ph', ...extra });
  img._load = () => thumbURL(d, i, width).then(u => { img.src = u; img.classList.remove('ph'); }).catch(() => {});
  if (lazyIO) lazyIO.observe(img); else img._load();
  return img;
}

// ---------- downloads ----------
const host = { downloads: null, embedded: false };
function initHost() {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      host.embedded = true;
      window.claude.use('downloads').then(d => { host.downloads = d; }).catch(() => {});
    }
  } catch (e) { /* standalone */ }
}
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', zip: 'application/zip', txt: 'text/plain' };
async function saveFile(name, data) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || 'application/octet-stream' });
  if (host.downloads) {
    try { await host.downloads.save({ filename: name, data: blob }); return true; }
    catch (e) {
      if (e && e.code === 'declined') return false;
      if (e && e.code === 'rate_limited') { toast('A save prompt is already open.', 'info'); return false; }
      if (e && e.code === 'host_unavailable') { toast('Saving isn’t available in this app — open The PDF Tool in a browser to save files.', 'error'); return false; }
      if (e && e.code === 'too_large') { toast('That file is too large to save here.', 'error'); return false; }
    }
  } else if (host.embedded) {
    toast('Saving files isn’t available in this view. Open the standalone folio.html to save your work.', 'error');
    return false;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name, style: 'display:none' });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  return true;
}
function zipFiles(files) {
  const used = new Set(), entries = {};
  for (const f of files) {
    let n = f.name, k = 2;
    while (used.has(n.toLowerCase())) n = f.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`);
    used.add(n.toLowerCase());
    entries[n] = [f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), { level: /\.(txt|svg)$/i.test(n) ? 6 : 0 }];
  }
  return fflate.zipSync(entries);
}

// ---------- toasts & dialogs ----------
function toast(msg, type = 'info', ms) {
  const box = $('#toasts');
  const t = h('div', { class: 'toast ' + type, role: type === 'error' ? 'alert' : 'status' }, h('span', { text: msg }),
    h('button', { class: 'x', 'aria-label': 'Dismiss', onclick: () => t.remove() }, icon('x')));
  box.append(t);
  setTimeout(() => t.remove(), ms || (type === 'error' ? 9000 : 4200));
}
function dialog({ title, body = [], actions = [{ label: 'OK', value: 'ok', primary: true }], focus, wide }) {
  return new Promise(resolve => {
    const dl = h('dialog', { style: wide ? 'width:min(720px,calc(100vw - 24px))' : null });
    const done = v => { dl.close(); dl.remove(); resolve(v); };
    const acts = h('div', { class: 'acts' }, actions.map(a => btn(a.label, () => done(a.value), { cls: a.primary ? 'primary' : a.danger ? 'danger' : '' })));
    const form = h('form', { class: 'dlg', onsubmit: e => { e.preventDefault(); const p = actions.find(a => a.primary); done(p ? p.value : null); } },
      h('h2', { text: title }), body, acts);
    dl.append(form);
    dl.addEventListener('cancel', e => { e.preventDefault(); done(null); });
    document.body.append(dl); dl.showModal();
    setTimeout(() => (focus || acts.lastChild).focus(), 30);
  });
}
function popMenu(anchor, items) {
  const old = $('.menu'); if (old) old.remove();
  const m = h('div', { class: 'menu', role: 'menu' }, items.map(it => it ? h('button', { role: 'menuitem', type: 'button', onclick: () => { close(); it.onclick(); } }, it.icon ? icon(it.icon) : null, it.label) : h('div', { class: 'hr', style: 'margin:4px 0' })));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + 6 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 6) : r.bottom + 6;
  m.style.top = top + 'px';
  m.style.left = clamp(r.right - m.offsetWidth, 8, innerWidth - m.offsetWidth - 8) + 'px';
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); };
  const outside = e => { if (!m.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
  const first = m.querySelector('button'); first && first.focus();
}

// ---------- settings memory (per tool, this browser only) ----------
function loadPrefs(id, defaults) {
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem('folio:' + id) || '{}')); } catch (e) { return Object.assign({}, defaults); }
}
function savePrefs(id, obj) { try { localStorage.setItem('folio:' + id, JSON.stringify(obj)); } catch (e) { /* private mode */ } }

// ---------- small form builders ----------
function seg(options, value, onchange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label || null });
  const set = v => { value = v; for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); };
  for (const [v, l] of options) wrap.append(h('button', { type: 'button', 'data-v': String(v), onclick: () => { set(v); onchange(v); } }, l));
  set(value); wrap.set = set;
  return wrap;
}
function field(label, control, help) {
  const id = control.id || (control.id = 'f' + uid());
  return h('div', { class: 'field' }, h(control.tagName === 'DIV' ? 'div' : 'label', control.tagName === 'DIV' ? { class: 'lbl', text: label } : { for: id, text: label }), control, help ? h('div', { class: 'help', text: help }) : null);
}
function checkbox(label, checked, onchange, sub) {
  const inp = h('input', { type: 'checkbox', checked: !!checked, onchange: () => onchange(inp.checked) });
  return h('label', { class: 'check' }, inp, h('span', null, label, sub ? h('small', { text: sub }) : null));
}
function choices(name, opts, value, onchange) { // opts: [{v, title, sub, extra}]
  const wrap = h('div', { class: 'choices', role: 'radiogroup' });
  const sync = () => opts.forEach(o => { if (o.extra) o.extra.hidden = String(o.v) !== String(value); });
  for (const o of opts) {
    const inp = h('input', { type: 'radio', name, value: String(o.v), checked: String(o.v) === String(value), disabled: !!o.disabled, onchange: () => { value = o.v; sync(); onchange(o.v); } });
    wrap.append(h('label', { class: 'choice', style: o.disabled ? 'opacity:.55;cursor:not-allowed' : null }, inp, h('div', { style: 'flex:1' }, h('b', { text: o.title }), o.sub ? h('small', { text: o.sub }) : null, o.extra ? h('div', { class: 'extra' }, o.extra) : null)));
    if (o.extra) o.extra = o.extra.parentNode;
  }
  sync();
  return wrap;
}
function numInput(value, { min, max, step = 1, onchange, width = '90px', label }) {
  const inp = h('input', { class: 'inp', type: 'number', value: String(value), min: min ?? null, max: max ?? null, step: String(step), style: `width:${width};flex:none`, 'aria-label': label || null });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onchange(v); });
  return inp;
}
const COLORS = ['#000000', '#1f3fbf', '#c8291c', '#0b7a46', '#7a7f8c', '#ffffff'];
function swatches(value, onchange, list = COLORS) {
  const wrap = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour' });
  const pick = h('input', { type: 'color', value, 'aria-label': 'Custom colour', oninput: () => { set(pick.value); onchange(pick.value); } });
  const set = v => { for (const b of wrap.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.c === v)); };
  for (const c of list) wrap.append(h('button', { type: 'button', 'data-c': c, title: c, 'aria-label': 'Colour ' + c, style: `background:${c}`, onclick: () => { set(c); pick.value = c; onchange(c); } }));
  wrap.append(pick); set(value);
  return wrap;
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ---------- geometry: visual page space (top-left origin, y down) <-> PDF user space ----------
function pageGeom(page) {
  const box = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const x0 = box.x, y0 = box.y, x1 = box.x + box.width, y1 = box.y + box.height;
  const W = r % 180 ? box.height : box.width, H = r % 180 ? box.width : box.height;
  const toUser = (u, v) => r === 0 ? [x0 + u, y1 - v] : r === 90 ? [x0 + v, y0 + u] : r === 180 ? [x1 - u, y0 + v] : [x1 - v, y1 - u];
  const toVisual = (x, y) => r === 0 ? [x - x0, y1 - y] : r === 90 ? [y - y0, x - x0] : r === 180 ? [x1 - x, y - y0] : [y1 - y, x1 - x];
  const rectToVisual = rc => { const [a, b] = toVisual(rc.x, rc.y), [c, d] = toVisual(rc.x + rc.width, rc.y + rc.height); return { u: Math.min(a, c), v: Math.min(b, d), w: Math.abs(c - a), h: Math.abs(d - b) }; };
  return { r, W, H, toUser, toVisual, rectToVisual, box };
}
// map visual margins {top,right,bottom,left} to an unrotated box
function marginsToBox(page, m) {
  const g = pageGeom(page), b = g.box;
  let xMin = b.x, yMin = b.y, xMax = b.x + b.width, yMax = b.y + b.height;
  const map = { 0: ['yMax-', 'xMax-', 'yMin+', 'xMin+'], 90: ['xMin+', 'yMax-', 'xMax-', 'yMin+'], 180: ['yMin+', 'xMin+', 'yMax-', 'xMax-'], 270: ['xMax-', 'yMin+', 'xMin+', 'yMax-'] }[g.r];
  const vals = { xMin, yMin, xMax, yMax };
  [m.top, m.right, m.bottom, m.left].forEach((v, i) => { const k = map[i].slice(0, 4), s = map[i][4]; vals[k] += s === '+' ? v : -v; });
  return { x: vals.xMin, y: vals.yMin, width: vals.xMax - vals.xMin, height: vals.yMax - vals.yMin };
}

// ---------- text that standard fonts can't encode -> crisp image ----------
const FONT_CSS = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
function stdFontName(fam = 'Helvetica', bold, italic) {
  const k = fam + (bold ? 'B' : '') + (italic ? 'I' : '');
  return ({ Helvetica: 'Helvetica', HelveticaB: 'Helvetica-Bold', HelveticaI: 'Helvetica-Oblique', HelveticaBI: 'Helvetica-BoldOblique',
    Times: 'Times-Roman', TimesB: 'Times-Bold', TimesI: 'Times-Italic', TimesBI: 'Times-BoldItalic',
    Courier: 'Courier', CourierB: 'Courier-Bold', CourierI: 'Courier-Oblique', CourierBI: 'Courier-BoldOblique' })[k];
}
const charsets = new WeakMap();
function canEncode(font, text) { // pdf-lib silently turns unknown characters into "?", so check the font's character set
  let set = charsets.get(font);
  if (!set) { set = new Set(font.getCharacterSet()); charsets.set(font, set); }
  for (const ch of String(text)) { const cp = ch.codePointAt(0); if (cp !== 10 && cp !== 13 && !set.has(cp)) return false; }
  return true;
}
async function textToPng(text, { size, family = 'Helvetica', bold, italic, color = '#000' }) {
  const px = size * 4, lines = String(text).split('\n');
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${px}px ${FONT_CSS[family] || family}`;
  ctx.font = font;
  const w = Math.ceil(Math.max(1, ...lines.map(l => ctx.measureText(l).width))) + 4;
  cv.width = w; cv.height = Math.ceil(px * 1.2 * lines.length) + 4;
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, 2, 2 + px * (0.1 + 0.8) + i * px * 1.2 + px * 0.05));
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width / 4, h: cv.height / 4 };
}
// Draw (possibly multi-line) text on a page in visual coordinates; falls back to an image for non-Latin text.
async function drawTextVisual(pdfDoc, page, text, { u, v, size, family, bold, italic, color = '#000000', opacity = 1, fonts }) {
  const g = pageGeom(page);
  const name = stdFontName(family, bold, italic);
  fonts = fonts || (pdfDoc._folioFonts || (pdfDoc._folioFonts = {}));
  const font = fonts[name] || (fonts[name] = await pdfDoc.embedFont(name));
  const lines = String(text).split('\n');
  if (lines.every(l => canEncode(font, l))) {
    const base = size * (family === 'Courier' ? 0.87 : 0.92); // first baseline for 1.2 line-height
    lines.forEach((l, i) => {
      const [x, y] = g.toUser(u, v + base + i * size * 1.2);
      page.drawText(l, { x, y, size, font, color: hexToRgb(color), opacity, rotate: degrees(g.r) });
    });
  } else {
    const t = await textToPng(text, { size, family, bold, italic, color });
    const img = await pdfDoc.embedPng(t.bytes);
    const [x, y] = g.toUser(u, v + t.h);
    page.drawImage(img, { x, y, width: t.w, height: t.h, opacity, rotate: degrees(g.r) });
  }
}

// ---------- outlines (bookmarks) ----------
async function readOutline(d) {
  const items = await d.pdf.getOutline().catch(() => null);
  if (!items) return [];
  const walk = async list => {
    const out = [];
    for (const it of list) {
      let pageIndex = null;
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await d.pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) pageIndex = typeof dest[0] === 'number' ? dest[0] : await d.pdf.getPageIndex(dest[0]);
      } catch (e) { /* unresolved */ }
      out.push({ title: it.title || 'Untitled', pageIndex, children: it.items && it.items.length ? await walk(it.items) : [] });
    }
    return out;
  };
  return walk(items);
}
function writeOutline(pdfDoc, tree) {
  tree = (function prune(list) { return list.filter(n => n.pageIndex != null || (n.children && prune(n.children).length)).map(n => ({ ...n, children: prune(n.children || []) })); })(tree);
  if (!tree.length) return;
  const ctx = pdfDoc.context, pages = pdfDoc.getPages();
  const rootRef = ctx.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef());
    let total = 0;
    list.forEach((n, i) => {
      const pi = n.pageIndex != null ? n.pageIndex : (function first(c) { for (const x of c) { if (x.pageIndex != null) return x.pageIndex; const f = first(x.children || []); if (f != null) return f; } return 0; })(n.children);
      const dict = ctx.obj({ Title: PDFHexString.fromText(n.title), Parent: parentRef, Dest: [pages[clamp(pi, 0, pages.length - 1)].ref, 'XYZ', null, null, null] });
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
      if (n.children && n.children.length) {
        const c = build(n.children, refs[i]);
        dict.set(PDFName.of('First'), c.first); dict.set(PDFName.of('Last'), c.last);
        dict.set(PDFName.of('Count'), PDFNumber.of(-c.count));
      }
      ctx.assign(refs[i], dict); total++;
    });
    return { first: refs[0], last: refs[refs.length - 1], count: total };
  };
  const top = build(tree, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count }));
  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef);
  pdfDoc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

// ---------- images ----------
function jpegOrientation(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 2;
  while (off + 4 < dv.byteLength) {
    const marker = dv.getUint16(off); off += 2;
    if (marker === 0xffe1) {
      if (dv.getUint32(off + 2) !== 0x45786966) return 1;
      const t = off + 8, le = dv.getUint16(t) === 0x4949;
      const ifd = t + dv.getUint32(t + 4, le), n = dv.getUint16(ifd, le);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le); }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00) return 1;
    off += dv.getUint16(off);
  }
  return 1;
}
async function canvasToBytes(cv, type = 'image/jpeg', q = 0.85) {
  const blob = await new Promise(r => cv.toBlob(r, type, q));
  return new Uint8Array(await blob.arrayBuffer());
}
// Embed a library image into pdfDoc, re-encoding only when needed (rotation, EXIF, formats PDF can't hold).
async function embedImageFile(pdfDoc, d, { rotate = 0, recompress = false, quality = 0.82 } = {}) {
  const exif = d.mime === 'image/jpeg' ? jpegOrientation(d.bytes) : 1;
  if (!rotate && !recompress && exif === 1) {
    if (d.mime === 'image/jpeg') { try { return await pdfDoc.embedJpg(d.bytes); } catch (e) { /* CMYK/odd JPEG: re-encode */ } }
    if (d.mime === 'image/png') { try { return await pdfDoc.embedPng(d.bytes); } catch (e) { /* fall through */ } }
  }
  const bmp = await createImageBitmap(new Blob([d.bytes], { type: d.mime }));
  const swap = rotate % 180 !== 0;
  const cv = document.createElement('canvas');
  cv.width = swap ? bmp.height : bmp.width; cv.height = swap ? bmp.width : bmp.height;
  const ctx = cv.getContext('2d');
  const alpha = d.mime !== 'image/jpeg' && !recompress;
  if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(rotate * Math.PI / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close && bmp.close();
  return alpha ? pdfDoc.embedPng(await canvasToBytes(cv, 'image/png')) : pdfDoc.embedJpg(await canvasToBytes(cv, 'image/jpeg', quality));
}
const PAPER = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a3: [841.89, 1190.55], a5: [419.53, 595.28] };
// Add an image as a new page. opts: size ('fit'|'a4'|...), orient ('auto'|'portrait'|'landscape'), margin (pt), fit ('contain'|'cover')
function addImagePage(pdfDoc, img, { size = 'fit', orient = 'auto', margin = 0, fit = 'contain' } = {}) {
  const iw = img.width, ih = img.height;
  let pw, ph;
  if (size === 'fit') { const k = Math.min(1, 14400 / Math.max(iw, ih)) * 0.75; pw = iw * k + margin * 2; ph = ih * k + margin * 2; }
  else {
    [pw, ph] = PAPER[size] || PAPER.a4;
    const land = orient === 'landscape' || (orient === 'auto' && iw > ih);
    if (land) [pw, ph] = [ph, pw];
  }
  const page = pdfDoc.addPage([pw, ph]);
  const bw = pw - margin * 2, bh = ph - margin * 2;
  const k = fit === 'cover' && size !== 'fit' ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
  const w = iw * k, hh = ih * k;
  page.drawImage(img, { x: margin + (bw - w) / 2, y: margin + (bh - hh) / 2, width: w, height: hh });
  return page;
}

// ---------- produce results ----------
async function pdfOutput(pdfDoc, name, opts = {}) {
  const bytes = await pdfDoc.save({ useObjectStreams: true, ...opts });
  return { name: safeName(name, 'pdf'), data: bytes, pdf: true };
}
