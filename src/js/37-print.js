// ---------------------------------------------------------------------------
// Print: render pages into a printer-friendly sheet and open the system dialog.
// ---------------------------------------------------------------------------
defineTool({
  id: 'print', name: 'Print', icon: 'print', group: 'convert', verb: 'print', runLabel: 'Print', runIcon: 'print',
  desc: 'Preview pages and send them to your printer with fit, actual-size or handout profiles.',
  defaults: { profile: 'fit', dpi: 150, grayscale: false },
  outName: f => baseName(f.name) + '-print.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const preview = h('div', { class: 'print-sheet' }, h('p', { class: 'help', text: 'Choose a profile, then Print. Your browser’s print dialog handles paper size and duplex.' }));
    ctx.work.append(preview);
    const rf = rangeField({ label: 'Pages', value: '', total: f.pages, placeholder: 'All pages', onchange: validate });
    ctx.side.append(
      h('h4', { text: 'Profile' }),
      choices('profile', [
        { v: 'fit', title: 'Fit to page', sub: 'Scale each page to the printable area.' },
        { v: 'actual', title: 'Actual size', sub: '1:1 at 72 pt = 1 inch. May clip on small paper.' },
        { v: 'handout2', title: '2-up handout', sub: 'Two pages per sheet, portrait.' },
        { v: 'handout4', title: '4-up handout', sub: 'Four pages per sheet.' },
      ], P.profile, v => { P.profile = v; ctx.save(); validate(); }),
      field('Render quality', seg([[110, 'Draft'], [150, 'Standard'], [200, 'Fine']], P.dpi, v => { P.dpi = v; ctx.save(); }, 'Quality')),
      checkbox('Grayscale', P.grayscale, v => { P.grayscale = v; ctx.save(); }),
      rf.el,
      h('p', { class: 'note', text: 'Also saves a flattened print-ready PDF you can archive or send to a print shop.' }));
    function validate() {
      const r = rf.check();
      if (r.error) return ctx.setRunnable(false, r.error, true);
      ctx.setRunnable(true); ctx.setStatus('Ready to print');
    }
    validate();

    ctx.onRun = async progress => {
      const pages = rf.value.trim() ? parseRanges(rf.value, f.pages).pages : [...Array(f.pages).keys()];
      const imgs = [];
      for (let k = 0; k < pages.length; k++) {
        const i = pages[k];
        progress(0.05 + 0.7 * k / pages.length, `Rendering page ${i + 1}…`);
        const s = await pageSize(f, i);
        let scale = P.dpi / 72;
        if (s.w * s.h * scale * scale > 4e6) scale = Math.sqrt(4e6 / (s.w * s.h));
        const cv = await renderPage(f, i, { scale });
        if (P.grayscale) {
          const c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height);
          for (let p = 0; p < d.data.length; p += 4) {
            const g = 0.299 * d.data[p] + 0.587 * d.data[p + 1] + 0.114 * d.data[p + 2];
            d.data[p] = d.data[p + 1] = d.data[p + 2] = g;
          }
          c.putImageData(d, 0, 0);
        }
        imgs.push({ i, url: cv.toDataURL('image/jpeg', 0.88), w: s.w, h: s.h });
        cv.width = cv.height = 0;
        await tick();
      }
      progress(0.8, 'Opening print dialog…');
      const nUp = P.profile === 'handout4' ? 4 : P.profile === 'handout2' ? 2 : 1;
      const fit = P.profile !== 'actual';
      const css = `
        @page { margin: 10mm; }
        body { margin: 0; font-family: system-ui, sans-serif; }
        .sheet { page-break-after: always; display: grid; gap: 4mm;
          ${nUp === 1 ? 'grid-template-columns:1fr;' : nUp === 2 ? 'grid-template-columns:1fr; grid-auto-rows:1fr;' : 'grid-template-columns:1fr 1fr;'}
          align-content: start; min-height: 90vh; }
        .pg { display:flex; align-items:center; justify-content:center; overflow:hidden; border:0; }
        .pg img { ${fit ? 'max-width:100%; max-height:100%; object-fit:contain;' : 'width:auto; height:auto;'} }
        @media print { .noprint { display:none } }
      `;
      const chunks = [];
      for (let i = 0; i < imgs.length; i += nUp) chunks.push(imgs.slice(i, i + nUp));
      const html = `<!DOCTYPE html><html><head><title>Print · ${escapeHtml(f.name)}</title><style>${css}</style></head><body>
        ${chunks.map(ch => `<div class="sheet">${ch.map(im => `<div class="pg"><img src="${im.url}" style="${!fit ? `width:${im.w}pt;height:${im.h}pt` : ''}"></div>`).join('')}</div>`).join('')}
        <scr` + `ipt>onload=()=>setTimeout(()=>print(),200)</scr` + `ipt></body></html>`;
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
      else toast('Allow pop-ups to open the print dialog.', 'error');

      // Also produce a print-ready PDF (one page per source page, optionally gray via re-render already done)
      progress(0.9, 'Saving print-ready PDF…');
      const out = await PDFDocument.create();
      for (const im of imgs) {
        const bytes = dataUrlToBytes(im.url);
        const img = await out.embedJpg(bytes);
        out.addPage([im.w, im.h]).drawImage(img, { x: 0, y: 0, width: im.w, height: im.h });
      }
      const o = await pdfOutput(out, ctx.outName);
      return { outputs: [o], summary: w ? 'Print dialog opened' : 'Print-ready PDF saved', detail: `${plural(imgs.length, 'page')} · ${o.name}` };
    };
  },
});
