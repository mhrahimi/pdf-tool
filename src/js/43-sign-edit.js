// ---------------------------------------------------------------------------
// Sign: draw / type / upload a signature, place it, add date and text.
// ---------------------------------------------------------------------------
const sigBytesCache = new Map();
const sigBytes = url => { if (!sigBytesCache.has(url)) sigBytesCache.set(url, dataURLBytes(url)); return sigBytesCache.get(url); };

defineTool({
  id: 'sign', name: 'Sign', icon: 'sign', group: 'edit', verb: 'sign', runLabel: 'Sign & save', runIcon: 'sign',
  desc: 'Draw, type or upload your signature and place it anywhere — add the date and initials too.',
  defaults: { dateFmt: 'locale' },
  outName: f => baseName(f.name) + '-signed.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const props = h('div');
    const ed = objectEditor(ctx, f, { onSelect: it => showProps(it), onChange: validate });
    ctx.work.append(ed.st.el);
    const sigGrid = h('div', { class: 'sigs', role: 'list', 'aria-label': 'Saved signatures' });
    const createBtn = btn('Create signature', newSig, { ic: 'plus', cls: 'sm primary' });
    const dateSel = h('select', { class: 'inp', 'aria-label': 'Date format', onchange: () => { P.dateFmt = dateSel.value; ctx.save(); } },
      [['locale', new Date().toLocaleDateString()], ['iso', isoDate()], ['long', new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })]].map(([v, l]) => h('option', { value: v, selected: P.dateFmt === v }, l)));
    ctx.side.append(
      h('h4', { text: 'Your signatures' }), sigGrid, h('div', { class: 'row', style: 'margin-bottom:18px' }, createBtn),
      h('h4', { text: 'Also add' }),
      h('div', { class: 'row', style: 'margin-bottom:8px' }, btn('Date', addDate, { cls: 'sm', ic: 'calendar' }), btn('Text', addText, { cls: 'sm', ic: 'text' }), btn('Initials', newSig, { cls: 'sm', ic: 'pen', title: 'Create initials the same way as a signature' })),
      field('Date format', dateSel),
      h('div', { class: 'hr' }), props,
      h('p', { class: 'note', text: 'This adds a visible signature image. It isn’t a certificate-based digital signature — if your recipient requires one, use their e-signature service.' }));

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
      if (!n) return ctx.setRunnable(false, 'Place a signature on the page to continue.');
      const pages = new Set(ed.items.map(x => x.page)).size;
      ctx.setRunnable(true); ctx.setStatus(`${plural(n, 'item')} on ${plural(pages, 'page')}`);
    }
    drawSigs(); showProps(null); validate(); ed.st.show(0);
    ctx.onRun = async progress => {
      const doc = await libDoc(f);
      await ed.apply(doc, progress);
      const o = await pdfOutput(doc, ctx.outName);
      return { outputs: [o], summary: 'Signed', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});

// ---------------------------------------------------------------------------
// Edit: add text, whiteout, highlight, boxes, freehand ink and images.
// ---------------------------------------------------------------------------
defineTool({
  id: 'edit', name: 'Edit', icon: 'edit', group: 'edit', verb: 'edit', runLabel: 'Save', runIcon: 'download',
  desc: 'Add text, cover things up, highlight, draw and insert images on any page.',
  defaults: { family: 'Helvetica', size: 14, bold: false, italic: false, color: '#111111', white: '#ffffff', hl: '#ffe14d', stroke: '#c8291c', sw: 2, ink: '#1f3fbf', inkW: 2.5 },
  outName: f => baseName(f.name) + '-edited.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const props = h('div');
    let mode = 'select';
    const ed = objectEditor(ctx, f, { onSelect: () => showProps(), onChange: validate });
    ctx.work.append(ed.st.el);
    const MODES = [['select', 'Select', 'organize'], ['text', 'Text', 'text'], ['whiteout', 'Whiteout', 'whiteout'], ['highlight', 'Highlight', 'highlight'], ['box', 'Box', 'rect'], ['draw', 'Draw', 'draw'], ['image', 'Image', 'toimage']];
    const grid = h('div', { class: 'toolgrid', role: 'toolbar', 'aria-label': 'Editing tools' });
    const setMode = m => {
      if (m === 'image') return addImage();
      mode = m; ed.setMode(m); ed.setDrawStyle({ color: P.ink, width: P.inkW });
      for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.m === m));
      showProps();
    };
    for (const [m, l, ic] of MODES) grid.append(h('button', { type: 'button', 'data-m': m, onclick: () => setMode(m) }, icon(ic), l));
    ed.onModeReset(() => setMode('select'));
    ed.makeText = (u, v) => { const it = { type: 'text', text: 'Text', u, v: v - P.size * 0.6, size: P.size, family: P.family, bold: P.bold, italic: P.italic, color: P.color }; fitText(it); return it; };
    ed.makeRect = (kind, u, v, w, hh) => kind === 'whiteout' ? { type: 'rect', label: 'Whiteout', fill: P.white, fillOpacity: 1, u, v, w, h: hh }
      : kind === 'highlight' ? { type: 'rect', label: 'Highlight', fill: P.hl, fillOpacity: 0.45, blend: true, u, v, w, h: hh }
        : { type: 'rect', label: 'Box', stroke: P.stroke, sw: P.sw, u, v, w, h: hh };
    ctx.side.append(grid, props, h('p', { class: 'note', text: 'To change existing text: cover it with Whiteout, then add Text on top. Double-click any text you added to retype it.' }));

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
      const kind = it ? (it.type === 'rect' ? it.label.toLowerCase() : it.type) : mode;
      const upd = (key, v, pref) => { if (pref) { P[pref] = v; ctx.save(); } if (it) { it[key] = v; if (it.type === 'text') fitText(it); ed.refresh(); } ed.setDrawStyle({ color: P.ink, width: P.inkW }); };
      const title = it ? `Selected ${it.label ? it.label.toLowerCase() : it.type}` : ({ select: 'Select', text: 'Text', whiteout: 'Whiteout', highlight: 'Highlight', box: 'Box', draw: 'Draw' }[mode] || '');
      props.append(h('h4', { text: title }));
      const tips = { select: 'Click an item to change it. Drag to move, use the round handle to resize, Delete to remove.', text: 'Click on the page where the text should start.', whiteout: 'Drag over anything you want to hide.', highlight: 'Drag over text to highlight it.', box: 'Drag to draw a box.', draw: 'Draw freehand on the page.' };
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
      ctx.setRunnable(true); ctx.setStatus(`${plural(n, 'change')} on ${plural(new Set(ed.items.map(x => x.page)).size, 'page')}`);
    }
    setMode('select'); validate(); ed.st.show(0);
    ctx.onRun = async progress => {
      const doc = await libDoc(f);
      await ed.apply(doc, progress);
      const o = await pdfOutput(doc, ctx.outName);
      return { outputs: [o], summary: 'Changes saved', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});
