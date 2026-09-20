import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
XPAGE=open('ext_post.py').read().split("XPAGE='''")[1].split("'''")[0]
EP=open(PODCAST,'rb').read()
POD='''<!doctype html><html><head><title>Can overnight buses work? - The Transit Hour</title>
<meta property="og:type" content="music.song"><meta property="og:title" content="Can overnight buses work?"><meta property="og:site_name" content="The Transit Hour">
<style>body{font:16px system-ui;max-width:720px;margin:40px auto;color:#16181D}h1{font-size:30px}audio{width:100%;margin-top:20px}.show{color:#1E5582;font-weight:700}</style>
</head><body><div class="show">The Transit Hour</div><h1>Can overnight buses work?</h1><p>Episode 41. The city council approved a six-month overnight bus trial on three routes. A longtime night rider joins us to talk about the survey behind it.</p>
<audio controls preload="auto" src="https://cdn.transithour.example/ep41.webm"></audio></body></html>'''
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def cdn(route):
  rng=route.request.headers.get('range'); h={'Content-Type':'audio/webm','Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'}
  if rng and rng.startswith('bytes='):
    a,b=rng[6:].split('-'); a=int(a); b=int(b) if b else len(EP)-1
    h.update({'Content-Range':f'bytes {a}-{b}/{len(EP)}','Content-Length':str(b-a+1)}); await route.fulfill(status=206,body=EP[a:b+1],headers=h)
  else: h['Content-Length']=str(len(EP)); await route.fulfill(status=200,body=EP,headers=h)
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profG'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required','--headless=new'],no_viewport=True)
    await ctx.route('https://www.youtube.com/**',yt_route)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    await ctx.route('https://x.com/**',lambda r: r.fulfill(status=200,body=XPAGE,headers={'Content-Type':'text/html'}))
    await ctx.route('https://thetransithour.example/**',lambda r: r.fulfill(status=200,body=POD,headers={'Content-Type':'text/html'}))
    await ctx.route('https://cdn.transithour.example/**',cdn)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    errs=[]
    async def tab(url, w=966, h=768):
      pg=await ctx.new_page(); await pg.set_viewport_size({'width':w,'height':h}); await pg.goto(url); return pg
    async def panel_for(host, w=400):
      tid=await sw.evaluate(f"chrome.tabs.query({{}}).then(t=>t.find(x=>x.url.includes('{host}')).id)")
      pg=await ctx.new_page(); await pg.set_viewport_size({'width':w,'height':768}); pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); return pg, tid
    # welcome (first open)
    yt=await tab('https://www.youtube.com/watch?v=TESTVID01'); await yt.wait_for_function('document.querySelector("video").readyState>=2')
    pv,_=await panel_for('youtube'); await asyncio.sleep(1.2)
    await yt.screenshot(path='gal/01_page.png'); await pv.screenshot(path='gal/01_panel.png')
    await pv.click('.wGo'); await asyncio.sleep(1)
    await ctx.add_init_script(INIT)
    await pv.fill('#videoMode .rStart','40'); await pv.press('#videoMode .rStart','Enter'); await pv.fill('#videoMode .rEnd','48'); await pv.press('#videoMode .rEnd','Enter'); await asyncio.sleep(.5)
    await yt.screenshot(path='gal/02_page.png'); await pv.screenshot(path='gal/02_panel.png')
    await pv.click('#videoMode .capBtn'); await pv.wait_for_selector('#videoMode .vCompose:not([hidden])',timeout=30000); await asyncio.sleep(.8)
    await pv.click('#videoMode .tagbtn >> text=Fact check'); await pv.fill('#videoMode .takeInput','The bars shift color right at 0:43. Watch the left edge.')
    await asyncio.sleep(.6); await pv.screenshot(path='gal/03_panel.png'); await yt.screenshot(path='gal/03_page.png')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pv.click('#videoMode .publish')
    annv=await asyncio.wait_for(np,15); await annv.set_viewport_size({'width':1366,'height':900}); await annv.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(2.4)
    await annv.screenshot(path='gal/04_ann_video.png')
    await pv.screenshot(path='gal/04b_panel_published.png')
    # article
    news=await tab('https://harborline.example/x'); await asyncio.sleep(1)
    pa,_=await panel_for('harborline')
    await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()'''); await asyncio.sleep(1)
    await news.screenshot(path='gal/05_page.png'); await pa.screenshot(path='gal/05_panel.png')
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.6)
    await pa.click('#articleMode .tagbtn >> text=Receipts'); await pa.fill('#articleMode .takeInput','The 61 percent figure comes from a survey employers handed out.')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pa.click('#articleMode .publish')
    anna=await asyncio.wait_for(np,15); await anna.set_viewport_size({'width':1366,'height':1000}); await anna.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(2.4)
    await anna.screenshot(path='gal/06_ann_article.png')
    # X post
    x=await tab('https://x.com/harborlinenews/status/1836000000000000001'); await asyncio.sleep(1)
    px,_=await panel_for('x.com'); await asyncio.sleep(1.2)
    await px.check('#postMode input[value="both"]')
    await x.screenshot(path='gal/07_page.png'); await px.screenshot(path='gal/07_panel.png')
    # podcast
    pod=await tab('https://thetransithour.example/episodes/41'); await pod.wait_for_function('document.querySelector("audio").readyState>=1')
    pp,_=await panel_for('transithour'); await asyncio.sleep(2.5)
    await pp.fill('#podcastMode .rStart','1:02'); await pp.press('#podcastMode .rStart','Enter'); await pp.fill('#podcastMode .rEnd','1:14'); await pp.press('#podcastMode .rEnd','Enter'); await asyncio.sleep(.6)
    await pod.screenshot(path='gal/08_page.png'); await pp.screenshot(path='gal/08_panel.png')
    await pp.click('#podcastMode .capBtn'); await pp.wait_for_selector('#podcastMode .vCompose:not([hidden])',timeout=30000); await asyncio.sleep(.5)
    await pp.click('#podcastMode .tagbtn >> text=Hot take'); await pp.fill('#podcastMode .takeInput','Twelve passengers a trip is too low a bar to prove much.')
    await pp.click('#podcastMode .pollBtn'); await asyncio.sleep(.3)
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pp.click('#podcastMode .publish')
    annp=await asyncio.wait_for(np,15); await annp.set_viewport_size({'width':1366,'height':900}); await annp.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(2.4)
    await annp.click('.pollOpt >> nth=0'); await annp.click('.reactBtn'); await annp.click('.quickBar .qE >> nth=5'); await asyncio.sleep(.3)
    await annp.screenshot(path='gal/09_ann_podcast.png')
    # feed
    feed=await tab(f'chrome-extension://{extid}/feed.html',1366,900); await asyncio.sleep(1); await feed.screenshot(path='gal/10_feed.png')
    # display menu + floating mode
    await pa.click('.gearBtn'); await asyncio.sleep(.3); await pa.screenshot(path='gal/11_display.png')
    await sw.evaluate("chrome.storage.local.get('annotatedPrefs').then(o=>chrome.storage.local.set({annotatedPrefs:{...(o.annotatedPrefs||{}),display:'float'}}))"); await asyncio.sleep(.5)
    await news.set_viewport_size({'width':1366,'height':800}); await news.bring_to_front(); await news.reload(); await asyncio.sleep(1)
    await sw.evaluate("chrome.tabs.query({}).then(t=>{const tab=t.find(x=>x.url.includes('harborline'));return showFloat(tab,'float-open')})"); await asyncio.sleep(3)
    await news.screenshot(path='gal/12_floating.png')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
