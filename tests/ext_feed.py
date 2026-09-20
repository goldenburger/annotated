import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
SPOT='<!doctype html><title>Bill Gurley: Searching for Feynman | All-In with Chamath, Jason, Sacks &amp; Friedberg | Podcast on Spotify</title><body style="background:#121212;color:#fff">Spotify episode page</body>'
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFP'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--autoplay-policy=no-user-gesture-required','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://open.spotify.com/**',lambda r: r.fulfill(status=200,body=SPOT,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    sp=await ctx.new_page(); await sp.goto('https://open.spotify.com/episode/abc')
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('spotify')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900}); pan.on('pageerror',lambda e: errs.append(str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}')
    P='#podcastMode '
    await pan.wait_for_selector(P+'.fpList li', timeout=20000)
    print('search box starts with:', await pan.input_value(P+'.fpQ'))
    print('status:', await pan.inner_text(P+'.fpStatus'))
    print('first results:', [x.replace('\n',' | ')[:90] for x in await pan.eval_on_selector_all(P+'.fpList li','els=>els.slice(0,2).map(e=>e.innerText)')])
    await pan.screenshot(path='ext_feed_results.png')
    await pan.click(P+'.fpList li button >> nth=0')
    await pan.wait_for_selector(P+'.fpClip:not([hidden]) .vTitle', timeout=20000); await asyncio.sleep(3)
    print('episode:', await pan.inner_text(P+'.vTitle'), '|', await pan.inner_text(P+'.vMeta'), '| length:', await pan.inner_text(P+'.ovLen'))
    print('waveform painted:', await pan.eval_on_selector(P+'.wave','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}'))
    await pan.fill(P+'.rStart','10:00'); await pan.press(P+'.rStart','Enter'); await pan.fill(P+'.rEnd','10:20'); await pan.press(P+'.rEnd','Enter'); await asyncio.sleep(2.5)
    print('waveform after moving to 10:00:', await pan.eval_on_selector(P+'.wave','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}'))
    await pan.screenshot(path='ext_feed_trim.png')
    await pan.click(P+'.capBtn')
    await pan.wait_for_selector(P+'.vCompose:not([hidden])', timeout=30000)
    for k in range(20):
      await asyncio.sleep(.5)
      if 'Checking' not in await pan.inner_text(P+'.ccMeta'): break
    print('clip card:', (await pan.inner_text(P+'.clipCard')).replace('\n',' | '))
    print('checks:', (await pan.eval_on_selector(P+'.vStatus','e=>e.textContent.replace(/\\s+/g," ")'))[:330])
    print('log:', [l for l in (await pan.evaluate("document.body.textContent")).split('[') if 'Cut ' in l or 'Episode file' in l][:2])
    await pan.fill(P+'.takeInput','Gurley on Feynman')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pan.click(P+'.publish')
    ann=await asyncio.wait_for(np,15); ann.on('pageerror',lambda e: errs.append('ANN '+str(e))); await ann.set_viewport_size({'width':1200,'height':900})
    await ann.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(1.5)
    print('page audio:', await ann.eval_on_selector('.clipAudio','a=>[a.readyState, Math.round(a.duration*10)/10]'), '| source:', (await ann.inner_text('.srcbar')).replace('\n',' | ')[:160])
    await ann.screenshot(path='ext_feed_page.png')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
