# The website's front page and shared pages, against a stand-in database.
#   1. The four scenes: with a passage, a clip, a podcast moment and a post published, each scene ends on the
#      real one, drawn with the feed's own card. A passage with no picture shows its words inked. The headline
#      changes word without changing height and stops once the try-it is touched, and the paper leans toward
#      the pointer. Left alone, the page runs one labelled example, which a touch stops.
#   2. With two kinds published, those two scenes end on real cards and the other two on labelled examples.
#      Asked for less motion, nothing tilts, cycles or runs by itself, and every scene shows its last frame.
#   3. The install block says the three steps and offers the download, and the try-it's button leads to it.
#   4. A shared annotation, opened signed out, ends with Make one like this, leading to the try-it.
#   5. At phone width nothing on the front page runs off the side.
import asyncio, json, pathlib, mimetypes
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
AUTHOR = {'id': 'a-1', 'handle': 'robo', 'display_name': 'Robo Taxi', 'avatar_url': ''}
def row(i, kind, source, **extra):
  return {'id': f'hp-{kind}', 'author_id': 'a-1', 'kind': kind, 'take_text': f'A take on the {kind}', 'tag': None, 'poll': None, 'gif': None,
          'created_at': f'2026-09-2{i}T10:00:00Z', 'source': source, 'author': AUTHOR, 'comments': [], 'reactions': [], 'poll_votes': [], **extra}
ALL = [
  row(1, 'article', {'text': 'The council met on a Tuesday to talk about the overnight buses.', 'meta': {'title': 'Harbor story', 'site': 'Harborline', 'url': 'https://harborline.example/story'}}),
  row(2, 'video', {'title': 'A clip', 'channel': 'A channel', 'start': 40, 'end': 48, 'duration': 150, 'url': 'https://www.youtube.com/watch?v=abc', 'poster': 'https://i.ytimg.com/vi/abc/hq.jpg'}),
  row(3, 'audio', {'title': 'An episode', 'show': 'A show', 'start': 60, 'end': 80, 'duration': 3000, 'url': 'https://podcasts.apple.com/x', 'artwork': 'https://is1.example/art.jpg'}),
  row(4, 'post', {'text': 'A post on X.', 'author': 'Someone', 'handle': '@someone', 'url': 'https://x.com/someone/status/1'}),
]

def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def main():
  errs = []
  rows = {'list': ALL}
  async def db(route):
    u, h = route.request.url, route.request.headers
    if '/rest/v1/annotations' in u:
      if 'id=eq.' in u:
        one = [r for r in rows['list'] if f"id=eq.{r['id']}" in u]
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(one[0] if 'vnd.pgrst.object' in h.get('accept', '') and one else one))
      return await route.fulfill(status=200, content_type='application/json', body=json.dumps(rows['list']))
    await route.fulfill(status=200, content_type='application/json', body='[]')
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    await ctx.route('https://i.ytimg.com/**', lambda r: r.fulfill(status=404, body=''))
    await ctx.route('https://is1.example/**', lambda r: r.fulfill(status=404, body=''))
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(3)

    # 1.
    sc = await pg.evaluate("""() => { const s = document.querySelector('.scenes'); if (!s) return null;
      return { kinds: [...s.querySelectorAll('.scKind')].map((k) => k.textContent), cards: s.querySelectorAll('.scCard.real .card.mf').length,
        inked: !!s.querySelector('.cquote .cqInk'), before: !!(s.compareDocumentPosition(document.querySelector('.sitegrid')) & Node.DOCUMENT_POSITION_FOLLOWING) }; }""")
    print('1. one of each:', sc)
    if not sc or sc['kinds'] != ['A passage', 'A YouTube clip', 'A podcast moment', 'A post on X'] or sc['cards'] != 4: errs.append(f'the row read {sc}')
    elif not sc['inked']: errs.append('the passage with no picture did not show its words')
    elif not sc['before']: errs.append('the row is not above the feed')
    if sc and await pg.query_selector('.scenes .exCard'): errs.append('an Example card showed where a real annotation of that kind exists')
    # The headline changes word, keeps its height, and stops once the try-it is touched.
    h0 = await pg.evaluate("document.querySelector('.heroH').offsetHeight")
    await asyncio.sleep(4.8)
    w1 = await pg.evaluate("document.querySelector('.heroMark').textContent")
    h1 = await pg.evaluate("document.querySelector('.heroH').offsetHeight")
    print('   the headline now says', repr(w1), '| height', h0, '->', h1)
    if w1 == 'anything': errs.append('the headline did not change word')
    if h1 != h0: errs.append('the headline changed height as its word changed')
    await pg.click('.tiText p'); await asyncio.sleep(.6)
    w2 = await pg.evaluate("document.querySelector('.heroMark').textContent")
    await asyncio.sleep(4.5)
    w3 = await pg.evaluate("document.querySelector('.heroMark').textContent")
    if w2 != 'anything' or w3 != 'anything': errs.append(f'the headline went on changing after the try-it was touched: {w2!r}, {w3!r}')
    # The paper leans toward the pointer.
    await pg.mouse.move(1250, 200); await asyncio.sleep(.9)
    tf = await pg.evaluate("document.querySelector('.tiTilt').style.transform")
    print('   the paper, with the pointer at its top right:', tf)
    if 'rotateY(' not in tf or 'rotateY(0.00deg)' in tf: errs.append(f'the paper did not lean toward the pointer: {tf!r}')
    # Left alone, one example, labelled, which a touch puts away.
    idle = await ctx.new_page(); await idle.goto('https://annotated-app.netlify.app/'); await idle.mouse.move(700, 890); await asyncio.sleep(7)
    ex = await idle.evaluate("({ shown: !document.querySelector('.tiLift').hidden, label: !document.querySelector('.tiExample').hidden, inked: document.querySelectorAll('.tiText mark.annotated-hl').length })")
    print('   left alone, the example:', ex)
    if not (ex['shown'] and ex['label'] and ex['inked']): errs.append(f'the page did not run its labelled example: {ex}')
    await idle.mouse.click(1000, 300); await asyncio.sleep(.8)
    gone = await idle.evaluate("({ lift: !document.querySelector('.tiLift').hidden, inked: document.querySelectorAll('.tiText mark.annotated-hl').length })")
    if gone['lift'] or gone['inked']: errs.append(f'a touch did not put the example away: {gone}')
    await idle.close()
    # 3.
    gi = await pg.evaluate("""() => { const g = document.querySelector('#get.getIt'); return g ? { steps: g.querySelectorAll('.giSteps li').length,
      zip: !!g.querySelector('a[href="/annotated-extension.zip"][download]') } : null; }""")
    print('3. getting it:', gi)
    if not gi or gi['steps'] != 3 or not gi['zip']: errs.append(f'the install block read {gi}')
    if not await pg.query_selector('#try.hero'): errs.append('the try-it has no #try for shared pages to lead to')
    await pg.evaluate("localStorage.setItem('annotated-tryit', '')")

    # 5.
    await pg.set_viewport_size({'width': 390, 'height': 844}); await asyncio.sleep(1)
    over = await pg.evaluate("document.scrollingElement.scrollWidth - window.innerWidth")
    print('5. at phone width it runs off the side by', over, 'px')
    if over > 1: errs.append(f'the front page is {over}px wider than a phone')
    await pg.set_viewport_size({'width': 1440, 'height': 900})

    # 4.
    await pg.goto('https://annotated-app.netlify.app/@robo/hp-article'); await asyncio.sleep(3)
    mo = await pg.evaluate("""() => { const m = document.querySelector('.makeOne'); return m ? { h: m.querySelector('h2').textContent, to: m.querySelector('a.primary').getAttribute('href') } : null; }""")
    print('4. the shared page ends with:', mo)
    if not mo or mo['h'] != 'Make one like this' or mo['to'] != '/#try': errs.append(f'the shared page ended with {mo}')

    # 2.
    rows['list'] = ALL[:2]
    await pg.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(3)
    two = await pg.evaluate("({ real: document.querySelectorAll('.scCard.real').length, examples: document.querySelectorAll('.scenes .exCard').length })")
    print('2. with two kinds published:', two)
    if two != {'real': 2, 'examples': 2}: errs.append(f'with two kinds the scenes showed {two}')

    # Asked for less motion: nothing tilts, the headline stays, the example does not run, and the scenes are finished.
    rm = await ctx.new_page(); await rm.emulate_media(reduced_motion='reduce')
    await rm.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(1.2)
    await rm.mouse.move(1250, 200); await asyncio.sleep(5.5)
    calm = await rm.evaluate("""() => ({ tilt: document.querySelector('.tiTilt').style.transform, word: document.querySelector('.heroMark').textContent,
      example: !document.querySelector('.tiLift').hidden, anim: getComputedStyle(document.querySelector('.sc-article .a-hl')).animationName })""")
    print('   with less motion:', calm)
    if calm['tilt'] or calm['word'] != 'anything' or calm['example'] or calm['anim'] not in ('none', ''): errs.append(f'reduced motion still moved: {calm}')
    await rm.close()
    print('errors:', errs)
    await b.close()

asyncio.run(main())
