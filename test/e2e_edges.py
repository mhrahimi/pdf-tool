"""High-value edge cases not covered by e2e.py / e2e_extra.py."""
import os, sys, time, zipfile, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from smoke import start, S, OUT
from e2e_helpers import *
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

    # ---- owner-only encrypted PDF (empty user password) should open without a prompt
    page.set_input_files('.home .drop input[type=file]', [S('owner-locked.pdf')])
    page.wait_for_selector('.vpage canvas', timeout=20000)
    time.sleep(0.5)
    ok('owner-locked: opens without password dialog',
       page.locator('dialog:visible').count() == 0 and 'owner-locked.pdf' in page.inner_text('#tool-title'),
       page.inner_text('#tool-title'))

    # ---- merge: invalid range disables Run; blankOdd pads odd file
    page.evaluate("location.hash='home'"); time.sleep(0.3)
    page.set_input_files('.home .drop input[type=file]', [S('report.pdf')])
    page.wait_for_selector('.vpage canvas', timeout=20000)
    tool(page, 'merge')
    with page.expect_file_chooser() as fc:
        page.click('.toolbar .btn:has-text("Add files")')
    fc.value.set_files([S('form.pdf')])
    page.wait_for_function("document.querySelectorAll('.frow').length >= 2", timeout=20000)
    # keep only report + form
    names = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)')
    for n in list(names):
        if n not in ('report.pdf', 'form.pdf'):
            idx = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)').index(n)
            page.locator('.frow').nth(idx).locator('button[title=Remove]').click(); time.sleep(0.1)
    names = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)')
    ri = names.index('report.pdf')
    page.locator('.frow').nth(ri).locator('input.inp').fill('99')
    page.locator('.frow').nth(ri).locator('input.inp').dispatch_event('input')
    time.sleep(0.3)
    ok('merge: invalid range disables Run', page.locator('.runbar .btn.primary').is_disabled())
    page.locator('.frow').nth(ri).locator('input.inp').fill('1')
    page.locator('.frow').nth(ri).locator('input.inp').dispatch_event('input')
    time.sleep(0.2)
    page.click('.side label.check:has-text("blank page after files with an odd page count") input')
    # report contributes 1 page (odd → +blank), form has 1 page (odd → +blank) → 4 pages
    path, _ = run_and_download(page, 'merge-blankodd.pdf')
    ok('merge: blankOdd pads odd files', pages_of(path) == 4, pages_of(path))
    good, msg = qcheck(path); ok('merge blankOdd: qpdf check', good, msg[-80:])

    # ---- split: after specific pages
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    tool(page, 'split')
    page.check('input[name=mode][value=after]')
    page.fill('.choice:has(input[value=after]) input.inp', '3, 7')
    page.dispatch_event('.choice:has(input[value=after]) input.inp', 'input')
    time.sleep(0.4)
    preview = page.inner_text('.preview-list')
    ok('split after: preview has 3 parts', page.locator('.preview-list li').count() == 3, preview.replace('\n', ' | ')[:160])
    page.click('.runbar .btn.primary'); page.wait_for_selector('.result:not([hidden])', timeout=60000)
    with page.expect_download() as d:
        page.click('.result .acts .btn.primary')
    zp = os.path.join(OUT, 'split-after.zip'); d.value.save_as(zp)
    z = zipfile.ZipFile(zp)
    ok('split after: zip has 3 PDFs', len(z.namelist()) == 3, z.namelist())
    # pages should be 1-3, 4-7, 8-12
    sizes = []
    for name in sorted(z.namelist()):
        z.extract(name, OUT)
        sizes.append(pages_of(os.path.join(OUT, name)))
    ok('split after: page groups 3/4/5', sizes == [3, 4, 5], sizes)

    # ---- split: by page ranges
    page.check('input[name=mode][value=ranges]')
    page.fill('.choice:has(input[value=ranges]) input.inp', '1-2, 5-6, 11-')
    page.dispatch_event('.choice:has(input[value=ranges]) input.inp', 'input')
    time.sleep(0.4)
    ok('split ranges: preview has 3 parts', page.locator('.preview-list li').count() == 3, page.inner_text('.preview-list').replace('\n', ' | ')[:160])
    page.click('.runbar .btn.primary'); page.wait_for_selector('.result:not([hidden])', timeout=60000)
    with page.expect_download() as d:
        page.click('.result .acts .btn.primary')
    zp = os.path.join(OUT, 'split-ranges.zip'); d.value.save_as(zp)
    z = zipfile.ZipFile(zp)
    ok('split ranges: zip has 3 PDFs', len(z.namelist()) == 3, z.namelist())
    rsizes = []
    for name in sorted(z.namelist()):
        z.extract(name, OUT)
        rsizes.append(pages_of(os.path.join(OUT, name)))
    ok('split ranges: page groups 2/2/2', rsizes == [2, 2, 2], rsizes)

    # ---- watermark: image logo
    tool(page, 'watermark')
    page.click('.side .seg button[data-v=image]')
    time.sleep(0.3)
    with page.expect_file_chooser() as fc:
        page.click('.side .btn:has-text("Choose image")')
    fc.value.set_files([S('logo.png')])
    page.wait_for_function("document.getElementById('logoname') && document.getElementById('logoname').textContent.includes('logo')", timeout=10000)
    path, _ = run_and_download(page, 'wm-logo.pdf')
    good, msg = qcheck(path); ok('watermark image: valid PDF', good, msg[-80:])
    imgs = subprocess.run(['pdfimages', '-list', path], capture_output=True, text=True).stdout
    # logo should appear as an image XObject on pages
    img_lines = [l for l in imgs.splitlines()[2:] if l.strip()]
    ok('watermark image: embedded on pages', len(img_lines) >= 12, len(img_lines))
    subprocess.run(['pdftoppm', '-r', '40', '-f', '1', '-l', '1', '-png', path, f'{OUT}/wm-logo-p1'])

    ok('no page errors', not [e for e in errs if 'PAGEERROR' in e], [e for e in errs if 'PAGEERROR' in e][:3])
    b.close()

msg, fails = summary()
print(msg)
sys.exit(1 if fails else 0)
