// ---------------------------------------------------------------------------
// PDF → HTML / Markdown (structured text export; not a layout-perfect Word doc).
// ---------------------------------------------------------------------------
defineTool({
  id: 'export', name: 'PDF → HTML / MD', icon: 'export', group: 'convert', verb: 'export', runLabel: 'Export', runIcon: 'download',
  desc: 'Turn PDF text into HTML or Markdown you can edit elsewhere. Layout is approximate.',
  defaults: { fmt: 'md', images: false },
  outName: (f, P) => baseName(f.name) + (P.fmt === 'html' ? '.html' : '.md'),
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    ctx.work.append(
      h('div', { class: 'pages', style: 'max-width:720px' }, [...Array(Math.min(f.pages, 6)).keys()].map(i =>
        h('div', { class: 'pg', style: 'cursor:default' }, h('div', { class: 'thumb' }, thumbImg(f, i, 140)), h('span', { class: 'num', text: String(i + 1) })))),
      h('p', { class: 'help', style: 'max-width:720px;color:var(--muted)', text: 'Exports selectable text. Scanned pages without OCR will be mostly empty. This is not a Word (.docx) converter.' }));
    const rf = rangeField({ label: 'Pages', value: '', total: f.pages, placeholder: 'All pages', onchange: validate });
    ctx.side.append(
      h('h4', { text: 'Format' }),
      choices('fmt', [
        { v: 'md', title: 'Markdown', sub: 'Good for notes and GitHub.' },
        { v: 'html', title: 'HTML', sub: 'Simple styled page you can open in a browser.' },
      ], P.fmt, v => { P.fmt = v; ctx.save(); ctx.outName = baseName(f.name) + (v === 'html' ? '.html' : '.md'); validate(); }),
      rf.el,
      checkbox('Include page images (HTML only)', P.images, v => { P.images = v; ctx.save(); }, 'Embeds a JPEG preview of each page. Makes the file larger.'),
      h('p', { class: 'note', text: 'Office → PDF is not included in this build. Drop images into Image → PDF instead.' }));
    function validate() {
      const r = rf.check();
      if (r.error) return ctx.setRunnable(false, r.error, true);
      ctx.setRunnable(true); ctx.setStatus(P.fmt === 'html' ? 'HTML export' : 'Markdown export');
    }
    validate();

    ctx.onRun = async progress => {
      const pages = rf.value.trim() ? parseRanges(rf.value, f.pages).pages : [...Array(f.pages).keys()];
      const blocks = [];
      for (let k = 0; k < pages.length; k++) {
        const i = pages[k];
        progress(k / pages.length, `Reading page ${i + 1}…`);
        const page = await f.pdf.getPage(i + 1);
        const tc = await page.getTextContent();
        let line = '', text = '';
        for (const it of tc.items) {
          line += it.str || '';
          if (it.hasEOL) { text += line + '\n'; line = ''; }
        }
        text += line;
        let imgDataUrl = null;
        if (P.fmt === 'html' && P.images) {
          const s = await pageSize(f, i);
          let scale = 96 / 72;
          if (s.w * s.h * scale * scale > 2e6) scale = Math.sqrt(2e6 / (s.w * s.h));
          const cv = await renderPage(f, i, { scale });
          imgDataUrl = cv.toDataURL('image/jpeg', 0.72);
          cv.width = cv.height = 0;
        }
        blocks.push({ i, text: text.trim(), imgDataUrl });
        await tick();
      }
      let body, mime, ext;
      if (P.fmt === 'html') {
        const parts = blocks.map(b => {
          const img = b.imgDataUrl ? `<figure><img src="${b.imgDataUrl}" alt="Page ${b.i + 1}"></figure>` : '';
          const paras = (b.text || '(no selectable text)').split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
          return `<section id="page-${b.i + 1}"><h2>Page ${b.i + 1}</h2>${img}${paras}</section>`;
        }).join('\n');
        body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(baseName(f.name))}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#111}
h1,h2{font-weight:650}img{max-width:100%;height:auto;border:1px solid #ddd}section{margin:2rem 0;padding-top:1rem;border-top:1px solid #eee}</style>
</head><body><h1>${escapeHtml(baseName(f.name))}</h1>${parts}</body></html>`;
        mime = 'text/html'; ext = 'html';
      } else {
        body = `# ${baseName(f.name)}\n\n` + blocks.map(b => `## Page ${b.i + 1}\n\n${b.text || '_No selectable text._'}\n`).join('\n');
        mime = 'text/markdown'; ext = 'md';
      }
      const data = new TextEncoder().encode(body);
      const name = safeName(ctx.outName || baseName(f.name), ext);
      return { outputs: [{ name, data, mime }], summary: `Exported ${plural(blocks.length, 'page')}`, detail: `${name} · ${fmtBytes(data.length)}` };
    };
  },
});
