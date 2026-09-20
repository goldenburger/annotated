import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
SPOT='<!doctype html><title>AI Kills Everybody or Doomer Psyop? | All-In Podcast | Podcast on Spotify</title><body>Spotify</body>'
POST='''<!doctype html><title>Post / X</title><body style="background:#000;color:#fff;font:16px system-ui;max-width:600px;margin:0 auto">
<article data-testid="tweet" style="padding:12px"><div data-testid="User-Name"><span>DogeDesigner</span><span>@cb_doge</span><a href="/cb_doge/status/1970273189704078"><time datetime="2026-09-19T08:00:00Z">8h</time></a></div>
<div data-testid="tweetText" style="white-space:pre-wrap">Elon Musk says the Roadster demo will be a banger.\n\n"It'll be a banger. Excitement guaranteed, but not sure what the excitement is."\n\n"We actually need an audience to vouch for the fact that this is not AI"</div>
<div style="height:1100px;background:linear-gradient(#632,#113);margin-top:12px">video</div></article></body>'''
YTSTALE=YT.replace('<title>Test clip - YouTube</title>','<title>(3) Elon Musk and Gwynne Shotwell on AI - YouTube</title>').replace('<h1 class="title">Spike test video</h1>','<h1 class="title">Hugging Face Co-Founder on Open-Source</h1>')
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profQ'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://open.spotify.com/**',lambda r: r.fulfill(status=200,body=SPOT,headers={'Content-Type':'text/html'}))
    await ctx.route('https://x.com/cb_doge/status/**',lambda r: r.fulfill(status=200,body=POST,headers={'Content-Type':'text/html'}))
    async def yt(r):
      if '/media/' in r.request.url: return await yt_route(r)
      await r.fulfill(status=200,body=YTSTALE,headers={'Content-Type':'text/html'})
    await ctx.route('https://www.youtube.com/**',yt)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    async def panel_for(host):
      tid=await sw.evaluate(f"chrome.tabs.query({{}}).then(t=>t.find(x=>x.url.includes('{host}')).id)")
      pg=await ctx.new_page(); await pg.set_viewport_size({'width':400,'height':800}); pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5); return pg
    sp=await ctx.new_page(); await sp.goto('https://open.spotify.com/episode/abc')
    ps=await panel_for('spotify')
    # Spotify now opens the podcast-feed panel, starting a search with the episode's title.
    await ps.wait_for_selector('#podcastMode .fpQ', timeout=10000)
    print('spotify search starts with:', await ps.input_value('#podcastMode .fpQ'))
    yt_=await ctx.new_page(); await yt_.goto('https://www.youtube.com/watch?v=TESTVID01'); await yt_.wait_for_function('document.querySelector("video").readyState>=2')
    py=await panel_for('youtube')
    print('youtube header:', await py.inner_text('#videoMode .vTitle'))
    x=await ctx.new_page(); await x.set_viewport_size({'width':900,'height':800}); await x.goto('https://x.com/cb_doge/status/1970273189704078')
    px=await panel_for('x.com/cb_doge')
    await x.bring_to_front()
    sel='''(()=>{const n=document.querySelector('[data-testid="tweetText"]').firstChild;const s=n.textContent.indexOf('"It');const r=document.createRange();r.setStart(n,s);r.setEnd(n,s+44);getSelection().removeAllRanges();getSelection().addRange(r)})()'''
    hl="CSS.highlights.get('annotated-pending')?CSS.highlights.get('annotated-pending').size:0"
    await x.evaluate(sel); await asyncio.sleep(.8); await x.evaluate("getSelection().removeAllRanges()"); await asyncio.sleep(.4)
    print('highlight held after the selection goes:', await x.evaluate(hl))
    await x.mouse.click(700,600); await asyncio.sleep(.4)
    print('after clicking elsewhere on the page:', await x.evaluate(hl))
    await x.evaluate(sel); await asyncio.sleep(.8); await x.evaluate("getSelection().removeAllRanges()"); await asyncio.sleep(.3)
    await x.keyboard.press('Escape'); await asyncio.sleep(.3)
    print('after Escape:', await x.evaluate(hl))
    await x.evaluate(sel); await asyncio.sleep(.8)
    await px.click('#postMode .pGrab'); await px.wait_for_selector('#postMode .pCompose:not([hidden])',timeout=15000); await asyncio.sleep(.5)
    print('panel quote:', repr(await px.inner_text('#postMode .pQuote')), '| page highlight after capture:', await x.evaluate(hl))
    await px.fill('#postMode .takeInput','Quote test')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await px.click('#postMode .publish')
    ann=await asyncio.wait_for(np,15); ann.on('pageerror',lambda e: errs.append('ANN '+str(e))); await ann.set_viewport_size({'width':1200,'height':900})
    await ann.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(1)
    print('page quote:', repr(await ann.inner_text('.postQuote')))
    print('tall screenshot capped:', await ann.eval_on_selector('.xshotFrame','f=>[f.classList.contains("tall"), Math.round(f.getBoundingClientRect().height)]'), '| button:', await ann.is_visible('.xshotMore'))
    await ann.click('.xshotMore'); await asyncio.sleep(.2)
    print('after Show the whole post:', await ann.eval_on_selector('.xshotFrame','f=>Math.round(f.getBoundingClientRect().height)'), await ann.inner_text('.xshotMore'))
    await ann.screenshot(path='ext_r12_page.png')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
