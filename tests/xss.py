import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profXS'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'])
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); dialogs=[]; pg.on('dialog',lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(f'chrome-extension://{extid}/annotation.html#claude-xss-test-zz1'); await pg.wait_for_selector('.ann:not(.loading)',timeout=15000); await asyncio.sleep(1)
    print('elements with injected handlers:', await pg.evaluate("document.querySelectorAll('[onerror],[onmouseover]').length"))
    print('injected img tags:', await pg.evaluate("[...document.querySelectorAll('img')].filter(i=>i.getAttribute('src')==='x').length"))
    print('javascript: links:', await pg.evaluate("[...document.querySelectorAll('a')].filter(a=>/^javascript:/i.test(a.getAttribute('href')||'')).length"))
    print('post text shown as text:', await pg.evaluate("document.body.innerText.includes('<img src=x onerror=alert(1)>')"))
    print('screenshot image with the bad address:', await pg.evaluate("document.querySelectorAll('.xshot img').length"))
    print('dialogs opened:', dialogs, '| errors:', errs)
    await ctx.close()
asyncio.run(main())
