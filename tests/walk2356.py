# The recording of 2026-09-24 at 23:56.
#   1. The panel's help link to the home page goes to the tab already on it (?installed included), not a new one.
#   2. An empty Your profile in the panel says what to do.
#   3. Installed, the front page says "annotated is installed.", not "You have annotated."
#   4. A card clicked while the try-it is in sight does not scroll the page, and clicking a moment's waveform plays it.
#   5. A take is held for two seconds, out of the row (no empty slot), and the brief is back soon after it leaves.
#   6. The fresh brief is back within about three seconds of folding away.
#   7. A passage's and a post's card show their words large and inked.
#   8. Undo sits in the row's heading, so removing a card does not move the row.
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
  {'kind': 'audio', 'take': 'Moment take.', 'what': 'Audio clip 1:16 to 1:38 of 11:04', 'source': 'NASA', 'wave': [.5] * 40, 'a': 76, 'z': 98, 'at': now - 1000},
  {'kind': 'article', 'take': 'Brief take.', 'quote': 'clip media, text, audio, or video, from any website', 'source': 'The annotated.com brief', 'at': now - 2000},
  {'kind': 'post', 'take': 'Post take.', 'quote': 'redesign on Friday. Sign-ups', 'source': 'An example post on X', 'at': now - 3000},
]

async def site_part(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True, args=['--autoplay-policy=no-user-gesture-required'])
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site)
  await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  await c.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); sessionStorage.setItem('seeded', '1'); }} }} catch (e) {{}}")
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
  # 3.
  await pg.evaluate("document.documentElement.dataset.annotatedInstalled = '1'; document.dispatchEvent(new CustomEvent('annotated-installed'))"); await asyncio.sleep(1.2)
  have = await pg.evaluate("[...document.querySelectorAll('.heroHave')].filter((x) => !x.hidden).map((x) => x.textContent.trim().slice(0, 24))")
  print('3. the installed line:', have)
  if not have or not all(h.startswith('annotated is installed') for h in have): errs.append(f'the installed line reads {have}')
  # 7.
  words = await pg.evaluate("[...document.querySelectorAll('.llRow .yours')].map((li) => ({ quote: !!li.querySelector('.yQuote'), csn: li.querySelector('.csn').textContent }))")
  print('7. the cards:', words)
  if [w['quote'] for w in words] != [False, True, True] or words[1]['csn'] != 'Passage' or words[2]['csn'] != 'Post': errs.append(f'passage and post cards do not show their words: {words}')
  # 4.
  await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(.3)
  await pg.click('.llRow .yours:first-child .ctake'); await asyncio.sleep(1)
  st = await pg.evaluate("({ y: scrollY, tab: document.querySelector('.tryTab[aria-selected=\"true\"]').id })")
  print('4. a card clicked with the try-it in sight:', st)
  if st['y'] > 2 or st['tab'] != 'tab-audio': errs.append(f'the page moved or the tab did not open: {st}')
  box = await pg.evaluate("(() => { const r = document.querySelector('.llRow .yours:first-child .yWave').getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; })()")
  await pg.mouse.click(box['x'], box['y']); await asyncio.sleep(.8)
  playing = await pg.evaluate("document.querySelector('.llRow .yours:first-child .yWave').classList.contains('playing')")
  print('   the waveform clicked plays:', playing)
  if not playing: errs.append('clicking the waveform did not play the moment')
  await pg.mouse.click(box['x'], box['y'])
  # 8.
  await pg.hover('.llRow .yours:nth-child(2)'); await asyncio.sleep(.3)
  top0 = await pg.evaluate("document.querySelector('.llRow').getBoundingClientRect().top")
  await pg.click('.llRow .yours:nth-child(2) .yDel'); await asyncio.sleep(.4)
  und = await pg.evaluate("({ shown: !document.querySelector('.llUndo').hidden, inHead: !!document.querySelector('.llHead .llUndo'), top: document.querySelector('.llRow').getBoundingClientRect().top })")
  print('8. Undo after removing a card:', und, 'row top before', top0)
  if not und['shown'] or not und['inHead'] or abs(und['top'] - top0) > 1: errs.append(f'Undo moved the row or is not in the heading: {und} vs {top0}')
  await pg.click('.llUndoBtn'); await asyncio.sleep(.3)
  # 5 and 6.
  await pg.goto(URL + '?planes'); await asyncio.sleep(4.5)
  await pg.evaluate("document.dispatchEvent(new CustomEvent('annotated-tryit-touched'))"); await asyncio.sleep(.3)
  await pg.click('.tiForMe'); await asyncio.sleep(1.4)
  await pg.fill('#tiInput', 'A take.'); await pg.keyboard.press('Enter')
  t0 = time.time(); log = []
  while time.time() - t0 < 7:
    s = await pg.evaluate("""(() => { const li = document.querySelector('.llRow .yours'); const paper = document.querySelector('.tp-article .tiTilt > .tiPaper');
      return { held: !!li && li.classList.contains('pl-held'), slot: !!li && getComputedStyle(li).display !== 'none' && li.firstElementChild.classList.contains('pl-hidden'), paper: !!paper && !paper.classList.contains('pl-hidden') }; })()""")
    log.append((round(time.time() - t0, 1), s)); await asyncio.sleep(.1)
  held_until = max([t for t, s in log if s['held']], default=0)
  slot_early = [t for t, s in log if s['slot'] and t < 1.8]
  gone = [t for t, s in log if not s['paper']]
  gap = (gone[-1] - gone[0]) if gone else 0
  print(f'5. held out of the row until {held_until}s, an empty slot shown before 1.8s at {slot_early[:3]}')
  print(f'6. the brief was away from {gone[0] if gone else None}s for {round(gap, 1)}s')
  if not (1.5 <= held_until <= 2.6): errs.append(f'the take was held for {held_until}s, not about two')
  if slot_early: errs.append('the row showed an empty slot while the take was still up')
  if not gone: errs.append('the brief never folded away')
  elif gap > 3.2: errs.append(f'the brief was away for {gap}s')
  await b.close()

async def ext_part(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('prof2356'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.route('https://annotated-app.netlify.app/**', site)
  await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  extid = sw.url.split('/')[2]
  home = await ctx.new_page(); await home.goto(URL + '?installed'); await asyncio.sleep(1)
  blank = await ctx.new_page()
  bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
  pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
  await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(2)
  # 2.
  await pan.evaluate("(document.querySelector('.welcome .wGo') || {}).click && document.querySelector('.welcome .wGo').click()"); await asyncio.sleep(.3)
  await pan.evaluate("document.querySelector('.youBtn').click()"); await asyncio.sleep(1)
  empty = await pan.evaluate("(document.querySelector('#browseMode .browseEmpty') || {}).textContent || null")
  print('2. an empty Your profile says:', empty)
  if empty and 'Capture something' in empty: errs.append(f'the empty profile still says {empty!r}')
  # 1.
  before = await sw.evaluate("chrome.tabs.query({}).then((t) => t.length)")
  await pan.click('.helpBtn'); await asyncio.sleep(.5)
  await pan.click('.wSite'); await asyncio.sleep(1)
  after = await sw.evaluate("chrome.tabs.query({}).then((t) => ({ n: t.length, active: t.filter((x) => x.active).map((x) => x.url) }))")
  print('1. tabs before', before, 'and after the help link:', after)
  if after['n'] != before: errs.append(f'the help link opened another tab: {before} -> {after["n"]}')
  if not any('annotated-app.netlify.app/?installed' in u for u in after['active']): errs.append(f'the home page tab was not brought forward: {after}')
  await ctx.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await site_part(p, errs)
    await ext_part(p, errs)
  print('errors:', errs)

asyncio.run(main())
