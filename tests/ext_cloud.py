import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profC'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],viewport={'width':1280,'height':900})
    await ctx.add_init_script(INIT)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(f'chrome-extension://{extid}/annotation.html#claude-test-read-zz9'); await pg.wait_for_selector('.ann:not(.loading)',timeout=15000); await asyncio.sleep(1)
    print('author:', (await pg.inner_text('.annCard .who')).replace('\n',' | '))
    print('take:', await pg.inner_text('.annCard .take'))
    print('comment:', (await pg.inner_text('.cList')).replace('\n',' | ')[:120])
    print('reaction chips:', (await pg.inner_text('.reactHost')).replace('\n',' '))
    print('poll:', (await pg.inner_text('.pollBox')).replace('\n',' | '))
    print('edit menu for someone else (should be none):', await pg.locator('.moreBtn').count())
    await pg.screenshot(path='ext_cloud_page.png', full_page=True)
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await pg.wait_for_selector('.feedHead'); await asyncio.sleep(1.5)
    print('feed:', (await pg.inner_text('.feedHead')).replace('\n',' | '), '| first card:', (await pg.inner_text('.card')).replace('\n',' | ')[:160])
    await pg.click('.card'); await pg.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(.5)
    await pg.click('.annCard .profileLink >> nth=1'); await pg.wait_for_selector('.feedHead'); await asyncio.sleep(1)
    print('their profile:', (await pg.inner_text('.feedHead')).replace('\n',' | '))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
