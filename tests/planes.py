# EXPERIMENT: the paper planes on the front page (website/public/experiments/planes.js). Remove this test with them.
#   1. With ?planes a plane flies in while the brief is held back: a dart folded from a copy of the brief, ten pieces
#      of paper each with a blank back (.pl-sheet), carrying no ids and no try-it mark. It lands, opens, and goes,
#      and the real brief is showing and works: Mark a sentence for me inks it and a take makes the card.
#   1b. A moment later the marked sheet folds back into a plane and flies off (Latest is hidden here, having no
#      annotations, so it leaves the page), a fresh brief flies in, and the try-it is clean and says where yours is.
#   2. A click while it flies finishes it at once, and the brief is there.
#   3. It plays once a visit, ?planes or not: loading the page again in the same tab shows no plane. (The aborted
#      request that reload causes is the page's own list being cut off, and is not counted.)
#   4. None with ?noplanes, none for a browser driven by tests without ?planes, none with reduced motion, and none
#      at phone width.
import asyncio, pathlib, mimetypes
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
STATE = """() => ({ plane: !!document.querySelector('.pl-carrier'), waiting: document.documentElement.classList.contains('planes-waiting'),
  shown: getComputedStyle(document.querySelector('.tp-article .tiTilt > .tiPaper')).opacity })"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    async def page(w=1440, h=900, motion='no-preference'):
      ctx = await b.new_context(viewport={'width': w, 'height': h}, reduced_motion=motion)
      await ctx.route('https://annotated-app.netlify.app/**', site)
      await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
      pg = await ctx.new_page(); pg.on('pageerror', lambda e: 'aborted a request' in str(e) or errs.append('PAGE ' + str(e)))
      return pg
    async def arrive(pg, q):
      await pg.goto(URL + q); await pg.wait_for_selector('.tp-article .tiPaper'); await asyncio.sleep(.35)
      return await pg.evaluate(STATE)

    # 1.
    pg = await page()
    s = await arrive(pg, '?planes')
    print('1. while it flies:', s)
    if not s['plane']: errs.append('no plane flew in with ?planes')
    if s['shown'] != '0': errs.append('the brief showed before the plane landed')
    sheet = await pg.evaluate("(() => { const s = document.querySelector('.pl-sheet'); return { leaves: s.querySelectorAll('.pl-leaf').length, printed: s.querySelectorAll('.pl-leaf .tiText').length, backs: s.querySelectorAll('.pl-blank').length, ids: s.querySelectorAll('[id], [data-annotated-self]').length }; })()")
    print('   the plane:', sheet)
    if sheet != {'leaves': 20, 'printed': 10, 'backs': 10, 'ids': 0}: errs.append(f'the plane is not ten printed pieces with blank backs and nothing the real brief owns: {sheet}')
    await pg.wait_for_function("!document.querySelector('.pl-layer')", timeout=7000)
    s = await pg.evaluate(STATE)
    s['sheet'] = await pg.evaluate("!!document.querySelector('.pl-sheet, .pl-sheetShadow')")
    print('   after:', s)
    if s['plane'] or s['sheet'] or s['waiting'] or s['shown'] != '1': errs.append(f'the landing did not finish: {s}')
    await pg.click('.tiForMe'); await asyncio.sleep(1.5)
    marks = await pg.evaluate("document.querySelectorAll('.tiText mark.annotated-hl').length")
    await pg.fill('#tiInput', 'A take after the landing.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1)
    take = await pg.evaluate("(document.querySelector('.tiLift:not([hidden]) .tiTakeOut') || {}).textContent || null")
    print('   marks', marks, '| card take', take)
    if not marks: errs.append('Mark a sentence for me inked nothing after the landing')
    if take != 'A take after the landing.': errs.append(f'the take made no card after the landing: {take!r}')
    # 1b.
    await pg.wait_for_selector('.pl-carrier', state='attached', timeout=4000)
    await pg.wait_for_function("!document.querySelector('.pl-layer')", timeout=10000)
    await asyncio.sleep(.8)
    after = await pg.evaluate("""() => ({ paper: getComputedStyle(document.querySelector('.tp-article .tiTilt > .tiPaper')).opacity,
      lift: !document.querySelector('.tiLift').hidden, marks: document.querySelectorAll('.tiText mark').length,
      hint: document.querySelector('.tiHint').textContent, hidden: document.querySelectorAll('.pl-hidden').length })""")
    print('1b. after it folded away and a fresh brief came in:', after)
    if after != {'paper': '1', 'lift': False, 'marks': 0, 'hint': 'Yours is kept in this browser. Mark another sentence.', 'hidden': 0}:
      errs.append(f'the fold-away did not leave a clean try-it saying where yours is: {after}')
    # 3. Same tab, same visit.
    s = await arrive(pg, '?planes')
    print('3. again in the same visit:', s)
    s2 = await pg.evaluate(STATE)
    if s['plane'] or s2['shown'] != '1': errs.append('the plane played a second time in one visit')
    await pg.context.close()

    # 2.
    pg = await page()
    await arrive(pg, '?planes')
    await pg.mouse.click(40, 860); await asyncio.sleep(.35)
    s = await pg.evaluate(STATE)
    print('2. clicked mid-flight:', s)
    if s['plane'] or s['waiting'] or s['shown'] != '1': errs.append(f'a click did not finish the landing: {s}')
    await pg.context.close()

    # 4.
    for name, q, kw in [('?noplanes', '?planes&noplanes', {}), ('driven by tests', '', {}),
                        ('reduced motion', '?planes', {'motion': 'reduce'}), ('phone', '?planes', {'w': 390, 'h': 844})]:
      pg = await page(**kw)
      s = await arrive(pg, q)
      print(f'4. {name}:', s)
      if s['plane'] or s['waiting'] or s['shown'] != '1': errs.append(f'{name}: a plane, or the brief held back: {s}')
      await pg.context.close()
    await b.close()
  print('errors:', errs)

asyncio.run(main())
