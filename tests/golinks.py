# An empty panel offers places to start from, not only a box to paste a link into. A blank tab goes straight
# there, and any other page stays where it was while the site opens in a tab of its own.
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
PAGE = lambda t: f'<!doctype html><title>{t}</title><p>{t}</p>'

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profGO'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    for host in ['https://www.youtube.com/**', 'https://x.com/**', 'https://open.spotify.com/**', 'https://podcasts.apple.com/**', 'https://news.google.com/**']:
      await ctx.route(host, lambda r: r.fulfill(status=200, body=PAGE('stand-in'), headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    async def panel_beside(url):
      tab = await ctx.new_page(); await tab.goto(url); await asyncio.sleep(.6)
      # The tab just opened is the one with the highest id. Edge renames chrome:// pages, so the address is no help.
      tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
      pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 800})
      pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
      await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.8)
      return tid, pan

    tid, pan = await panel_beside('about:blank')
    names = await pan.eval_on_selector_all('#browseMode .startBlock .goSite', 'bs=>bs.map(b=>b.textContent.trim() || b.getAttribute("aria-label"))')
    print('places offered:', names)
    if names != ['YouTube', 'X', 'Spotify', 'Apple Podcasts', 'Google News']: errs.append(f'the places offered were {names}')
    await pan.screenshot(path='golinks.png')
    before = await sw.evaluate("chrome.tabs.query({}).then(t=>t.length)")
    await pan.click('#browseMode .startBlock .goSite:has-text("YouTube")'); await asyncio.sleep(1.2)
    now = await sw.evaluate(f"chrome.tabs.get({tid}).then(t=>t.url)")
    after = await sw.evaluate("chrome.tabs.query({}).then(t=>t.length)")
    print('the blank tab is now on:', now, '| tabs before and after:', before, after)
    if 'youtube.com' not in now: errs.append(f'the blank tab did not go to YouTube, it is on {now}')
    if after != before: errs.append('a blank tab was left behind while a new one opened')

    tid2, pan2 = await panel_beside('chrome://version/')
    before = await sw.evaluate("chrome.tabs.query({}).then(t=>t.length)")
    await pan2.click('#browseMode .startBlock .goSite[aria-label="X"]'); await asyncio.sleep(1.2)
    kept = await sw.evaluate(f"chrome.tabs.get({tid2}).then(t=>t.url)")
    urls = await sw.evaluate("chrome.tabs.query({}).then(t=>t.map(x=>x.url))")
    print('the page that was open is still on:', kept, '| an X tab exists:', any('x.com' in u for u in urls))
    if 'version' not in kept: errs.append(f'a page that was open was replaced, it is now on {kept}')
    if not any('x.com' in u for u in urls): errs.append('X did not open')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
