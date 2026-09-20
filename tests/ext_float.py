import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profF'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new','--window-size=1280,900'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    errs=[]
    await sw.evaluate("chrome.storage.local.set({annotatedPrefs:{display:'float',afterPublish:'stay',density:'comfortable',theme:'system',pageButton:true}})")
    await asyncio.sleep(.5)
    print('side panel opens on toolbar click:', await sw.evaluate("chrome.sidePanel.getPanelBehavior().then(b=>b.openPanelOnActionClick)"))
    news=await ctx.new_page(); news.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await news.goto('https://harborline.example/x'); await asyncio.sleep(1)
    # selecting text and clicking the page's Annotate button should bring up the floating panel
    await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    await news.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()")
    await asyncio.sleep(3)
    has=await news.evaluate("!!document.getElementById('annotated-float-host')")
    print('floating frame on page:', has)
    fr=[f for f in news.frames if 'sidepanel.html' in f.url]
    print('panel frame:', fr[0].url.split('/')[-1] if fr else None)
    f=fr[0]
    await f.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
    print('auto-captured in frame:', (await f.inner_text('#articleMode .capQuote'))[:60])
    src=await f.get_attribute('#articleMode .shot','src'); open('ext_float_shot.jpg','wb').write(base64.b64decode(src.split(',')[1]))
    print('frame visible again after screenshot:', await news.evaluate("(()=>{const h=document.getElementById('annotated-float-host');return getComputedStyle(h.shadowRoot.querySelector('.ff')).visibility})()"))
    await news.screenshot(path='ext_float_page.png')
    fh=await news.evaluate("(()=>{const r=document.getElementById('annotated-float-host').shadowRoot.querySelector('.ff').getBoundingClientRect();return [Math.round(r.y),Math.round(r.height)]})()")
    print('frame top and fitted height:', fh)
    print('frame bar buttons:', await news.evaluate("[...document.getElementById('annotated-float-host').shadowRoot.querySelectorAll('.ffBtn')].map(b=>b.getAttribute('aria-label'))"))
    await news.evaluate("document.getElementById('annotated-float-host').shadowRoot.querySelectorAll('.ffX')[0].click()"); await asyncio.sleep(.4)
    print('gear opens Display inside the frame:', await f.is_visible('.dmPop'))
    await f.press('.dmPop', 'Escape')
    print('inner wordmark row hidden:', not await f.is_visible('body > .brand'))
    # publish from the frame
    await f.fill('#articleMode .takeInput','Floating in the real extension')
    np=asyncio.ensure_future(ctx.wait_for_event('page'))
    await f.click('#articleMode .publish')
    ann=await asyncio.wait_for(np, 15); await ann.wait_for_selector('.ann:not(.loading)')
    print('published page:', await ann.inner_text('.take'))
    # switching the setting back to side panel removes the frame
    await sw.evaluate("chrome.storage.local.get('annotatedPrefs').then(o=>chrome.storage.local.set({annotatedPrefs:{...o.annotatedPrefs,display:'side'}}))")
    await asyncio.sleep(.6)
    print('frame removed in side mode:', not await news.evaluate("!!document.getElementById('annotated-float-host')"))
    print('toolbar opens side panel again:', await sw.evaluate("chrome.sidePanel.getPanelBehavior().then(b=>b.openPanelOnActionClick)"))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
