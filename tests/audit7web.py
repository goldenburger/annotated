# The seventh pass of the audit of 2026-09-29, on the website.
#   1. A returning person's front page is drawn from the stored session, without waiting on a token refresh that
#      the auth server does not answer.
#   2. A feed tab come back into view keeps its list when the database cannot be reached, rather than drawing
#      "These annotations did not load" over it.
#   3. The clip's picture of frames is fetched only by the front page, not by the feed.
#   4. The reading scripts all run, in order, on an annotation's page.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db, ROWS, A

STORED = {'access_token': 'x', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 30,
          'refresh_token': 'r', 'user': {'id': A, 'aud': 'authenticated', 'email': 'robo@example.com',
          'user_metadata': {'full_name': 'Robo Taxi', 'avatar_url': ''}}}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    # 1. The token is thirty seconds from its end and the auth server never answers.
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    await c.add_init_script(f"try {{ localStorage.setItem('annotated-auth', {json.dumps(json.dumps(STORED))}); }} catch {{}}")
    await c.route('https://annotated-app.netlify.app/**', site)
    async def hang(route):
      if '/auth/v1/' in route.request.url: return   # never answered
      return await db(route)
    await c.route(SUPA + '/**', hang)
    pg = await c.new_page()
    t0 = time.time(); await pg.goto('https://annotated-app.netlify.app/?noplanes')
    drawn = None
    for _ in range(40):
      if await pg.evaluate("!!document.querySelector('.tiPaper, .tryit, .landHero, .heroTry')"): drawn = round(time.time() - t0, 1); break
      await asyncio.sleep(0.25)
    you = await pg.evaluate("!!document.querySelector('.navProfile')")
    print('1. front page drawn after', drawn, 's with the auth server silent | You in the header:', you)
    if drawn is None or drawn > 5: errs.append('the front page waited on the token refresh')
    if not you: errs.append('the stored session did not show the person as signed in')
    await c.close()
    # 2 and 3. The feed, then the database goes away and the tab is hidden and shown again.
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    down = {'on': False}
    async def maybe(route):
      if down['on'] and '/rest/v1/' in route.request.url: return await route.abort()
      return await db(route)
    await c.route(SUPA + '/**', maybe)
    pg = await c.new_page(); frames = []
    pg.on('request', lambda r: frames.append(r.url) if 'artemis-i-frames.jpg' in r.url else None)
    await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.card.mf'); await asyncio.sleep(1)
    before = await pg.evaluate("document.querySelectorAll('.card.mf').length")
    down['on'] = True
    await pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }""")
    await asyncio.sleep(1.8)
    await pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }""")
    await asyncio.sleep(34)   # three tries, each retried by the client, take about 28 s to give up
    after = await pg.evaluate("document.querySelectorAll('.card.mf').length")
    txt = await pg.evaluate("document.body.innerText")
    print('2. cards before', before, 'after', after, '| failure shown:', 'did not load' in txt)
    if after != before or 'did not load' in txt: errs.append('a feed come back into view lost its list to a failed read')
    print('3. picture of frames asked for on the feed:', len(frames))
    if frames: errs.append('the feed fetched the front page\'s clip frames')
    await c.close()
    # 4. An annotation's page has every reading script, run in order.
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f"https://annotated-app.netlify.app/@robotaxi/{ROWS[0]['id']}"); await asyncio.sleep(4)
    got = await pg.evaluate("({ emoji: typeof EmojiKit, compose: typeof Compose, giphy: typeof Giphy, take: !!document.querySelector('.annCard, .annBody') })")
    print('4. on an annotation page:', got)
    if 'undefined' in (got['emoji'], got['compose'], got['giphy']) or not got['take']: errs.append('the reading scripts did not all load')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
