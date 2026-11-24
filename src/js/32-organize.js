// ---------------------------------------------------------------------------
// Organize pages: select, rotate, delete, duplicate, reorder, insert blank
// pages, add pages from other files, reverse — with undo/redo.
// ---------------------------------------------------------------------------
defineTool({
  id: 'organize', name: 'Organize pages', icon: 'organize', group: 'organize', verb: 'organize', side: false, runLabel: 'Save', runIcon: 'download',
  desc: 'Rotate, delete, reorder, duplicate and insert pages. Drag pages to move them.',
  outName: f => baseName(f.name) + '-organized.pdf',
  mount(ctx) {
    const f = ctx.file;
    let items = [...Array(f.pages).keys()].map(i => ({ key: uid(), src: f, index: i, rot: 0 }));
    let sel = new Set(), anchor = null;
    const undo = [], redo = [];
    const snap = () => items.map(x => ({ ...x }));
    const commit = () => { undo.push(snap()); if (undo.length > 60) undo.shift(); redo.length = 0; };

    const count = h('span', { class: 'count' });
    const selBtns = [];
    const sb = (label, ic, fn, title) => { const b = btn(label, fn, { cls: 'sm', ic, title }); selBtns.push(b); return b; };
    const undoBtn = iconBtn('undo', 'Undo (Ctrl+Z)', () => history(undo, redo), 'sm'), redoBtn = iconBtn('redo', 'Redo (Ctrl+Shift+Z)', () => history(redo, undo), 'sm');
    const bar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Page actions' },
      btn('Select all', () => { sel = new Set(items.map(x => x.key)); draw(); }, { cls: 'sm ghost' }),
      sb('', 'rotl', () => rotate(-90), 'Rotate left'), sb('', 'rotr', () => rotate(90), 'Rotate right'),
      sb('Delete', 'trash', del), sb('Duplicate', 'copy', dup),
      sb('', 'left', () => shift(-1), 'Move earlier'), sb('', 'right', () => shift(1), 'Move later'),
      h('span', { class: 'sep' }),
      btn('Blank page', insertBlank, { cls: 'sm', ic: 'blank', title: 'Insert a blank page after the selection' }),
      btn('Add file', addFrom, { cls: 'sm', ic: 'plus', title: 'Insert pages from another PDF or images' }),
      btn('', () => { commit(); items.reverse(); draw(); }, { cls: 'sm', ic: 'reverse', title: 'Reverse order' }),
      h('span', { class: 'sep' }), undoBtn, redoBtn, count);
    const grid = h('div', { class: 'pages', tabindex: '0', 'aria-label': 'Pages — click to select, drag to reorder' });
    ctx.work.append(bar, grid, h('p', { class: 'help', style: 'margin-top:18px;color:var(--muted);font-size:13px', text: 'Tips: Shift-click selects a run of pages, Ctrl/⌘-click adds to the selection, Delete removes, Ctrl/⌘+Z undoes.' }));
    sortable(grid, '.pg', (a, b) => { commit(); moveItem(items, a, b); draw(); }, { horizontal: true });
    pageSize(f, 0).then(s => grid.style.setProperty('--ar', (s.w / s.h).toFixed(3)));

    function history(from, to) { if (!from.length) return; to.push(snap()); items = from.pop(); sel = new Set([...sel].filter(k => items.some(x => x.key === k))); draw(); }
    const selected = () => items.filter(x => sel.has(x.key));
    function rotate(d) { if (!sel.size) return; commit(); selected().forEach(x => { x.rot = (x.rot + d + 360) % 360; }); draw(); }
    function del() {
      if (!sel.size) return;
      if (sel.size === items.length) return toast('A PDF needs at least one page — select fewer pages.', 'error');
      commit(); items = items.filter(x => !sel.has(x.key)); sel.clear(); draw();
    }
    function dup() {
      if (!sel.size) return; commit();
      const out = []; const nsel = new Set();
      items.forEach(x => { out.push(x); if (sel.has(x.key)) { const c = { ...x, key: uid() }; out.push(c); nsel.add(c.key); } });
      items = out; sel = nsel; draw();
    }
    function shift(d) {
      if (!sel.size) return; commit();
      const idx = items.map((x, i) => sel.has(x.key) ? i : -1).filter(i => i >= 0);
      if (d < 0 && idx[0] === 0) return; if (d > 0 && idx[idx.length - 1] === items.length - 1) return;
      (d < 0 ? idx : idx.reverse()).forEach(i => moveItem(items, i, i + d));
      draw();
    }
    async function insertBlank() {
      commit();
      const at = sel.size ? Math.max(...items.map((x, i) => sel.has(x.key) ? i : -1)) : items.length - 1;
      const ref = items[at] || items[0];
      let size = { w: 595.28, h: 841.89 };
      if (ref && !ref.blank && ref.src.kind === 'pdf') size = await pageSize(ref.src, ref.index);
      const b = { key: uid(), blank: true, w: size.w, h: size.h, rot: 0 };
      items.splice(at + 1, 0, b); sel = new Set([b.key]); draw();
    }
    function addFrom() {
      pickFiles('.pdf,application/pdf,image/*', true, async fl => {
        const docs = await addFiles(fl, { select: false });
        if (!docs.length) return;
        commit();
        let at = sel.size ? Math.max(...items.map((x, i) => sel.has(x.key) ? i : -1)) + 1 : items.length;
        const added = [];
        for (const d of docs) for (let i = 0; i < d.pages; i++) added.push({ key: uid(), src: d, index: i, rot: 0, image: d.kind === 'image' });
        items.splice(at, 0, ...added); sel = new Set(added.map(x => x.key)); draw();
        toast(`Added ${plural(added.length, 'page')}.`);
      });
    }
    ctx.onFiles = docs => {
      commit();
      const added = [];
      for (const d of docs) for (let i = 0; i < d.pages; i++) added.push({ key: uid(), src: d, index: i, rot: 0, image: d.kind === 'image' });
      items.push(...added); draw();
    };

    function onCellClick(e, x, i) {
      if (e.target.closest('.hover')) return;
      if (e.shiftKey && anchor != null) {
        const a = items.findIndex(y => y.key === anchor);
        const [lo, hi] = a < i ? [a, i] : [i, a];
        if (!(e.ctrlKey || e.metaKey)) sel.clear();
        for (let k = lo; k <= hi; k++) sel.add(items[k].key);
      } else if (e.ctrlKey || e.metaKey || e.target.closest('.tick')) {
        sel.has(x.key) ? sel.delete(x.key) : sel.add(x.key); anchor = x.key;
      } else {
        sel = sel.size === 1 && sel.has(x.key) ? new Set() : new Set([x.key]); anchor = x.key;
      }
      draw();
    }
    function paintChrome() {
      selBtns.forEach(b => { b.disabled = !sel.size; });
      undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
      const changed = items.length !== f.pages || items.some((x, i) => x.src !== f || x.index !== i || x.rot || x.blank);
      count.textContent = `${plural(items.length, 'page')}${sel.size ? ` · ${sel.size} selected` : ''}`;
      ctx.setRunnable(true);
      ctx.setStatus(changed ? 'Unsaved changes' : 'Select pages to change them.');
    }
    function updateCell(cell, x, i) {
      const on = sel.has(x.key);
      cell.classList.toggle('sel', on);
      cell.dataset.idx = String(i);
      cell.dataset.key = x.key;
      cell.setAttribute('aria-selected', String(on));
      cell.setAttribute('aria-label', `Page ${i + 1}${x.src && x.src !== f ? ' from ' + x.src.name : ''}${x.blank ? ' (blank)' : ''}`);
      const tick = cell.querySelector('.tick');
      if (tick) tick.replaceChildren(on ? icon('check') : null);
      const num = cell.querySelector('.num');
      if (num) num.textContent = String(i + 1) + (x.src && x.src !== f ? ' · ' + baseName(x.src.name).slice(0, 14) : '');
      let badge = cell.querySelector('.badge');
      if (x.rot) {
        if (!badge) { badge = h('span', { class: 'badge' }); cell.append(badge); }
        badge.textContent = x.rot + '°';
      } else if (badge) badge.remove();
      const th = cell.querySelector('.thumb > *');
      if (th) th.style.transform = x.rot ? `rotate(${x.rot}deg) scale(${x.rot % 180 ? 0.74 : 1})` : '';
    }
    function itemAt(el) {
      const cell = el.closest ? el.closest('.pg') : el;
      const i = +cell.dataset.idx;
      return { i, x: items[i] };
    }
    function makeCell(x, i) {
      let th;
      if (x.blank) th = h('div', { class: 'ph', style: `aspect-ratio:${x.w}/${x.h};width:${x.w > x.h ? '100%' : 'auto'};height:${x.w > x.h ? 'auto' : '100%'}` });
      else th = thumbImg(x.src, x.index, 150);
      th.style.transform = x.rot ? `rotate(${x.rot}deg) scale(${x.rot % 180 ? 0.74 : 1})` : '';
      return h('div', { class: 'pg' + (sel.has(x.key) ? ' sel' : ''), draggable: 'true', 'data-idx': String(i), 'data-key': x.key, tabindex: '0', role: 'option', 'aria-selected': String(sel.has(x.key)), 'aria-label': `Page ${i + 1}${x.src && x.src !== f ? ' from ' + x.src.name : ''}${x.blank ? ' (blank)' : ''}`,
        onclick: e => { const { i: ii, x: xx } = itemAt(e.currentTarget); if (xx) onCellClick(e, xx, ii); },
        onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const { i: ii, x: xx } = itemAt(e.currentTarget); if (xx) onCellClick({ target: e.target, ctrlKey: true }, xx, ii); } } },
        h('div', { class: 'tick', 'aria-hidden': 'true' }, sel.has(x.key) ? icon('check') : null),
        h('div', { class: 'hover' },
          h('button', { type: 'button', title: 'Rotate', 'aria-label': `Rotate page ${i + 1}`, onclick: e => { e.stopPropagation(); const { x: xx } = itemAt(e.currentTarget); if (!xx) return; commit(); xx.rot = (xx.rot + 90) % 360; draw(); } }, icon('rotr')),
          h('button', { type: 'button', title: 'Delete', 'aria-label': `Delete page ${i + 1}`, onclick: e => { e.stopPropagation(); const { i: ii, x: xx } = itemAt(e.currentTarget); if (!xx) return; if (items.length < 2) return toast('A PDF needs at least one page.', 'error'); commit(); items.splice(ii, 1); sel.delete(xx.key); draw(); } }, icon('trash'))),
        h('div', { class: 'thumb' }, th),
        h('span', { class: 'num', text: String(i + 1) + (x.src && x.src !== f ? ' · ' + baseName(x.src.name).slice(0, 14) : '') }),
        x.rot ? h('span', { class: 'badge', text: x.rot + '°' }) : null);
    }
    function draw() {
      const keepScroll = ctx.work.scrollTop;
      // Reuse cells when keys match so we don't re-queue hundreds of lazy thumbs.
      const same = grid.children.length === items.length && items.every((x, i) => grid.children[i].dataset.key === x.key);
      if (same) {
        items.forEach((x, i) => updateCell(grid.children[i], x, i));
      } else {
        const frag = document.createDocumentFragment();
        items.forEach((x, i) => frag.append(makeCell(x, i)));
        grid.replaceChildren(frag);
      }
      paintChrome();
      ctx.work.scrollTop = keepScroll;
    }
    ctx.on(document, 'keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea,select,dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history(redo, undo) : history(undo, redo); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); history(redo, undo); }
      else if (mod && e.key.toLowerCase() === 'a' && grid.contains(document.activeElement)) { e.preventDefault(); sel = new Set(items.map(x => x.key)); draw(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); del(); }
    });
    draw();

    ctx.onRun = async progress => {
      const out = await PDFDocument.create();
      const libs = new Map();
      // copy pages source by source to keep shared resources shared
      const copied = new Array(items.length);
      const bySrc = new Map();
      items.forEach((x, i) => { if (!x.blank && !x.image) { if (!bySrc.has(x.src)) bySrc.set(x.src, []); bySrc.get(x.src).push(i); } });
      for (const [src, idxs] of bySrc) {
        if (!libs.has(src)) libs.set(src, await libDoc(src));
        const pages = await out.copyPages(libs.get(src), idxs.map(i => items[i].index));
        idxs.forEach((i, k) => { copied[i] = pages[k]; });
      }
      for (let i = 0; i < items.length; i++) {
        const x = items[i];
        if (x.blank) out.addPage([x.w, x.h]);
        else if (x.image) { const img = await embedImageFile(out, x.src, { rotate: x.rot }); addImagePage(out, img, { size: 'fit' }); continue; }
        else out.addPage(copied[i]);
        const p = out.getPage(out.getPageCount() - 1);
        if (x.rot) p.setRotation(degrees((p.getRotation().angle + x.rot + 360) % 360));
        if (i % 20 === 19) { progress(i / items.length, 'Building pages…'); await tick(); }
      }
      const src = libs.get(f);
      if (src) { const t = src.getTitle(); if (t) out.setTitle(t); const a = src.getAuthor(); if (a) out.setAuthor(a); }
      const o = await pdfOutput(out, ctx.outName || baseName(f.name) + '-organized.pdf');
      return { outputs: [o], summary: 'Pages saved', detail: `${o.name} · ${plural(out.getPageCount(), 'page')} · ${fmtBytes(o.data.length)}` };
    };
  },
});
