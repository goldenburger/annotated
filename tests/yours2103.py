# The recording of 2026-09-24 at 21:03, and the two notes after it.
#   1. A clip's card in Yours so far plays the clip, silent and on repeat, including a card kept from before the
#      range was stored (read from its words).
#   2. A card can be removed by its ×, with Undo; Clear all removes every one, with Undo. Removing the brief's
#      take clears it from the page's storage too.
#   3. Quotes on the cards are cut to three lines, and a card waiting for its plane holds a dashed slot.
#   4. The website's feed is headed Feed.
import asyncio, pathlib, mimetypes, json, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  ctype = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
  body = f.read_bytes()
  rng = route.request.headers.get('range', '')
  if rng.startswith('bytes='):
    first, _, last = rng[6:].partition('-')
    start = int(first or 0); end = min(int(last) if last else len(body) - 1, len(body) - 1)
    return route.fulfill(status=206, body=body[start:end + 1], headers={'Content-Type': ctype, 'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {start}-{end}/{len(body)}'})
  return route.fulfill(status=200, body=body, headers={'Content-Type': ctype, 'Accept-Ranges': 'bytes'})
URL = 'https://annotated-app.netlify.app/'
now = int(time.time() * 1000)
YOURS = [
  {'kind': 'video', 'take': 'Old clip card.', 'what': 'Clip 2:57 to 3:02 of 5:47', 'source': 'NASA', 'at': now - 1000,
   'thumb': {'src': '/media/artemis-i-frames.jpg', 'cols': 12, 'rows': 15, 'idx': 90}},
  {'kind': 'article', 'take': 'Brief take.', 'quote': ' '.join(['word'] * 120), 'source': 'The annotated.com brief', 'tryitAt': 77, 'at': now - 2000},
  {'kind': 'post', 'take': 'Post take.', 'quote': 'y', 'source': 'An example post on X', 'at': now - 3000},
]

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await c.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); localStorage.setItem('annotated-tryit', JSON.stringify({{ take: 'Brief take.', quote: 'x', at: 77 }})); sessionStorage.setItem('seeded', '1'); }} }} catch (e) {{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
    await pg.evaluate("document.querySelector('.landLatest').scrollIntoView({ block: 'center' })"); await asyncio.sleep(3)
    # 1.
    t1 = await pg.evaluate("(() => { const v = document.querySelector('.llRow .yClip'); return v && { t: v.currentTime, paused: v.paused, muted: v.muted }; })()")
    await asyncio.sleep(5)
    t2 = await pg.evaluate("(() => { const v = document.querySelector('.llRow .yClip'); return v && { t: v.currentTime, paused: v.paused }; })()")
    print('1. the clip on its card:', t1, 'then', t2)
    if not t1 or t1['paused'] or not t1['muted'] or not (177 <= t1['t'] <= 182.5): errs.append(f'the clip card is not playing its clip, muted: {t1}')
    if not t2 or t2['paused'] or not (177 <= t2['t'] <= 182.5): errs.append(f'the clip did not go round again within its range: {t2}')
    # 3.
    q = await pg.evaluate("(() => { const s = [...document.querySelectorAll('.llRow .yours .csn')].find((x) => x.textContent.length > 300); const lh = parseFloat(getComputedStyle(s).lineHeight); return Math.round(s.getBoundingClientRect().height / lh); })()")
    print('3. lines shown of a long quote:', q)
    if q > 3: errs.append(f'a long quote shows {q} lines')
    css = (PUB / 'web.css').read_text(encoding='utf-8')
    if '.llRow .yours:has(> .card.pl-hidden)' not in css: errs.append('no reserved slot for a card waiting for its plane')
    # 2.
    await pg.hover('.llRow .yours:nth-child(2)'); await pg.click('.llRow .yours:nth-child(2) .yDel'); await asyncio.sleep(.4)
    after = await pg.evaluate("({ cards: document.querySelectorAll('.llRow .yours').length, undo: !document.querySelector('.llUndo').hidden, tryit: localStorage.getItem('annotated-tryit'), kept: JSON.parse(localStorage.getItem('annotated-yours')).length })")
    print('2. after removing the brief take:', after)
    if after != {'cards': 2, 'undo': True, 'tryit': None, 'kept': 2}: errs.append(f'removing a card did not work as it should: {after}')
    await pg.click('.llUndoBtn'); await asyncio.sleep(.4)
    back = await pg.evaluate("({ cards: document.querySelectorAll('.llRow .yours').length, tryit: !!localStorage.getItem('annotated-tryit') })")
    print('   after Undo:', back)
    if back != {'cards': 3, 'tryit': True}: errs.append(f'Undo did not put it back: {back}')
    await pg.click('.llClear'); await asyncio.sleep(.4)
    gone = await pg.evaluate("({ cards: document.querySelectorAll('.llRow .yours').length, kept: JSON.parse(localStorage.getItem('annotated-yours')).length, undo: !document.querySelector('.llUndo').hidden })")
    print('   after Clear all:', gone)
    if gone != {'cards': 0, 'kept': 0, 'undo': True}: errs.append(f'Clear all did not clear: {gone}')
    await pg.click('.llUndoBtn'); await asyncio.sleep(.4)
    if await pg.evaluate("document.querySelectorAll('.llRow .yours').length") != 3: errs.append('Undo after Clear all did not bring them back')
    # 4.
    await pg.goto(URL + '?feed'); await asyncio.sleep(2)
    h = await pg.evaluate("(document.querySelector('.feedHead h1') || {}).textContent")
    print('4. the feed is headed', repr(h))
    if h != 'Feed': errs.append(f'the website feed is headed {h!r}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
