# The recording of 2026-09-24 at 20:19.
#   1. The profile page redraws when the panel deletes (the store's stamp changes), rather than listing what is gone.
#   2. The red Delete button stays red when pointed at.
#   3. Beside annotated's own website the panel is Home, not the clip trimmer for the demo episode.
#   4. The panel's old empty screen is not drawn before the first look at the tab.
#   5. Signed out on the website's feed there is no "You" card; there is Sign in. 16. Following says so without
#      "the panel", and an empty feed offers the home page.
#   8. The front page's example does not run for someone who has made one. 10. The headline stays put after it.
#   11. The hero's install area is held back for a moment while the extension's mark may come.
#   13. The clip's card uses the brightest frame in the clip. 14. Cards in Yours so far are one height.
import asyncio, pathlib, mimetypes, json
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
URL = 'https://annotated-app.netlify.app/'
PUT = """(id) => Store.put(id, { created: Date.now(), item: { kind: 'article', text: 'One two three', meta: { title: 'Harbor story', site: 'harbor' }, url: 'https://h.example/' }, take: { text: 'A take.' } })"""

async def main():
  errs = []
  async with async_playwright() as p:
    # ---- the extension
    ctx = await p.chromium.launch_persistent_context(prof('profW2019'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    # 4.
    html = open(EXT + '/sidepanel.html', encoding='utf-8').read()
    if 'id="empty" class="emptyState shellEmpty" hidden' not in html or 'Open something to annotate' in html:
      errs.append('the old empty screen is drawn before the first look at the tab')
    # 1.
    feed = await ctx.new_page(); await feed.set_viewport_size({'width': 1200, 'height': 800})
    await feed.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(1)
    await feed.evaluate(PUT, 'w-1'); await asyncio.sleep(1.5)
    before = await feed.evaluate("document.querySelectorAll('.cards .card').length")
    await feed.evaluate("Store.del('w-1')"); await asyncio.sleep(1.5)
    after = await feed.evaluate("document.querySelectorAll('.cards .card').length")
    print('1. cards on the profile page before and after a delete elsewhere:', before, after)
    if before != 1 or after != 0: errs.append(f'the page did not redraw after a delete: {before} then {after}')
    # 2.
    await feed.evaluate(PUT, 'w-2'); await asyncio.sleep(1.5)
    await feed.click('.delAllOpen'); await asyncio.sleep(.3)
    await feed.hover('.delAllYes'); await asyncio.sleep(.3)
    bg = await feed.evaluate("getComputedStyle(document.querySelector('.delAllYes')).backgroundColor")
    red = await feed.evaluate("(() => { const d = document.createElement('i'); d.style.color = 'var(--red)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })()")
    print('2. Delete when pointed at:', bg, '| red is', red)
    if bg != red: errs.append(f'the Delete button is not red when pointed at: {bg}')
    # 3.
    site_pg = await ctx.new_page(); await site_pg.goto(URL + '?noplanes'); await asyncio.sleep(1.5)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://annotated-app.netlify.app/*'}).then(t=>t[0].id)")
    side = await ctx.new_page(); await side.set_viewport_size({'width': 400, 'height': 900})
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(3)
    mode = await side.evaluate("({ home: !document.querySelector('#browseMode').hidden, clip: !document.querySelector('#podcastMode').hidden || !document.querySelector('#videoMode').hidden })")
    print('3. beside the website the panel:', mode)
    if mode != {'home': True, 'clip': False}: errs.append(f'beside the website the panel is not Home: {mode}')
    await ctx.close()

    # ---- the website
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 5, 16.
    await pg.goto(URL + '?feed'); await asyncio.sleep(2)
    r = await pg.evaluate("({ you: !!document.querySelector('.rail .who'), signIn: !!document.querySelector('.rail .railSignIn'), make: !!document.querySelector('.esMake') })")
    await pg.evaluate("[...document.querySelectorAll('label, button')].find((x) => x.textContent.trim() === 'Following').click()"); await asyncio.sleep(1)
    follow = await pg.evaluate("(document.querySelector('.emptyState') || {}).textContent || ''")
    print('5, 16. signed out on the feed:', r, '| Following:', follow.strip()[:90])
    if r['you'] or not r['signIn']: errs.append(f'signed out, the feed shows a You card or no Sign in: {r}')
    if 'panel' in follow: errs.append(f'the website tells visitors to sign in from the panel: {follow!r}')
    if not r['make']: errs.append('an empty feed does not offer the home page')
    # 11.
    await pg.add_init_script("window.__held = 0; new MutationObserver(() => { const l = document.querySelector('.land'); if (l && l.classList.contains('landChecking')) window.__held = 1; }).observe(document, { subtree: true, attributes: true, childList: true });")
    await pg.goto(URL + '?noplanes')
    held = bool(await pg.evaluate("window.__held"))
    await asyncio.sleep(1.2)
    later = await pg.evaluate("document.querySelector('.land').classList.contains('landChecking')")
    print('11. the install area held, then shown:', held, not later)
    if not held or later: errs.append(f'the install area was not held back for a moment: {held} {later}')
    # 13, 14.
    await pg.click('#tab-video'); await asyncio.sleep(1.5)
    await pg.click('.st-video .stGo'); await asyncio.sleep(.3)
    await pg.fill('.st-video textarea', 'A clip.'); await pg.click('.st-video .stMake'); await asyncio.sleep(.8)
    await pg.click('#tab-article'); await asyncio.sleep(.3)
    await pg.click('.tiForMe'); await asyncio.sleep(1.5)
    await pg.fill('#tiInput', 'A passage.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1)
    y = await pg.evaluate("JSON.parse(localStorage.getItem('annotated-yours'))")
    clip = [x for x in y if x.get('kind') == 'video'][0]
    bright = json.loads((PUB / 'media' / 'artemis-i-frames.json').read_text())['bright']
    lo, hi = 177 // 2, 199 // 2
    best = max(range(lo, hi + 1), key=lambda i: bright[i])
    print('13. the clip card uses frame', clip['thumb']['idx'], '| the brightest in the clip is', best)
    if clip['thumb']['idx'] != best: errs.append(f"the clip card does not use the brightest frame: {clip['thumb']['idx']} not {best}")
    hs = await pg.evaluate("[...document.querySelectorAll('.llRow .yours .card')].map((c) => Math.round(c.getBoundingClientRect().height))")
    print('14. card heights:', hs)
    if len(hs) != 2 or len(set(hs)) != 1: errs.append(f'the cards are not one height: {hs}')
    # 8, 10.
    await pg.goto(URL + '?noplanes'); await pg.mouse.move(700, 890); await asyncio.sleep(7)
    ran = await pg.evaluate("({ lift: !document.querySelector('.tiLift').hidden, marks: document.querySelectorAll('.tiText mark').length, word: document.querySelector('.heroMark').textContent })")
    print('8, 10. back with two made, after seven seconds:', ran)
    if ran['lift'] or ran['marks']: errs.append(f'the example ran again for someone who has made one: {ran}')
    if ran['word'] != 'anything': errs.append(f'the headline changed on its own: {ran}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
