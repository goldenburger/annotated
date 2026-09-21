# Two things the recording on 2026-09-20 showed.
# 1. On a post, the quote came out as the raw drag ("This is such") while the page highlighted the whole snapped
#    sentence. The quote should match the highlight.
# 2. A whole short post ("44 days until the midterm elections", 35 characters) was refused for being under the
#    40 character minimum, even though it is the entire post.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
LONG=("There are so many seasoned software executives who are completely out of their element. "
      "Over the last 20 years, their brains were wired to build apps that deliver value. "
      "This is such a different way to approach how something should work.")
SHORT="44 days until the midterm elections"
def tweet(i, name, handle, text):
    return f'''<article data-testid="tweet" style="padding:12px;border-bottom:1px solid #333"><div data-testid="User-Name"><span>{name}</span><span>{handle}</span><a href="/{handle[1:]}/status/19000000000000000{i}"><time datetime="2026-09-20T08:00:00Z">8h</time></a></div>
<div data-testid="tweetText" lang="en" style="white-space:pre-wrap">{text}</div></article>'''
STATUS='<!doctype html><html><head><title>Nikita Bier on X</title><meta property="og:site_name" content="X (formerly Twitter)"></head><body style="background:#000;color:#e7e9ea;font:15px system-ui;max-width:600px;margin:0 auto">'+tweet(1,'Nikita Bier','@nikitabier',LONG)+'</body></html>'
HOME='<!doctype html><html><head><title>(1) Home / X</title><meta property="og:site_name" content="X (formerly Twitter)"></head><body style="background:#000;color:#e7e9ea;font:15px system-ui;max-width:600px;margin:0 auto">'+tweet(2,'Whole Mars Catalog','@wholemars',SHORT)+'</body></html>'
# Selects part of the middle sentence, the way a person dragging across a few words does.
PICK="""(()=>{const t=document.querySelector('[data-testid="tweetText"]');const n=t.firstChild;
  const i=n.nodeValue.indexOf('%s');const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+%d);
  getSelection().removeAllRanges();getSelection().addRange(r)})()"""
WHOLE="""(()=>{const t=document.querySelector('[data-testid="tweetText"]');const r=document.createRange();
  r.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(r)})()"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profXQ'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/nikitabier/status/**',lambda r: r.fulfill(status=200,body=STATUS,headers={'Content-Type':'text/html'}))
    await ctx.route('https://x.com/home',lambda r: r.fulfill(status=200,body=HOME,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]

    # ---- 1. the quote on a post matches the sentence the page highlights ----
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    await pg.goto('https://x.com/nikitabier/status/190000000000000001'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('/status/')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    await pg.bring_to_front(); await pg.evaluate(PICK % ('This is such',12)); await asyncio.sleep(1)
    await pan.bring_to_front(); await pan.click('#postMode .pGrab')
    await pan.wait_for_selector('#postMode .pQuoteBox:not([hidden])',timeout=15000); await asyncio.sleep(.4)
    quote=(await pan.inner_text('#postMode .pQuote')).strip()
    print('quote:',repr(quote))
    want='This is such a different way to approach how something should work.'
    if quote!=want: errs.append(f'quote was {quote!r}, wanted the whole sentence')

    # ---- 2. a whole short post is allowed ----
    hm=await ctx.new_page(); await hm.set_viewport_size({'width':900,'height':800})
    await hm.goto('https://x.com/home'); await asyncio.sleep(1)
    htid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('x.com/home')).id)")
    pan2=await ctx.new_page(); await pan2.set_viewport_size({'width':400,'height':900})
    pan2.on('pageerror',lambda e: errs.append('PANEL2 '+str(e)))
    await pan2.goto(f'chrome-extension://{extid}/sidepanel.html?tab={htid}'); await asyncio.sleep(1.5)
    await hm.bring_to_front(); await hm.evaluate(WHOLE); await asyncio.sleep(1.2)
    await pan2.bring_to_front(); await asyncio.sleep(.5)
    quoted=(await pan2.inner_text('#articleMode .selQuote')).strip()
    err=(await pan2.inner_text('#articleMode .selErr')).strip() if await pan2.is_visible('#articleMode .selErr') else ''
    count=(await pan2.inner_text('#articleMode .selCount')).strip()
    disabled=await pan2.locator('#articleMode .grab').is_disabled()
    print('short post selected:',repr(quoted),'|',count,'| error:',repr(err),'| capture disabled:',disabled)
    if err: errs.append('a whole short post was still refused with '+repr(err))
    if disabled: errs.append('capture was disabled for a whole short post')
    if quoted!=SHORT: errs.append('the selected text was '+repr(quoted)+', wanted the whole post')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
