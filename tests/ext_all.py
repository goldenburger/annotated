import asyncio, re, base64
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
SRC=open('src.webm','rb').read()
YT='''<!doctype html><title>Test clip - YouTube</title><h1 class="title">Spike test video</h1>
<div id="movie_player"><video class="html5-main-video" src="/media/src.webm" width="640"></video></div>'''
BODY=open('article_body.html').read()
NEWS=f'''<!doctype html><html><head><title>Overnight buses trial - Harborline News</title>
<style>body{{font:18px/1.6 Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px}}</style></head><body><article>{BODY}</article><div style="height:900px"></div></body></html>'''
async def yt_route(r):
    u=r.request.url
    if '/media/' in u:
        rng=r.request.headers.get('range'); n=len(SRC)
        if rng:
            a,b=re.match(r'bytes=(\d*)-(\d*)',rng).groups(); a=int(a or 0); b=int(b) if b else n-1
            await r.fulfill(status=206,body=SRC[a:b+1],headers={'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Range':f'bytes {a}-{b}/{n}'})
        else: await r.fulfill(status=200,body=SRC,headers={'Content-Type':'video/webm'})
    else: await r.fulfill(status=200,body=YT,headers={'Content-Type':'text/html'})
async def open_panel(ctx, sw, extid, tabid):
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tabid}',width:420,height:1000}})")
    return await ctx.wait_for_event('page')
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('prof3'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--autoplay-policy=no-user-gesture-required','--headless=new','--window-size=1100,900','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await ctx.add_init_script(NO_MAILTO)
    errs=[]
    ctx.on('weberror', lambda e: errs.append(str(e.error)))
    await ctx.route('https://www.youtube.com/**',yt_route)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    # ---------- VIDEO ----------
    yt=await ctx.new_page(); await yt.goto('https://www.youtube.com/watch?v=TESTVID01')
    await yt.wait_for_function('document.querySelector("video").readyState>=2')
    tid=await sw.evaluate("chrome.tabs.query({url:'https://www.youtube.com/*'}).then(t=>t[0].id)")
    panel=await open_panel(ctx,sw,extid,tid)
    panel.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await panel.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    await yt.evaluate('document.querySelector("video").currentTime=30'); await asyncio.sleep(1); await panel.click('.setStart')
    await yt.evaluate('document.querySelector("video").currentTime=38'); await asyncio.sleep(1); await panel.click('.setEnd')
    print('scale (zoomed view):', await panel.inner_text('.scale'))
    await panel.click('.capBtn')
    await panel.wait_for_selector('.vCompose:not([hidden])',timeout=30000)
    print('status:', await panel.inner_text('.vStatus .status'))
    print('checks visible (should be False):', await panel.is_visible('.vStatus .checks'))
    print('label:', await panel.inner_text('.resLabel'))
    await panel.click('.csChange'); await asyncio.sleep(.3)
    await yt.evaluate('document.querySelector("video").currentTime=50'); await asyncio.sleep(1); await panel.click('.setEnd')
    await asyncio.sleep(.5); print('stale label:', await panel.inner_text('.resLabel'))
    await yt.evaluate('document.querySelector("video").currentTime=38'); await asyncio.sleep(1); await panel.click('.setEnd')
    await asyncio.sleep(.5); print('back to fresh:', await panel.inner_text('.resLabel'))
    tags_wrap = await panel.evaluate("(()=>{const b=[...document.querySelectorAll('#videoMode .tagbtn')];return new Set(b.map(x=>x.offsetTop)).size})()")
    print('tag rows:', tags_wrap)
    await panel.fill('#videoMode .takeInput','Watch the bars at 0:34.')
    await panel.click('#videoMode .tagbtn >> text=Fact check')
    await panel.click('#videoMode .recBtn'); await asyncio.sleep(2); await panel.click('#videoMode .recStop')
    await panel.wait_for_selector('#videoMode .voiceOut:not([hidden])')
    newpage = ctx.wait_for_event('page')
    await panel.evaluate("() => Prefs.set('afterPublish','page')"); await panel.click('#videoMode .publish')
    ann = await newpage
    ann.on('pageerror',lambda e: errs.append('ANN '+str(e)))
    await ann.wait_for_selector('.ann:not(.loading)',timeout=10000)
    print('ann url:', ann.url.split('/')[-1])
    print('video ready:', await ann.eval_on_selector('.clipVideo','v=>v.readyState'), 'errors shown:', await ann.locator('.mediaErr').count())
    print('published card:', await panel.inner_text('.vPublished'))
    print('local-only: share hidden', not await ann.is_visible('.shareBtn'), '| banner:', await ann.inner_text('.toastText'))
    await ann.keyboard.press('Escape')
    if await ann.locator('.inviteOpen').count() and await ann.is_visible('.inviteOpen'):
      await ann.click('.inviteOpen'); await ann.click('.inviteBtn'); print('invite err:', await ann.inner_text('.inviteMsg')); await ann.fill('.inviteEmail','a@b.co'); print('msg hidden after typing:', not await ann.is_visible('.inviteMsg'))
    else: print('toast had faded after 10 seconds, as designed')
    xhref=await ann.get_attribute('.actions a','href'); print('x text:', xhref.split('text=')[1].split('&')[0])
    await ann.fill('.cText','Nice catch'); await ann.click('.cPost'); print('comment:', await ann.inner_text('.cList'))
    await ann.screenshot(path='e_ann_video.png', full_page=True)
    # duplicate check: recapture same range and publish again
    await panel.click('.capBtn'); await panel.wait_for_selector('#videoMode .vCompose:not([hidden])',timeout=30000)
    await panel.fill('#videoMode .takeInput','dup'); await panel.click('#videoMode .publish'); await asyncio.sleep(.6)
    print('ext dup warning:', (await panel.inner_text('#videoMode .vDup')).replace('\n',' | '))
    await panel.screenshot(path='e_panel_video.png', full_page=True)
    # ---------- ARTICLE ----------
    news=await ctx.new_page(); await news.goto('https://harborline.example/2026/09/17/overnight-buses-trial')
    await news.bring_to_front()
    nid=await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    ap=await open_panel(ctx,sw,extid,nid)
    ap.on('pageerror',lambda e: errs.append('APANEL '+str(e)))
    await ap.wait_for_selector('#articleMode:not([hidden]) .aTitle')
    await asyncio.sleep(.5)
    # fragment selection mid-sentence in paragraph 2
    await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[1].firstChild;const r=document.createRange();r.setStart(p,p.nodeValue.indexOf("paid")+2);r.setEnd(p,p.nodeValue.indexOf("Alvarez")+4);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    print('sel (auto-expanded):', await ap.inner_text('.selQuote'), '| mode:', await ap.inner_text('.selMode'))
    print('floating button visible:', await news.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"))
    await ap.click('.exactBtn'); await asyncio.sleep(.6)
    print('exact:', await ap.inner_text('.selQuote'))
    await ap.click('.exactBtn'); await asyncio.sleep(.6)
    # click away: selection should be held
    await news.mouse.click(900,700); await asyncio.sleep(.6)
    print('held label:', await ap.inner_text('.selLabel'), '| capture enabled:', not await ap.is_disabled('.grab'))
    # use the floating button path: reselect then click Annotate button in shadow root
    await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,0);r.setEnd(p,p.nodeValue.indexOf("home.")+5);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    await news.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()")
    await ap.wait_for_selector('.aCompose:not([hidden])',timeout=10000)
    print('captured quote:', await ap.inner_text('.capQuote'))
    print('status:', await ap.inner_text('.aStatus .status'))
    src=await ap.get_attribute('.shot','src'); open('e_shot.jpg','wb').write(base64.b64decode(src.split(',')[1]))
    print('placeholder:', await ap.get_attribute('#articleMode .takeInput','placeholder'))
    await ap.fill('#articleMode .takeInput','The 61 percent figure comes from a survey handed out by employers.')
    # annotated's pages share one tab, so the second annotation moves the tab the first one opened rather
    # than opening another beside it.
    was = ann.url
    await ap.evaluate("() => Prefs.set('afterPublish','page')"); await ap.click('#articleMode .publish')
    ann2 = ann
    for _ in range(80):
        if ann2.url != was: break
        await asyncio.sleep(.25)
    if ann2.url == was: raise AssertionError('the annotated tab never moved to the second annotation')
    await ann2.wait_for_selector('.ann:not(.loading)',timeout=10000)
    await ann2.screenshot(path='e_ann_article.png', full_page=True)
    print('article page order:', await ann2.evaluate("[...document.querySelector('.media').children].map(e=>e.className)"), '| screenshot shows:', await ann2.is_visible('.pageShot img'), await ann2.eval_on_selector('.pageShot img','i=>i.naturalWidth'))
    print('stats on 2nd page:', await ann2.inner_text('.stats'))
    await ann2.click('.tagLink') if await ann2.locator('.tagLink').count() else None
    await ann2.click('.profileLink >> nth=1'); await ann2.wait_for_selector('.feedHead')
    print('feed:', (await ann2.inner_text('#feed'))[:200].replace('\n',' | '))
    await ann2.click('.card >> nth=0'); await ann2.wait_for_selector('.ann:not(.loading)')
    print('banner after revisit (should be 0):', await ann2.locator('.banner').count())
    await ann2.click('.moreBtn'); await ann2.click('.delBtn'); await ann2.click('.delYes'); await ann2.wait_for_selector('.feedHead')
    print('after delete feed:', (await ann2.inner_text('.feedHead .stats')))
    await ap.screenshot(path='e_panel_article.png', full_page=True)
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
