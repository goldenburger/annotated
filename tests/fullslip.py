# "Open the feed as a full page" under the panel's lists is a torn paper slip like a reply, not an outlined box
# (David, 2026-09-29). Checked in light and dark, and it still opens the full page.
import asyncio, os
from playwright.async_api import async_playwright
from _env import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profSLIP'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)
    await pg.evaluate("""Store.put('slip-1', { item: { kind: 'post', text: 'A post.', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' },
      take: { text: 'A take kept on this computer' }, created: Date.now() - 60000 })""")
    for scheme in ('light', 'dark'):
      await pg.emulate_media(color_scheme=scheme)
      await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(2)
      await pg.evaluate("openBrowse('profile', { byHand: true })"); await asyncio.sleep(3)
      b = await pg.query_selector('.fullRow .fullBtn')
      if not b: errs.append(f'no full page button ({scheme})'); continue
      st = await pg.evaluate("""(b) => { const s = getComputedStyle(b), bf = getComputedStyle(b, '::before'), af = getComputedStyle(b, '::after');
        return { border: s.borderTopWidth, bg: s.backgroundColor, mask: /tear|svg/.test(bf.maskImage || bf.webkitMaskImage), paper: bf.backgroundColor, shadow: af.filter, text: b.textContent.trim() }; }""", b)
      print(scheme, st)
      if st['border'] != '0px' or not st['mask'] or 'blur' not in st['shadow']: errs.append(f'the button is not a slip in {scheme}: {st}')
      await b.scroll_into_view_if_needed()
      box = await b.bounding_box()
      await pg.screenshot(path=os.path.join(OUT, f'fullslip_{scheme}.png'), clip={'x': 0, 'y': max(0, box['y'] - 120), 'width': 400, 'height': box['height'] + 200})
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
