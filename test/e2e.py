"""End-to-end test of every Folio tool in headless Chrome. Saves outputs to test/out/."""
import os, sys, time, json, zipfile, subprocess
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from smoke import start, S, OUT, URL

RESULTS = []
def ok(name, cond, info=''):
    RESULTS.append((name, bool(cond), info)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(info) if info else ''), flush=True)

def tool(page, tid):
    page.evaluate(f"location.hash = '{tid}'")
    page.wait_for_selector('#tool-title', timeout=10000)
    time.sleep(0.4)

def run_and_download(page, name, timeout=60000):
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=timeout)
    time.sleep(0.3)
    btn = page.locator('.result .acts .btn').first
    if 'Download' not in btn.inner_text():
        return None, page.inner_text('.result')
    with page.expect_download(timeout=timeout) as d:
        btn.click()
    path = os.path.join(OUT, name)
    d.value.save_as(path)
    return path, page.inner_text('.result')

def pdfinfo(path):
    return subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout

def pages_of(path):
    for l in pdfinfo(path).splitlines():
        if l.startswith('Pages:'): return int(l.split()[1])

def text_of(path, first=1, last=1):
    return subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-layout', path, '-'], capture_output=True, text=True).stdout

def qcheck(path):
    r = subprocess.run(['qpdf', '--check', path], capture_output=True, text=True)
    return r.returncode in (0, 3), r.stdout[-300:] + r.stderr[-300:]

def open_in_picker(page, files):
    page.set_input_files('.pick .drop input[type=file]', files)
    page.wait_for_selector('.filebar', timeout=20000)
    time.sleep(0.5)

with sync_playwright() as p:
    b, page, errs = start(p)

    # ---------------- viewer: encodings + details
    page.set_input_files('.home .drop input[type=file]', [S('encodings.pdf')])
    page.wait_for_selector('.vpage canvas', timeout=20000); time.sleep(1.5)
    page.screenshot(path=f'{OUT}/v-encodings.png')
    tl = page.inner_text('.vpage .textLayer')
    ok('viewer: CJK text layer (Japanese)', 'こんにちは世界' in tl, tl[:80].replace('\n', ' '))
    ok('viewer: CJK text layer (Korean/Chinese)', '안녕하세요' in tl and '你好' in tl)
    page.click('.tabs button[data-t=info]'); page.wait_for_selector('table.fonts', timeout=15000); time.sleep(0.3)
    ft = page.inner_text('table.fonts')
    ok('viewer: font table shows CMaps', 'UniJIS-UCS2-H' in ft and 'Adobe-Japan1' in ft, ft[:200].replace('\n', ' | '))
    page.screenshot(path=f'{OUT}/v-details.png')

    # password-protected
    page.evaluate("location.hash='home'"); time.sleep(0.3)
    page.set_input_files('.home .drop input[type=file]', [S('locked.pdf')])
    page.wait_for_selector('dialog input[type=password]', timeout=15000)
    page.fill('dialog input[type=password]', 'wrong'); page.keyboard.press('Enter')
    page.wait_for_selector('dialog p:has-text("didn’t work")', timeout=15000)
    page.fill('dialog input[type=password]', 'secret'); page.keyboard.press('Enter')
    page.wait_for_selector('.vpage canvas', timeout=20000); time.sleep(0.5)
    ok('viewer: opens password PDF after retry', 'locked.pdf' in page.inner_text('#tool-title'))

    # search
    page.evaluate("location.hash='home'"); time.sleep(0.3)
    page.set_input_files('.home .drop input[type=file]', [S('report.pdf')])
    page.wait_for_selector('.vpage canvas', timeout=20000); time.sleep(0.5)
    page.click('.tabs button[data-t=search]'); page.fill('.tabpanel input[type=search]', 'Methods'); page.keyboard.press('Enter')
    page.wait_for_selector('.hits li', timeout=15000)
    ok('viewer: search finds matches', page.locator('.hits li').count() >= 3, page.locator('.hits li').count())
    page.click('.tabs button[data-t=outline]'); page.wait_for_selector('.tabpanel .outline', timeout=10000)
    ok('viewer: bookmarks listed', 'Results' in page.inner_text('.tabpanel'))
    page.screenshot(path=f'{OUT}/v-report.png')

    # ---------------- merge
    tool(page, 'merge')
    with page.expect_file_chooser() as fc: page.click('.toolbar .btn:has-text("Add files")')
    fc.value.set_files([S('form.pdf'), S('photo1.jpg')])
    page.wait_for_function("document.querySelectorAll('.frow').length >= 4", timeout=20000)
    # remove everything except report.pdf, form.pdf, photo1.jpg
    names = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)')
    for n in list(names):
        if n not in ('report.pdf', 'form.pdf', 'photo1.jpg'):
            idx = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)').index(n)
            page.locator('.frow').nth(idx).locator('button[title=Remove]').click(); time.sleep(0.1)
    names = page.eval_on_selector_all('.frow .meta b', 'els => els.map(e => e.textContent)')
    ri = names.index('report.pdf')
    page.locator('.frow').nth(ri).locator('input.inp').fill('1-3, last')
    page.locator('.frow').nth(ri).locator('input.inp').dispatch_event('input')
    page.screenshot(path=f'{OUT}/merge.png')
    path, txt = run_and_download(page, 'merged.pdf')
    n = pages_of(path)
    ok('merge: page count (4 + 2 + 1)', n == 7, n)
    good, msg = qcheck(path); ok('merge: qpdf check', good, msg)
    import pypdf
    r = pypdf.PdfReader(path)
    ok('merge: bookmarks per file (+ nested originals)', len([o for o in r.outline if not isinstance(o, list)]) == 3 and any(isinstance(o, list) for o in r.outline), [o.title if hasattr(o, 'title') else type(o).__name__ for o in r.outline])
    fields = r.get_fields() or {}
    ok('merge: form fields kept fillable', 'full_name' in fields, list(fields)[:6])

    # ---------------- split
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    tool(page, 'split')
    page.check('input[name=mode][value=n]'); page.fill('.choice input[type=number]', '5'); page.dispatch_event('.choice input[type=number]', 'input')
    ok('split: preview lists 3 files', page.locator('.preview-list li').count() == 3, page.inner_text('.preview-list'))
    page.screenshot(path=f'{OUT}/split.png')
    page.click('.runbar .btn.primary'); page.wait_for_selector('.result:not([hidden])', timeout=60000)
    with page.expect_download() as d: page.click('.result .acts .btn.primary')
    zp = os.path.join(OUT, 'split.zip'); d.value.save_as(zp)
    z = zipfile.ZipFile(zp); ok('split: zip with 3 PDFs', len(z.namelist()) == 3, z.namelist())
    # bookmarks mode
    page.check('input[name=mode][value=bookmarks]'); time.sleep(0.3)
    ok('split: by bookmarks → 4 files', page.locator('.preview-list li').count() == 4, page.inner_text('.preview-list').replace('\n', ' | ')[:200])
    # extract
    page.check('input[name=mode][value=extract]')
    page.fill('.choice:has(input[value=extract]) input.inp', '2, 4'); page.dispatch_event('.choice:has(input[value=extract]) input.inp', 'input')
    path, _ = run_and_download(page, 'extract.pdf')
    ok('split: extract 2 pages', pages_of(path) == 2 and 'part 2' in text_of(path, 1, 1), text_of(path, 1, 1)[:60].strip())

    # ---------------- organize
    tool(page, 'organize')
    page.locator('.pages .pg').nth(0).click()
    page.click('button[title="Rotate right"]')
    page.locator('.pages .pg').nth(1).click()
    page.click('.toolbar .btn:has-text("Delete")')
    page.click('.toolbar .btn:has-text("Blank page")'); time.sleep(0.3)
    page.screenshot(path=f'{OUT}/organize.png')
    path, _ = run_and_download(page, 'organized.pdf')
    r = pypdf.PdfReader(path)
    ok('organize: 12 pages (−1 +1)', len(r.pages) == 12, len(r.pages))
    ok('organize: first page rotated 90', (r.pages[0].get('/Rotate') or 0) == 90, r.pages[0].get('/Rotate'))
    ok('organize: page 2 is old page 3', 'part 3' in text_of(path, 2, 2))
    ok('organize: blank page added at the end', text_of(path, 12, 12).strip() == '', repr(text_of(path, 12, 12)[:40]))

    # ---------------- crop (auto detect on scan)
    page.evaluate("location.hash='home'"); time.sleep(0.2)
    tool(page, 'crop')
    with page.expect_file_chooser() as fc: page.click('.filebar .btn:has-text("Change file")'); page.click('.menu button:has-text("Open another PDF")')
    fc.value.set_files([S('scan.pdf')]); time.sleep(1.5)
    page.click('.btn:has-text("Detect content")'); time.sleep(1.2)
    page.screenshot(path=f'{OUT}/crop.png')
    path, _ = run_and_download(page, 'cropped.pdf')
    r = pypdf.PdfReader(path); cb = r.pages[0].cropbox
    ok('crop: crop box shrunk to content', float(cb.width) < 400 and float(cb.height) < 560, (float(cb.left), float(cb.bottom), float(cb.width), float(cb.height)))

    # ---------------- compress
    page.evaluate("location.hash='home'"); time.sleep(0.2)
    page.set_input_files('.home .drop input[type=file]', [S('photos.pdf')]); page.wait_for_selector('.vpage canvas', timeout=20000)
    tool(page, 'compress')
    page.check('input[name=level][value=balanced]')
    path, txt = run_and_download(page, 'compressed.pdf', timeout=120000)
    sz = os.path.getsize(path); orig = os.path.getsize(S('photos.pdf'))
    ok('compress: balanced makes it smaller', sz < orig * 0.6, f'{orig} -> {sz} ({txt.splitlines()[0] if txt else ""})')
    good, msg = qcheck(path); ok('compress: qpdf check', good, msg)
    ok('compress: still 4 pages, text intact', pages_of(path) == 4 and 'photo1.jpg' in text_of(path, 1, 1))
    subprocess.run(['pdftoppm', '-r', '40', '-f', '4', '-l', '4', '-png', path, f'{OUT}/compressed-p4'])
    page.check('input[name=level][value=lossless]')
    page.click('.runbar .btn.primary'); page.wait_for_selector('.result:not([hidden])', timeout=60000); time.sleep(0.3)
    ok('compress: lossless reports result', len(page.inner_text('.result')) > 5, page.inner_text('.result').replace('\n', ' ')[:120])

    # ---------------- pdf -> image
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    tool(page, 'toimage')
    page.fill('.side input.inp[placeholder="All pages"]', '1-2'); page.dispatch_event('.side input.inp[placeholder="All pages"]', 'input')
    page.click('.seg button[data-v="72"]')
    page.click('.runbar .btn.primary'); page.wait_for_selector('.result:not([hidden])', timeout=60000)
    with page.expect_download() as d: page.click('.result .acts .btn.primary')
    zp = os.path.join(OUT, 'images.zip'); d.value.save_as(zp)
    z = zipfile.ZipFile(zp); ok('toimage: 2 PNGs', len(z.namelist()) == 2 and all(n.endswith('.png') for n in z.namelist()), z.namelist())

    # ---------------- image -> pdf
    tool(page, 'fromimage')
    page.click('.toolbar .btn:has-text("Clear")')
    with page.expect_file_chooser() as fc: page.click('.toolbar .btn:has-text("Add images")')
    fc.value.set_files([S('photo2.jpg'), S('logo.png'), S('small.webp')])
    page.wait_for_function("document.querySelectorAll('.frow').length === 3", timeout=20000)
    page.locator('.frow').nth(0).locator('button[title="Rotate right"]').click()
    page.screenshot(path=f'{OUT}/fromimage.png')
    path, _ = run_and_download(page, 'images.pdf')
    r = pypdf.PdfReader(path)
    ok('fromimage: 3 pages', len(r.pages) == 3, len(r.pages))
    w, hgt = float(r.pages[0].mediabox.width), float(r.pages[0].mediabox.height)
    ok('fromimage: rotated portrait photo → landscape A4 page', w > hgt, (w, hgt))

    # ---------------- sign (typed)
    page.evaluate("folio.store.current = folio.store.files.find(f => f.name === 'report.pdf').id")
    page.evaluate("localStorage.removeItem('folio:sigs')")
    tool(page, 'sign')
    page.click('.side .btn:has-text("Create signature")')
    page.click('dialog .seg button[data-v=type]')
    page.fill('dialog input[aria-label="Your name"]', 'Jane Doe')
    time.sleep(0.4)
    page.screenshot(path=f'{OUT}/sign-dialog.png')
    page.click('dialog .btn.primary'); time.sleep(0.8)
    page.click('.side .btn:has-text("Date")'); time.sleep(0.3)
    page.screenshot(path=f'{OUT}/sign.png')
    path, _ = run_and_download(page, 'signed.pdf')
    imgs = subprocess.run(['pdfimages', '-f', '1', '-l', '1', '-list', path], capture_output=True, text=True).stdout
    ok('sign: signature image on page 1', len(imgs.strip().splitlines()) >= 3, imgs.strip().splitlines()[-1] if imgs.strip() else '')
    import datetime
    ok('sign: date text added', str(datetime.date.today().year) in text_of(path, 1, 1))

    # ---------------- watermark text + numbers
    tool(page, 'watermark')
    time.sleep(1.5)
    page.screenshot(path=f'{OUT}/watermark.png')
    path, _ = run_and_download(page, 'wm.pdf')
    rr = pypdf.PdfReader(path); ok('watermark: text on every page', all('CONFIDENTIAL' in rr.pages[i].extract_text() for i in (0, 11)))
    page.click('.side .seg button[data-v=numbers]'); time.sleep(1.2)
    page.screenshot(path=f'{OUT}/numbers.png')
    path, _ = run_and_download(page, 'numbered.pdf')
    t = pypdf.PdfReader(path).pages[2].extract_text()
    ok('watermark: page numbers', 'Page 3 of 12' in t, t[-40:])

    # ---------------- edit: text + whiteout + draw
    tool(page, 'edit')
    time.sleep(1)
    page.click('.toolgrid button[data-m=text]')
    st = page.locator('.stage').bounding_box()
    page.mouse.click(st['x'] + 80, st['y'] + st['height'] - 40)
    time.sleep(0.3)
    page.keyboard.type('Hello Folio')
    page.mouse.click(st['x'] + 5, st['y'] + st['height'] - 5)  # blur by clicking empty page in select mode
    page.click('.toolgrid button[data-m=whiteout]')
    page.mouse.move(st['x'] + 60, st['y'] + 300); page.mouse.down(); page.mouse.move(st['x'] + 300, st['y'] + 340, steps=6); page.mouse.up()
    page.click('.toolgrid button[data-m=draw]')
    page.mouse.move(st['x'] + 100, st['y'] + 450); page.mouse.down()
    for k in range(12): page.mouse.move(st['x'] + 100 + k * 15, st['y'] + 450 + (k % 2) * 20)
    page.mouse.up(); time.sleep(0.3)
    page.screenshot(path=f'{OUT}/edit.png')
    path, _ = run_and_download(page, 'edited.pdf')
    t = text_of(path, 1, 1)
    ok('edit: added text present', 'Hello Folio' in t, [l for l in t.splitlines() if 'Hello' in l][:1])
    subprocess.run(['pdftoppm', '-r', '50', '-f', '1', '-l', '1', '-png', path, f'{OUT}/edited-p1'])

    # ---------------- forms
    page.evaluate("location.hash='home'"); time.sleep(0.2)
    page.set_input_files('.home .drop input[type=file]', [S('form.pdf')]); page.wait_for_selector('.vpage canvas', timeout=20000)
    tool(page, 'forms')
    page.wait_for_selector('.fieldov', timeout=20000)
    page.fill('.stage input.fieldov[aria-label="Full name"]', 'Jane Doe')
    page.fill('.stage input.fieldov[aria-label="Email address"]', 'jane@example.com')
    page.check('.stage input.fieldov[type=checkbox]')
    page.locator('.stage input.fieldov[type=radio]').nth(2).check()
    page.select_option('.stage select.fieldov[aria-label=Country]', 'Mexico')
    page.screenshot(path=f'{OUT}/forms.png')
    path, _ = run_and_download(page, 'filled.pdf')
    r = pypdf.PdfReader(path); fv = {k: v.get('/V') for k, v in (r.get_fields() or {}).items()}
    ok('forms: text values saved', fv.get('full_name') == 'Jane Doe' and fv.get('email') == 'jane@example.com', fv)
    ok('forms: checkbox/radio/choice saved', str(fv.get('newsletter')) not in ('/Off', 'None') and str(fv.get('plan')) == '/pro' and fv.get('country') == 'Mexico', (fv.get('newsletter'), fv.get('plan'), fv.get('country')))
    # flatten with non-Latin answer
    page.fill('.stage input.fieldov[aria-label="Full name"]', '山田 太郎')
    page.check('.side input[type=checkbox] >> nth=0')
    path, _ = run_and_download(page, 'filled-flat.pdf')
    r = pypdf.PdfReader(path)
    ok('forms: flattened (no fields left)', not (r.get_fields() or {}), list((r.get_fields() or {}).keys())[:3])
    subprocess.run(['pdftoppm', '-r', '60', '-f', '1', '-l', '1', '-png', path, f'{OUT}/flat-p1'])
    ok('forms: flattened Latin values visible', 'jane@example.com' in text_of(path, 1, 1))

    errs_f = [e for e in errs if 'PAGEERROR' in e or ('ERROR' in e and 'favicon' not in e)]
    ok('no page errors', not [e for e in errs if 'PAGEERROR' in e], errs_f[:5])
    print('\nConsole (first 25):'); print('\n'.join(errs[:25]))
    b.close()

fails = [r for r in RESULTS if not r[1]]
print(f'\n{len(RESULTS) - len(fails)}/{len(RESULTS)} passed')
sys.exit(1 if fails else 0)
