// ---------------------------------------------------------------------------
// Form designer: create AcroForm text, checkbox, radio, dropdown and list fields.
// ---------------------------------------------------------------------------
defineTool({
  id: 'formdesign', name: 'Create form', icon: 'design', group: 'read', verb: 'design', runLabel: 'Save form', runIcon: 'download',
  desc: 'Add fillable text, checkboxes, radios and dropdowns onto a PDF — then open Fill form to complete it.',
  defaults: { kind: 'text', multiline: false },
  outName: f => baseName(f.name) + '-form.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const fields = [];
    let sel = null, drawing = null;
    const st = pageStage(ctx, f, { onShow: () => render() });
    ctx.work.append(st.el);
    const list = h('div');
    const nameInp = h('input', { class: 'inp', placeholder: 'field.name', 'aria-label': 'Field name' });
    const optsInp = h('input', { class: 'inp', placeholder: 'Option A, Option B', 'aria-label': 'Options' });
    const optsWrap = field('Choices (comma-separated)', optsInp);
    const syncKind = () => { optsWrap.hidden = !['choice', 'radio', 'list'].includes(P.kind); };
    ctx.side.append(
      h('h4', { text: 'New field' }),
      field('Type', seg([['text', 'Text'], ['check', 'Check'], ['radio', 'Radio'], ['choice', 'Dropdown'], ['list', 'List']], P.kind, v => { P.kind = v; ctx.save(); syncKind(); }, 'Type')),
      field('Internal name', nameInp, 'Used by the PDF. Letters, numbers, dots.'),
      checkbox('Multiline text', P.multiline, v => { P.multiline = v; ctx.save(); }, 'Only for text fields.'),
      optsWrap,
      h('p', { class: 'help', style: 'margin-bottom:14px', text: 'Drag on the page to place a field. Click a field in the list to select it.' }),
      h('h4', { text: 'Fields on this PDF' }), list,
      h('p', { class: 'note', text: 'Signature widgets for digital signing are added in Sign when you import a certificate.' }));
    syncKind();

    function defaultName() {
      const base = P.kind === 'text' ? 'text' : P.kind === 'check' ? 'check' : P.kind === 'radio' ? 'group' : P.kind === 'choice' ? 'choice' : 'list';
      let n = 1; while (fields.some(x => x.name === `${base}${n}`)) n++;
      return `${base}${n}`;
    }
    function render() {
      const s = st.scale;
      st.layer.replaceChildren();
      for (const fld of fields.filter(x => x.page === st.cur)) {
        const el = h('div', { class: 'obj' + (sel === fld ? ' sel' : ''), tabindex: '0', style: `left:${fld.u * s}px;top:${fld.v * s}px;width:${fld.w * s}px;height:${fld.h * s}px;background:rgb(18 64 224/.12);box-shadow:inset 0 0 0 1.5px var(--accent)` },
          h('div', { class: 'tx', style: 'font-size:11px;padding:2px 4px;color:var(--accent)', text: `${fld.kind}: ${fld.name}` }),
          h('div', { class: 'rs', 'aria-hidden': 'true' }),
          h('button', { class: 'del', type: 'button', 'aria-label': 'Remove', onclick: e => { e.stopPropagation(); remove(fld); } }, icon('x')));
        el.addEventListener('pointerdown', e => {
          if (e.target.closest('.del')) return;
          sel = fld; nameInp.value = fld.name; render(); drawList();
          const o = { u: fld.u, v: fld.v, w: fld.w, h: fld.h }, resize = e.target.classList.contains('rs');
          dragging(e, (dx, dy) => {
            dx /= s; dy /= s;
            if (resize) { fld.w = Math.max(16, o.w + dx); fld.h = Math.max(14, o.h + dy); }
            else { fld.u = clamp(o.u + dx, 0, st.size.w - fld.w); fld.v = clamp(o.v + dy, 0, st.size.h - fld.h); }
            Object.assign(el.style, { left: fld.u * s + 'px', top: fld.v * s + 'px', width: fld.w * s + 'px', height: fld.h * s + 'px' });
          }, validate);
        });
        st.layer.append(el);
      }
    }
    function drawList() {
      list.replaceChildren();
      if (!fields.length) { list.append(h('p', { class: 'help', style: 'color:var(--muted)', text: 'None yet — drag on the page.' })); return; }
      fields.forEach((fld, i) => {
        list.append(h('div', { class: 'row', style: 'margin-bottom:6px;flex-wrap:nowrap' },
          h('button', { type: 'button', class: 'btn sm ghost', style: 'flex:1;justify-content:flex-start', onclick: async () => { sel = fld; nameInp.value = fld.name; await st.show(fld.page); render(); } }, `${i + 1}. ${fld.kind} · ${fld.name} · p${fld.page + 1}`),
          btn('', () => remove(fld), { cls: 'sm ghost icon', ic: 'trash', title: 'Remove' })));
      });
    }
    function remove(fld) { const i = fields.indexOf(fld); if (i >= 0) fields.splice(i, 1); if (sel === fld) sel = null; render(); drawList(); validate(); }
    function validate() {
      if (!fields.length) return ctx.setRunnable(false, 'Drag on the page to add a field.');
      if (fields.some(x => !/^[A-Za-z][\w.]*$/.test(x.name))) return ctx.setRunnable(false, 'Field names must start with a letter.', true);
      const names = fields.map(x => x.name);
      if (new Set(names).size !== names.length && !fields.every(x => x.kind !== 'radio' || names.filter(n => n === x.name).length === fields.filter(f2 => f2.name === x.name).length)) {
        // radios may share a name; other kinds must be unique
        const nonRadio = fields.filter(x => x.kind !== 'radio').map(x => x.name);
        if (new Set(nonRadio).size !== nonRadio.length) return ctx.setRunnable(false, 'Duplicate field names.', true);
      }
      ctx.setRunnable(true); ctx.setStatus(plural(fields.length, 'field'));
    }
    nameInp.addEventListener('change', () => { if (sel) { sel.name = nameInp.value.trim() || sel.name; render(); drawList(); validate(); } });
    st.stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.obj')) return;
      const r = st.stage.getBoundingClientRect(), s = st.scale;
      const u0 = (e.clientX - r.left) / s, v0 = (e.clientY - r.top) / s;
      const ghost = h('div', { class: 'obj sel', style: `left:${u0 * s}px;top:${v0 * s}px;width:0;height:0;background:rgb(18 64 224/.15);box-shadow:inset 0 0 0 1.5px var(--accent)` });
      st.layer.append(ghost);
      let u1 = u0, v1 = v0;
      dragging(e, (dx, dy) => {
        u1 = u0 + dx / s; v1 = v0 + dy / s;
        Object.assign(ghost.style, { left: Math.min(u0, u1) * s + 'px', top: Math.min(v0, v1) * s + 'px', width: Math.abs(u1 - u0) * s + 'px', height: Math.abs(v1 - v0) * s + 'px' });
      }, () => {
        ghost.remove();
        let u = Math.min(u0, u1), v = Math.min(v0, v1), w = Math.abs(u1 - u0), hh = Math.abs(v1 - v0);
        if (w < 8 || hh < 8) { w = P.kind === 'check' ? 18 : 160; hh = P.kind === 'check' ? 18 : (P.kind === 'text' && P.multiline ? 48 : 22); u = clamp(u0 - w / 2, 0, st.size.w - w); v = clamp(v0 - hh / 2, 0, st.size.h - hh); }
        const name = (nameInp.value.trim() && P.kind === 'radio') ? nameInp.value.trim() : (nameInp.value.trim() || defaultName());
        const options = optsInp.value.split(',').map(x => x.trim()).filter(Boolean);
        const fld = { kind: P.kind, name, multiline: P.multiline, options: options.length ? options : ['Yes', 'No'], page: st.cur, u, v, w, h: hh };
        fields.push(fld); sel = fld; nameInp.value = fld.name; render(); drawList(); validate();
      });
    });
    drawList(); validate(); st.show(0);

    ctx.onRun = async progress => {
      const doc = await libDoc(f);
      const form = doc.getForm();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const radioGroups = new Map();
      for (let i = 0; i < fields.length; i++) {
        progress(i / fields.length, `Creating field ${i + 1}…`);
        const fld = fields[i];
        const page = doc.getPage(fld.page);
        const g = pageGeom(page);
        const [x, y] = g.toUser(fld.u, fld.v + fld.h);
        const rect = { x, y, width: fld.w, height: fld.h };
        try {
          if (fld.kind === 'text') {
            const tf = form.createTextField(fld.name);
            if (fld.multiline) tf.enableMultiline();
            tf.addToPage(page, rect);
            tf.updateAppearances(font);
          } else if (fld.kind === 'check') {
            const cb = form.createCheckBox(fld.name);
            cb.addToPage(page, rect);
            cb.updateAppearances();
          } else if (fld.kind === 'radio') {
            let rg = radioGroups.get(fld.name);
            if (!rg) { rg = form.createRadioGroup(fld.name); radioGroups.set(fld.name, rg); }
            const opt = fld.options[fields.filter(x => x.name === fld.name && x.kind === 'radio').indexOf(fld)] || `opt${i}`;
            rg.addOptionToPage(String(opt), page, rect);
          } else if (fld.kind === 'choice') {
            const dd = form.createDropdown(fld.name);
            dd.addOptions(fld.options);
            dd.addToPage(page, rect);
            dd.updateAppearances(font);
          } else if (fld.kind === 'list') {
            const ol = form.createOptionList(fld.name);
            ol.addOptions(fld.options);
            ol.addToPage(page, rect);
            ol.updateAppearances(font);
          }
        } catch (e) { console.warn(fld.name, e); toast(`Couldn’t create “${fld.name}”: ${friendlyError(e)}`, 'error'); }
      }
      progress(0.9, 'Saving…');
      const o = await pdfOutput(doc, ctx.outName, { updateFieldAppearances: false });
      return { outputs: [o], summary: `Added ${plural(fields.length, 'field')}`, detail: `${o.name} · ${fmtBytes(o.data.length)}` };
    };
  },
});
