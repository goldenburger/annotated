# X folds a long post behind a Show more link, and the recording on 2026-09-20 showed that fold saved into the
# screenshot, so the source under the take was visibly cut off. The post should be opened for the shot and put
# back afterwards.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
LONG=" ".join([f"Sentence number {i} of a post that runs on well past the fold." for i in range(1,9)])
STATUS='''<!doctype html><html><head><title>Nikita Bier on X</title><meta property="og:site_name" content="X (formerly Twitter)">
<style>body{background:#000;color:#e7e9ea;font:15px/1.4 system-ui;max-width:600px;margin:0 auto}
.fold{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}</style></head><body>
<article data-testid="tweet" style="padding:12px"><div data-testid="User-Name"><span>Nikita Bier</span><span>@nikitabier</span>
<a href="/nikitabier/status/190000000000000009"><time datetime="2026-09-20T08:00:00Z">8h</time></a></div>
<div data-testid="tweetText" class="fold" lang="en">'''+LONG+'''</div>
<button data-testid="tweet-text-show-more-link">Show more</button></article></body></html>'''
RATIOS="""(()=>{const a=document.querySelector('article[data-testid="tweet"]');const t=a.querySelector('[data-testid="tweetText"]');
  const folded=a.getBoundingClientRect();const f={w:folded.width,h:folded.height};
  t.classList.remove('fold');const open=a.getBoundingClientRect();const o={w:open.width,h:open.height};t.classList.add('fold');
  return {folded:f.h/f.w, open:o.h/o.w};})()"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profXF'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/nikitabier/status/**',lambda r: r.fulfill(status=200,body=STATUS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    await pg.goto('https://x.com/nikitabier/status/190000000000000009'); await asyncio.sleep(1)
    r=await pg.evaluate(RATIOS)
    print('post shape folded %.3f, open %.3f' % (r['folded'], r['open']))
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('/status/')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    # The post has to be the tab in front, because that is the only tab Chrome will give a picture of and
    # the panel now refuses rather than taking a picture of somewhere else. Clicking through evaluate keeps
    # the post in front while the panel's own button is pressed.
    await pg.bring_to_front()
    await pan.evaluate("() => document.querySelector('#postMode .pGrab').click()")
    await pan.wait_for_selector('#postMode .ctxthumb:not([hidden])',timeout=20000); await asyncio.sleep(.6)
    shot=await pan.evaluate("(()=>{const i=document.querySelector('#postMode .shot');return i&&i.naturalWidth?i.naturalHeight/i.naturalWidth:0})()")
    print('screenshot shape %.3f' % shot)
    if not shot: errs.append('no screenshot was taken')
    elif abs(shot-r['open']) > abs(shot-r['folded']): errs.append('the screenshot kept the fold')
    # The page goes back to how it was, so the person is not left looking at an unfolded post.
    await asyncio.sleep(.6)
    back=await pg.evaluate("(()=>{const t=document.querySelector('[data-testid=\"tweetText\"]');const m=document.querySelector('[data-testid=\"tweet-text-show-more-link\"]');\
      return {clamp:getComputedStyle(t).webkitLineClamp, more:getComputedStyle(m).display}})()")
    print('after the shot:',back)
    if back['clamp']=='none': errs.append('the post was left unfolded')
    if back['more']=='none': errs.append('Show more was left hidden')
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
