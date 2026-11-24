"""Big-PDF stress suite: crash/completion focused, long timeouts.

Fails on PAGEERROR, crash toasts, hangs (timeout), bad qpdf output, wrong page counts.
"""
import os, sys, time, zipfile, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from smoke import start, S, OUT
from e2e_helpers import ok, summary, tool, run_and_download, qcheck
from playwright.sync_api import sync_playwright

LONG = 10 * 60 * 1000  # 10 minutes


def pages_of(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith('Pages:'):
            return int(line.split()[1])
    return None


def page_errors(errs):
    return [e for e in errs if 'PAGEERROR' in e]


def crash_toasts(page):
    try:
        texts = page.eval_on_selector_all('.toast', 'els => els.map(e => e.textContent || "")')
    except Exception:
        return []
    return [t for t in texts if 'Something went wrong' in t]


def assert_alive(page, errs, label):
    ok(f'{label}: no PAGEERROR', not page_errors(errs), page_errors(errs)[:3])
    bad = crash_toasts(page)
    ok(f'{label}: no crash toast', not bad, bad[:2])
    try:
        ready = page.evaluate("document.body.dataset.ready === '1'")
        ok(f'{label}: page still ready', ready)
    except Exception as e:
        ok(f'{label}: page still ready', False, str(e))


def open_pdf(page, name, timeout=120000):
    page.evaluate("location.hash='home'")
    time.sleep(0.3)
    page.set_input_files('.home .drop input[type=file]', [S(name)])
    page.wait_for_selector('.vpage canvas, .filebar, .pick', timeout=timeout)
    # Prefer viewer canvas when routed to view
    try:
        page.wait_for_selector('.vpage canvas', timeout=min(timeout, 90000))
    except Exception:
        pass
    time.sleep(0.4)


def set_current(page, name):
    page.evaluate(f"""() => {{
      const f = folio.store.files.find(x => x.name === {name!r});
      if (f) {{ folio.store.current = f.id; }}
    }}""")


with sync_playwright() as p:
    b, page, errs = start(p)
    page.set_default_timeout(LONG)

    # ---------- 1. Viewer ----------
    t0 = time.time()
    open_pdf(page, 'big-pages.pdf')
    page.wait_for_selector('.vpage canvas', timeout=LONG)
    page.fill('input[aria-label="Page number"]', '100')
    page.keyboard.press('Enter')
    time.sleep(1.2)
    page.fill('input[aria-label="Page number"]', '200')
    page.keyboard.press('Enter')
    time.sleep(1.2)
    ok('viewer: opened big-pages and jumped', page.locator('.vpage canvas').count() >= 1,
       f'{time.time() - t0:.1f}s')
    assert_alive(page, errs, 'viewer')

    # ---------- 2. Organize ----------
    t0 = time.time()
    set_current(page, 'big-pages.pdf')
    tool(page, 'organize')
    page.wait_for_function('document.querySelectorAll(".pages .pg").length >= 200', timeout=LONG)
    ncells = page.locator('.pages .pg').count()
    ok('organize: grid has ≥200 cells', ncells >= 200, ncells)
    page.locator('.pages .pg').nth(0).click()
    page.click('button[title="Rotate right"]')
    time.sleep(0.5)
    path, _ = run_and_download(page, 'stress-organized.pdf', timeout=LONG)
    n = pages_of(path)
    good, msg = qcheck(path)
    ok('organize: 200 pages saved', n == 200, n)
    ok('organize: qpdf OK', good, msg[-120:])
    assert_alive(page, errs, 'organize')
    print(f'  organize wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 3. Split every N=50 ----------
    t0 = time.time()
    set_current(page, 'big-pages.pdf')
    tool(page, 'split')
    page.wait_for_function('document.querySelectorAll(".pages .pg").length >= 200', timeout=LONG)
    page.check('input[name=mode][value=n]')
    page.fill('.choice input[type=number]', '50')
    page.dispatch_event('.choice input[type=number]', 'input')
    time.sleep(0.4)
    ok('split: preview 4 parts', page.locator('.preview-list li').count() == 4,
       page.inner_text('.preview-list')[:120])
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=LONG)
    with page.expect_download(timeout=LONG) as d:
        page.locator('.result .acts .btn').first.click()
    zp = os.path.join(OUT, 'stress-split.zip')
    d.value.save_as(zp)
    with zipfile.ZipFile(zp) as z:
        names = sorted(z.namelist())
        ok('split: zip has 4 PDFs', len(names) == 4, names)
        counts = []
        for i, nm in enumerate(names):
            part = os.path.join(OUT, f'stress-split-{i}.pdf')
            with open(part, 'wb') as f:
                f.write(z.read(nm))
            counts.append(pages_of(part))
        ok('split: page counts 50/50/50/50', counts == [50, 50, 50, 50], counts)
    assert_alive(page, errs, 'split')
    print(f'  split wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 4. Watermark all 200 ----------
    t0 = time.time()
    set_current(page, 'big-pages.pdf')
    tool(page, 'watermark')
    time.sleep(1.0)
    path, _ = run_and_download(page, 'stress-wm.pdf', timeout=LONG)
    n = pages_of(path)
    good, msg = qcheck(path)
    ok('watermark: 200 pages', n == 200, n)
    ok('watermark: qpdf OK', good, msg[-120:])
    assert_alive(page, errs, 'watermark')
    print(f'  watermark wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 5. Merge big-pages + report ----------
    t0 = time.time()
    tool(page, 'merge')
    # clear existing rows if any, then add both files
    page.evaluate("location.hash='merge'")
    time.sleep(0.5)
    # Start fresh via home multi-drop into merge heuristics, or Add files
    page.evaluate("""() => {
      // keep store; merge tool seeds from open files — remount cleanly
    }""")
    # Remount merge empty by navigating home then merge and adding files
    page.evaluate("location.hash='home'"); time.sleep(0.3)
    tool(page, 'merge')
    # Remove all current rows
    while page.locator('.frow button[title=Remove]').count() > 0:
        page.locator('.frow button[title=Remove]').first.click()
        time.sleep(0.05)
    with page.expect_file_chooser() as fc:
        page.click('.toolbar .btn:has-text("Add files")')
    fc.value.set_files([S('big-pages.pdf'), S('report.pdf')])
    page.wait_for_function("document.querySelectorAll('.frow').length >= 2", timeout=LONG)
    path, _ = run_and_download(page, 'stress-merged.pdf', timeout=LONG)
    n = pages_of(path)
    good, msg = qcheck(path)
    ok('merge: 212 pages', n == 212, n)
    ok('merge: qpdf OK', good, msg[-120:])
    assert_alive(page, errs, 'merge')
    print(f'  merge wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 6. Compress balanced on big-images ----------
    t0 = time.time()
    open_pdf(page, 'big-images.pdf', timeout=LONG)
    tool(page, 'compress')
    page.check('input[name=level][value=balanced]')
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=LONG)
    time.sleep(0.3)
    result_txt = page.inner_text('.result')
    # Either download a smaller file, or "already well compressed"
    if 'Download' in page.locator('.result .acts').inner_text():
        with page.expect_download(timeout=LONG) as d:
            page.locator('.result .acts .btn').first.click()
        path = os.path.join(OUT, 'stress-compressed.pdf')
        d.value.save_as(path)
        good, msg = qcheck(path)
        orig = os.path.getsize(S('big-images.pdf'))
        sz = os.path.getsize(path)
        ok('compress balanced: completed', True, f'{orig} -> {sz}')
        ok('compress balanced: qpdf OK', good, msg[-120:])
        ok('compress balanced: smaller or close', sz < orig * 1.02, f'{orig} -> {sz}')
    else:
        ok('compress balanced: already-compressed report', 'compress' in result_txt.lower() or 'smaller' in result_txt.lower() or 'already' in result_txt.lower(), result_txt[:160])
        ok('compress balanced: qpdf OK', True, 'no output file')
        ok('compress balanced: smaller or close', True, 'skipped')
    assert_alive(page, errs, 'compress-balanced')
    print(f'  compress balanced wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 7. Compress flatten on big-images ----------
    t0 = time.time()
    set_current(page, 'big-images.pdf')
    tool(page, 'compress')
    page.check('input[name=level][value=flatten]')
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=LONG)
    time.sleep(0.3)
    if 'Download' in page.locator('.result .acts').inner_text():
        with page.expect_download(timeout=LONG) as d:
            page.locator('.result .acts .btn').first.click()
        path = os.path.join(OUT, 'stress-flatten.pdf')
        d.value.save_as(path)
        good, msg = qcheck(path)
        n = pages_of(path)
        ok('compress flatten: completed', n == 40, n)
        ok('compress flatten: qpdf OK', good, msg[-120:])
    else:
        ok('compress flatten: completed', False, page.inner_text('.result')[:200])
        ok('compress flatten: qpdf OK', False, 'no output')
    assert_alive(page, errs, 'compress-flatten')
    print(f'  compress flatten wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 8. PDF → Image pages 1-3 @ 72 dpi ----------
    t0 = time.time()
    set_current(page, 'big-pages.pdf')
    tool(page, 'toimage')
    page.wait_for_selector('.pages .pg', timeout=LONG)
    page.fill('.side input.inp[placeholder="All pages"]', '1-3')
    page.dispatch_event('.side input.inp[placeholder="All pages"]', 'input')
    page.click('.seg button[data-v="72"]')
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=LONG)
    with page.expect_download(timeout=LONG) as d:
        page.locator('.result .acts .btn').first.click()
    zp = os.path.join(OUT, 'stress-images.zip')
    d.value.save_as(zp)
    with zipfile.ZipFile(zp) as z:
        names = z.namelist()
        ok('toimage: 3 PNGs', len(names) == 3 and all(n.endswith('.png') for n in names), names)
    assert_alive(page, errs, 'toimage')
    print(f'  toimage wall {time.time() - t0:.1f}s', flush=True)

    # ---------- 9. Sign place-on-every-page on 50-page extract ----------
    t0 = time.time()
    set_current(page, 'big-pages.pdf')
    tool(page, 'split')
    page.check('input[name=mode][value=extract]')
    page.fill('.choice:has(input[value=extract]) input.inp', '1-50')
    page.dispatch_event('.choice:has(input[value=extract]) input.inp', 'input')
    path50, _ = run_and_download(page, 'stress-50.pdf', timeout=LONG)
    ok('sign prep: 50-page extract', pages_of(path50) == 50, pages_of(path50))

    page.evaluate("location.hash='home'"); time.sleep(0.3)
    page.set_input_files('.home .drop input[type=file]', [path50])
    page.wait_for_selector('.vpage canvas', timeout=LONG)
    page.evaluate("localStorage.removeItem('folio:sigs')")
    tool(page, 'sign')
    page.click('.side .btn:has-text("Create signature")')
    page.click('dialog .seg button[data-v=type]')
    page.fill('dialog input[aria-label="Your name"]', 'Stress Tester')
    time.sleep(0.4)
    page.click('dialog .btn.primary')
    time.sleep(0.8)
    page.click('.side .btn:has-text("Place on every page")')
    time.sleep(0.5)
    path, _ = run_and_download(page, 'stress-signed.pdf', timeout=LONG)
    n = pages_of(path)
    good, msg = qcheck(path)
    ok('sign: 50 pages', n == 50, n)
    ok('sign: qpdf OK', good, msg[-120:])
    assert_alive(page, errs, 'sign')
    print(f'  sign wall {time.time() - t0:.1f}s', flush=True)

    pe = page_errors(errs)
    ok('suite: no PAGEERRORs overall', not pe, pe[:5])
    print('\nConsole (first 30):')
    print('\n'.join(errs[:30]))
    b.close()

msg, fails = summary()
print(msg)
sys.exit(1 if fails else 0)
