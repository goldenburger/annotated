# EXPERIMENT: the paper planes on the front page (website/public/experiments/planes.js). Remove this test with them.
#   1. With ?planes a plane flies in while the brief is held back: a dart folded from a copy of the brief, ten pieces
#      of paper each with a blank back (.pl-sheet), carrying no ids and no try-it mark. It lands, opens, and goes,
#      and the real brief is showing and works: Mark a sentence for me inks it and a take makes the card.
#   1b. Made, the take waits two seconds with a line saying it is going to Latest, and its card in Latest stays
#      hidden meanwhile. Then the marked sheet folds back into a plane and flies down (Latest, holding only yours
#      here, is out of sight), a fresh brief drops in, the try-it is clean and says "Yours is below. See
#      it", and See it scrolls there, where the card lands.
#   1c. From another tab: a post's take folds away the same way and the tab resets; and a click in the tab while a
#      clip's take waits keeps it where it is, with its card shown in Latest at once.
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
    waiting = await pg.evaluate("""() => ({ line: getComputedStyle(document.querySelector('.tiNext'), '::after').content,
      card: !!document.querySelector('.llRow .yours .card.pl-hidden') })""")
    print('1b. while it waits:', waiting)
    if waiting != {'line': '"It' + "'" + 's going below, with the rest of yours."', 'card': True}: errs.append(f'the take did not say it was going to Latest, or its card showed early: {waiting}')
    await pg.wait_for_selector('.pl-carrier', state='attached', timeout=6000)
    await pg.wait_for_function("!document.querySelector('.pl-layer')", timeout=10000)
    await asyncio.sleep(.8)
    after = await pg.evaluate("""() => ({ paper: getComputedStyle(document.querySelector('.tp-article .tiTilt > .tiPaper')).opacity,
      lift: !document.querySelector('.tiLift').hidden, marks: document.querySelectorAll('.tiText mark').length,
      hint: document.querySelector('.tiHint').textContent, hidden: document.querySelectorAll('.pl-hidden').length })""")
    print('   after it folded away and a fresh brief came in:', after)
    # The card may still wait for its row (1) or have landed already (0), now the take leaves after two seconds.
    if {**after, 'hidden': 1 if after['hidden'] in (0, 1) else after['hidden']} != {'paper': '1', 'lift': False, 'marks': 0, 'hint': 'Yours is below. See it', 'hidden': 1}:
      errs.append(f'the fold-away did not leave a clean try-it saying where yours is: {after}')
    await pg.click('.tiHint .seeYours'); await asyncio.sleep(3.2)
    landed = await pg.evaluate("(() => { const c = document.querySelector('.llRow .yours .card'); return c && { shown: !c.classList.contains('pl-hidden'), first: c.closest('li') === document.querySelector('.llRow').firstElementChild, take: c.querySelector('.ctake').textContent }; })()")
    print('   See it, and in Latest:', landed)
    if landed != {'shown': True, 'first': True, 'take': 'A take after the landing.'}: errs.append(f'yours did not land first in Latest: {landed}')
    # 1c.
    await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(.4)
    await pg.click('#tab-post'); await asyncio.sleep(.4)
    await pg.click('.st-post .stWhole'); await asyncio.sleep(1.6)
    await pg.fill('.st-post textarea', 'A post take.'); await pg.click('.st-post .stMake')
    await pg.mouse.move(5, 5)
    await pg.wait_for_selector('.pl-carrier', state='attached', timeout=6000)
    await pg.wait_for_function("!document.querySelector('.pl-layer')", timeout=10000)
    post = await pg.evaluate("({ reset: !document.querySelector('.st-post').classList.contains('taken'), card: (document.querySelector('.llRow .yours .ctake') || {}).textContent })")
    print('1c. a post take:', post)
    if post != {'reset': True, 'card': 'A post take.'}: errs.append(f'the post take did not fold away to Latest: {post}')
    await pg.click('#tab-video'); await asyncio.sleep(.6)
    await pg.click('.st-video .stGo'); await asyncio.sleep(.3)
    await pg.fill('.st-video textarea', 'A clip take.')
    # The take waits two seconds, and Playwright takes about as long between Make and a mouse press on this
    # machine, so the press on the tab is sent from the page 300 ms after Make.
    await pg.evaluate("""() => { document.querySelector('.st-video .stMake').click();
      setTimeout(() => document.querySelector('.tryPanel.tp-video').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 300); }""")
    await asyncio.sleep(4.5)
    kept = await pg.evaluate("({ planes: !!document.querySelector('.pl-layer'), card: !!document.querySelector('.st-video .stCard'), shown: !document.querySelector('.llRow .yours .card').classList.contains('pl-hidden'), take: document.querySelector('.llRow .yours .ctake').textContent })")
    print('   a clip take, clicked while it waits:', kept)
    if kept != {'planes': False, 'card': True, 'shown': True, 'take': 'A clip take.'}: errs.append(f'a click in the tab did not keep the take where it was: {kept}')
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
