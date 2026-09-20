import asyncio, re, json
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])  # EXT, routes, NEWS
XPAGE=open('ext_post.py').read().split("XPAGE='''")[1].split("'''")[0]
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
report=[]
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profM'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--autoplay-policy=no-user-gesture-required','--headless=new','--window-size=1100,900'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://www.youtube.com/**',yt_route)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    await ctx.route('https://x.com/**',lambda r: r.fulfill(status=200,body=XPAGE,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    errs=[]
    yt=await ctx.new_page(); await yt.goto('https://www.youtube.com/watch?v=TESTVID01'); await yt.wait_for_function('document.querySelector("video").readyState>=2')
    news=await ctx.new_page(); await news.goto('https://harborline.example/x')
    x=await ctx.new_page(); await x.goto('https://x.com/harborlinenews/status/1836000000000000001')
    tid=lambda host: sw.evaluate(f"chrome.tabs.query({{}}).then(t=>t.find(x=>x.url.includes('{host}')).id)")
    ids={'video':await tid('youtube'),'article':await tid('harborline'),'post':await tid('x.com')}
    ann_urls=set(); dup_seen=set()
    for W in (320,360,400):
      for scheme in ('light','dark'):
        for kind in ('video','article','post'):
          pg=await ctx.new_page(); pg.on('pageerror',lambda e: errs.append(str(e)))
          await pg.set_viewport_size({'width':W,'height':720}); await pg.emulate_media(color_scheme=scheme)
          await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={ids[kind]}'); await asyncio.sleep(1.2)
          tag=f'{W}_{scheme}_{kind}'; print('run', tag, flush=True)
          ow=await pg.evaluate('document.documentElement.scrollWidth')
          await pg.screenshot(path=f'mx_{tag}_1.png')
          if kind=='video':
            await pg.fill('.rStart','40'); await pg.press('.rStart','Enter'); await pg.fill('.rEnd','42'); await pg.press('.rEnd','Enter')
            await pg.click('.capBtn'); await pg.wait_for_selector('#videoMode .vCompose:not([hidden])',timeout=30000)
            M='#videoMode '
          elif kind=='article':
            await news.reload(); await asyncio.sleep(1.2)
            await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
            await asyncio.sleep(.8); await pg.click('.grab'); await pg.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=15000)
            M='#articleMode '
          else:
            await pg.click('.pGrab'); await pg.wait_for_selector('#postMode .pCompose:not([hidden])',timeout=15000)
            M='#postMode '
          await asyncio.sleep(.8)
          pub=await pg.eval_on_selector(M+'.publish','e=>Math.round(e.getBoundingClientRect().bottom)')
          ow2=await pg.evaluate('document.documentElement.scrollWidth')
          await pg.screenshot(path=f'mx_{tag}_2.png')
          await pg.fill(M+'.takeInput',f'Matrix check {W} {scheme} {kind}')
          np=asyncio.ensure_future(ctx.wait_for_event('page'))
          await pg.click(M+'.publish'); await asyncio.sleep(.6)
          if await pg.is_visible(M+'.dAny'):
            dup_seen.add(kind); await pg.click(M+'.dAny')
          try:
            ann=await asyncio.wait_for(np, 12)
          except Exception as e:
            await pg.screenshot(path=f'mx_FAIL_{tag}.png'); print('FAIL', tag, await pg.evaluate("document.querySelector('%spublish').disabled" % M), await pg.inner_text(M.strip()+' .pubBar')); raise
          await ann.wait_for_selector('.ann:not(.loading)'); ann_urls.add(ann.url); await ann.close()
          await asyncio.sleep(.5)
          ow3=await pg.evaluate('document.documentElement.scrollWidth')
          await pg.screenshot(path=f'mx_{tag}_3.png')
          report.append((tag, ow, ow2, ow3, pub, pub<=720))
          await pg.close()
    # pages
    anns=sorted(ann_urls)
    samples={}
    for u in anns:
      for k in ('video','article','post'):
        if f'-{k}-' in u or u.endswith(k) or (k in u and k not in samples): pass
    pg=await ctx.new_page(); pg.on('pageerror',lambda e: errs.append(str(e)))
    rec_ids=await sw.evaluate("new Promise(r=>{const o=indexedDB.open('annotated');o.onsuccess=()=>{const t=o.result.transaction('annotations').objectStore('annotations');const q=t.getAllKeys();q.onsuccess=()=>r(q.result)}})") if False else None
    for W in (390,1440):
      for scheme in ('light','dark'):
        await pg.set_viewport_size({'width':W,'height':900}); await pg.emulate_media(color_scheme=scheme)
        shown=set()
        for u in anns:
          kind=[k for k in ('video','article','post') if f'-{k}-' in u.split('#')[1]][0]
          if kind in shown: continue
          shown.add(kind)
          await pg.goto(u); await pg.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(1.2)
          ow=await pg.evaluate('document.documentElement.scrollWidth')
          await pg.screenshot(path=f'mxp_{W}_{scheme}_{kind}.png', full_page=(W==390))
          report.append((f'page {W} {scheme} {kind}', ow, None, None, None, ow<=W))
        await pg.goto(f'chrome-extension://{extid}/feed.html'); await pg.wait_for_selector('.feedHead'); await asyncio.sleep(.5)
        ow=await pg.evaluate('document.documentElement.scrollWidth')
        await pg.screenshot(path=f'mxp_{W}_{scheme}_feed.png', full_page=(W==390))
        report.append((f'feed {W} {scheme}', ow, None, None, None, ow<=W))
    for r in report: print(r)
    print('duplicate warning appeared for:', sorted(dup_seen))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
