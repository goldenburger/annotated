# A double press on Publish publishes once (audit of 2026-09-29, third pass: a double click, or Ctrl+Enter then a
# click, both passed the duplicate check before either was saved, and two annotations were made).
import asyncio
from playwright.async_api import async_playwright
from _env import *
BODY = open('article_body.html').read()
NEWS = f'''<!doctype html><html><head><title>Overnight buses trial - Harborline News</title></head><body style="font:18px/1.6 Georgia,serif;max-width:680px;margin:40px auto"><article>{BODY}</article></body></html>'''

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('publish2x'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    await one_panel(sw)
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    for extra in ctx.pages[1:]: await extra.close()
    await page.set_viewport_size({'width': 1000, 'height': 800})
    await page.goto('https://harborline.example/story'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(v=>v.url.includes('harborline')).id)")
    fut = asyncio.ensure_future(ctx.wait_for_event('page'))
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{sw.url.split('/')[2]}/sidepanel.html?tab={tid}',width:420,height:1000}})")
    pv = await fut; await pv.set_viewport_size({'width': 420, 'height': 1000}); pv.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await asyncio.sleep(3)
    r = await page.evaluate("""(() => { const p = document.querySelectorAll('article p')[1]; const n = p.firstChild; const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(n.nodeValue.length, 60)); const b = r.getClientRects(); return [b[0].left + 1, b[0].top + 5, b[b.length - 1].right - 1, b[b.length - 1].top + 5]; })()""")
    await page.mouse.move(r[0], r[1]); await page.mouse.down(); await page.mouse.move(r[2], r[3], steps=8); await page.mouse.up(); await asyncio.sleep(1)
    await press_annotate(page)
    await pv.wait_for_selector('#articleMode .takeInput', timeout=15000)
    await pv.fill('#articleMode .takeInput', 'Only once, please.')
    before = await pv.evaluate('Store.count()')
    # Two presses as close together as a double click.
    await pv.evaluate("() => { const b = document.querySelector('#articleMode .publish'); b.click(); b.click(); }")
    await asyncio.sleep(5)
    after = await pv.evaluate('Store.count()')
    print('annotations saved by a double press on Publish:', after - before)
    if after - before != 1: errs.append(f'a double press saved {after - before} annotations')
    await ctx.close()
  print('errors:', errs)
asyncio.run(main())
