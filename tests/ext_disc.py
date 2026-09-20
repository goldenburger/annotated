import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profD'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body='<!doctype html><title>Harbor test story</title><article><h1>Harbor story</h1><p>'+('Some words in the story. '*40)+'</p></article>',headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    f=await ctx.new_page(); await f.set_viewport_size({'width':1280,'height':900}); f.on('pageerror',lambda e: errs.append(str(e)))
    await f.goto(f'chrome-extension://{extid}/feed.html'); await f.wait_for_selector('.feedTabs', timeout=15000); await asyncio.sleep(1)
    print('extension feed tabs:', await f.eval_on_selector_all('.feedTabs label','ls=>ls.map(l=>l.innerText)'), '| cards:', await f.locator('.card').count())
    print('rail:', await f.eval_on_selector_all('.rail .railcard:not(.dbg) h2','hs=>hs.map(h=>h.innerText)'))
    await f.click('.card >> nth=0'); await f.wait_for_selector('.ann:not(.loading)', timeout=15000); await asyncio.sleep(1)
    print('author follow button:', await f.is_visible('.annCard .followBtn'), '| rail:', await f.eval_on_selector_all('.rail .railcard:not(.dbg) h2','hs=>hs.map(h=>h.innerText)'))
    # paste a link from the empty panel of a blank tab
    blank=await ctx.new_page(); await blank.goto('about:blank')
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url==='about:blank').id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':800}); pan.on('pageerror',lambda e: errs.append(str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    print('empty panel offers paste:', await pan.is_visible('#emptyAction .pasteForm'))
    await blank.bring_to_front()
    await sw.evaluate(f"chrome.tabs.update({tid},{{active:true}})")
    await pan.fill('#pasteUrl','harborline.example/story'); await pan.click('.pasteForm button'); await asyncio.sleep(2.5)
    print('message:', await pan.inner_text('.pasteMsg'), '| tabs:', await sw.evaluate('chrome.tabs.query({}).then(t=>t.map(x=>x.url))'))
    print('tab now at:', blank.url, '| panel switched to the article:', await pan.is_visible('#articleMode'))
    print('article panel offers paste too:', await pan.is_visible('#articleMode .pasteForm'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
