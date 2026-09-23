# The empty panel names what is most talked about on annotated lately, above the places to start. It shows
# three rows at most, writes other people's words as text, drops any row whose address is not a web page,
# opens the source when a row is pressed, and says nothing at all when there is nothing to say. Display
# settings can turn the suggestions off, which takes the talked about list and the places to start and
# leaves pasting a link and clipping a podcast by name.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
PAGE = lambda t: f'<!doctype html><title>{t}</title><p>{t}</p>'
ROWS = [
  {'kind': 'post', 'title': 'Sawyer <img src=x onerror="window.__owned=1"> on X', 'url': 'https://x.com/s/status/1', 'video_id': None,
   'annotations': 4, 'people': 3, 'replies': 7, 'reactions': 2, 'score': 9},
  {'kind': 'video', 'title': 'All-In, episode 240', 'url': None, 'video_id': 'abcDEF12345', 'annotations': 2, 'people': 1, 'replies': 1, 'reactions': 0, 'score': 5},
  {'kind': 'article', 'title': 'Not a web page', 'url': 'javascript:alert(1)', 'video_id': None, 'annotations': 9, 'people': 9, 'replies': 9, 'reactions': 0, 'score': 4},
  {'kind': 'audio', 'title': 'Acquired: Costco', 'url': 'https://www.acquired.fm/episodes/costco', 'video_id': None, 'annotations': 1, 'people': 1, 'replies': 0, 'reactions': 0, 'score': 3},
  {'kind': 'article', 'title': 'A fourth one', 'url': 'https://news.example/four', 'video_id': None, 'annotations': 1, 'people': 1, 'replies': 0, 'reactions': 0, 'score': 1},
]

async def main():
  errs = []
  answer = {'rows': ROWS}
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profTALK'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    for host in ['https://www.youtube.com/**', 'https://x.com/**', 'https://www.acquired.fm/**', 'https://news.example/**',
                 'https://open.spotify.com/**', 'https://podcasts.apple.com/**', 'https://news.google.com/**']:
      await ctx.route(host, lambda r: r.fulfill(status=200, body=PAGE('stand-in'), headers={'Content-Type': 'text/html'}))
    async def db(route):
      if '/rpc/talked_about' in route.request.url:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(answer['rows']))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await ctx.route(SUPA + '/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    async def panel_beside(url):
      tab = await ctx.new_page(); await tab.goto(url); await asyncio.sleep(.6)
      tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
      pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 800})
      pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
      await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.2)
      return tid, pan

    tid, pan = await panel_beside('about:blank')
    rows = await pan.eval_on_selector_all('#browseMode .startBlock .talkRow', 'bs=>bs.map(b=>[b.querySelector(".talkName").textContent, b.querySelector(".talkWhy").textContent, b.dataset.url])')
    for r in rows: print('row:', r)
    if len(rows) != 3: errs.append(f'{len(rows)} rows were shown, wanted three')
    if any('javascript' in (r[2] or '') for r in rows): errs.append('a row that is not a web page was offered')
    if rows and rows[0][1] != '3 people annotating · 7 replies': errs.append(f'the first row says {rows[0][1]!r}')
    if len(rows) > 1 and rows[1][2] != 'https://www.youtube.com/watch?v=abcDEF12345': errs.append(f'the video opens {rows[1][2]!r}')
    if len(rows) > 1 and rows[1][1] != '2 annotations · 1 reply': errs.append(f'the second row says {rows[1][1]!r}')
    if await pan.evaluate('!!window.__owned || !!document.querySelector(".talkRow img")'): errs.append('a title reached the panel as markup')
    order = await pan.evaluate("[...document.querySelectorAll('#browseMode .startBlock .talked, #browseMode .startBlock .goSites, #browseMode .startBlock .pasteForm')].map(e=>e.className)")
    print('order:', order)
    await pan.screenshot(path='talked.png')

    await pan.click('#browseMode .startBlock .talkRow >> nth=0'); await asyncio.sleep(1.2)
    now = await sw.evaluate(f"chrome.tabs.get({tid}).then(t=>t.url)")
    print('the blank tab is now on:', now)
    if 'x.com/s/status/1' not in now: errs.append(f'pressing the first row went to {now}')

    # A clean slate, beside a fresh blank tab, since the first one has gone to X.
    tid, pan = await panel_beside('about:blank')
    await pan.evaluate("Prefs.set('suggest', false)"); await asyncio.sleep(.8)
    seen = await pan.evaluate("""() => { const vis = (s) => { const e = document.querySelector('#browseMode .startBlock ' + s); return !!e && e.offsetParent !== null; };
      return { talked: vis('.talked'), sites: vis('.goSites'), paste: vis('.pasteForm'), byName: vis('.fpAny') }; }""")
    print('with suggestions off:', seen)
    if seen['talked'] or seen['sites']: errs.append(f'suggestions still showed with the setting off: {seen}')
    if not (seen['paste'] and seen['byName']): errs.append(f'the tools went with the suggestions: {seen}')
    await pan.screenshot(path='talked_off.png')
    await pan.evaluate("Prefs.set('suggest', true)"); await asyncio.sleep(.8)
    if not await pan.evaluate("document.querySelector('#browseMode .startBlock .talked').offsetParent !== null"): errs.append('the list did not come back when turned on')

    # The switch itself, in Display settings.
    label = await pan.evaluate("""async () => { const g = document.querySelector('.gearBtn'); if (g) g.click();
      await new Promise(r => setTimeout(r, 400)); const i = document.querySelector('.dmSuggest'); return i ? i.closest('label').textContent.trim() + ' | ' + i.checked : null; }""")
    print('the switch:', label)
    if not label or 'Suggest places to start' not in label or not label.endswith('true'): errs.append(f'the switch reads {label!r}')

    # Nothing talked about: no heading over an empty box.
    answer['rows'] = []
    tid3, pan3 = await panel_beside('chrome://version/')
    shown = await pan3.evaluate("(() => { const t = document.querySelector('#browseMode .startBlock .talked'); return t ? t.offsetParent !== null : 'missing'; })()")
    sites = await pan3.evaluate("document.querySelectorAll('#browseMode .startBlock .goSite').length")
    print('with nothing talked about, the list shows:', shown, '| places to start:', sites)
    if shown is not False: errs.append(f'the list showed with nothing in it: {shown}')
    if sites != 5: errs.append('the places to start went with the empty list')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
