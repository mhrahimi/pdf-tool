// ---------------------------------------------------------------------------
// PDF → images
// ---------------------------------------------------------------------------
const MAX_PX = 16.7e6; // keeps every browser (incl. iOS Safari) inside its canvas limit

defineTool({
  id: 'toimage', name: 'PDF → Image', icon: 'toimage', group: 'convert', verb: 'convert', runLabel: 'Convert', runIcon: 'toimage',
  desc: 'Save pages as PNG, JPEG or WebP images at the resolution you choose.',
  defaults: { fmt: 'png', dpi: 150, q: 0.85, transparent: false, pattern: '{name}-{page}' },
  outLabel: 'File names',
  outName: (f, P) => P.pattern,
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    let picked = new Set([...Array(f.pages).keys()]);
    const rf = rangeField({ label: 'Pages', value: '', total: f.pages, placeholder: 'All pages', onchange: r => { if (!r.error) { picked = new Set(r.pages); draw(); } validate(); } });
    const qWrap = h('div');
    const qLbl = h('span');
    const q = h('input', { type: 'range', min: '0.4', max: '0.98', step: '0.02', value: String(P.q), 'aria-label': 'Quality', oninput: () => { P.q = +q.value; qLbl.textContent = Math.round(P.q * 100) + '%'; ctx.save(); } });
    qWrap.append(field('Quality', h('div', null, q, h('div', { class: 'help' }, 'Quality: ', qLbl))));
    qLbl.textContent = Math.round(P.q * 100) + '%';
    const transp = checkbox('Transparent background', P.transparent, v => { P.transparent = v; ctx.save(); }, 'Only for PNG and WebP; most PDFs have white pages anyway.');
    const dpiInp = numInput(P.dpi, { min: 36, max: 1200, step: 1, label: 'Custom dpi', onchange: v => { P.dpi = clamp(Math.round(v), 36, 1200); dpiSeg.set(P.dpi); ctx.save(); est(); } });
    const dpiSeg = seg([[72, 'Screen 72'], [150, 'Standard 150'], [300, 'Print 300']], P.dpi, v => { P.dpi = v; dpiInp.value = String(v); ctx.save(); est(); }, 'Resolution');
    const estEl = h('div', { class: 'help' });
    const fmtSeg = seg([['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']], P.fmt, v => { P.fmt = v; ctx.save(); sync(); }, 'Format');
    ctx.side.append(field('Format', fmtSeg, 'PNG is sharp and lossless; JPEG and WebP are much smaller for photos.'), qWrap, transp,
      field('Resolution', h('div', { style: 'display:grid;gap:8px' }, dpiSeg, h('div', { class: 'row' }, dpiInp, h('span', { class: 'help', text: 'dots per inch' })), estEl)),
      rf.el, h('p', { class: 'help', style: 'color:var(--muted);font-size:12.5px', text: 'Name tokens: {name} file name · {page} page number. Several images download as one .zip.' }));
    function sync() { qWrap.hidden = P.fmt === 'png'; transp.hidden = P.fmt === 'jpg'; }
    async function est() {
      const s = await pageSize(f, 0);
      let w = s.w / 72 * P.dpi, hh = s.h / 72 * P.dpi; const capped = w * hh > MAX_PX;
      if (capped) { const k = Math.sqrt(MAX_PX / (w * hh)); w *= k; hh *= k; }
      estEl.textContent = `Page 1 → ${Math.round(w)} × ${Math.round(hh)} px${capped ? ' (capped to stay within browser limits)' : ''}`;
    }
    const grid = h('div', { class: 'pages' });
    ctx.work.append(h('div', { class: 'toolbar' }, btn('Select all', () => { picked = new Set([...Array(f.pages).keys()]); rf.value = ''; draw(); validate(); }, { cls: 'sm ghost' }), btn('Select none', () => { picked.clear(); rf.value = ''; draw(); validate(); }, { cls: 'sm ghost' })), grid);
    const cells = [...Array(f.pages).keys()].map(i => {
      const c = h('div', { class: 'pg sel', role: 'checkbox', tabindex: '0', 'aria-label': `Page ${i + 1}`, onclick: () => toggle(i), onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(i); } } },
        h('div', { class: 'tick' }, icon('check')), h('div', { class: 'thumb' }, thumbImg(f, i, 150)), h('span', { class: 'num', text: String(i + 1) }));
      grid.append(c); return c;
    });
    pageSize(f, 0).then(s => grid.style.setProperty('--ar', (s.w / s.h).toFixed(3)));
    function toggle(i) { picked.has(i) ? picked.delete(i) : picked.add(i); rf.value = picked.size === f.pages ? '' : rangesFromSet([...picked]); draw(); validate(); }
    function draw() { cells.forEach((c, i) => { const on = picked.has(i); c.classList.toggle('sel', on); c.classList.toggle('off', !on); c.setAttribute('aria-checked', String(on)); c.firstChild.replaceChildren(on ? icon('check') : ''); }); }
    function validate() {
      const r = rf.check();
      if (r.error) return ctx.setRunnable(false, r.error, true);
      if (!picked.size) return ctx.setRunnable(false, 'Select at least one page.');
      ctx.setRunnable(true); ctx.setStatus(`${plural(picked.size, 'image')} will be created.`);
    }
    ctx.on($('#outname'), 'input', () => { P.pattern = ctx.outName; ctx.save(); });
    sync(); est(); validate();

    ctx.onRun = async progress => {
      const r = parseRanges(rf.value, f.pages);
      const pages = rf.value.trim() ? r.pages : [...picked].sort((a, b) => a - b);
      const ext = P.fmt, mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext];
      const width = String(f.pages).length, outs = [];
      for (let k = 0; k < pages.length; k++) {
        const i = pages[k];
        progress(k / pages.length, `Rendering page ${i + 1}…`);
        const s = await pageSize(f, i);
        let sc = P.dpi / 72; if (s.w * s.h * sc * sc > MAX_PX) sc = Math.sqrt(MAX_PX / (s.w * s.h));
        const clear = P.transparent && ext !== 'jpg';
        const cv = await renderPage(f, i, { scale: sc, background: clear ? 'rgba(0,0,0,0)' : '#ffffff' });
        const data = await canvasToBytes(cv, mime, P.q);
        cv.width = cv.height = 0;
        outs.push({ name: safeName(fillPattern(ctx.outName || '{name}-{page}', { name: baseName(f.name), page: String(i + 1).padStart(width, '0'), n: k + 1 }), ext), data });
      }
      return { outputs: outs, zipName: baseName(f.name) + '-images', summary: `Created ${plural(outs.length, 'image')}`, detail: `${ext.toUpperCase()} at ${P.dpi} dpi · ${fmtBytes(outs.reduce((s, o) => s + o.data.length, 0))}` };
    };
  },
});

// ---------------------------------------------------------------------------
// Images → PDF
// ---------------------------------------------------------------------------
let imgItems = [];
defineTool({
  id: 'fromimage', name: 'Image → PDF', icon: 'fromimage', group: 'convert', input: 'none', runLabel: 'Create PDF', runIcon: 'file',
  desc: 'Turn photos, scans and screenshots (JPG, PNG, WebP, GIF, BMP) into a PDF.',
  defaults: { size: 'a4', orient: 'auto', margin: 'small', fit: 'contain', quality: 'original', each: false },
  outName: () => 'images.pdf',
  mount(ctx) {
    const P = ctx.prefs;
    imgItems = imgItems.filter(m => store.files.includes(m.doc));
    if (!imgItems.length) store.files.filter(d => d.kind === 'image').forEach(d => imgItems.push({ key: uid(), doc: d, rot: 0 }));
    const list = h('div', { class: 'rows' });
    const add = docs => {
      const imgs = docs.filter(d => d.kind === 'image');
      if (imgs.length < docs.length) toast('PDFs can be combined with images in Merge.', 'info');
      imgs.forEach(d => imgItems.push({ key: uid(), doc: d, rot: 0 })); draw();
    };
    ctx.onFiles = add;
    const browse = () => pickFiles('image/*', true, async fl => add(await addFiles(fl, { select: false })));
    const count = h('span', { class: 'count' });
    ctx.work.append(h('div', { class: 'toolbar' },
      btn('Add images', browse, { cls: 'sm primary', ic: 'plus' }),
      btn('Sort A–Z', () => { imgItems.sort((a, b) => a.doc.name.localeCompare(b.doc.name, undefined, { numeric: true })); draw(); }, { cls: 'sm', ic: 'sort' }),
      btn('Clear', () => { imgItems = []; draw(); }, { cls: 'sm ghost danger', ic: 'trash' }), count),
    list, h('div', { class: 'addmore' }, 'Drop images here, or ', h('a', { href: '#', onclick: e => { e.preventDefault(); browse(); }, text: 'browse' }), '.'));
    sortable(list, '.frow', (a, b) => { moveItem(imgItems, a, b); draw(); });

    const sizeDep = h('div');
    sizeDep.append(
      field('Orientation', seg([['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], P.orient, v => { P.orient = v; ctx.save(); }, 'Orientation'), 'Auto turns each page to match its image.'),
      field('Image placement', seg([['contain', 'Fit whole image'], ['cover', 'Fill the page']], P.fit, v => { P.fit = v; ctx.save(); }, 'Placement')));
    ctx.side.append(
      field('Page size', seg([['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'Letter'], ['legal', 'Legal']], P.size, v => { P.size = v; ctx.save(); sizeDep.hidden = v === 'fit'; }, 'Page size')),
      sizeDep,
      field('Margin', seg([['none', 'None'], ['small', 'Small'], ['large', 'Large']], P.margin, v => { P.margin = v; ctx.save(); }, 'Margin')),
      field('Quality', seg([['original', 'Original'], ['smaller', 'Smaller file']], P.quality, v => { P.quality = v; ctx.save(); }, 'Quality'), 'Original keeps your images byte-for-byte when possible.'),
      checkbox('One PDF per image', P.each, v => { P.each = v; ctx.save(); }));
    sizeDep.hidden = P.size === 'fit';

    function draw() {
      list.replaceChildren();
      imgItems.forEach((m, i) => {
        const d = m.doc;
        const img = h('img', { src: d.url || (d.url = URL.createObjectURL(new Blob([d.bytes], { type: d.mime }))), alt: '', style: m.rot ? `transform:rotate(${m.rot}deg)` : '' });
        list.append(h('div', { class: 'frow', draggable: 'true', 'data-idx': String(i) },
          h('div', { class: 'grip', title: 'Drag to reorder' }, icon('grip')), h('div', { class: 'th' }, img),
          h('div', { class: 'meta' }, h('b', { text: d.name, title: d.name }), h('small', { text: `${d.w} × ${d.h} px · ${fmtBytes(d.size)}${m.rot ? ` · rotated ${m.rot}°` : ''}` })),
          h('div', { class: 'acts' },
            iconBtn('rotl', 'Rotate left', () => { m.rot = (m.rot + 270) % 360; draw(); }), iconBtn('rotr', 'Rotate right', () => { m.rot = (m.rot + 90) % 360; draw(); }),
            iconBtn('up', 'Move up', () => { if (i > 0) { moveItem(imgItems, i, i - 1); draw(); } }), iconBtn('down', 'Move down', () => { if (i < imgItems.length - 1) { moveItem(imgItems, i, i + 1); draw(); } }),
            iconBtn('x', 'Remove', () => { imgItems.splice(i, 1); draw(); }))));
      });
      if (!imgItems.length) list.append(h('div', { class: 'empty', text: 'No images yet. Add some — each becomes a page.' }));
      count.textContent = plural(imgItems.length, 'image');
      if (!ctx.outEdited && imgItems[0]) ctx.outName = (imgItems.length === 1 ? baseName(imgItems[0].doc.name) : 'images') + '.pdf';
      ctx.setRunnable(imgItems.length > 0, 'Add at least one image.');
    }
    draw();

    ctx.onRun = async progress => {
      const margin = { none: 0, small: 10 * PT_PER.mm, large: 20 * PT_PER.mm }[P.margin];
      const opts = { size: P.size, orient: P.orient, margin, fit: P.fit };
      const enc = { rotate: 0, recompress: P.quality === 'smaller', quality: 0.75 };
      if (P.each) {
        const outs = [];
        for (let i = 0; i < imgItems.length; i++) {
          progress(i / imgItems.length, `Adding ${imgItems[i].doc.name}…`);
          const doc = await PDFDocument.create();
          addImagePage(doc, await embedImageFile(doc, imgItems[i].doc, { ...enc, rotate: imgItems[i].rot }), opts);
          outs.push(await pdfOutput(doc, baseName(imgItems[i].doc.name)));
        }
        return { outputs: outs, zipName: 'images-pdf', summary: `Created ${plural(outs.length, 'PDF')}` };
      }
      const doc = await PDFDocument.create();
      for (let i = 0; i < imgItems.length; i++) {
        progress(i / imgItems.length, `Adding ${imgItems[i].doc.name}…`);
        addImagePage(doc, await embedImageFile(doc, imgItems[i].doc, { ...enc, rotate: imgItems[i].rot }), opts);
        await tick();
      }
      const o = await pdfOutput(doc, ctx.outName || 'images.pdf');
      return { outputs: [o], summary: `Created a ${plural(imgItems.length, 'page')} PDF`, detail: `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});
