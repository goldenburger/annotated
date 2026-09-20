import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
def tweet(i, name, handle, text):
    return f'''<article data-testid="tweet" style="padding:12px;border-bottom:1px solid #333"><div data-testid="User-Name"><span>{name}</span><span>{handle}</span><a href="/{handle[1:]}/status/18000000000000000{i}"><time datetime="2026-09-19T08:00:00Z">8h</time></a></div>
<div data-testid="tweetText" lang="en" style="white-space:pre-wrap">{text}</div></article>'''
HOME='''<!doctype html><html><head><title>(1) Home / X</title><meta property="og:site_name" content="X (formerly Twitter)"></head><body style="background:#000;color:#e7e9ea;font:15px system-ui;max-width:600px;margin:0 auto">'''+\
  tweet(1,'Whole Mars Catalog','@wholemars','Human brain is two separate organs, Stanford Medicine-led research finds')+\
  tweet(2,'Evan','@StockMKTNewz',"Yesterday's headlines:\n\n- Warren Buffett retires in the morning\n- A Rave happens at the NYSE at night\n\nThis feels about right for the 2026 stock market")+'</body></html>'
LATE='''<!doctype html><html><head><title>Post / X</title></head><body style="background:#000;color:#fff"><main id="m">Loading</main>
<script>setTimeout(()=>{document.getElementById('m').innerHTML=`'''+tweet(1,'Whole Mars Catalog','@wholemars','Human brain is two separate organs').replace('`','')+'''`},3500)</script></body></html>'''
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profX'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/home',lambda r: r.fulfill(status=200,body=HOME,headers={'Content-Type':'text/html'}))
    await ctx.route('https://x.com/wholemars/status/**',lambda r: r.fulfill(status=200,body=LATE,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    home=await ctx.new_page(); await home.set_viewport_size({'width':900,'height':800}); await home.goto('https://x.com/home'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('x.com/home')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':800}); pan.on('pageerror',lambda e: errs.append(str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    print('panel header on the timeline:', (await pan.inner_text('#articleMode .phead')).split('\n')[1:3])
    print('wordmark hidden in native side panel:', not await pan.is_visible('.brand .wordmark'))
    await home.bring_to_front()
    await home.evaluate('''(()=>{const t=document.querySelectorAll('[data-testid="tweetText"]')[1];const n=t.firstChild;const r=document.createRange();r.setStart(n,24);r.setEnd(n,95);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(1)
    await pan.click('#articleMode .grab'); await pan.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.5)
    print('checks:', (await pan.eval_on_selector('#articleMode .aStatus','e=>e.textContent.replace(/\\s+/g," ")'))[:120])
    await pan.fill('#articleMode .takeInput','Timeline post test')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pan.click('#articleMode .publish')
    ann=await asyncio.wait_for(np,15); ann.on('pageerror',lambda e: errs.append('ANN '+str(e))); await ann.set_viewport_size({'width':1200,'height':1000})
    await ann.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(.8)
    print('panel card:', (await pan.inner_text('#articleMode .pubcard')).replace('\n',' | ')[:160], '| copy/X buttons:', await pan.locator('#articleMode .pubcard .pcopy').count())
    print('page kind label and author line:', (await ann.inner_text('.srccard, .xcard, .xshot')).replace('\n',' | ')[:120] if await ann.locator('.srccard, .xcard, .xshot').count() else 'n/a')
    print('quote:', await ann.evaluate("(()=>{const q=document.querySelector('.postQuote');return q?JSON.stringify(q.innerText):'NONE '+JSON.stringify(document.querySelector('.media').innerHTML.slice(0,300))})()"))
    print('local note:', (await ann.inner_text('.localNote')).replace('\n',' '), '| banner:', await ann.inner_text('.toastText'), '| share hidden:', not await ann.is_visible('.shareBtn'))
    print('source link goes to the post:', await ann.evaluate("(document.querySelector('.srcJump,.orig,a[href*=\"/status/\"]')||{}).href||''"))
    await ann.screenshot(path='ext_x_page.png')
    # late-loading status page
    late=await ctx.new_page(); await late.goto('https://x.com/wholemars/status/180000000000000001')
    tid2=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('/status/')).id)")
    p2=await ctx.new_page(); await p2.set_viewport_size({'width':400,'height':800})
    await p2.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid2}'); await asyncio.sleep(1.5)
    print('before the post loads:', await p2.inner_text('#postMode .pEmptyMsg'))
    await asyncio.sleep(4)
    print('after it loads:', await p2.inner_text('#postMode .pTitle'), '| body shown:', await p2.is_visible('#postMode .pBody'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
