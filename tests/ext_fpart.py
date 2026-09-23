import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFA'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    n=await ctx.new_page(); await n.goto('https://harborline.example/x'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900}); pan.on('pageerror',lambda e: errs.append(str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    # A plain article no longer offers it (the UX audit of 2026-09-23), so the finder is asked for the way a
    # page with audio of its own asks for it.
    print('article panel link on a plain article:', await pan.is_visible('#articleMode .fpFind'))
    await pan.evaluate(f"feedAsked.add({tid}); drop({tid}); refresh()"); await asyncio.sleep(1.2)
    print('feed panel open:', await pan.is_visible('#podcastMode .fpQ'), '| note:', await pan.inner_text('#podcastMode .fpNote'))
    await pan.fill('#podcastMode .fpQ','Hard Fork'); await pan.click('#podcastMode .fpSearch button')
    await pan.wait_for_selector('#podcastMode .fpList li', timeout=20000)
    print('results:', await pan.locator('#podcastMode .fpList li').count(), '| first:', (await pan.inner_text('#podcastMode .fpList li >> nth=0')).replace('\n',' | ')[:100])
    await pan.click('#podcastMode .fpBack'); await asyncio.sleep(1.2)
    print('back to the article panel:', await pan.is_visible('#articleMode .grab') or await pan.is_visible('#articleMode .selHint'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
