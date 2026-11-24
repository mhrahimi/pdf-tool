import os, time, subprocess
from smoke import OUT
RESULTS = []
def ok(name, cond, info=''):
    RESULTS.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(info) if info else ''), flush=True)
def summary():
    fails = sum(1 for r in RESULTS if not r[1])
    msg = f"{len(RESULTS) - fails}/{len(RESULTS)} passed"
    return msg, fails
def tool(page, tid):
    page.evaluate(f"location.hash = '{tid}'"); page.wait_for_selector('#tool-title', timeout=10000); time.sleep(0.4)
def run_and_download(page, name, timeout=60000):
    page.click('.runbar .btn.primary')
    page.wait_for_selector('.result:not([hidden])', timeout=timeout); time.sleep(0.3)
    with page.expect_download(timeout=timeout) as d:
        page.locator('.result .acts .btn').first.click()
    path = os.path.join(OUT, name); d.value.save_as(path)
    return path, page.inner_text('.result')
def qcheck(path):
    r = subprocess.run(['qpdf', '--check', path], capture_output=True, text=True)
    return r.returncode in (0, 3), r.stdout[-300:] + r.stderr[-300:]
