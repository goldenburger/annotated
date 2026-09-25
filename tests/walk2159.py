# The recording of 2026-09-25 at 21:59, and the new wording under "Other things it does".
#   1. After Clear all in Yours so far, no Example flies into the row just emptied, even when the example's turn
#      had not come yet. Show me an example still plays it, and a fresh visit with nothing made still gets it.
#   2. The extension's own pages land the loading plane on their outline (.bootMain), as the website does.
#   3. The front page's examples use the rewritten wording.
import asyncio, pathlib, mimetypes, json, time
from playwright.async_api import async_playwright
from _env import *
ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
URL = 'https://annotated-app.netlify.app/'
now = int(time.time() * 1000)
YOURS = [
  {'kind': 'article', 'take': 'Brief take.', 'quote': 'words', 'source': 'The annotated.com brief', 'at': now - 2000},
  {'kind': 'post', 'take': 'Post take.', 'quote': 'y', 'source': 'An example post on X', 'at': now - 3000},
]
EXAMPLE = "!!document.querySelector('.llRow .example')"

async def ctx(b, seed):
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site)
  await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  if seed: await c.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); sessionStorage.setItem('seeded', '1'); }} }} catch (e) {{}}")
  return c

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    # 1. Clear all before the example's turn (it waits four seconds once the try-it is in view).
    c = await ctx(b, True)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(.8)
    await pg.evaluate("document.querySelector('.llClear').click()"); await asyncio.sleep(9)
    ex = await pg.evaluate(EXAMPLE)
    print('1. an Example in the row after Clear all:', ex)
    if ex: errs.append('an Example flew into Yours so far right after Clear all')
    # Show me an example still plays it.
    await pg.evaluate("window.scrollTo(0, 0)"); await pg.click('.tiShowMe'); await asyncio.sleep(10)
    marked = await pg.evaluate("!!document.querySelector('.tp-article .tiText mark') || " + EXAMPLE)
    print('   Show me an example afterwards plays it:', marked)
    if not marked: errs.append('Show me an example did nothing after Clear all')
    await c.close()
    # A fresh visit with nothing made still gets the example on its own.
    c = await ctx(b, False)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(10)
    fresh = await pg.evaluate("!!document.querySelector('.tp-article .tiText mark') || " + EXAMPLE)
    print('   a fresh visit gets the example:', fresh)
    if not fresh: errs.append('a fresh visit with nothing made no longer gets the example')
    # 3.
    words = await pg.evaluate("document.body.innerText")
    for w in ['Other things it does', 'Tags, polls and reactions', 'Every annotation gets its own page', 'If the post gets deleted', 'Clip podcasts from Spotify']:
      if w not in words: errs.append(f'the front page does not say "{w}"')
    for w in ['What else it does', 'Say it your way', 'Receipts that stay', 'It lands as a page']:
      if w in words: errs.append(f'the front page still says "{w}"')
    print('3. the new wording checked')
    await c.close()
    # 2. The extension's page outline, read before any of its scripts can replace it.
    c = await b.new_context(viewport={'width': 1200, 'height': 800})
    pg = await c.new_page()
    await pg.route('**/*.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=''))
    await pg.goto((ROOT / 'extension' / 'annotation.html').as_uri()); await asyncio.sleep(2.6)
    end = await pg.evaluate("(() => { const m = document.querySelector('.bootMain'); if (!m) return null; const s = getComputedStyle(m, '::before'); return { content: s.content, dist: s.offsetDistance, path: s.offsetPath, rotate: s.offsetRotate, anim: s.animationName, iter: s.animationIterationCount }; })()")
    print('2. the extension outline plane at the end:', end)
    if not end or end['content'] in ('none', 'normal') or end['dist'] != '100%' or 'path(' not in end['path'] or end['anim'] != 'pdLand' or end['iter'] == 'infinite':
      errs.append(f'the extension page outline has no landing plane: {end}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
