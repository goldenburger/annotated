# What 2.34.0 added after watching the other entries (recordings of 2026-09-28 at 21:38 and 22:04).
#   1. A clip or podcast card shows the moment on its picture, "3:09–3:26", with the length in its tooltip.
#   2. The feed carries the first reply by someone else as one line under the card, read from the list itself.
#   3. Folding the corner of an annotation keeps it; the feed then offers Folded with the count, and it lists it.
#   4. Copying a link sends a tiny plane off the button.
#   5. The home page's hero has Watch the demo and a plain trust line, and on a wide screen two pencil notes sit
#      in the margins, the try-it's going once the paper is touched.
import asyncio, json, pathlib, mimetypes
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
SHOT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
A = '22222222-2222-4222-8222-222222222222'; B = '33333333-3333-4333-8333-333333333333'
ROW = {'id': 'pod1', 'author_id': A, 'kind': 'audio', 'created_at': '2026-09-27T10:00:00Z', 'take_text': 'The same line as Dario.',
       'tag': 'Hot take', 'poll': None, 'gif': None, 'voice_path': None, 'upload': None, 'media_path': A + '/pod1/clip.mp3', 'poster_path': None, 'shot_path': None,
       'source': {'title': 'Ajeya Cotra', 'show': 'Dwarkesh Podcast', 'url': 'https://pod.example/e', 'artwork': SHOT, 'start': 5890, 'end': 5905, 'duration': 8432},
       'author': {'id': A, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''},
       'comments': [{'author_id': A, 'body': 'my own note', 'gif': None, 'created_at': '2026-09-27T10:01:00Z', 'author': {'id': A, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}},
                    {'author_id': B, 'body': 'Worth hearing in his own words.', 'gif': None, 'created_at': '2026-09-27T10:02:00Z', 'author': {'id': B, 'handle': 'jen', 'display_name': 'Jen Park', 'avatar_url': ''}},
                    {'author_id': B, 'body': 'later one', 'gif': None, 'created_at': '2026-09-27T11:00:00Z', 'author': {'id': B, 'handle': 'jen', 'display_name': 'Jen Park', 'avatar_url': ''}}],
       'reactions': [], 'poll_votes': []}

def site(route):
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def ext_part(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('profF234'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-planes','on')}catch(e){}")
  async def rest(route):
    u = route.request.url
    if '/rest/v1/annotations' in u and 'select=id' in u.replace('%2C', ','):
      return await route.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
    if '/rest/v1/annotations' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([ROW]))
    return await route.fulfill(status=200, content_type='application/json', body='[]')
  await ctx.route(SUPA + '/**', rest)
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  extid = sw.url.split('/')[2]
  pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1100, 'height': 900})
  pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)

  # 1 and 2: the list as the database gives it, drawn as the feed draws it.
  got = await pg.evaluate("""async () => {
    const rs = await Cloud.list();
    const d = document.createElement('div'); document.body.appendChild(d);
    AnnotationPage.renderFeed(d, { records: rs, mode: 'home', onOpen() {}, onTag() {}, onAll() {} });
    await new Promise((r) => setTimeout(r, 300));
    const c = d.querySelector('.cardItem');
    const out = { first: rs[0] && rs[0].firstReply, range: (c.querySelector('.cdur') || {}).textContent || '', tip: (c.querySelector('.cdur') || {}).title || '',
                  reply: ((c.querySelector('.creply') || {}).textContent || '').replace(/\\s+/g, ' ').trim() };
    d.remove(); return out; }""")
  print('the card:', got)
  if got['range'] != '1:38:10–1:38:25': errs.append(f"the moment is not on the picture: {got['range']!r}")
  if '0:15' not in got['tip']: errs.append(f"the length is not in the tooltip: {got['tip']!r}")
  if got['reply'] != 'Jen Park Worth hearing in his own words.': errs.append(f"the first reply by someone else is not the line under the card: {got['reply']!r}")

  # 3. Fold the corner, and the feed offers Folded.
  folded = await pg.evaluate("""async (id) => {
    localStorage.removeItem('annotated-folded');
    const rs = await Cloud.list();
    const d = document.createElement('div'); document.body.appendChild(d);
    const before = () => { AnnotationPage.renderFeed(d, { records: rs, mode: 'home', onOpen() {}, onTag() {}, onAll() {} }); return [...d.querySelectorAll('.feedFilter input')].map((i) => i.value); };
    const had = before();
    AnnotationPage.Folded.toggle(id);
    const now = before();
    const lab = [...d.querySelectorAll('.feedFilter label')].find((l) => l.querySelector('input').value === 'folded');
    const text = lab ? lab.textContent.replace(/\\s+/g, ' ').trim() : '';
    lab && lab.querySelector('input').click();
    await new Promise((r) => setTimeout(r, 200));
    const listed = [...d.querySelectorAll('.cardItem .card')].map((c) => c.dataset.id);
    d.remove(); return { had, now, text, listed }; }""", 'pod1')
  print('Folded:', folded)
  if 'folded' in folded['had']: errs.append('Folded was offered with nothing folded')
  if 'folded' not in folded['now'] or folded['text'] != 'Folded 1': errs.append(f"Folded is not offered with its count: {folded}")
  if folded['listed'] != ['pod1']: errs.append(f"Folded does not list the folded annotation: {folded['listed']}")

  # 3 and 4 on the annotation's own page: the corner folds, and Copy link sends a plane.
  ann = await ctx.new_page(); await ann.set_viewport_size({'width': 1100, 'height': 900})
  ann.on('pageerror', lambda e: errs.append('ANN ' + str(e)))
  await ann.evaluate("() => 0")
  await ann.goto(f'chrome-extension://{extid}/annotation.html#pod1'); await asyncio.sleep(2.5)
  st = await ann.evaluate("({ has: !!document.querySelector('.annCard .foldBtn'), folded: document.querySelector('.annCard') && document.querySelector('.annCard').classList.contains('folded') })")
  print('annotation page corner:', st)
  if not st['has']: errs.append('the annotation page has no corner to fold')
  elif not st['folded']: errs.append('an annotation folded in the feed is not folded on its page')
  if st['has']:
    await ann.click('.annCard .foldBtn'); await asyncio.sleep(.4)
    after = await ann.evaluate("({ folded: document.querySelector('.annCard').classList.contains('folded'), kept: JSON.parse(localStorage.getItem('annotated-folded') || '[]') })")
    print('pressed, unfolded:', after)
    if after['folded'] or 'pod1' in after['kept']: errs.append(f'pressing the folded corner did not unfold it: {after}')
  tossed = await ann.evaluate("""async () => {
    const b = document.createElement('button'); b.textContent = 'Copy link'; b.style.cssText = 'position:fixed;left:200px;top:300px'; document.body.appendChild(b);
    Fold.toss(b); await new Promise((r) => setTimeout(r, 200));
    const p = document.querySelector('.pl-toss'); const r = p && p.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 1200));
    return { flew: !!p, moved: r ? Math.round(r.left) : null, gone: !document.querySelector('.pl-toss') }; }""")
  print('the share plane:', tossed)
  if not tossed['flew'] or not tossed['gone']: errs.append(f'the share plane did not fly off and go: {tossed}')
  await ctx.close()

async def site_part(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True)
  c = await b.new_context(viewport={'width': 1440, 'height': 1000})
  await c.route('https://annotated-app.netlify.app/**', site)
  await c.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('SITE ' + str(e)))
  await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2.5)
  hero = await pg.evaluate("""() => { const d = document.querySelector('.heroDemo'); const n = [...document.querySelectorAll('.marginNote')];
    return { demo: d ? d.href : '', free: (document.querySelector('.heroFree') || {}).textContent || '', notes: n.map((x) => [x.textContent.trim(), getComputedStyle(x).display, Math.round(x.getBoundingClientRect().width)]) }; }""")
  print('home page:', hero)
  if 'youtu.be/VTbDJ9a-2XE' not in hero['demo']: errs.append(f"Watch the demo does not go to the demo: {hero['demo']!r}")
  if hero['free'] != 'Free and open source. No ads.': errs.append(f"the trust line is wrong: {hero['free']!r}")
  # The try-it's note was removed at David's word (2.35); the install one stays.
  if len(hero['notes']) != 1 or any(d == 'none' for _, d, _ in hero['notes']): errs.append(f'the install margin note is not shown on a wide screen: {hero["notes"]}')
  await pg.screenshot(path='features234_home.png')
  await pg.evaluate("document.dispatchEvent(new CustomEvent('annotated-tryit-touched'))"); await asyncio.sleep(.8)
  if await pg.evaluate("!!document.querySelector('.mnTry')"): errs.append("the try-it's margin note is back")
  phone = await b.new_page(viewport={'width': 390, 'height': 800})
  await phone.route('https://annotated-app.netlify.app/**', site)
  await phone.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  await phone.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2)
  shown = await phone.evaluate("[...document.querySelectorAll('.marginNote')].filter((x) => getComputedStyle(x).display !== 'none').length")
  wide = await phone.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
  print('on a phone, margin notes shown:', shown, '| page wider than the screen:', wide)
  if shown: errs.append('margin notes show on a phone')
  if wide: errs.append('the home page scrolls sideways on a phone')
  await b.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await ext_part(p, errs)
    await site_part(p, errs)
  print('errors:', errs)

if __name__ == "__main__": asyncio.run(main())
