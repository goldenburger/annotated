import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
EP=open(PODCAST,'rb').read()
PAGE='''<!doctype html><html><head><title>Can overnight buses work? - The Transit Hour</title>
<meta property="og:type" content="music.song"><meta property="og:title" content="Can overnight buses work?"><meta property="og:site_name" content="The Transit Hour">
</head><body><h1>Can overnight buses work?</h1><p>Episode 41.</p><audio controls preload="auto" src="https://cdn.transithour.example/ep41.webm"></audio></body></html>'''
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profP'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--autoplay-policy=no-user-gesture-required','--headless=new','--window-size=1100,900'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://thetransithour.example/**',lambda r: r.fulfill(status=200,body=PAGE,headers={'Content-Type':'text/html'}))
    async def cdn(route):
      rng=route.request.headers.get('range')
      h={'Content-Type':'audio/webm','Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'}
      if rng and rng.startswith('bytes='):
        a,b=rng[6:].split('-'); a=int(a); b=int(b) if b else len(EP)-1
        h.update({'Content-Range':f'bytes {a}-{b}/{len(EP)}','Content-Length':str(b-a+1)})
        await route.fulfill(status=206,body=EP[a:b+1],headers=h)
      else:
        h['Content-Length']=str(len(EP)); await route.fulfill(status=200,body=EP,headers=h)
    await ctx.route('https://cdn.transithour.example/**',cdn)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.goto('https://thetransithour.example/episodes/41'); await pg.wait_for_function('document.querySelector("audio").readyState>=1')
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('transithour')).id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tid}',width:420,height:900}})")
    panel=await ctx.wait_for_event('page'); errs=[]; panel.on('pageerror',lambda e: errs.append(str(e)))
    await panel.wait_for_selector('#podcastMode:not([hidden]) .vTitle', timeout=15000); await asyncio.sleep(2)
    print('header:', (await panel.inner_text('#podcastMode .phead')).replace('\n',' | ')[:90])
    print('waveform painted:', await panel.eval_on_selector('#podcastMode .wave','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}'))
    await panel.fill('#podcastMode .rStart','30'); await panel.press('#podcastMode .rStart','Enter'); await panel.fill('#podcastMode .rEnd','36'); await panel.press('#podcastMode .rEnd','Enter')
    await panel.click('#podcastMode .capBtn')
    for k in range(14):
      await asyncio.sleep(1)
      st=await panel.evaluate("[document.querySelector('#podcastMode .pText')?.textContent, document.querySelector('#podcastMode .capErr')?.textContent, document.querySelector('#podcastMode .capErr')?.hidden, document.querySelector('#podcastMode .vCompose').hidden]")
      print(k, st)
      if not st[3]: break
    await panel.wait_for_selector('#podcastMode .vCompose:not([hidden])',timeout=5000)
    print('clip card:', (await panel.inner_text('#podcastMode .clipCard')).replace('\n',' | '))
    print('checks:', (await panel.eval_on_selector('#podcastMode .vStatus','e=>e.textContent.replace(/\s+/g," ")'))[:260])
    await panel.fill('#podcastMode .takeInput','Podcast clip in the real extension')
    np=asyncio.ensure_future(ctx.wait_for_event('page'))
    await panel.evaluate("() => Prefs.set('afterPublish','page')"); await panel.click('#podcastMode .publish')
    ann=await asyncio.wait_for(np,15); ann.on('pageerror',lambda e: errs.append('ANN '+str(e)))
    await ann.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(1)
    print('page:', await ann.inner_text('.take'), '| audio', await ann.eval_on_selector('.clipAudio','a=>[a.readyState,Math.round(a.duration)]'), '| back label:', await ann.inner_text('.back'))
    await ann.eval_on_selector('.clipAudio','a=>{a.currentTime=3}'); await asyncio.sleep(.4)
    print('waveform shows progress:', await ann.eval_on_selector('.waveCanvas','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let y=0;for(let i=0;i<d.length;i+=4)if(d[i+3]&&d[i]>240&&d[i+1]>200&&d[i+2]<120)y++;return y}') > 0)
    # switch to text mode
    await panel.bring_to_front(); await panel.click('#podcastMode .pubcard .new'); await asyncio.sleep(.2)
    await panel.click('#podcastMode .modeSeg label >> nth=1'); await asyncio.sleep(1.2)
    print('switched to text mode:', await panel.is_visible('#articleMode'), '| link back:', await panel.inner_text('#articleMode .modeSeg'))
    # protected audio is refused in the real extension too
    # Real encryption keys on the player, the way protected services set them (Clear Key is built into Chrome)
    print('keys set:', await pg.evaluate('''(async()=>{const a=document.querySelector('audio');const acc=await navigator.requestMediaKeySystemAccess('org.w3.clearkey',[{initDataTypes:['webm'],audioCapabilities:[{contentType:'audio/webm; codecs="opus"'}]}]);const k=await acc.createMediaKeys();await a.setMediaKeys(k);return !!a.mediaKeys})()'''))
    await panel.click('#articleMode .modeSeg label >> nth=0'); await asyncio.sleep(2)
    print('route now:', await sw.evaluate(f"chrome.tabs.sendMessage({tid}, {{type:'pod-info'}}).then(r=>r.route)"))
    await panel.click('#podcastMode:not([hidden]) .capBtn'); await asyncio.sleep(1)
    print('protected audio:', await panel.inner_text('#podcastMode .capErr'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
