# The extension's annotation page: your card counts what you have published, not only the copies on this computer. Beside
# someone else's annotation, with nothing of yours kept here, it said "0 annotations" for someone with two published
# (found looking at the left column, 2026-09-30). Also: that page has the left column, as the website's does.
import asyncio
from playwright.async_api import async_playwright
from _env import CHROME, EXT, LOADEXT, prof
import _world as W
async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profEXTCOUNT'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route(W.SUPA + '/**', W.make_db({}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", W.SESSION)
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1440, 'height': 900}); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/annotation.html#{W.A_SAW["id"]}'); await asyncio.sleep(5)
    card = await pg.evaluate(r"(document.querySelector('.rail .railcard') || {}).innerText || ''")
    card = ' '.join(card.split())
    print('your card beside their annotation:', card)
    if '2 annotations' not in card: errs.append(f'your card does not count your published annotations: {card}')
    side = await pg.evaluate("({ side: !!document.querySelector('.lside.lsNav'), get: !!document.querySelector('.lsGet'), have: !!(document.querySelector('.lsHave') || {}).offsetParent })")
    print('the column:', side)
    if side != {'side': True, 'get': False, 'have': True}: errs.append(f"the extension's annotation page has no column: {side}")
    await ctx.close()
  print('errors:', errs)
asyncio.run(main())