import asyncio, sys
from playwright.async_api import async_playwright
from _env import *
sys.path.insert(0, '.')
from features234 import site
async def main():
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profL6'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 1000})
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(5)
    await pg.screenshot(path='l6_panel.png')
    w = await ctx.new_page(); await w.set_viewport_size({'width': 1300, 'height': 900})
    await w.route('https://annotated-app.netlify.app/**', site)
    await w.goto('https://annotated-app.netlify.app/paper.html'); await asyncio.sleep(2)
    await w.evaluate("document.querySelector('[data-k=creased]').scrollIntoView({block:'center'})"); await asyncio.sleep(.5)
    await w.locator('[data-k=creased]').screenshot(path='l6_creased.png')
    await w.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(3)
    await w.screenshot(path='l6_home.png')
    await ctx.close()
asyncio.run(main())
