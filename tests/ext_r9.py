import asyncio, re
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
SPEC='https://i.ytimg.com/sb/TESTVID01/storyboard3_L$L/$N.jpg?sqp=abc|48#27#100#10#10#0#default#rs$AAA|80#45#60#10#10#2000#M$M#rs$BBB'
YT2=YT + ('<script>var ytInitialPlayerResponse={"videoDetails":{"videoId":"TESTVID01"},"storyboards":{"playerStoryboardSpecRenderer":{"spec":"'+SPEC.replace('&','\\u0026')+'"}}};</script>')
SHEET=open('sb_sheet.jpg','rb').read()
POD='''<!doctype html><html><head><title>Episode with transcript</title><meta property="og:type" content="article"></head><body><h1>Episode 41, with transcript</h1>
<audio controls preload="auto" src="https://cdn.transithour.example/ep41.webm"></audio><p>''' + ('Transcript text. '*200) + '''</p></body></html>'''
EP=open(PODCAST,'rb').read()
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profR'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    sheet_hits=[]
    async def yt2(r):
      if '/media/' in r.request.url: return await yt_route(r)
      await r.fulfill(status=200,body=YT2,headers={'Content-Type':'text/html'})
    async def ytimg(r):
      sheet_hits.append(r.request.url); await r.fulfill(status=200,body=SHEET,headers={'Content-Type':'image/jpeg'})
    await ctx.route('https://www.youtube.com/**',yt2)
    await ctx.route('https://i.ytimg.com/sb/**',ytimg)
    await ctx.route('https://podpage.example/**',lambda r: r.fulfill(status=200,body=POD,headers={'Content-Type':'text/html'}))
    await ctx.route('https://cdn.transithour.example/**',lambda r: r.fulfill(status=200,body=EP,headers={'Content-Type':'audio/webm','Access-Control-Allow-Origin':'*'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    yt=await ctx.new_page(); await yt.goto('https://www.youtube.com/watch?v=TESTVID01'); await yt.wait_for_function('document.querySelector("video").readyState>=2')
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('youtube')).id)")
    pv=await ctx.new_page(); await pv.set_viewport_size({'width':400,'height':760}); pv.on('pageerror',lambda e: errs.append(str(e)))
    await pv.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    film=await pv.eval_on_selector('#videoMode .film','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}')
    print('storyboard sheets requested:', sheet_hits[:2])
    print('filmstrip painted pixels:', film)
    await pv.screenshot(path='ext_r9_film.png')
    # a page with both audio and text shows the switch
    pp=await ctx.new_page(); await pp.goto('https://podpage.example/ep'); await pp.wait_for_function('document.querySelector("audio").readyState>=1')
    tid2=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('podpage')).id)")
    pa=await ctx.new_page(); await pa.set_viewport_size({'width':400,'height':760}); pa.on('pageerror',lambda e: errs.append(str(e)))
    await pa.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid2}'); await asyncio.sleep(2)
    vis=[m for m in ['#articleMode','#podcastMode'] if await pa.is_visible(m)]
    print('opens in:', vis, '| switch:', (await pa.inner_text(vis[0]+' .modeSeg')).replace('\n',' | '))
    await pa.click(vis[0]+' .modeSeg label >> nth=0'); await asyncio.sleep(1.5)
    print('after choosing Clip the audio:', await pa.is_visible('#podcastMode'), '| checked:', await pa.eval_on_selector('#podcastMode .modeSeg input:checked','e=>e.value'))
    await pa.click('#podcastMode .modeSeg label >> nth=1'); await asyncio.sleep(1.5)
    print('after choosing Highlight text:', await pa.is_visible('#articleMode'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
