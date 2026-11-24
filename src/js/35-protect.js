// ---------------------------------------------------------------------------
// Protect: encrypt a PDF with a password and optional permission flags.
// ---------------------------------------------------------------------------
defineTool({
  id: 'protect', name: 'Protect', icon: 'protect', group: 'organize', verb: 'protect', runLabel: 'Encrypt', runIcon: 'lock',
  desc: 'Set a password and optional restrictions so others need it to open or edit the PDF.',
  defaults: { printing: 'highResolution', modifying: false, copying: false, annotating: true, fillingForms: true, assembly: false },
  outName: f => baseName(f.name) + '-protected.pdf',
  mount(ctx) {
    const f = ctx.file, P = ctx.prefs;
    const userPw = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', 'aria-label': 'Open password', placeholder: 'Required to open' });
    const userPw2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', 'aria-label': 'Confirm open password', placeholder: 'Confirm open password' });
    const ownerPw = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', 'aria-label': 'Owner password', placeholder: 'Optional — defaults to open password' });
    const show = checkbox('Show passwords', false, v => { userPw.type = userPw2.type = ownerPw.type = v ? 'text' : 'password'; });
    ctx.work.append(
      h('div', { class: 'pages', style: 'max-width:720px' }, [...Array(Math.min(f.pages, 6)).keys()].map(i =>
        h('div', { class: 'pg', style: 'cursor:default' }, h('div', { class: 'thumb' }, thumbImg(f, i, 140)), h('span', { class: 'num', text: String(i + 1) })))),
      h('p', { class: 'help', style: 'color:var(--muted);max-width:720px', text: 'Encryption uses AES-256. Keep a copy of the password — The PDF Tool cannot recover it later.' }));
    ctx.side.append(
      h('h4', { text: 'Passwords' }),
      field('Password to open', userPw),
      field('Confirm', userPw2),
      field('Owner password', ownerPw, 'Needed to change permissions later. Leave blank to reuse the open password.'),
      show,
      h('h4', { text: 'Permissions for people who only know the open password' }),
      field('Printing', seg([['highResolution', 'High quality'], ['lowResolution', 'Low quality'], ['none', 'Not allowed']], P.printing === false ? 'none' : P.printing, v => { P.printing = v === 'none' ? false : v; ctx.save(); }, 'Printing')),
      checkbox('Allow copying text and images', P.copying, v => { P.copying = v; ctx.save(); }),
      checkbox('Allow modifying content', P.modifying, v => { P.modifying = v; ctx.save(); }),
      checkbox('Allow annotating and commenting', P.annotating, v => { P.annotating = v; ctx.save(); }),
      checkbox('Allow filling forms', P.fillingForms, v => { P.fillingForms = v; ctx.save(); }),
      checkbox('Allow assembling (insert/rotate/delete pages)', P.assembly, v => { P.assembly = v; ctx.save(); }),
      h('p', { class: 'note', text: f.encrypted ? 'This file was unlocked here; the saved copy will use the new password you set above.' : 'Anyone with the open password can view the PDF within the limits you set.' }));

    const validate = () => {
      const a = userPw.value, b = userPw2.value;
      if (!a) return ctx.setRunnable(false, 'Enter a password to open the PDF.');
      if (a.length < 4) return ctx.setRunnable(false, 'Use at least 4 characters.');
      if (a !== b) return ctx.setRunnable(false, 'Passwords don’t match.', true);
      ctx.setRunnable(true); ctx.setStatus('AES-256 encryption');
    };
    userPw.addEventListener('input', validate);
    userPw2.addEventListener('input', validate);
    validate();

    ctx.onRun = async progress => {
      progress(0.2, 'Encrypting…');
      const doc = await libDoc(f);
      const open = userPw.value;
      const owner = ownerPw.value || open;
      doc.encrypt({
        userPassword: open,
        ownerPassword: owner,
        permissions: {
          printing: P.printing === false ? false : P.printing,
          modifying: !!P.modifying,
          copying: !!P.copying,
          annotating: !!P.annotating,
          fillingForms: !!P.fillingForms,
          contentAccessibility: true,
          documentAssembly: !!P.assembly,
        },
      });
      progress(0.85, 'Saving…');
      const o = await pdfOutput(doc, ctx.outName);
      // Pass the open password so presentResult can add the file without re-prompting.
      return { outputs: [o], summary: 'Password protected', detail: `${o.name} · ${fmtBytes(o.data.length)} · AES-256`, password: open };
    };
  },
});
