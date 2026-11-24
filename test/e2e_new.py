"""Coverage for recently added tools: protect, hard crop, redact, export, compare, form design, PKCS#7, print smoke."""
import os, sys, time, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from smoke import start, S, OUT
from e2e_helpers import ok, summary, tool, run_and_download, qcheck
from playwright.sync_api import sync_playwright
import pypdf

def pages_of(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    for l in out.splitlines():
        if l.startswith('Pages:'): return int(l.split()[1])

def text_of(path, first=1, last=1):
    return subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-layout', path, '-'], capture_output=True, text=True).stdout

with sync_playwright() as p:
    b, page, errs = start(p)
    page.set_input_files('.home .drop input[type=file]', [S('report.pdf')])
    page.wait_for_selector('.vpage canvas', timeout=20000)

    # ---------------- Protect
    tool(page, 'protect')
    page.fill('.side input[aria-label="Open password"]', 'gate-secret')
    page.fill('.side input[aria-label="Confirm open password"]', 'gate-secret')
    page.dispatch_event('.side input[aria-label="Open password"]', 'input')
    page.dispatch_event('.side input[aria-label="Confirm open password"]', 'input')
    time.sleep(0.2)
    path, _ = run_and_download(page, 'protected.pdf')
    enc = subprocess.run(['qpdf', '--show-encryption', path], capture_output=True, text=True)
    enc_txt = enc.stdout + enc.stderr
    ok('protect: output is encrypted', 'encrypt' in enc_txt.lower() or 'R = 6' in enc_txt or 'R = 5' in enc_txt, enc_txt[-200:])
    good = subprocess.run(['qpdf', '--password=gate-secret', '--check', path], capture_output=True, text=True)
    ok('protect: opens with user password', good.returncode in (0, 3), (good.stdout + good.stderr)[-120:])
    bad = subprocess.run(['qpdf', '--password=wrong', '--check', path], capture_output=True, text=True)
    ok('protect: wrong password fails', bad.returncode not in (0, 3), (bad.stdout + bad.stderr)[-120:])

    # ---------------- Hard crop
    page.evaluate("location.hash='home'"); time.sleep(0.2)
    tool(page, 'crop')
    with page.expect_file_chooser() as fc:
        page.click('.filebar .btn:has-text("Change file")'); page.click('.menu button:has-text("Open another PDF")')
    fc.value.set_files([S('scan.pdf')]); time.sleep(1.5)
    page.click('.btn:has-text("Detect content")'); time.sleep(1.2)
    page.check('input[name=hard][value=true]'); time.sleep(0.2)
    page.screenshot(path=f'{OUT}/hard-crop.png')
    soft_ref = pypdf.PdfReader(S('scan.pdf')).pages[0]
    soft_w = float(soft_ref.mediabox.width)
    path, detail = run_and_download(page, 'hard-cropped.pdf', timeout=120000)
    good, msg = qcheck(path); ok('hard crop: valid PDF', good, msg[-80:])
    r = pypdf.PdfReader(path)
    mb = r.pages[0].mediabox
    ok('hard crop: media box shrunk', float(mb.width) < soft_w * 0.95, (float(mb.width), soft_w))
    # hard crop burns to image — little/no selectable text left
    t = text_of(path, 1, 1).strip()
    ok('hard crop: text not selectable (rasterized)', len(t) < 20, repr(t[:40]))

    # ---------------- Redact
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    tool(page, 'edit')
    time.sleep(0.8)
    page.click('.toolgrid button[data-m=redact]')
    st = page.locator('.stage').bounding_box()
    # Cover a band of body text on page 1
    page.mouse.move(st['x'] + 50, st['y'] + 180)
    page.mouse.down()
    page.mouse.move(st['x'] + st['width'] - 50, st['y'] + 230, steps=8)
    page.mouse.up()
    time.sleep(0.3)
    page.screenshot(path=f'{OUT}/redact.png')
    before = text_of(S('report.pdf'), 1, 1)
    path, _ = run_and_download(page, 'redacted.pdf', timeout=120000)
    good, msg = qcheck(path); ok('redact: valid PDF', good, msg[-80:])
    after = text_of(path, 1, 1)
    # Burned page: either text gone or substantially shorter / no "quick brown"
    ok('redact: burned content removed from text layer',
       'quick brown' not in after.lower() or len(after) < len(before) * 0.5,
       (len(before), len(after), after[:80]))

    # ---------------- Export MD + HTML
    tool(page, 'export')
    page.check('input[name=fmt][value=md]')
    page.fill('.side input.inp[placeholder="All pages"]', '1-2')
    page.dispatch_event('.side input.inp[placeholder="All pages"]', 'input')
    path, _ = run_and_download(page, 'report.md')
    md = open(path, encoding='utf-8').read()
    ok('export md: has heading and page text', '# report' in md.lower() and '## Page 1' in md and 'Introduction' in md, md[:200])
    page.check('input[name=fmt][value=html]')
    path, _ = run_and_download(page, 'report.html')
    html = open(path, encoding='utf-8').read()
    ok('export html: valid document with pages', '<!DOCTYPE html>' in html and 'Page 1' in html and 'Introduction' in html, html[:160])

    # ---------------- Compare
    tool(page, 'compare')
    with page.expect_file_chooser() as fc:
        page.click('.side .btn:has-text("Choose left PDF")')
    fc.value.set_files([S('report.pdf')])
    time.sleep(0.5)
    with page.expect_file_chooser() as fc:
        page.click('.side .btn:has-text("Choose right PDF")')
    fc.value.set_files([S('form.pdf')])
    page.wait_for_selector('.compare-wrap canvas, .compare-diff canvas', timeout=30000)
    time.sleep(0.8)
    page.screenshot(path=f'{OUT}/compare.png')
    ok('compare: renders diff canvas', page.locator('.compare-wrap canvas, .compare-diff canvas').count() >= 1)
    page.click('.side .seg button[data-v=side]'); time.sleep(0.8)
    ok('compare: side-by-side mode', page.locator('.compare-pane').count() == 2, page.locator('.compare-pane').count())
    page.click('.side .seg button[data-v=onion]'); time.sleep(0.8)
    ok('compare: onion mode canvas', page.locator('.compare-wrap canvas, .compare-diff canvas').count() >= 1)

    # ---------------- Create form
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    tool(page, 'formdesign')
    time.sleep(0.8)
    if page.locator('.side .seg button[data-v=text]').count():
        page.click('.side .seg button[data-v=text]')
    page.fill('.side input[aria-label="Field name"]', 'e2e_field')
    page.dispatch_event('.side input[aria-label="Field name"]', 'input')
    st = page.locator('.stage').bounding_box()
    page.mouse.move(st['x'] + 80, st['y'] + 120)
    page.mouse.down()
    page.mouse.move(st['x'] + 280, st['y'] + 150, steps=6)
    page.mouse.up()
    time.sleep(0.4)
    page.screenshot(path=f'{OUT}/formdesign.png')
    path, _ = run_and_download(page, 'with-field.pdf')
    good, msg = qcheck(path); ok('formdesign: valid PDF', good, msg[-80:])
    fields = pypdf.PdfReader(path).get_fields() or {}
    ok('formdesign: created text field', 'e2e_field' in fields, list(fields.keys())[:8])

    # ---------------- PKCS#7 digital sign
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    page.evaluate("localStorage.removeItem('folio:sigs')")
    tool(page, 'sign')
    # Enable digital + load cert (digital-only seal OK without visible stamp)
    page.locator('.side .check').filter(has_text='certificate').locator('input').check()
    time.sleep(0.3)
    with page.expect_file_chooser() as fc:
        page.click('.side .btn:has-text("Load .p12")')
    fc.value.set_files([S('signer.p12')])
    page.wait_for_function("document.querySelector('.side') && document.querySelector('.side').innerText.includes('signer.p12')", timeout=10000)
    page.fill('.side input[aria-label="Certificate password"]', 'testpass')
    page.dispatch_event('.side input[aria-label="Certificate password"]', 'input')
    time.sleep(0.2)
    page.screenshot(path=f'{OUT}/pkcs7.png')
    path, detail = run_and_download(page, 'digitally-signed.pdf', timeout=120000)
    good, msg = qcheck(path); ok('pkcs7: valid PDF', good, msg[-120:])
    # ByteRange / Contents markers indicate a signature dictionary was embedded
    raw = open(path, 'rb').read()
    ok('pkcs7: signature dictionary present', b'/Type /Sig' in raw or b'/ByteRange' in raw, detail[:120])
    ok('pkcs7: still 12 pages', pages_of(path) == 12, pages_of(path))

    # ---------------- Print smoke (popup may be blocked; PDF still produced)
    tool(page, 'print')
    page.fill('.side input.inp[placeholder="All pages"]', '1')
    page.dispatch_event('.side input.inp[placeholder="All pages"]', 'input')
    time.sleep(0.2)
    # Close any print popup that appears
    def on_popup(pop):
        try:
            pop.close()
        except Exception:
            pass
    page.context.on('page', on_popup)
    path, detail = run_and_download(page, 'print-ready.pdf', timeout=120000)
    good, msg = qcheck(path); ok('print: print-ready PDF valid', good, msg[-80:])
    ok('print: one page rendered', pages_of(path) == 1, pages_of(path))

    pe = [e for e in errs if 'PAGEERROR' in e]
    ok('no page errors', not pe, pe[:5])
    b.close()

msg, fails = summary()
print(msg)
sys.exit(1 if fails else 0)
