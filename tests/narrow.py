import asyncio, re
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])  # reuse constants and routes
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('prof8'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required','--headless=new','--window-size=1100,900'],no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://www.youtube.com/**',yt_route)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    shots=[]
    for url,kind in [('https://www.youtube.com/watch?v=TESTVID01','video'),('https://harborline.example/x','article')]:
      pg=await ctx.new_page(); await pg.goto(url)
      if kind=='video': await pg.wait_for_function('document.querySelector("video").readyState>=2')
      host='youtube' if kind=='video' else 'harborline'
      tid=await sw.evaluate(f"chrome.tabs.query({{}}).then(t=>t.find(x=>x.url.includes('{host}')).id)")
      panel=await ctx.new_page(); await panel.set_viewport_size({'width':320,'height':760})
      errs=[]; panel.on('pageerror',lambda e: errs.append(str(e)))
      await panel.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}')
      await asyncio.sleep(1.5)
      if kind=='article':
        await pg.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
        await asyncio.sleep(.8)
      ow=await panel.evaluate('document.documentElement.scrollWidth')
      print(await panel.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>321).slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))"))
      print(kind,'overflow width:', ow, 'errors', errs)
      await panel.screenshot(path=f'n320_{kind}.png')
    await ctx.close()
asyncio.run(main())
