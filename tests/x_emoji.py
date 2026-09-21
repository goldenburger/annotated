# X draws emoji as an image with the character in its alt, so innerText and Range.toString both skipped them.
# The recording on 2026-09-21 showed a post ending "CyberSUV" with the emoji gone from the preview, the quote
# and the annotation page, while the screenshot right above it still had it.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
DOT="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
EMOJI="\U0001F919"
TEXT=(f'<span>Production is hard and it takes real time.</span>'
      f'<span> This is the CyberSUV <img alt="{EMOJI}" src="{DOT}"> moment.</span>')
STATUS=('<!doctype html><html><head><meta charset="utf-8"><title>Nikita Bier on X</title><meta property="og:site_name" content="X (formerly Twitter)"></head>'
        '<body style="background:#000;color:#e7e9ea;font:15px system-ui;max-width:600px;margin:0 auto">'
        '<article data-testid="tweet" style="padding:12px"><div data-testid="User-Name"><span>Nikita Bier</span><span>@nikitabier</span>'
        '<a href="/nikitabier/status/190000000000000021"><time datetime="2026-09-21T08:00:00Z">8h</time></a></div>'
        f'<div data-testid="tweetText" lang="en" style="white-space:pre-wrap">{TEXT}</div></article></body></html>')
# Select a few words inside the second sentence, the way a person dragging does.
PICK="""(()=>{const s=document.querySelectorAll('[data-testid="tweetText"] span')[1];
  const r=document.createRange();r.setStart(s.firstChild,1);r.setEnd(s.firstChild,12);
  getSelection().removeAllRanges();getSelection().addRange(r)})()"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profXE'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/nikitabier/status/**',lambda r: r.fulfill(status=200,body=STATUS,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    await pg.goto('https://x.com/nikitabier/status/190000000000000021'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('/status/')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    # Exact is the default now, and this test is about what ends up in the quote.
    await pan.evaluate("Prefs.set('snap','sentences')"); await asyncio.sleep(1.2)

    preview=(await pan.inner_text('#postMode .pText')).strip()
    print('preview:',repr(preview))
    if EMOJI not in preview: errs.append('the post preview lost the emoji')

    await pg.bring_to_front(); await pg.evaluate(PICK); await asyncio.sleep(1)
    await pan.bring_to_front(); await pan.click('#postMode .pGrab')
    await pan.wait_for_selector('#postMode .pQuoteBox:not([hidden])',timeout=20000); await asyncio.sleep(.4)
    quote=(await pan.inner_text('#postMode .pQuote')).strip()
    print('quote:',repr(quote))
    if EMOJI not in quote: errs.append('the quote lost the emoji')
    if quote!='This is the CyberSUV '+EMOJI+' moment.': errs.append('the quote was not the whole sentence')

    # The text carried into the annotation keeps it too.
    await pan.fill('#postMode .takeInput','Emoji test')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pan.click('#postMode .publish')
    ann=await asyncio.wait_for(np,20); ann.on('pageerror',lambda e: errs.append('ANN '+str(e)))
    await ann.wait_for_selector('.ann:not(.loading)',timeout=20000); await asyncio.sleep(.8)
    onpage=(await ann.inner_text('.postQuote')).strip() if await ann.locator('.postQuote').count() else ''
    print('on the annotation page:',repr(onpage))
    if EMOJI not in onpage: errs.append('the annotation page lost the emoji')
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
