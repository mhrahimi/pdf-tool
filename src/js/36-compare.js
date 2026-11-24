// ---------------------------------------------------------------------------
// Compare: visual diff of two PDFs (side-by-side + difference heatmap).
// ---------------------------------------------------------------------------
defineTool({
  id: 'compare', name: 'Compare', icon: 'compare', group: 'read', verb: 'compare', run: false, input: 'none',
  desc: 'Open two PDFs side by side and highlight pixels that differ.',
  mount(ctx) {
    let left = null, right = null, page = 0, mode = 'diff';
    const stage = h('div', { class: 'compare-wrap' });
    const status = h('p', { class: 'help', style: 'grid-column:1/-1' });
    const namesEl = h('div', { class: 'help', style: 'margin:12px 0', text: 'Left: — · Right: —' });
    const pageEl = h('span', { class: 'help' });
    ctx.work.append(stage, status);
    ctx.side.append(
      h('h4', { text: 'Documents' }),
      btn('Choose left PDF…', () => pick('left'), { cls: 'sm', ic: 'file' }),
      btn('Choose right PDF…', () => pick('right'), { cls: 'sm', ic: 'file', style: 'margin-top:8px' }),
      namesEl,
      h('h4', { text: 'View' }),
      field('Mode', seg([['diff', 'Difference'], ['side', 'Side by side'], ['onion', 'Onion skin']], mode, v => { mode = v; draw(); }, 'Mode')),
      h('div', { class: 'row', style: 'margin:12px 0' },
        iconBtn('left', 'Previous page', () => { page = Math.max(0, page - 1); draw(); }),
        pageEl,
        iconBtn('right', 'Next page', () => { page = Math.min(Math.max(0, maxPage() - 1), page + 1); draw(); })),
      h('p', { class: 'note', text: 'Difference mode paints changed pixels in red. Useful for proofing revisions.' }));
    ctx.showRun(false);

    function maxPage() { return Math.max(left?.pages || 0, right?.pages || 0); }
    function pick(which) {
      pickFiles('.pdf,application/pdf', false, async fl => {
        const a = await addFiles(fl, { select: false });
        const d = a.find(x => x.kind === 'pdf');
        if (!d) return;
        if (which === 'left') left = d; else right = d;
        page = 0;
        namesEl.textContent = `Left: ${left ? left.name : '—'} · Right: ${right ? right.name : '—'}`;
        draw();
      });
    }
    async function renderAt(f, i, scale) {
      if (!f || i >= f.pages) {
        const cv = document.createElement('canvas'); cv.width = 400; cv.height = 560;
        const c = cv.getContext('2d'); c.fillStyle = '#f0f2f7'; c.fillRect(0, 0, cv.width, cv.height);
        c.fillStyle = '#889'; c.font = '14px system-ui'; c.textAlign = 'center'; c.fillText('No page', cv.width / 2, cv.height / 2);
        return cv;
      }
      return renderPage(f, i, { scale });
    }
    async function draw() {
      if (!left && !right) { stage.replaceChildren(h('div', { class: 'empty', text: 'Choose two PDFs to compare.' })); status.textContent = ''; return; }
      const n = maxPage();
      page = clamp(page, 0, Math.max(0, n - 1));
      pageEl.textContent = `Page ${page + 1} of ${n || 1}`;
      status.textContent = 'Rendering…';
      const scale = 1.1;
      const a = await renderAt(left, page, scale);
      const b = await renderAt(right, page, scale);
      const W = Math.max(a.width, b.width), H = Math.max(a.height, b.height);
      if (mode === 'side') {
        stage.className = 'compare-wrap';
        stage.replaceChildren(
          h('div', { class: 'compare-pane' }, h('h3', { text: left ? left.name : 'Left' }), a),
          h('div', { class: 'compare-pane' }, h('h3', { text: right ? right.name : 'Right' }), b));
        status.textContent = '';
        return;
      }
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const c = out.getContext('2d');
      if (mode === 'onion') {
        c.drawImage(a, 0, 0);
        c.globalAlpha = 0.45;
        c.drawImage(b, 0, 0);
        c.globalAlpha = 1;
        status.textContent = 'Onion skin: left opaque, right at 45% opacity.';
      } else {
        const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
        const cb = document.createElement('canvas'); cb.width = W; cb.height = H;
        ca.getContext('2d').drawImage(a, 0, 0);
        cb.getContext('2d').drawImage(b, 0, 0);
        const da = ca.getContext('2d').getImageData(0, 0, W, H);
        const db = cb.getContext('2d').getImageData(0, 0, W, H);
        const o = c.createImageData(W, H);
        let diff = 0;
        for (let i = 0; i < da.data.length; i += 4) {
          const dr = Math.abs(da.data[i] - db.data[i]), dg = Math.abs(da.data[i + 1] - db.data[i + 1]), dbv = Math.abs(da.data[i + 2] - db.data[i + 2]);
          const changed = dr + dg + dbv > 36;
          if (changed) { diff++; o.data[i] = 220; o.data[i + 1] = 40; o.data[i + 2] = 40; o.data[i + 3] = 220; }
          else {
            const g = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3;
            o.data[i] = o.data[i + 1] = o.data[i + 2] = g;
            o.data[i + 3] = 255;
          }
        }
        c.putImageData(o, 0, 0);
        status.textContent = `${((diff / (W * H)) * 100).toFixed(2)}% of pixels differ on this page.`;
      }
      stage.className = 'compare-wrap';
      stage.replaceChildren(h('div', { class: 'compare-diff' }, out));
      a.width = a.height = b.width = b.height = 0;
    }
    stage.replaceChildren(h('div', { class: 'empty', text: 'Choose two PDFs to compare.' }));
  },
});
