// ---------------------------------------------------------------------------
// Fill form: type straight onto the page (or in the field list), then save —
// optionally flattened. Non-Latin answers stay correct via an image fallback.
// ---------------------------------------------------------------------------
defineTool({
  id: 'forms', name: 'Fill form', icon: 'form', group: 'read', verb: 'fill in', runLabel: 'Save filled PDF', runIcon: 'download',
  desc: 'Type straight into fillable PDF forms, then save — optionally flattened so answers can’t be changed.',
  defaults: { flatten: false },
  outName: f => baseName(f.name) + '-filled.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const loading = h('div', { class: 'empty' }, h('div', { class: 'spinner', style: 'margin:0 auto 10px' }), 'Reading form fields…');
    ctx.work.append(loading);
    ctx.setRunnable(false, 'Reading form…');
    (async () => {
      let doc, entries;
      try { doc = await libDoc(f); entries = collectEntries(doc); }
      catch (e) { console.error(e); loading.replaceWith(h('div', { class: 'empty', text: 'Couldn’t read this form: ' + friendlyError(e) })); return; }
      if (ctx.dead) return;
      loading.remove();
      const fillable = entries.filter(e => e.type !== 'other');
      const sigOnly = entries.filter(e => e.kind === 'signature');
      let isXfa = !!(f.pdf && f.pdf.isPureXfa);
      if (!fillable.length && !isXfa) {
        try { const meta = await f.pdf.getMetadata(); isXfa = !!(meta.info && meta.info.IsXFAPresent); } catch (e) { /* ok */ }
      }
      if (!fillable.length && isXfa) {
        // XFA: fill via pdf.js annotation storage, then saveDocument
        const st = pageStage(ctx, f, { annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS });
        ctx.work.append(st.el,
          h('p', { class: 'note', style: 'max-width:720px', text: 'This is an XFA form. Fill the fields on the page (pdf.js rendering), then save. Appearance depends on the form’s own scripts.' }));
        ctx.side.append(h('h4', { text: 'XFA form' }), h('p', { class: 'help', text: 'Type into the fields shown on the page. Complex XFA scripts may not all run in the browser.' }));
        ctx.setRunnable(true); ctx.setStatus('XFA form');
        st.show(0);
        ctx.onRun = async progress => {
          progress(0.5, 'Saving XFA form…');
          const data = await f.pdf.saveDocument();
          const o = { name: safeName(ctx.outName, 'pdf'), data: new Uint8Array(data), pdf: true };
          return { outputs: [o], summary: 'XFA form saved', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
        };
        return;
      }
      if (!fillable.length) {
        ctx.work.append(h('div', { class: 'pick' }, h('div', { class: 'drop' }, icon('form', 'i big'), h('strong', { text: sigOnly.length ? 'Only signature fields found' : 'This PDF has no fillable fields' }),
          h('p', { text: sigOnly.length ? 'Use Sign to place a visible stamp on those fields, and optionally seal with a .p12 certificate.' : 'You can still type on it: use Edit to add text anywhere, or Sign to add a signature. Or use Create form to add fields.' }),
          h('div', { class: 'row', style: 'justify-content:center' },
            sigOnly.length ? btn('Open Sign', () => go('sign'), { cls: 'primary', ic: 'sign' }) : btn('Type on it with Edit', () => go('edit'), { cls: 'primary', ic: 'edit' }),
            btn('Create form fields', () => go('formdesign'), { ic: 'design' }),
            sigOnly.length ? null : btn('Sign it', () => go('sign'), { ic: 'sign' })))));
        ctx.sec.classList.add('noside'); ctx.showRun(false);
        return;
      }
      const initial = new Map(fillable.map(e => [e, structuredClone(e.value)]));
      const st = pageStage(ctx, f, { annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS, onShow: () => drawOverlay() });
      ctx.work.append(st.el);
      const status = h('div', { class: 'help', style: 'margin-bottom:12px' });
      const list = h('div');
      ctx.side.append(h('h4', { text: 'Fields' }), status,
        checkbox('Flatten after filling', P.flatten, v => { P.flatten = v; ctx.save(); }, 'Answers become part of the page and can’t be edited later. Good for sending final copies.'),
        h('div', { class: 'row', style: 'margin-bottom:14px' }, btn('Clear all', () => { fillable.forEach(e => setValue(e, emptyOf(e))); }, { cls: 'sm ghost' }), btn('Undo my changes', () => { fillable.forEach(e => setValue(e, structuredClone(initial.get(e)))); }, { cls: 'sm ghost' })),
        list);

      function emptyOf(e) { return e.type === 'check' ? false : e.type === 'list' ? [] : ''; }
      function setValue(e, v, from) {
        e.value = v;
        e.controls.forEach(c => { if (c !== from) c.sync(); });
        counts();
      }
      function counts() {
        const filled = fillable.filter(e => Array.isArray(e.value) ? e.value.length : !!e.value).length;
        status.textContent = `${plural(fillable.length, 'field')} · ${filled} filled`;
        ctx.setRunnable(true);
        const changed = fillable.some(e => JSON.stringify(e.value) !== JSON.stringify(initial.get(e)));
        ctx.setStatus(changed ? 'Unsaved answers' : 'Click a field on the page and start typing.');
      }
      // control factory: where = 'page' | 'side'
      function control(e, wi, where, box) {
        const id = `fld-${where}-${e.idx}-${wi}`;
        let el, sync;
        const ro = e.readOnly;
        if (e.type === 'text') {
          el = e.multiline ? h('textarea', { id, rows: where === 'side' ? 3 : null }) : h('input', { id, type: 'text' });
          if (e.maxLen) el.maxLength = e.maxLen;
          el.addEventListener('input', () => setValue(e, el.value, ctl));
          sync = () => { if (el.value !== e.value) el.value = e.value; };
        } else if (e.type === 'check') {
          el = h('input', { id, type: 'checkbox' });
          el.addEventListener('change', () => setValue(e, el.checked, ctl));
          sync = () => { el.checked = !!e.value; };
        } else if (e.type === 'radio' && where === 'page') {
          el = h('input', { id, type: 'radio', name: `r-${e.idx}` });
          const opt = e.widgets[wi].option;
          el.addEventListener('change', () => { if (el.checked) setValue(e, opt, ctl); });
          el.addEventListener('click', () => { if (e.value === opt && e.allowOff) { el.checked = false; setValue(e, '', ctl); } });
          sync = () => { el.checked = e.value === opt; };
        } else if (e.type === 'radio' || e.type === 'choice' || e.type === 'list') {
          const opts = e.type === 'radio' ? [...new Set(e.widgets.map(w => w.option))] : e.options;
          el = h('select', { id, multiple: e.type === 'list' });
          if (e.type !== 'list') el.append(h('option', { value: '' }, '—'));
          opts.forEach(o => el.append(h('option', { value: o }, o)));
          el.addEventListener('change', () => setValue(e, e.type === 'list' ? [...el.selectedOptions].map(o => o.value) : el.value, ctl));
          sync = () => { if (e.type === 'list') [...el.options].forEach(o => { o.selected = e.value.includes(o.value); }); else el.value = e.value || ''; };
        }
        if (!el) return null;
        el.disabled = ro;
        el.title = e.label + (ro ? ' (read-only)' : '');
        if (where === 'page') {
          el.classList.add('fieldov');
          el.setAttribute('aria-label', e.label);
          const s = st.scale;
          Object.assign(el.style, { left: box.u * s + 'px', top: box.v * s + 'px', width: box.w * s + 'px', height: box.h * s + 'px' });
          if (e.type === 'list') el.style.fontSize = clamp(11 * s, 9, 15) + 'px';
          if (e.type === 'text' || e.type === 'choice') el.style.fontSize = clamp(e.multiline ? 12 * s : box.h * s * 0.62, 9, 18) + 'px';
          if (e.type === 'check' || e.type === 'radio') { const sz = Math.max(14, Math.min(box.w, box.h) * s); Object.assign(el.style, { width: sz + 'px', height: sz + 'px', left: (box.u + box.w / 2) * s - sz / 2 + 'px', top: (box.v + box.h / 2) * s - sz / 2 + 'px' }); }
        } else el.classList.add('inp');
        const ctl = { el, sync, where }; e.controls.add(ctl); sync();
        return el;
      }
      function drawOverlay() {
        fillable.forEach(e => e.controls.forEach(c => { if (c.where === 'page') e.controls.delete(c); }));
        st.layer.replaceChildren();
        fillable.forEach(e => e.widgets.forEach((w, wi) => {
          if (w.page !== st.cur) return;
          const el = control(e, wi, 'page', w.box);
          if (el) st.layer.append(el);
        }));
      }
      // side list grouped by page
      let lastPage = -1;
      fillable.slice().sort((a, b) => a.firstPage - b.firstPage).forEach(e => {
        if (e.firstPage !== lastPage) { lastPage = e.firstPage; list.append(h('div', { style: 'font-size:12px;color:var(--muted);margin:14px 0 6px;font-weight:600', text: `Page ${e.firstPage + 1}` })); }
        const c = control(e, 0, 'side');
        const jump = h('button', { type: 'button', class: 'btn sm ghost icon', title: 'Show on page', 'aria-label': `Show ${e.label} on the page`, onclick: async () => { await st.show(e.firstPage); const t = $(`#fld-page-${e.idx}-0`); t && t.focus(); } }, icon('search'));
        if (e.type === 'check') list.append(h('div', { class: 'row', style: 'margin-bottom:8px;flex-wrap:nowrap' }, h('label', { class: 'check', style: 'margin:0;flex:1' }, c, h('span', { text: e.label })), jump));
        else list.append(h('div', { class: 'field', style: 'margin-bottom:10px' }, h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:nowrap' }, h('label', { for: c.id, text: e.label, style: 'font-size:13px;font-weight:600' }), jump), c));
      });
      const sigs = entries.filter(e => e.type === 'other' && e.kind === 'signature');
      if (sigs.length) list.append(
        h('p', { class: 'note', text: `${plural(sigs.length, 'signature field')} found.` }),
        btn('Open Sign for signature fields', () => go('sign'), { cls: 'sm', ic: 'sign', style: 'margin-bottom:12px' }));
      counts();
      st.show(fillable[0].firstPage);

      ctx.onRun = async progress => {
        const out = await libDoc(f);
        const outEntries = collectEntries(out);
        const font = await out.embedFont(StandardFonts.Helvetica);
        const fallback = [];
        outEntries.forEach((oe, i) => {
          const e = entries[i];
          if (!e || e.type === 'other' || e.readOnly) return;
          const fld = oe.field;
          try {
            if (e.type === 'text') {
              let v = String(e.value || '');
              if (oe.maxLen && v.length > oe.maxLen) v = v.slice(0, oe.maxLen);
              if (v && !canEncode(font, v)) { fallback.push({ oe, v }); fld.setText(''); } else fld.setText(v);
            } else if (e.type === 'check') e.value ? fld.check() : fld.uncheck();
            else if (e.type === 'radio') {
              if (!e.value) fld.clear();
              else { const wi = oe.widgets.findIndex(w => w.option === e.value); const on = fld.acroField.getOnValues()[wi]; if (on) fld.acroField.setValue(on); }
            } else if (e.type === 'choice') { if (e.value) fld.select(e.value, fld.isEditable && fld.isEditable()); else fld.clear(); }
            else if (e.type === 'list') { if (e.value.length) fld.select(e.value); else fld.clear(); }
          } catch (err) { console.warn('field', e.name, err); }
        });
        progress(0.5, 'Updating appearances…');
        for (const oe of outEntries) {
          if (oe.type === 'other') continue;
          try { (oe.type === 'check' || oe.type === 'radio') ? oe.field.updateAppearances() : oe.field.updateAppearances(font); }
          catch (err) { console.warn('appearance', oe.name, err); }
        }
        const form = out.getForm();
        if (P.flatten) {
          form.flatten({ updateFieldAppearances: false });
          for (const { oe, v } of fallback) for (const w of oe.widgets) {
            const page = out.getPage(w.page);
            const size = oe.multiline ? 11 : clamp(w.box.h * 0.62, 6, 14);
            await drawTextVisual(out, page, oe.multiline ? v : v.replace(/\n/g, ' '), { u: w.box.u + 2, v: w.box.v + (oe.multiline ? 2 : (w.box.h - size * 1.2) / 2), size, family: 'Helvetica', color: '#000000' });
          }
        } else if (fallback.length) {
          for (const { oe, v } of fallback) { oe.field.acroField.setValue(PDFHexString.fromText(v)); oe.field.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP'))); }
          form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
        }
        progress(0.9, 'Saving…');
        const o = await pdfOutput(out, ctx.outName, { updateFieldAppearances: false });
        return { outputs: [o], summary: P.flatten ? 'Form filled and flattened' : 'Form filled', detail: `${o.name} · ${fmtBytes(o.data.length)}` };
      };
    })();
  },
});

function collectEntries(doc) {
  const L = PDFLib, form = doc.getForm(), pages = doc.getPages();
  const annotPage = new Map();
  pages.forEach((p, i) => { const a = p.node.Annots(); if (a) for (let k = 0; k < a.size(); k++) { const o = doc.context.lookup(a.get(k)); if (o) annotPage.set(o, i); } });
  return form.getFields().map((field, idx) => {
    const name = field.getName();
    const tu = field.acroField.dict.lookup(PDFName.of('TU'));
    const label = (tu && tu.decodeText && tu.decodeText()) || name.split('.').pop().replace(/[_-]+/g, ' ');
    let type = 'other', kind = '', value = '', options = [], multiline = false, maxLen = 0, allowOff = true;
    if (field instanceof L.PDFTextField) { type = 'text'; value = field.getText() || ''; multiline = field.isMultiline(); maxLen = field.getMaxLength() || 0; }
    else if (field instanceof L.PDFCheckBox) { type = 'check'; value = field.isChecked(); }
    else if (field instanceof L.PDFRadioGroup) { type = 'radio'; value = field.getSelected() || ''; allowOff = !field.isOffToggleable || field.isOffToggleable(); }
    else if (field instanceof L.PDFDropdown) { type = 'choice'; options = field.getOptions(); value = field.getSelected()[0] || ''; }
    else if (field instanceof L.PDFOptionList) { type = 'list'; options = field.getOptions(); value = field.getSelected(); }
    else if (field instanceof L.PDFSignature) kind = 'signature';
    const radioOpts = type === 'radio' ? field.getOptions() : [];
    const widgets = field.acroField.getWidgets().map((w, wi) => {
      let page = annotPage.get(w.dict);
      if (page == null) { const pr = w.P(); page = pr ? pages.findIndex(p => p.ref === pr || String(p.ref) === String(pr)) : -1; }
      if (page == null || page < 0) return null;
      const box = pageGeom(pages[page]).rectToVisual(w.getRectangle());
      return { page, box, option: radioOpts[wi] };
    }).filter(Boolean);
    return { idx, field, name, label, type, kind, value, options, multiline, maxLen, allowOff, widgets, firstPage: widgets.length ? widgets[0].page : 0, readOnly: field.isReadOnly(), controls: new Set() };
  }).filter(e => e.widgets.length || e.type === 'other');
}
