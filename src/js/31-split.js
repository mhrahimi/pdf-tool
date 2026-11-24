// ---------------------------------------------------------------------------
// Split: single pages, every N, after pages (click the scissors), ranges,
// bookmarks, or extract a selection into one file.
// ---------------------------------------------------------------------------
const GROUP_TINTS = ['#1240e0', '#e0601f', '#0b8a5a', '#a2329e', '#c79a00', '#0a8ab0'];

defineTool({
  id: 'split', name: 'Split', icon: 'split', group: 'organize', verb: 'split', runLabel: 'Split', runIcon: 'split',
  desc: 'Break a PDF into several files — or pull out just the pages you need.',
  defaults: { mode: 'every', n: 2, pattern: '{name}-part{n}', level: 1 },
  outLabel: 'File names',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    let after = new Set(), extractSel = new Set([...Array(f.pages).keys()]), bookmarks = null;
    const rangesInp = rangeField({ label: 'Ranges — one file each', value: P.ranges || '', total: f.pages, placeholder: 'e.g. 1-3, 4-10, 11-', help: 'Each comma-separated part becomes its own file.', emptyIsAll: false, onchange: () => { P.ranges = rangesInp.value; ctx.save(); update(); } });
    const afterInp = rangeField({ label: 'Split after pages', value: '', total: f.pages, placeholder: 'e.g. 3, 7', help: 'Or click the scissors between pages.', emptyIsAll: false, onchange: r => { if (!r.error) { after = new Set(r.pages.filter(p => p < f.pages - 1)); } update(false); } });
    const extractInp = rangeField({ label: 'Pages to extract', value: '', total: f.pages, placeholder: 'e.g. 1, 3, 5-7, odd', help: 'Or click pages to include or leave them out.', emptyIsAll: false, onchange: r => { if (!r.error) extractSel = new Set(r.pages); update(false); } });
    const nInp = numInput(P.n, { min: 1, max: f.pages, label: 'Pages per file', onchange: v => { P.n = Math.max(1, Math.round(v)); ctx.save(); update(); } });
    const bmInfo = h('div', { class: 'help' });
    const levelSeg = seg([[1, 'Top level'], [2, 'Second level']], P.level, v => { P.level = v; ctx.save(); update(); }, 'Bookmark level');

    const modes = choices('mode', [
      { v: 'every', title: 'Into single pages', sub: `One file per page — ${plural(f.pages, 'file')}.` },
      { v: 'n', title: 'Every N pages', extra: h('div', { class: 'row' }, nInp, h('span', { class: 'help', text: 'pages per file' })) },
      { v: 'after', title: 'After specific pages', extra: afterInp.el },
      { v: 'ranges', title: 'By page ranges', extra: rangesInp.el },
      { v: 'bookmarks', title: 'By bookmarks', sub: 'A new file starts at each chapter bookmark.', extra: h('div', null, levelSeg, bmInfo) },
      { v: 'extract', title: 'Extract pages into one file', extra: extractInp.el },
    ], P.mode, v => { P.mode = v; ctx.save(); update(); });
    const preview = h('ul', { class: 'preview-list', 'aria-label': 'Files that will be created' });
    const previewHead = h('h4');
    ctx.side.append(h('h4', { text: 'How to split' }), modes, previewHead, preview,
      h('p', { class: 'help', style: 'font-size:12.5px;color:var(--muted)', text: 'Name tokens: {name} original name · {n} file number · {from} {to} page numbers · {title} bookmark title.' }));

    const grid = h('div', { class: 'pages', 'aria-label': 'Pages' });
    ctx.work.append(grid);
    const cells = [];
    for (let i = 0; i < f.pages; i++) {
      const cut = i < f.pages - 1 ? h('button', { class: 'cut', type: 'button', title: `Split after page ${i + 1}`, 'aria-label': `Split after page ${i + 1}`, onclick: e => { e.stopPropagation(); toggleCut(i); } }, icon('split')) : null;
      const grp = h('div', { class: 'grp' });
      const cell = h('div', { class: 'pg', role: 'button', tabindex: '0', 'data-i': String(i), 'aria-label': `Page ${i + 1}`, onclick: () => togglePage(i), onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePage(i); } } },
        h('div', { class: 'thumb' }, thumbImg(f, i, 150)), h('span', { class: 'num', text: String(i + 1) }), grp, cut);
      cells.push({ cell, cut, grp }); grid.append(cell);
    }
    pageSize(f, 0).then(s => grid.style.setProperty('--ar', (s.w / s.h).toFixed(3)));

    function toggleCut(i) {
      if (P.mode !== 'after') {
        const g = groups();
        after = new Set();
        if (!g.error && P.mode !== 'extract') g.list.forEach(x => { const last = x.pages[x.pages.length - 1]; if (last < f.pages - 1) after.add(last); });
        P.mode = 'after'; ctx.save();
        modes.querySelector('input[value=after]').checked = true;
        modes.querySelector('input[value=after]').dispatchEvent(new Event('change'));
      }
      after.has(i) ? after.delete(i) : after.add(i);
      afterInp.value = rangesFromSet([...after]);
      update(false);
    }
    function togglePage(i) {
      if (P.mode !== 'extract') return;
      extractSel.has(i) ? extractSel.delete(i) : extractSel.add(i);
      extractInp.value = rangesFromSet([...extractSel]);
      update(false);
    }

    function groups() {
      const all = [...Array(f.pages).keys()], list = [];
      switch (P.mode) {
        case 'every': all.forEach(i => list.push({ pages: [i] })); break;
        case 'n': for (let i = 0; i < f.pages; i += P.n) list.push({ pages: all.slice(i, i + P.n) }); break;
        case 'after': { let cur = []; all.forEach(i => { cur.push(i); if (after.has(i)) { list.push({ pages: cur }); cur = []; } }); if (cur.length) list.push({ pages: cur }); break; }
        case 'ranges': {
          const r = parseRangeParts(rangesInp.value, f.pages);
          if (r.error) return { error: r.error };
          if (!r.groups.length) return { error: 'Type the ranges you want, e.g. 1-3, 4-10' };
          r.groups.forEach(g => list.push({ pages: g }));
          break;
        }
        case 'bookmarks': {
          if (!bookmarks) return { error: 'Reading bookmarks…' };
          let marks = [];
          const walk = (l, depth) => l.forEach(n => { if (depth === P.level && n.pageIndex != null) marks.push(n); if (depth < P.level) walk(n.children, depth + 1); });
          walk(bookmarks, 1);
          marks = marks.sort((a, b) => a.pageIndex - b.pageIndex).filter((m, i, a) => i === 0 || m.pageIndex !== a[i - 1].pageIndex);
          if (!marks.length) return { error: bookmarks.length ? 'No bookmarks at that level.' : 'This PDF has no bookmarks.' };
          if (marks[0].pageIndex > 0) list.push({ pages: all.slice(0, marks[0].pageIndex), title: 'Start' });
          marks.forEach((m, i) => list.push({ pages: all.slice(m.pageIndex, i + 1 < marks.length ? marks[i + 1].pageIndex : f.pages), title: m.title }));
          break;
        }
        case 'extract': {
          const sel = [...extractSel].sort((a, b) => a - b);
          if (extractInp.value.trim() && extractInp.check().error) return { error: extractInp.check().error };
          if (!sel.length) return { error: 'Choose at least one page to extract.' };
          const r = parseRanges(extractInp.value, f.pages);
          list.push({ pages: !extractInp.value.trim() ? sel : r.pages });
          break;
        }
      }
      return { list };
    }

    function update(syncInputs = true) {
      if (syncInputs) {
        if (P.mode === 'after') afterInp.value = rangesFromSet([...after]);
        if (P.mode === 'extract' && !extractInp.value) extractInp.value = rangesFromSet([...extractSel]);
      }
      const g = groups();
      const extract = P.mode === 'extract';
      ctx.runBtn.firstChild.nextSibling.textContent = extract ? 'Extract' : 'Split';
      const label = ctx.runbar.querySelector('.outname label');
      label.textContent = extract ? 'Save as' : 'File names';
      if (extract && (!ctx.outName || ctx.outName.includes('{'))) ctx.outName = `${baseName(f.name)}-extract.pdf`;
      if (!extract && (!ctx.outName || !ctx.outName.includes('{'))) ctx.outName = P.pattern || '{name}-part{n}';
      // grid state
      const owner = new Map();
      if (!g.error) g.list.forEach((x, gi) => x.pages.forEach(p => { if (!owner.has(p)) owner.set(p, gi); }));
      cells.forEach(({ cell, cut, grp }, i) => {
        const gi = owner.get(i);
        cell.classList.toggle('off', !owner.has(i));
        cell.classList.toggle('sel', extract && owner.has(i));
        grp.style.background = gi != null && !extract ? GROUP_TINTS[gi % GROUP_TINTS.length] : 'transparent';
        if (cut) {
          const isCut = !g.error && !extract && owner.has(i) && owner.has(i + 1) && owner.get(i) !== owner.get(i + 1);
          cut.classList.toggle('on', isCut); cut.hidden = extract;
          cut.setAttribute('aria-pressed', String(isCut));
        }
      });
      preview.replaceChildren();
      if (g.error) { previewHead.textContent = 'Result'; preview.append(h('li', null, h('span', { text: g.error, style: 'color:var(--danger);white-space:normal' }))); ctx.setRunnable(false, g.error, !/^(Type|Choose|Reading)/.test(g.error)); return; }
      previewHead.textContent = extract ? 'Result — 1 file' : `Result — ${plural(g.list.length, 'file')}`;
      names(g.list).forEach((n, i) => { if (i < 200) preview.append(h('li', null, h('span', { text: n, title: n }), h('span', { text: pagesLabel(g.list[i].pages) }))); });
      if (g.list.length > 200) preview.append(h('li', null, h('span', { text: `…and ${g.list.length - 200} more` })));
      ctx.setRunnable(true);
    }
    const pagesLabel = p => p.length === 1 ? `p. ${p[0] + 1}` : (p[p.length - 1] - p[0] === p.length - 1 ? `p. ${p[0] + 1}–${p[p.length - 1] + 1}` : plural(p.length, 'page'));
    function names(list) {
      if (P.mode === 'extract') return [safeName(ctx.outName || baseName(f.name) + '-extract', 'pdf')];
      const pattern = ctx.outName || '{name}-part{n}', width = String(list.length).length;
      return list.map((g, i) => safeName(fillPattern(pattern, { name: baseName(f.name), n: String(i + 1).padStart(width, '0'), from: g.pages[0] + 1, to: g.pages[g.pages.length - 1] + 1, title: g.title || `part ${i + 1}`, page: g.pages[0] + 1 }), 'pdf'));
    }
    ctx.on($('#outname'), 'input', () => { if (P.mode !== 'extract') { P.pattern = ctx.outName; ctx.save(); } update(false); });

    readOutline(f).then(b => {
      bookmarks = b;
      const top = b.filter(n => n.pageIndex != null).length;
      bmInfo.textContent = b.length ? `${plural(top, 'top-level bookmark')} found.` : 'This PDF has no bookmarks.';
      const opt = modes.querySelector('input[value=bookmarks]');
      if (!b.length) { opt.disabled = true; opt.closest('.choice').style.opacity = '.55'; if (P.mode === 'bookmarks') { P.mode = 'every'; modes.querySelector('input[value=every]').checked = true; } }
      update();
    });
    update();

    ctx.onRun = async progress => {
      const g = groups();
      if (g.error) throw new Error(g.error);
      const src = await libDoc(f), nm = names(g.list), outs = [];
      for (let i = 0; i < g.list.length; i++) {
        progress(i / g.list.length, `Creating file ${i + 1} of ${g.list.length}…`);
        const doc = await PDFDocument.create();
        (await doc.copyPages(src, g.list[i].pages)).forEach(p => doc.addPage(p));
        const t = src.getTitle(); if (t) doc.setTitle(g.list[i].title ? `${t} — ${g.list[i].title}` : t);
        outs.push({ name: nm[i], data: await doc.save({ useObjectStreams: true }), pdf: true });
        await tick();
      }
      const pages = g.list.reduce((s, x) => s + x.pages.length, 0);
      return {
        outputs: outs, zipName: baseName(f.name) + (P.mode === 'extract' ? '-extract' : '-split'),
        summary: P.mode === 'extract' ? `Extracted ${plural(pages, 'page')}` : `Split into ${plural(outs.length, 'file')}`,
      };
    };
  },
});
