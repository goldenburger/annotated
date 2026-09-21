import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
XPAGE='''<!doctype html><html><head><title>Harborline News on X</title><style>body{font:16px system-ui;max-width:600px;margin:40px auto}article{border:1px solid #ddd;padding:16px;border-radius:12px}</style></head><body>
<div style="height:300px"></div>
<article data-testid="tweet"><div data-testid="User-Name"><span>Harborline News</span> <span>@harborlinenews</span></div>
<div data-testid="tweetText">The city council voted 7 to 2 to fund overnight buses on three routes, starting in November.</div>
<a href="/harborlinenews/status/1836000000000000001"><time datetime="2026-09-17T16:05:00Z">9:05 AM</time></a></article>
<article data-testid="tweet"><div data-testid="User-Name"><span>Someone</span> <span>@someone</span></div><div data-testid="tweetText">A reply</div><a href="/someone/status/1836000000000000999"><time datetime="2026-09-17T17:00:00Z">10 AM</time></a></article>
<div style="height:1200px"></div></body></html>'''
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('prof6'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new','--window-size=1100,900'],no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://x.com/**',lambda r: r.fulfill(status=200,body=XPAGE,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    x=await ctx.new_page(); await x.goto('https://x.com/harborlinenews/status/1836000000000000001')
    tid=await sw.evaluate("chrome.tabs.query({url:'https://x.com/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tid}',width:420,height:900}})")
    panel=await ctx.wait_for_event('page'); errs=[]; panel.on('pageerror',lambda e: errs.append(str(e)))
    await panel.wait_for_selector('#postMode:not([hidden]) .pTitle')
    await asyncio.sleep(.5)
    print('panel:', (await panel.inner_text('#postMode .phead')).replace('\n',' | '), '|', await panel.inner_text('#postMode .pText'))
    await panel.check('#postMode input[value="screenshot"]')
    await panel.click('#postMode .pGrab'); await panel.wait_for_selector('#postMode .pCompose:not([hidden])',timeout=10000)
    print('status:', await panel.inner_text('#postMode .status'))
    src=await panel.get_attribute('#postMode .shot','src'); open('e_postshot.jpg','wb').write(base64.b64decode(src.split(',')[1]))
    await panel.click('#postMode .takeInput'); await panel.keyboard.type('Check the number :eyes:', delay=15)
    await panel.click('#postMode .pollBtn')
    print('panel take:', await panel.input_value('#postMode .takeInput'))
    await panel.evaluate("() => Prefs.set('afterPublish','page')"); np=ctx.wait_for_event('page'); await panel.click('#postMode .publish'); ann=await np
    ann.on('pageerror',lambda e: errs.append('ANN '+str(e)))
    await ann.wait_for_selector('.ann:not(.loading)')
    print('poll on page:', await ann.locator('.pollOpt').count())
    print('page shows screenshot:', await ann.locator('.xshot').count(), '| link:', await ann.get_attribute('.xshot a','href'))
    await ann.click('.moreBtn'); await ann.click('.editBtn'); await ann.fill('.editText','Edited in extension'); await ann.click('.editSave'); await asyncio.sleep(.4)
    await ann.click('.reactBtn'); await ann.click('.quickBar .qE >> nth=0'); await asyncio.sleep(.3)
    await ann.click('.cText'); await ann.keyboard.type('Nice :fire:', delay=15); await ann.click('.cPost'); await asyncio.sleep(.3)
    await ann.reload(); await ann.wait_for_selector('.ann:not(.loading)')
    print('after reload:', await ann.inner_text('.take'), '| reactions:', (await ann.inner_text('.reactHost')).replace('\n',' '), '| comment:', await ann.inner_text('.cList p'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
