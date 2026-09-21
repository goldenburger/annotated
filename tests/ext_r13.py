import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
def tw(i,name,handle,text,extra=''):
    return f'''<article data-testid="tweet" style="padding:12px;border-bottom:1px solid #333"><div data-testid="User-Name"><span>{name}</span><span>{handle}</span><a href="/{handle[1:]}/status/19702731897040{i}"><time datetime="2026-09-19T08:00:00Z">8h</time></a></div>
<div data-testid="tweetText" style="white-space:pre-wrap">{text}</div>{extra}</article>'''
POST='<!doctype html><title>Post / X</title><body style="background:#000;color:#fff;font:16px system-ui;max-width:600px;margin:0 auto">'+\
 tw(78,'DogeDesigner','@cb_doge','Elon Musk says the Roadster demo will be a banger.\n\n"It\'ll be a banger. Excitement guaranteed. Success is not guaranteed, but excitement is."')+\
 tw(90,'Jeheskiel Sunloy','@jsunloy','Imagine the tension on that stage, you could cut it with a knife.')+'</body>'
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profT13'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/cb_doge/status/**',lambda r: r.fulfill(status=200,body=POST,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; errs=[]
    x=await ctx.new_page(); await x.set_viewport_size({'width':900,'height':800}); await x.goto('https://x.com/cb_doge/status/1970273189704078')
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('cb_doge')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':800}); pan.on('pageerror',lambda e: errs.append(str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    P='#postMode '
    print('signed out: publish line shown?', await pan.evaluate("document.body.classList.contains('signedOut')"))
    async def select(i, a, b):
        await x.bring_to_front()
        await x.evaluate(f'''(()=>{{const n=document.querySelectorAll('[data-testid="tweetText"]')[{i}].firstChild;const t=n.textContent;const s=t.indexOf({a!r});const r=document.createRange();r.setStart(n,s);r.setEnd(n,s+{b});getSelection().removeAllRanges();getSelection().addRange(r)}})()''')
        await asyncio.sleep(.8)
    # Annotate button on the page starts the capture with the quote
    await select(0,'Success',25)
    await x.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()")
    await pan.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000); await asyncio.sleep(.4)
    print('Annotate button captured with quote:', repr(await pan.inner_text(P+'.pQuote')))
    print('post folded away:', not await pan.is_visible(P+'.pText'), '| show-as kept:', await pan.is_visible(P+'.showAs'))
    print('sign-in line above Publish:', await pan.is_visible(P+'.pubSignIn'))
    await pan.fill(P+'.takeInput','first')
    await pan.evaluate("() => Prefs.set('afterPublish','page')"); np=asyncio.ensure_future(ctx.wait_for_event('page')); await pan.click(P+'.publish'); ann=await asyncio.wait_for(np,15); await asyncio.sleep(1)
    print('remove-quote hidden after publishing:', not await pan.is_visible(P+'.pQuoteX'))
    # a new selection after publishing
    await select(0,'Excitement',22)
    await pan.bring_to_front(); await asyncio.sleep(.5)
    print('new-selection bar:', await pan.is_visible(P+'.pNewSel'))
    await pan.click(P+'.pNewSelGo'); await pan.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000); await asyncio.sleep(.3)
    print('second quote:', repr(await pan.inner_text(P+'.pQuote')))
    await pan.fill(P+'.takeInput','second'); await pan.click(P+'.publish'); await asyncio.sleep(1.5)
    print('no duplicate warning for a different quote:', not await pan.is_visible(P+'.pDup'))
    # a reply
    await pan.click(P+'.pubcard .new'); await asyncio.sleep(.3)
    await select(1,'you could',20)
    await pan.click(P+'.pGrab'); await pan.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000); await asyncio.sleep(.3)
    print('reply captured:', await pan.inner_text(P+'.pTitle'), '|', repr(await pan.inner_text(P+'.pQuote')))
    # side view for a local-only annotation
    ann2=await ctx.new_page(); await ann2.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(1.5)
    print('signed-out profile cards:', await ann2.locator('.card').count(), '| authors:', await ann2.evaluate("[...document.querySelectorAll('.card .cmeta')].map(e=>e.innerText.split(/\\s+/)[0])"))
    tid3=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('annotation.html')).id)")
    side=await ctx.new_page(); await side.set_viewport_size({'width':400,'height':800})
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid3}'); await asyncio.sleep(1.5)
    print('side card for local-only:', (await side.inner_text('#annMode .sideNow')).replace('\n',' | ')[:160], '| copy button:', await side.locator('#annMode .sideCopy').count())
    await pan.screenshot(path='ext_r13_panel.png')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
