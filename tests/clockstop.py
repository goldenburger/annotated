# An annotation deleted while its page is open. The page redraws itself as "This annotation was deleted",
# and the clock that keeps comment times current used to go on running against a page with no comments
# on it, throwing "Cannot set properties of null" every thirty seconds, which is what the recording of
# 2026-09-22 at 21:56 found in Chrome's error list. Timers are caught as they are made, so the test can run
# the clock at once instead of waiting half a minute.
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = """try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}
window.__ticks = []; const realSI = window.setInterval.bind(window);
window.setInterval = (fn, ms, ...a) => { const id = realSI(fn, ms, ...a); if (ms === 30000 && String(fn).includes('stopClock')) window.__ticks.push({ id, fn }); return id; };
const realCI = window.clearInterval.bind(window);
window.clearInterval = (id) => { window.__ticks = window.__ticks.filter((t) => t.id !== id); return realCI(id); };"""
RUN = """() => { const errs = []; for (const t of window.__ticks.slice()) { try { t.fn(); } catch (e) { errs.push(String(e)); } } return { errs, left: window.__ticks.length }; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profCLOCK'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)
    await pg.evaluate("""Store.put('clock-1', { item: { kind: 'post', text: 'A post.', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' },
      take: { text: 'A take with a clock' }, created: Date.now() - 60000, comments: [{ text: 'first', t: Date.now() - 30000 }] })""")
    await pg.goto(f'chrome-extension://{extid}/annotation.html#clock-1'); await asyncio.sleep(2.5)
    before = await pg.evaluate("({ take: (document.querySelector('.take')||{}).textContent, ticks: window.__ticks.length })")
    print('open:', before)
    if before['take'] != 'A take with a clock': errs.append(f'the annotation did not open: {before}')
    # Deleted while it is open, then drawn again, which is what a delete elsewhere leads to.
    await pg.evaluate("Store.del('clock-1')")
    await pg.evaluate("window.dispatchEvent(new HashChangeEvent('hashchange'))"); await asyncio.sleep(1.5)
    said = (await pg.inner_text('#page')).strip()
    print('the page now says:', said.replace('\n', ' | '))
    if 'deleted' not in said: errs.append(f'the page did not say it was deleted: {said!r}')
    out = await pg.evaluate(RUN)
    print('running the clock:', out)
    if out['errs']: errs.append(f"the clock threw: {out['errs']}")
    if out['left']: errs.append(f"{out['left']} clock(s) still running on a page with nothing to keep current")
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
