# The extension reloaded under an open page. The copy of article.js left on the page threw "Extension context
# invalidated" at chrome.runtime.sendMessage the next time words were selected, before there was any promise to
# catch, and Chrome listed it as an error of the extension (screenshot of 2026-09-23). The call is guarded now
# and the leftover takes itself off the page.
import asyncio
from playwright.async_api import async_playwright
from _env import *
PAGE = '<!doctype html><title>t</title><body style="font:18px Georgia"><p id="p">The ferry board voted five to two on Monday to raise the adult fare.</p></body>'
SEL = '''() => { const t = document.getElementById('p').firstChild; const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 30);
  getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); }'''

async def main():
  errs, logs = [], []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profCTX'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://bee.example/**', lambda r: r.fulfill(status=200, body=PAGE, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg = await ctx.new_page()
    pg.on('console', lambda m: logs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(str(e)))
    await pg.goto('https://bee.example/a'); await asyncio.sleep(1.2)
    before = await pg.evaluate("!!document.querySelector('.annotated-ui')")
    # Reload the extension under the page. The copy already on the page is left behind.
    try: await sw.evaluate("chrome.runtime.reload()")
    except Exception: pass
    await asyncio.sleep(2.5)
    for _ in range(3):
      await pg.evaluate(SEL); await asyncio.sleep(.8)
      await pg.mouse.click(10, 200); await asyncio.sleep(.4)
    bad = [l for l in logs if 'context invalidated' in l.lower()]
    print('the page had our button before the reload:', before, '| errors after:', bad)
    if bad: errs.append(f'the leftover copy threw: {bad[0]}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
