"""Edge cases: rotated pages, encrypted inputs, tiled/behind watermark, strong/flatten compression."""
import os, sys, time, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from smoke import start, S, OUT
from e2e_helpers import *
from playwright.sync_api import sync_playwright
import pypdf

with sync_playwright() as p:
    b, page, errs = start(p)
    ok('standalone uses a real worker', page.evaluate("!!pdfjsLib.GlobalWorkerOptions.workerPort"))
    page.set_input_files('.home .drop input[type=file]', [S('locked.pdf')])
    page.wait_for_selector('dialog input[type=password]', timeout=15000)
    page.fill('dialog input[type=password]', 'secret'); page.keyboard.press('Enter')
    page.wait_for_selector('.vpage canvas', timeout=20000)

    # watermark: tiled + behind on an encrypted file, check rotated page 8
    tool(page, 'watermark')
    page.click('.side label.check:has-text("Repeat across") input')
    page.click('.side label.check:has-text("behind") input')
    time.sleep(0.5)
    path, _ = run_and_download(page, 'wm-tiled.pdf')
    good, msg = qcheck(path); ok('watermark on encrypted input: valid, unencrypted output', good and 'not encrypted' in msg, msg[-120:])
    subprocess.run(['pdftoppm', '-r', '40', '-f', '8', '-l', '8', '-png', path, f'{OUT}/wm-tiled-p8'])
    subprocess.run(['pdftoppm', '-r', '40', '-f', '1', '-l', '1', '-png', path, f'{OUT}/wm-tiled-p1'])

    # page numbers on rotated page
    page.click('.side .seg button[data-v=numbers]'); time.sleep(0.4)
    page.locator('.side .btn[title="Bottom right"]:visible').click(); time.sleep(0.3)
    path, _ = run_and_download(page, 'num-rot.pdf')
    subprocess.run(['pdftoppm', '-r', '40', '-f', '8', '-l', '8', '-png', path, f'{OUT}/num-rot-p8'])

    # edit on rotated page 8: text + box
    tool(page, 'edit'); time.sleep(0.8)
    for _ in range(7): page.click('.stagebar button[aria-label="Next page"]'); time.sleep(0.15)
    time.sleep(0.8)
    st = page.locator('.stage').bounding_box()
    page.click('.toolgrid button[data-m=box]')
    page.mouse.move(st['x'] + 30, st['y'] + 30); page.mouse.down(); page.mouse.move(st['x'] + 200, st['y'] + 90, steps=5); page.mouse.up()
    page.click('.toolgrid button[data-m=text]')
    page.mouse.click(st['x'] + 40, st['y'] + 70); time.sleep(0.3)
    page.keyboard.type('Upright?')
    page.click('.toolgrid button[data-m=select]')
    page.screenshot(path=f'{OUT}/edit-rot.png')
    path, _ = run_and_download(page, 'edit-rot.pdf')
    subprocess.run(['pdftoppm', '-r', '40', '-f', '8', '-l', '8', '-png', path, f'{OUT}/edit-rot-p8'])
    t = subprocess.run(['pdftotext', '-f', '8', '-l', '8', path, '-'], capture_output=True, text=True).stdout
    ok('edit: text on rotated page extracted upright', 'Upright?' in t, t[:40])

    # sign: place on every page
    page.evaluate("location.hash='sign'"); time.sleep(1)
    if page.locator('.sigs .s').count() == 0:
        page.click('.side .btn:has-text("Create signature")'); page.click('dialog .seg button[data-v=type]')
        page.fill('dialog input[aria-label="Your name"]', 'Jane Doe'); page.click('dialog .btn.primary'); time.sleep(0.6)
    else:
        page.locator('.sigs .s button').first.click(); time.sleep(0.3)
    page.click('.side .btn:has-text("Place on every page")'); time.sleep(0.3)
    path, _ = run_and_download(page, 'signed-all.pdf')
    imgs = subprocess.run(['pdfimages', '-list', path], capture_output=True, text=True).stdout.strip().splitlines()[2:]
    ok('sign: signature on all 12 pages', len({l.split()[0] for l in imgs}) == 12, len({l.split()[0] for l in imgs}))
    subprocess.run(['pdftoppm', '-r', '40', '-f', '8', '-l', '8', '-png', path, f'{OUT}/signed-p8'])

    # compress strong + flatten
    page.evaluate("location.hash='home'"); time.sleep(0.2)
    page.set_input_files('.home .drop input[type=file]', [S('photos.pdf')]); page.wait_for_selector('.vpage canvas', timeout=20000)
    tool(page, 'compress')
    for lvl in ('strong', 'flatten'):
        page.check(f'input[name=level][value={lvl}]')
        path, txt = run_and_download(page, f'compressed-{lvl}.pdf', timeout=120000)
        good, msg = qcheck(path)
        ok(f'compress {lvl}: valid and smaller', good and os.path.getsize(path) < os.path.getsize(S('photos.pdf')) * 0.3, f'{os.path.getsize(path)} bytes')
    subprocess.run(['pdftoppm', '-r', '40', '-f', '4', '-l', '4', '-png', OUT + '/compressed-strong.pdf', f'{OUT}/strong-p4'])

    # continue-with chain: result -> Organize
    page.click('.result .acts .btn:has-text("Continue with")'); page.click('.menu button:has-text("Organize pages")'); time.sleep(0.8)
    ok('continue with: opens next tool on the result', 'compressed' in page.inner_text('.filebar'), page.inner_text('.filebar'))

    ok('no page errors', not [e for e in errs if 'PAGEERROR' in e], [e for e in errs if 'PAGEERROR' in e][:3])
    b.close()
msg, fails = summary()
print(msg)
sys.exit(1 if fails else 0)
