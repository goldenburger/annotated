# Exploration 1: a fresh install. The panel on first open, the live home page as a visitor with the extension, and the
# home page's try-it tabs. Nothing is signed in, so nothing reaches the live database.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
OUT = r"C:/Users/dswin/AppData/Local/Temp/claude/E--claude-code-annotated/5e7f320e-36dd-4cca-9ebc-dfaa38b01ba8/scratchpad/ex/"
log = []
async def main():
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('ex1'), headless=True, executable_path=CHROME, user_agent=REAL_UA,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], viewport={'width': 1280, 'height': 860})
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    ctx.on('page', lambda pg: pg.on('pageerror', lambda e: log.append(f'PAGEERR {pg.url[:60]}: {e}')))
    await asyncio.sleep(2)
    print('pages after install:', [x.url for x in ctx.pages])
    site = await ctx.new_page(); site.on('console', lambda m: log.append(f'CONSOLE {m.type}: {m.text[:160]}') if m.type in ('error', 'warning') else None)
    await site.goto('https://annotated-app.netlify.app/?planes'); await asyncio.sleep(6)
    await site.screenshot(path=OUT + '01_home.png')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('netlify')).id)")
    pv = await ctx.new_page(); await pv.set_viewport_size({'width': 400, 'height': 860})
    await pv.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    await pv.screenshot(path=OUT + '02_panel_first.png')
    print('panel text:', (await pv.evaluate("document.body.innerText"))[:700])
    # The home page, section by section.
    await site.bring_to_front()
    h = await site.evaluate("document.body.scrollHeight"); print('home height', h)
    for i, y in enumerate(range(0, h, 800)):
      await site.evaluate(f"scrollTo(0, {y})"); await asyncio.sleep(1.6)
      await site.screenshot(path=OUT + f'03_home_{i:02d}.png')
    print('installed attr:', await site.evaluate("document.documentElement.dataset.annotatedInstalled"))
    print('\n'.join(log[:40]))
    await ctx.close()
asyncio.run(main())
