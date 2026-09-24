# The website's front page (website/public/landing.js), the plan of 2026-09-23 afternoon, fifteen parts.
#   1. It appears at once: with the database six seconds slow, and with it unreachable, the hero is there.
#   2. Each visitor gets their page: a visitor the landing, someone signed in the feed with a slim try line,
#      someone with the extension no Get and no install steps.
#   3. It carries a title, a description and an image for a link preview.
#   4. One motion at a time: the headline does not change while the example runs, only after it.
#   5. One try-it with four tabs, and a tab sets the headline's word. The scenes section is gone.
#   6. A shorter hero: no line listing the kinds.
#   7. The hero does not move when the try-it grows.
#   8. The ending after a take is one line with Make another, and no second yellow button.
#   9. Mark a sentence for me marks one, for the keyboard.
#  10. The install steps in one row.
#  11. Yours so far: the take just made, one card a quarter row wide, no published cards; nothing shown before a take.
#  12. No Home pill on the front page.
#  13. No text under 12.5 pixels in the hero and the steps.
#  14. Dark mode: the headline word keeps dark ink, and the paper's text keeps its own dark ink.
#  15. At phone width nothing runs off the side.
#   And a shared annotation, signed out, still ends with Make one like this.
import asyncio, json, pathlib, mimetypes, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
AUTHOR = {'id': 'a-1', 'handle': 'robo', 'display_name': 'Robo Taxi', 'avatar_url': ''}
def row(i, kind, source):
  return {'id': f'hp-{kind}', 'author_id': 'a-1', 'kind': kind, 'take_text': f'A take on the {kind}', 'tag': None, 'poll': None, 'gif': None,
          'created_at': f'2026-09-2{i}T10:00:00Z', 'source': source, 'author': AUTHOR, 'comments': [], 'reactions': [], 'poll_votes': []}
ALL = [row(1, 'article', {'text': 'The council met.', 'meta': {'title': 'Harbor story', 'site': 'Harborline', 'url': 'https://harborline.example/story'}}),
       row(2, 'video', {'title': 'A clip', 'start': 40, 'end': 48, 'duration': 150, 'url': 'https://www.youtube.com/watch?v=abc'}),
       row(3, 'audio', {'title': 'An episode', 'show': 'A show', 'start': 60, 'end': 80, 'duration': 3000, 'url': 'https://podcasts.apple.com/x'}),
       row(4, 'post', {'text': 'A post on X.', 'author': 'Someone', 'handle': '@someone', 'url': 'https://x.com/someone/status/1'})]
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': 'a-1', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
SEL = """(() => { const n = document.querySelector('.tiText p').firstChild, t = n.nodeValue; const r = document.createRange();
  r.setStart(n, t.indexOf('quickly')); r.setEnd(n, t.indexOf('video') + 5); getSelection().removeAllRanges(); getSelection().addRange(r); })()"""

def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  # Netlify serves /install from install.html.
  if not f.is_file() and (PUB / (path + '.html')).is_file(): f = PUB / (path + '.html')
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
    if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': 'a-1', 'handle': 'robo', 'display_name': 'Robo Taxi', 'avatar_url': ''}))
    await route.fulfill(status=200, content_type='application/json', body='[]')
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    async def ctx_with(db_route, **kw):
      c = await b.new_context(viewport={'width': 1440, 'height': 900}, **kw)
      await c.route('https://annotated-app.netlify.app/**', site)
      await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db_route)
      return c

    # 1. Slow, and unreachable.
    async def slow(route):
      await asyncio.sleep(6); await db(route)
    for name, r in [('six seconds slow', slow), ('unreachable', lambda route: route.abort())]:
      c = await ctx_with(r); pg = await c.new_page()
      # Timed by the page's own clock: the harness itself notices a new element up to two seconds late.
      await pg.add_init_script("window.__tabsAt = null; const tick = () => { if (document.querySelector('.tryTabs')) window.__tabsAt = performance.now(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);")
      await pg.goto('https://annotated-app.netlify.app/', wait_until='domcontentloaded')
      try: await pg.wait_for_selector('.tryTabs', timeout=4000); took = round((await pg.evaluate('window.__tabsAt')) / 1000, 2)
      except Exception: took = None
      print(f'1. with the database {name}, the hero appears after', took, 's')
      if took is None or took > 2: errs.append(f'with the database {name} the hero took {took}')
      await c.close()

    c = await ctx_with(db); pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tryTabs'); await asyncio.sleep(1.5)
    # 3.
    tags = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('meta[property^=og], meta[name^=twitter]')].map((m) => [m.getAttribute('property') || m.getAttribute('name'), m.content]))")
    print('3. preview tags:', sorted(tags))
    if not all(tags.get(k) for k in ['og:title', 'og:description', 'og:image', 'twitter:card']): errs.append(f'preview tags missing: {tags}')
    if not (PUB / 'og.png').is_file(): errs.append('og.png, the preview image, is not in the site')
    # 4. The example runs first, and the headline holds still until it has.
    await pg.mouse.move(700, 890)
    during = {'example': False, 'word': None}
    for _ in range(40):
      during = await pg.evaluate("({ example: !document.querySelector('.tiLift').hidden, word: document.querySelector('.heroMark').textContent })")
      if during['example']: break
      await asyncio.sleep(.25)
    await asyncio.sleep(6.5)
    after = await pg.evaluate("document.querySelector('.heroMark').textContent")
    print('4. while the example runs the headline says', repr(during['word']), '| after it', repr(after))
    if not during['example'] or during['word'] != 'anything': errs.append(f'two things moved at once: {during}')
    # Since the recording of 2026-09-24 at 20:19 the word follows the tab only, and never changes on its own.
    if after != 'anything': errs.append(f'the headline changed on its own after the example: {after!r}')
    # Fixes of the pass after: a tab chosen mid-example puts the example away, and the headline is two lines
    # for every word, with no empty third line held for "on the web".
    await pg.reload(); await pg.wait_for_selector('.tryTabs'); await pg.mouse.move(700, 890); await asyncio.sleep(4.9)
    mid = await pg.evaluate("!document.querySelector('.tiLift').hidden || !!document.querySelector('.tiText mark.annotated-hl')")
    await pg.click('#tab-video'); await asyncio.sleep(.8); await pg.click('#tab-article'); await asyncio.sleep(.8)
    left = await pg.evaluate("({ lift: !document.querySelector('.tiLift').hidden, marks: document.querySelectorAll('.tiText mark.annotated-hl').length })")
    print('   example running when the tab changed:', mid, '| left behind on coming back:', left)
    if left['lift'] or left['marks']: errs.append(f'the example was left on the paper: {left}')
    lines = await pg.evaluate("""(() => { const h = document.querySelector('.heroH'), m = document.querySelector('.heroMark'), lh = parseFloat(getComputedStyle(h).lineHeight);
      const out = {}; for (const w of ['anything', 'a passage', 'a clip', 'a podcast', 'a post on X']) { m.textContent = w; out[w] = Math.round(h.getBoundingClientRect().height / lh); } return out; })()""")
    print('   headline lines for each word:', lines)
    if any(v != 2 for v in lines.values()): errs.append(f'the headline is not two lines for every word: {lines}')
    # 5, 6, 12.
    await pg.reload(); await pg.wait_for_selector('.tryTabs'); await asyncio.sleep(.8)
    shape = await pg.evaluate("""() => ({ tabs: [...document.querySelectorAll('.tryTab')].map((t) => t.textContent.trim()), scenes: !!document.querySelector('.scenes'),
      where: !!document.querySelector('.heroWhere'), homePill: [...document.querySelectorAll('.landBar .navBtn')].map((b) => b.textContent.trim()) })""")
    print('5, 6, 12.', shape)
    if shape['tabs'] != ['Article', 'YouTube clip', 'Podcast', 'Post on X'] or shape['scenes']: errs.append(f'the try-it tabs read {shape}')
    if shape['where']: errs.append('the hero still lists the kinds')
    if any('Home' in x for x in shape['homePill']): errs.append('the front page shows a Home pill')
    await pg.click('#tab-audio'); await asyncio.sleep(.5)
    word = await pg.inner_text('.heroMark'); shown = await pg.evaluate("[...document.querySelectorAll('.tryPanel')].filter((x) => !x.hidden).map((x) => x.id)")
    await pg.focus('#tab-audio'); await pg.keyboard.press('ArrowRight'); await asyncio.sleep(.3)
    kb = await pg.evaluate("document.activeElement.id")
    print('   the Podcast tab: headline', repr(word), '| panel', shown, '| arrow key moves to', kb)
    if word != 'a podcast' or shown != ['panel-audio'] or kb != 'tab-post': errs.append(f'the tabs did not work: {word}, {shown}, {kb}')
    await pg.click('#tab-article'); await asyncio.sleep(.5)
    # 7 and 8.
    top0 = await pg.evaluate("Math.round(document.querySelector('.heroH').getBoundingClientRect().top)")
    await pg.evaluate(SEL); await asyncio.sleep(.4); await pg.click('.tiBtn'); await asyncio.sleep(1.5)
    await pg.fill('#tiInput', 'Clip is the verb that matters.'); await pg.click('.tiMake'); await asyncio.sleep(1.2)
    top1 = await pg.evaluate("Math.round(document.querySelector('.heroH').getBoundingClientRect().top)")
    end = await pg.evaluate("({ text: document.querySelector('.tiAfter').textContent.trim(), yellow: document.querySelectorAll('.tiAfter .primary').length })")
    print('7. the headline top before and after a take:', top0, top1, '| 8. the ending:', end)
    if top0 != top1: errs.append(f'the headline moved {top1 - top0}px when the take was made')
    if end['yellow'] or 'Make another' not in end['text'] or len(end['text']) > 120: errs.append(f'the ending was not quiet: {end}')
    # 9.
    await pg.click('.tiRedo'); await asyncio.sleep(.8)
    await pg.click('.tiForMe'); await asyncio.sleep(1.5)
    marked = await pg.evaluate("[...document.querySelectorAll('.tiText mark.annotated-hl')].map((m) => m.textContent).join('').trim()")
    open_ = await pg.evaluate("!document.querySelector('.tiTake').hidden")
    print('9. Mark a sentence for me marked', repr(marked[:50]), '| take box open:', open_)
    if not marked.startswith('All clipped content') or not open_: errs.append(f'Mark a sentence for me gave {marked!r}')
    # 10.
    steps = await pg.evaluate("[...document.querySelectorAll('#get .giSteps li')].map((l) => Math.round(l.getBoundingClientRect().top))")
    print('10. the three steps start at', steps)
    # The steps follow a download, and the hero's buttons lead through the page.
    await pg.evaluate("document.querySelector('#get a[download]').addEventListener('click', (e) => e.preventDefault())")
    await pg.click('#get .giDo a[download]'); await asyncio.sleep(.3)
    st = await pg.evaluate("({ done: document.querySelector('.giSteps li').classList.contains('done'), now: document.querySelector('.giSteps li:nth-child(2)').classList.contains('now'), copy: !!document.querySelector('.giCopy') })")
    await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(.3); await pg.click('.heroGet'); await asyncio.sleep(1.2)
    at = await pg.evaluate("Math.round(document.querySelector('#get').getBoundingClientRect().top)")
    look = await pg.evaluate("document.querySelector('.heroLook').getAttribute('href')")
    print('   after a download', st, '| Get lands', at, 'px from the steps | Look around first goes to', look)
    if not all(st.values()): errs.append(f'the steps did not follow the download: {st}')
    # The page is short enough now that the steps may not reach the top, so on screen is what counts.
    if not (-5 <= at <= 600) or look != '/?feed': errs.append(f'the hero buttons led elsewhere: {at}, {look}')
    if len(steps) != 3 or len(set(steps)) != 1: errs.append(f'the steps are not one row: {steps}')
    # 11. Yours so far: the take just made is there, one card a quarter of the row wide; no published cards.
    cards = await pg.evaluate("({ takes: [...document.querySelectorAll('.landLatest .llRow .yours .ctake')].map((x) => x.textContent), published: document.querySelectorAll('.landLatest .llRow .cardItem:not(.yours)').length, shown: !document.querySelector('.landLatest').hidden, head: document.querySelector('.landLatest h2').textContent })")
    print('11. yours so far:', cards)
    cols = await pg.evaluate("getComputedStyle(document.querySelector('.llRow')).gridTemplateColumns.split(' ').length")
    if cols != 4: errs.append(f'the row is not four columns: {cols}')
    if cards != {'takes': ['Clip is the verb that matters.'], 'published': 0, 'shown': True, 'head': 'Yours so far'}: errs.append(f'yours so far read {cards}')
    # 13.
    small = await pg.evaluate("""[...document.querySelectorAll('.landHero *, .landGet *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) && e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 12.5).map((e) => e.className + ' ' + getComputedStyle(e).fontSize)""")
    print('13. text under 12.5px:', small)
    if small: errs.append(f'small text left: {small}')
    await c.close()

    # The install page: the same header and the same three steps.
    c = await ctx_with(db); pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('INSTALL ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/install'); await asyncio.sleep(1)
    ins = await pg.evaluate("({ header: !!document.querySelector('.landBar'), steps: document.querySelectorAll('#get .giSteps li').length, copy: !!document.querySelector('.giCopy'), old: !!document.querySelector('main.doc') })")
    print('   the install page:', ins)
    if ins != {'header': True, 'steps': 3, 'copy': True, 'old': False}: errs.append(f'the install page read {ins}')
    await c.close()
    # 11, nothing made yet: no row, whatever is published.
    c = await ctx_with(db); pg = await c.new_page(); await pg.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(2)
    if await pg.evaluate("!document.querySelector('.landLatest').hidden"): errs.append('the row showed with nothing made')
    await c.close()

    # 14. Dark.
    c = await ctx_with(db, color_scheme='dark'); pg = await c.new_page(); await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tryTabs'); await asyncio.sleep(1)
    await pg.click('#tab-video'); await asyncio.sleep(.4)
    ink = await pg.evaluate("({ word: getComputedStyle(document.querySelector('.heroMark')).color, times: getComputedStyle(document.querySelector('.st-video .stTimes')).color })")
    print('14. dark mode inks:', ink)
    if ink['word'] != 'rgb(28, 36, 51)' or ink['times'] != 'rgb(28, 36, 51)': errs.append(f'dark mode made the words pale: {ink}')
    await c.close()

    # 2. Signed in: the feed, with the slim line. With the extension: no Get.
    c = await ctx_with(db)
    await c.add_init_script(f"try {{ localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))}); }} catch (e) {{}}")
    pg = await c.new_page(); await pg.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(3)
    signed = await pg.evaluate("({ landing: !!document.querySelector('.landHero'), feed: !!document.querySelector('.sitegrid .cards'), slim: !!document.querySelector('.slimTry a[href=\"/?try\"]') })")
    print('2. signed in:', signed)
    if signed != {'landing': False, 'feed': True, 'slim': True}: errs.append(f'signed in the front page read {signed}')
    await c.close()
    c = await ctx_with(db)
    await c.add_init_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.annotatedInstalled = '1'; })")
    pg = await c.new_page(); await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tryTabs'); await asyncio.sleep(.8)
    have = await pg.evaluate("({ get: !document.querySelector('.heroGetRow').hidden, steps: !document.querySelector('.landGet').hidden, have: !document.querySelector('.heroHave').hidden })")
    print('   with the extension:', have)
    if have != {'get': False, 'steps': False, 'have': True}: errs.append(f'with the extension the page read {have}')
    await c.close()

    # 15, and the shared page.
    c = await ctx_with(db); pg = await c.new_page(); await pg.set_viewport_size({'width': 390, 'height': 844})
    await pg.goto('https://annotated-app.netlify.app/'); await asyncio.sleep(2)
    over = await pg.evaluate("document.scrollingElement.scrollWidth - innerWidth")
    print('15. at phone width it runs off the side by', over, 'px')
    if over > 1: errs.append(f'the front page is {over}px wider than a phone')
    await pg.set_viewport_size({'width': 1440, 'height': 900})
    await pg.goto('https://annotated-app.netlify.app/@robo/hp-article'); await asyncio.sleep(3)
    mo = await pg.evaluate("(() => { const m = document.querySelector('.makeOne'); return m ? m.querySelector('a.primary').getAttribute('href') : null; })()")
    print('   the shared page ends with Make one like this, leading to', mo)
    if mo != '/#try': errs.append(f'the shared page ended with {mo}')
    await c.close()
    print('errors:', errs)
    await b.close()

asyncio.run(main())
