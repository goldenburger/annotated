# The recording of 2026-09-26 at 04:06.
#   1. The plane at the foot replays everything, the brief's opening flight included.
#   2. It goes to the top at once, not by gliding up through the page.
#   3. The panel's way back to our own full pages says "your profile page" and "the feed page".
#   4. Unfollowing a For you card gives it a reason of its own, not the one beside it.
#   5. After Clear all, "Make one above" takes you up to the try-it, and Clear all itself does not move the page.
import asyncio, pathlib, mimetypes, json, time
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
now = int(time.time() * 1000)
YOURS = [{'kind': 'article', 'take': 'One.', 'quote': 'words', 'source': 'The annotated.com brief', 'at': now - 2000},
         {'kind': 'article', 'take': 'Two.', 'quote': 'more words', 'source': 'The annotated.com brief', 'at': now - 3000}]

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await c.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); sessionStorage.setItem('seeded', '1'); }} }} catch (e) {{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 1, 2. As if the opening had already played this visit.
    await pg.goto(URL + '?planes'); await asyncio.sleep(1)
    await pg.evaluate("sessionStorage.setItem('annotated-plane-seen', '1'); localStorage.setItem('annotated-features-flown', String(Date.now()))")
    await pg.goto(URL + '?planes'); await asyncio.sleep(1.5)
    await pg.evaluate("scrollTo(0, document.body.scrollHeight)"); await asyncio.sleep(.4)
    await pg.click('.pdFoot .flyAgain .pdFlyer', force=True)
    ys = []
    for _ in range(12):
      await asyncio.sleep(.1)
      try: ys.append(await pg.evaluate("scrollY"))
      except Exception: ys.append(None)
    await pg.wait_for_load_state(); await asyncio.sleep(.3)
    st = await pg.evaluate("({ y: scrollY, seen: sessionStorage.getItem('annotated-plane-seen'), waiting: document.documentElement.classList.contains('planes-waiting') || !!document.querySelector('.pl-layer') })")
    glide = [y for y in ys if y is not None and 0 < y < ys[0] - 50]
    print('1, 2. scroll after pressing:', ys, '| after the reload:', st)
    if st['seen'] == '1' and not st['waiting']: errs.append(f"the brief's opening did not play again: {st}")
    if len(glide) > 1: errs.append(f'the page glided up instead of going to the top: {ys}')
    # 4. Following Sam's card is on at first; unfollowing him must not give Priya's reason.
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1.5)
    await pg.evaluate("document.querySelector('.ftFY').scrollIntoView({ block: 'center' })")
    await pg.click('.ftFY:nth-child(1) .ftFollow'); await asyncio.sleep(.2)
    whys = await pg.evaluate("[...document.querySelectorAll('.ftFY .ftWhy span')].map((s) => s.textContent)")
    print('4. reasons after unfollowing Sam:', whys)
    if len(set(whys)) != len(whys): errs.append(f'two cards give the same reason: {whys}')
    # 5. Clear all does not move the page, and Make one above goes up to the try-it.
    await pg.evaluate("document.querySelector('.landLatest').scrollIntoView({ block: 'center' })"); await asyncio.sleep(.5)
    y0 = await pg.evaluate("scrollY")
    await pg.click('.llClear'); await asyncio.sleep(1.5)
    y1 = await pg.evaluate("scrollY")
    await pg.click('.llMake'); await asyncio.sleep(1.2)
    seen = await pg.evaluate("(() => { const r = document.querySelector('.heroTry, .tryit').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()")
    print('5. scroll before and after Clear all:', y0, y1, '| the try-it in view after Make one above:', seen)
    if abs(y1 - y0) > 120: errs.append(f'Clear all moved the page: {y0} to {y1}')
    if not seen: errs.append('Make one above did not go up to the try-it')
    await b.close()
    # 3. The panel's names for our own pages.
    ctx = await p.chromium.launch_persistent_context(prof('prof0406'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pv = await ctx.new_page(); await pv.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    names = await pv.evaluate("[cleanTitle('Your profile | annotated'), cleanTitle('Feed | annotated'), cleanTitle('Harbor story')]")
    print('3. the way back names:', names)
    if names != ['your profile page', 'the feed page', 'Harbor story']: errs.append(f'the way back names our pages {names}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
