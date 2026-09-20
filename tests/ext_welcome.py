import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('prof9'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'],viewport={'width':360,'height':760})
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    print('commands:', await sw.evaluate("chrome.commands.getAll().then(c=>c.map(x=>x.name+'='+x.shortcut))"))
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1)
    print('welcome:', await pg.is_visible('.welcome'), '|', await pg.inner_text('.wKey'))
    await pg.screenshot(path='ext_welcome.png')
    await pg.click('.wGo'); await pg.reload(); await asyncio.sleep(.8)
    print('dismissed stays:', await pg.locator('.welcome').count()==0, '| empty state visible:', await pg.is_visible('#empty'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
