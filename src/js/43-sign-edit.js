// ---------------------------------------------------------------------------
// Sign: draw / type / upload a signature, place it, add date and text.
// ---------------------------------------------------------------------------
const sigBytesCache = new Map();
const sigBytes = url => { if (!sigBytesCache.has(url)) sigBytesCache.set(url, dataURLBytes(url)); return sigBytesCache.get(url); };

defineTool({
  id: 'sign', name: 'Sign', icon: 'sign', group: 'edit', verb: 'sign', runLabel: 'Sign & save', runIcon: 'sign',
  desc: 'Draw, type or upload a visible signature — optionally seal the PDF with a .p12 certificate (PKCS#7).',
  defaults: { dateFmt: 'locale', digital: false, reason: 'I approve this document', location: '', contact: '' },
  outName: f => baseName(f.name) + '-signed.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const props = h('div');
    let p12Bytes = null, p12Name = '';
    const ed = objectEditor(ctx, f, { onSelect: it => showProps(it), onChange: validate });
    ctx.work.append(ed.st.el);
    const sigGrid = h('div', { class: 'sigs', role: 'list', 'aria-label': 'Saved signatures' });
    const createBtn = btn('Create signature', newSig, { ic: 'plus', cls: 'sm primary' });
    const dateSel = h('select', { class: 'inp', 'aria-label': 'Date format', onchange: () => { P.dateFmt = dateSel.value; ctx.save(); } },
      [['locale', new Date().toLocaleDateString()], ['iso', isoDate()], ['long', new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })]].map(([v, l]) => h('option', { value: v, selected: P.dateFmt === v }, l)));
    const certLbl = h('span', { class: 'help', text: 'No certificate loaded' });
    const certPass = h('input', { class: 'inp', type: 'password', autocomplete: 'off', placeholder: 'Certificate password', 'aria-label': 'Certificate password' });
    const reasonInp = h('input', { class: 'inp', value: P.reason || '', 'aria-label': 'Reason', oninput: () => { P.reason = reasonInp.value; ctx.save(); } });
    const locInp = h('input', { class: 'inp', value: P.location || '', 'aria-label': 'Location', oninput: () => { P.location = locInp.value; ctx.save(); } });
    const contactInp = h('input', { class: 'inp', value: P.contact || '', 'aria-label': 'Contact', oninput: () => { P.contact = contactInp.value; ctx.save(); } });
    const digiWrap = h('div');
    const sigFieldsBox = h('div');
    ctx.side.append(
      h('h4', { text: 'Your signatures' }), sigGrid, h('div', { class: 'row', style: 'margin-bottom:18px' }, createBtn),
      h('h4', { text: 'Also add' }),
      h('div', { class: 'row', style: 'margin-bottom:8px' }, btn('Date', addDate, { cls: 'sm', ic: 'calendar' }), btn('Text', addText, { cls: 'sm', ic: 'text' }), btn('Initials', newSig, { cls: 'sm', ic: 'pen', title: 'Create initials the same way as a signature' })),
      field('Date format', dateSel),
      h('div', { class: 'hr' }),
      h('h4', { text: 'AcroForm signature fields' }), sigFieldsBox,
      h('h4', { text: 'Digital signature (PKCS#7)' }),
      checkbox('Also embed a certificate signature', P.digital, v => { P.digital = v; digiWrap.hidden = !v; ctx.save(); validate(); }, 'Imports a .p12 / .pfx and seals the PDF. Self-signed certs show as untrusted in Adobe until you trust them.'),
      digiWrap,
      h('div', { class: 'hr' }), props,
      h('p', { class: 'note', text: 'Visible stamps always stay on-device. Certificate private keys never leave this browser tab.' }));
    digiWrap.append(
      h('div', { class: 'row', style: 'margin-bottom:8px' }, btn('Load .p12 / .pfx', loadP12, { cls: 'sm', ic: 'lock' }), certLbl),
      field('Certificate password', certPass),
      field('Reason', reasonInp),
      field('Location', locInp),
      field('Contact info', contactInp));
    digiWrap.hidden = !P.digital;

    (async () => {
      try {
        const doc = await libDoc(f);
        const sigs = collectEntries(doc).filter(e => e.kind === 'signature');
        if (!sigs.length) { sigFieldsBox.append(h('p', { class: 'help', style: 'color:var(--muted)', text: 'None in this PDF. Place a visible stamp anywhere, or enable digital signing to create a signature field.' })); return; }
        sigFieldsBox.append(...sigs.map(e => {
          const w = e.widgets[0];
          return btn(`Place on “${e.label || e.name}”`, () => {
            if (!loadSigs().length) return toast('Create a signature first.', 'error');
            const s = loadSigs()[0];
            const box = w.box;
            ed.add({ type: 'image', label: 'Signature', url: s.url, bytes: sigBytes(s.url), w: box.w, h: box.h, u: box.u, v: box.v, page: w.page, sigField: e.name });
            ed.st.show(w.page);
          }, { cls: 'sm', style: 'margin-bottom:6px;width:100%' });
        }));
      } catch (e) { sigFieldsBox.append(h('p', { class: 'help', text: 'Couldn’t read signature fields.' })); }
    })();

    function loadP12() {
      pickFiles('.p12,.pfx,application/x-pkcs12', false, async fl => {
        const file = fl[0]; if (!file) return;
        p12Bytes = new Uint8Array(await file.arrayBuffer());
        p12Name = file.name;
        certLbl.textContent = file.name;
        validate();
      });
    }
    function isoDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    function dateText() { return P.dateFmt === 'iso' ? isoDate() : P.dateFmt === 'long' ? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString(); }
    function drawSigs() {
      const list = loadSigs();
      sigGrid.replaceChildren(...list.map((s, i) => h('div', { class: 's', role: 'listitem' },
        h('button', { type: 'button', style: 'all:unset;cursor:pointer;display:grid;place-items:center;width:100%;height:100%', title: 'Place on this page', 'aria-label': `Place signature ${i + 1} on this page`, onclick: () => place(s) }, h('img', { src: s.url, alt: '' })),
        h('button', { class: 'x', type: 'button', title: 'Forget this signature', 'aria-label': 'Forget this signature', onclick: () => { const l = loadSigs(); l.splice(i, 1); saveSigs(l); drawSigs(); } }, icon('x')))));
      if (!list.length) sigGrid.replaceChildren(h('p', { class: 'help', style: 'grid-column:1/-1;margin:0;color:var(--muted)', text: 'None yet. Create one — it’s remembered in this browser only.' }));
      createBtn.classList.toggle('primary', !list.length);
    }
    async function newSig() {
      const s = await signatureDialog();
      if (!s) return;
      const l = loadSigs(); l.unshift(s); saveSigs(l); drawSigs();
      place(s);
    }
    function place(s) {
      const { w: W, h: H } = ed.st.size;
      const w = Math.min(180, W * 0.32), hh = w * s.h / s.w;
      ed.add({ type: 'image', label: 'Signature', url: s.url, bytes: sigBytes(s.url), w, h: hh, u: (W - w) / 2, v: Math.min(H - hh - 20, H * 0.72) });
    }
    function addDate() { const it = { type: 'text', text: dateText(), size: 11, family: 'Helvetica', color: '#111111', u: ed.st.size.w * 0.55, v: ed.st.size.h * 0.8 }; fitText(it); ed.add(it); }
    function addText() { const it = { type: 'text', text: 'Your name', size: 12, family: 'Helvetica', color: '#111111', u: ed.st.size.w * 0.15, v: ed.st.size.h * 0.8 }; fitText(it); ed.add(it); }
    function showProps(it) {
      props.replaceChildren();
      if (!it) { props.append(h('p', { class: 'help', style: 'color:var(--muted)', text: 'Click a signature to place it on the page you’re viewing. Drag to move it; drag the round handle to resize.' })); return; }
      if (it.type === 'text') {
        const ta = h('textarea', { class: 'inp', rows: 2, value: it.text, 'aria-label': 'Text', oninput: () => { it.text = ta.value; fitText(it); ed.refresh(); } });
        props.append(h('h4', { text: 'Selected text' }), ta, h('div', { class: 'row', style: 'margin:10px 0' }, h('span', { class: 'help', text: 'Size' }), numInput(Math.round(it.size), { min: 5, max: 72, label: 'Font size', onchange: v => { it.size = v; fitText(it); ed.refresh(); } }), swatches(it.color, c => { it.color = c; ed.refresh(); }, ['#111111', '#1f3fbf', '#c8291c'])));
      } else props.append(h('h4', { text: 'Selected signature' }));
      props.append(h('div', { class: 'row' },
        btn('Place on every page', () => { for (let i = 0; i < f.pages; i++) if (i !== it.page) ed.add({ ...it, id: null, page: i }, { selectIt: false }); toast(`Copied to ${plural(f.pages - 1, 'other page')}.`); }, { cls: 'sm', ic: 'copy' }),
        btn('Remove', () => ed.remove(it.id), { cls: 'sm ghost danger', ic: 'trash' })));
    }
    function validate() {
      const n = ed.items.length;
      if (!n && !(P.digital && p12Bytes)) return ctx.setRunnable(false, 'Place a signature, or load a certificate for a digital-only seal.');
      if (P.digital && !p12Bytes) return ctx.setRunnable(false, 'Load a .p12 / .pfx certificate to digitally sign.');
      const pages = new Set(ed.items.map(x => x.page)).size;
      ctx.setRunnable(true); ctx.setStatus(P.digital ? `Visible + PKCS#7 · ${p12Name || 'cert'}` : `${plural(n, 'item')} on ${plural(pages || 1, 'page')}`);
    }
    drawSigs(); showProps(null); validate(); ed.st.show(0);
    ctx.onRun = async progress => {
      progress(0.1, 'Applying visible signature…');
      const doc = await libDoc(f);
      await ed.apply(doc, f => progress(0.1 + 0.4 * f, 'Applying visible signature…'));
      if (!P.digital || !p12Bytes) {
        const o = await pdfOutput(doc, ctx.outName);
        return { outputs: [o], summary: 'Signed', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
      }
      if (!window.folioSign) throw new Error('Digital signing library failed to load.');
      progress(0.55, 'Embedding signature field…');
      const anchor = ed.items.find(x => x.type === 'image') || { page: 0, u: 72, v: 72, w: 180, h: 50 };
      const page = doc.getPage(anchor.page || 0);
      const g = pageGeom(page);
      const [x1, y1] = g.toUser(anchor.u, anchor.v + anchor.h);
      const [x2, y2] = g.toUser(anchor.u + anchor.w, anchor.v);
      const widgetRect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
      window.folioSign.pdflibAddPlaceholder({
        pdfPage: page,
        reason: P.reason || 'Signed',
        contactInfo: P.contact || '',
        name: 'The PDF Tool',
        location: P.location || '',
        signingTime: new Date(),
        signatureLength: 8192,
        widgetRect,
        appName: 'The PDF Tool',
      });
      progress(0.7, 'Computing PKCS#7 signature…');
      const pdfBytes = await doc.save({ useObjectStreams: false });
      const signed = await window.folioSign.sign(pdfBytes, p12Bytes, certPass.value || '');
      const data = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
      return { outputs: [{ name: safeName(ctx.outName, 'pdf'), data, pdf: true }], summary: 'Digitally signed', detail: `${safeName(ctx.outName, 'pdf')} · ${fmtBytes(data.length)} · PKCS#7` };
    };
  },
});

// ---------------------------------------------------------------------------
// Edit: add text, whiteout, highlight, boxes, freehand ink, images, redact,
// and edit existing PDF text runs.
// ---------------------------------------------------------------------------
defineTool({
  id: 'edit', name: 'Edit', icon: 'edit', group: 'edit', verb: 'edit', runLabel: 'Save', runIcon: 'download',
  desc: 'Add text, redact, edit existing text, cover things up, highlight, draw and insert images.',
  defaults: { family: 'Helvetica', size: 14, bold: false, italic: false, color: '#111111', white: '#ffffff', hl: '#ffe14d', stroke: '#c8291c', sw: 2, ink: '#1f3fbf', inkW: 2.5, redact: '#000000' },
  outName: f => baseName(f.name) + '-edited.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const props = h('div');
    let mode = 'select', textRuns = [], textLayer = h('div', { class: 'textedit-layer' });
    const ed = objectEditor(ctx, f, { onSelect: () => showProps(), onChange: validate });
    ed.st.layer.after(textLayer);
    // Keep text-run layer sized with the stage
    const _show = ed.st.show.bind(ed.st);
    ed.st.show = async i => { await _show(i); if (mode === 'textedit') await loadTextRuns(); };
    ctx.work.append(ed.st.el);
    const MODES = [['select', 'Select', 'organize'], ['text', 'Text', 'text'], ['textedit', 'Edit text', 'textedit'], ['redact', 'Redact', 'redact'], ['whiteout', 'Whiteout', 'whiteout'], ['highlight', 'Highlight', 'highlight'], ['box', 'Box', 'rect'], ['draw', 'Draw', 'draw'], ['image', 'Image', 'toimage']];
    const grid = h('div', { class: 'toolgrid wide', role: 'toolbar', 'aria-label': 'Editing tools' });
    const setMode = m => {
      if (m === 'image') return addImage();
      mode = m;
      const drawMode = (m === 'redact') ? 'whiteout' : (m === 'textedit' ? 'select' : m);
      ed.setMode(['whiteout', 'highlight', 'box', 'draw', 'text'].includes(drawMode) ? drawMode : 'select');
      if (m === 'redact') ed.setMode('whiteout');
      ed.setDrawStyle({ color: P.ink, width: P.inkW });
      for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.m === m));
      textLayer.hidden = m !== 'textedit';
      textLayer.replaceChildren();
      if (m === 'textedit') loadTextRuns();
      showProps();
    };
    for (const [m, l, ic] of MODES) grid.append(h('button', { type: 'button', 'data-m': m, onclick: () => setMode(m) }, icon(ic), l));
    ed.onModeReset(() => setMode('select'));
    ed.makeText = (u, v) => { const it = { type: 'text', text: 'Text', u, v: v - P.size * 0.6, size: P.size, family: P.family, bold: P.bold, italic: P.italic, color: P.color }; fitText(it); return it; };
    ed.makeRect = (kind, u, v, w, hh) => {
      if (mode === 'redact' || kind === 'redact') return { type: 'rect', label: 'Redact', fill: P.redact || '#000000', fillOpacity: 1, redact: true, u, v, w, h: hh };
      return kind === 'whiteout' ? { type: 'rect', label: 'Whiteout', fill: P.white, fillOpacity: 1, u, v, w, h: hh }
        : kind === 'highlight' ? { type: 'rect', label: 'Highlight', fill: P.hl, fillOpacity: 0.45, blend: true, u, v, w, h: hh }
          : { type: 'rect', label: 'Box', stroke: P.stroke, sw: P.sw, u, v, w, h: hh };
    };
    const note = h('p', { class: 'note', text: 'Redact permanently removes content under black boxes when you save. Edit text replaces a selected run (covers the old glyphs and writes new text).' });
    ctx.side.append(grid, props, note);

    async function loadTextRuns() {
      textLayer.replaceChildren(h('div', { class: 'help', style: 'padding:8px;color:var(--muted)', text: 'Reading text…' }));
      try { textRuns = await pageTextRuns(f, ed.st.cur); }
      catch (e) { textRuns = []; console.warn(e); }
      const s = ed.st.scale;
      textLayer.replaceChildren();
      if (!textRuns.length) { textLayer.append(h('p', { class: 'help', style: 'padding:8px;color:var(--muted)', text: 'No selectable text on this page (it may be a scan).' })); return; }
      for (const run of textRuns) {
        const el = h('button', { type: 'button', class: 'textrun', style: `left:${run.u * s}px;top:${run.v * s}px;width:${run.w * s}px;height:${run.h * s}px`, title: run.text, 'aria-label': 'Edit: ' + run.text.slice(0, 40),
          onclick: () => editRun(run) });
        textLayer.append(el);
      }
    }
    async function editRun(run) {
      const ta = h('textarea', { class: 'inp', rows: 3, value: run.text, style: 'width:min(420px,90vw)' });
      const res = await dialog({ title: 'Edit text', body: [h('p', { class: 'help', text: 'The original glyphs are covered and your new text is written on top. Pages with redactions are burned in for permanent removal.' }), ta],
        actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Replace', value: 'ok', primary: true }], focus: ta, wide: true });
      if (res !== 'ok') return;
      const next = ta.value;
      ed.add({ type: 'rect', label: 'Whiteout', fill: '#ffffff', fillOpacity: 1, u: run.u - 1, v: run.v - 1, w: run.w + 2, h: run.h + 2, page: ed.st.cur }, { selectIt: false });
      const it = { type: 'text', text: next, u: run.u, v: run.v, size: Math.max(6, run.size * 0.92), family: P.family, bold: P.bold, italic: P.italic, color: P.color, page: ed.st.cur };
      fitText(it); ed.add(it);
      setMode('select');
      toast('Text replaced on this page.');
    }

    function addImage() {
      pickFiles('image/*', false, async fl => {
        const file = fl[0]; if (!file) return;
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/png');
        const { w: W, h: H } = ed.st.size, w = Math.min(W * 0.5, cv.width * 0.75), hh = w * cv.height / cv.width;
        ed.add({ type: 'image', label: 'Image', url, bytes: dataURLBytes(url), u: (W - w) / 2, v: (H - hh) / 2, w, h: hh, opacity: 1 });
        setMode('select');
      });
    }
    function showProps() {
      const it = ed.selected();
      props.replaceChildren();
      const kind = it ? (it.redact ? 'redact' : it.type === 'rect' ? it.label.toLowerCase() : it.type) : mode;
      const upd = (key, v, pref) => { if (pref) { P[pref] = v; ctx.save(); } if (it) { it[key] = v; if (it.type === 'text') fitText(it); ed.refresh(); } ed.setDrawStyle({ color: P.ink, width: P.inkW }); };
      const title = it ? `Selected ${it.label ? it.label.toLowerCase() : it.type}` : ({ select: 'Select', text: 'Text', textedit: 'Edit text', redact: 'Redact', whiteout: 'Whiteout', highlight: 'Highlight', box: 'Box', draw: 'Draw' }[mode] || '');
      props.append(h('h4', { text: title }));
      const tips = { select: 'Click an item to change it. Drag to move, use the round handle to resize, Delete to remove.', text: 'Click on the page where the text should start.', textedit: 'Click a highlighted text run on the page to replace it.', redact: 'Drag a black box over content that must be permanently removed.', whiteout: 'Drag over anything you want to hide (recoverable unless you also Redact).', highlight: 'Drag over text to highlight it.', box: 'Drag to draw a box.', draw: 'Draw freehand on the page.' };
      if (!it) props.append(h('p', { class: 'help', style: 'color:var(--muted);margin:0 0 12px', text: tips[mode] || '' }));
      if (kind === 'text') {
        const src = it || P;
        if (it) props.append(h('textarea', { class: 'inp', rows: 3, value: it.text, 'aria-label': 'Text', style: 'margin-bottom:10px', oninput: e => upd('text', e.target.value) }));
        props.append(field('Font', seg([['Helvetica', 'Sans'], ['Times', 'Serif'], ['Courier', 'Mono']], src.family, v => upd('family', v, 'family'), 'Font')),
          h('div', { class: 'row', style: 'margin-bottom:12px' },
            numInput(Math.round(src.size), { min: 4, max: 144, label: 'Font size', onchange: v => upd('size', v, 'size') }), h('span', { class: 'help', text: 'pt' }),
            checkbox('Bold', src.bold, v => upd('bold', v, 'bold')), checkbox('Italic', src.italic, v => upd('italic', v, 'italic'))),
          field('Colour', swatches(src.color, c => upd('color', c, 'color'))));
      }
      if (kind === 'redact') props.append(field('Redaction colour', swatches(it ? it.fill : P.redact, c => upd('fill', c, 'redact'), ['#000000', '#111111', '#1a1a1a'])));
      if (kind === 'whiteout') props.append(field('Fill colour', swatches(it ? it.fill : P.white, c => upd('fill', c, 'white'), ['#ffffff', '#f5f1e6', '#eeeeee', '#000000']), 'Match the paper colour if it isn’t white.'));
      if (kind === 'highlight') props.append(field('Colour', swatches(it ? it.fill : P.hl, c => upd('fill', c, 'hl'), ['#ffe14d', '#8ff0a4', '#ffa3c7', '#8fd3ff'])));
      if (kind === 'box') props.append(field('Line colour', swatches(it ? it.stroke : P.stroke, c => upd('stroke', c, 'stroke'))),
        h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'help', text: 'Line width' }), numInput(it ? it.sw : P.sw, { min: 0.5, max: 20, step: 0.5, label: 'Line width', onchange: v => upd('sw', v, 'sw') })));
      if (kind === 'draw' || kind === 'ink') props.append(field('Pen colour', swatches(it ? it.color : P.ink, c => upd('color', c, 'ink'))),
        h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'help', text: 'Pen width' }), numInput(it ? it.width : P.inkW, { min: 0.5, max: 20, step: 0.5, label: 'Pen width', onchange: v => upd('width', v, 'inkW') })));
      if (kind === 'image') props.append(field('Opacity', h('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: String(it.opacity ?? 1), 'aria-label': 'Opacity', oninput: e => upd('opacity', +e.target.value) })));
      if (it) props.append(h('div', { class: 'row', style: 'margin-top:4px' },
        btn('Duplicate', () => ed.add({ ...it, id: null, u: it.u + 12, v: it.v + 12, points: it.points && it.points.map(([a, b]) => [a + 12, b + 12]) }), { cls: 'sm', ic: 'copy' }),
        btn('Remove', () => ed.remove(it.id), { cls: 'sm ghost danger', ic: 'trash' })));
    }
    function validate() {
      const n = ed.items.length;
      if (!n) return ctx.setRunnable(false, 'Pick a tool on the right and click or drag on the page.');
      const redacts = ed.items.filter(x => x.redact).length;
      ctx.setRunnable(true); ctx.setStatus(`${plural(n, 'change')}${redacts ? ` · ${plural(redacts, 'redaction')}` : ''} on ${plural(new Set(ed.items.map(x => x.page)).size, 'page')}`);
    }
    setMode('select'); validate(); ed.st.show(0);
    ctx.onRun = async progress => {
      const hasRedact = ed.items.some(x => x.redact);
      const doc = hasRedact ? await ed.applyBurning(f, progress) : await (async () => { const d = await libDoc(f); await ed.apply(d, progress); return d; })();
      const o = await pdfOutput(doc, ctx.outName);
      return { outputs: [o], summary: hasRedact ? 'Edited with redactions burned in' : 'Changes saved', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});
