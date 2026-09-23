# X opens a profile card when the mouse rests on a name. The recording of 2026-09-22 at 22:17 captured a post
# while one was open, and the card sat over half the post in the screenshot. A capture now keeps those cards
# from being drawn for the few seconds it takes. The card here is solid red, so the answer is in the pixels.
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
POST = ('<!doctype html><html><head><meta charset="utf-8"><title>Jo Bhakdi on X: "SpaceX" / X</title></head>'
        '<body style="background:#000;color:#e7e9ea;font:15px system-ui;max-width:600px;margin:0 auto">'
        '<article data-testid="tweet" style="padding:12px;position:relative"><div data-testid="User-Name"><span>Jo Bhakdi</span><span>@JOBhakdi</span>'
        '<a href="/JOBhakdi/status/1800000000000000001"><time datetime="2026-09-22T08:00:00Z">8h</time></a></div>'
        '<div data-testid="tweetText" lang="en" style="white-space:pre-wrap;font-size:18px">SpaceX has another unlock Thursday, September 24th. Roughly 15% more float hits the market.\n\n'
        'I have watched this pattern before, so here is the call. SpaceX drops Thursday, likely below 150.</div></article>'
        '<div id="layers"><div data-testid="hoverCardParent" style="position:fixed;left:20px;top:40px;width:260px;height:260px">'
        '<div data-testid="HoverCard" style="width:100%;height:100%;background:#ff0000"></div></div></div></body></html>')
RED = """async () => { const img = document.querySelector('#postMode .shot'); if (!img || !img.src) return -1;
  const i = new Image(); i.src = img.src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] < 60 && d[k + 2] < 60) n++; return n / (d.length / 4); }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profHOVER'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://x.com/**', lambda r: r.fulfill(status=200, body=POST, headers={'Content-Type': 'text/html; charset=utf-8'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)
    xp = await ctx.new_page(); await xp.set_viewport_size({'width': 900, 'height': 800})
    await xp.goto('https://x.com/JOBhakdi/status/1800000000000000001'); await asyncio.sleep(1.5)
    tid = await sw.evaluate("chrome.tabs.query({url:'https://x.com/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tid}',width:420,height:1000}})")
    pan = await ctx.wait_for_event('page'); await asyncio.sleep(3)
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    shown_before = await xp.evaluate("getComputedStyle(document.querySelector('[data-testid=HoverCard]')).display")
    print('the card before capturing:', shown_before)
    await xp.bring_to_front()
    await pan.click('#postMode .pGrab')
    await pan.wait_for_selector('#postMode .pCompose:not([hidden])', timeout=25000); await asyncio.sleep(1)
    red = await pan.evaluate(RED)
    print(f'share of the screenshot that is the red card: {red:.3f}')
    if red < 0: errs.append('there was no screenshot to look at')
    elif red > 0.002: errs.append(f'the profile card is in the screenshot ({red:.1%} of it)')
    await asyncio.sleep(6)
    after = await xp.evaluate("getComputedStyle(document.querySelector('[data-testid=HoverCard]')).display")
    print('the card a few seconds later:', after)
    if after == 'none': errs.append('X profile cards stayed hidden after the capture')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
