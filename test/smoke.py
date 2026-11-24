import sys, os, time, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda n: os.path.join(ROOT, 'test', 'samples', n)
OUT = os.path.join(ROOT, 'test', 'out'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'folio.html')

def find_chrome():
    for path in (
        os.environ.get('CHROME_PATH'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ):
        if path and os.path.isfile(path):
            return path
    return None

def start(p, w=1360, h=900):
    kwargs = dict(headless=True, args=['--no-sandbox'])
    chrome = find_chrome()
    if chrome:
        kwargs['executable_path'] = chrome
    b = p.chromium.launch(**kwargs)
    ctx = b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errs.append(f'{m.type.upper()} {m.text}') if m.type in ('error', 'warning') else None)
    page.on('dialog', lambda d: d.accept())
    page.goto(URL)
    page.wait_for_selector('body[data-ready="1"]', timeout=30000)
    return b, page, errs

if __name__ == '__main__':
    with sync_playwright() as p:
        b, page, errs = start(p)
        page.screenshot(path=f'{OUT}/home.png')
        page.set_input_files('.home .drop input[type=file]', [S('report.pdf')])
        page.wait_for_selector('.vpage canvas', timeout=20000)
        time.sleep(1)
        page.screenshot(path=f'{OUT}/viewer.png')
        print('\n'.join(errs[:30]))
        b.close()
