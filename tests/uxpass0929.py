# The UX pass of 2026-09-29 (after the backup tagged backup-2026-09-29-before-ux100), and David's paper notes of the
# same day.
#   1. No window has binder holes, and no sheet keeps the margin they needed.
#   2. Cards in a list are separate sheets: the gap between them is wider than both sheets' reach, so the torn edges show.
#   3. The paper carries the new grain (paper/grain2.png, a quieter copy in dark mode).
#   4. A sign-in asked for with nothing beside it drops from the top right, under the header, on opaque paper.
#   5. The feed's Following tab signed out offers Google or X, not the extension, and says so once.
#   6. A post card with its screenshot names the post under it without quoting the words again.
#   7. The podcast tab's button reads Capture clip, and the brief's hint says "in the brief".
#   9. The five paper touches: tears that differ, a tiny tilt, different whites, a lifted corner, ageing at the edges.
#   8. The panel's Sign in carries no Google mark, the way back drops a site's name from a page title, and chips in a
#      tag row keep their own width.
import asyncio, json, pathlib, mimetypes, re
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
SHOT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
A = '22222222-2222-4222-8222-222222222222'
def row(i, kind='post', shot=True):
  return {'id': f'00000000-0000-4000-8000-00000000000{i}', 'author_id': A, 'kind': kind, 'created_at': f'2026-09-27T1{i}:00:00Z', 'take_text': f'Take number {i}.',
    'tag': None, 'poll': None, 'gif': None, 'voice_path': None, 'upload': None, 'media_path': None, 'poster_path': None,
    'shot_path': A + f'/p{i}/shot.png' if shot else None,
    'source': {'text': 'The whole post, word for word.', 'quote': 'word for word', 'author': 'Test Person', 'handle': '@testperson', 'url': f'https://x.com/testperson/status/{i}'},
    'author': {'id': A, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}, 'comments': [], 'reactions': [], 'poll_votes': []}
ROWS = [row(i) for i in range(1, 7)]

def site(route):
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def db(route):
  u = route.request.url
  if '/storage/' in u:
    return await route.fulfill(status=200, body=(PUB / 'icon.png').read_bytes(), headers={'Content-Type': 'image/png'})
  if '/rest/v1/annotations' in u and 'select=id' in u.replace('%2C', ','):
    return await route.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
  if '/rest/v1/annotations' in u:
    # One annotation asked for on its own page comes back as one object, as Supabase answers .single().
    one = 'vnd.pgrst.object' in (route.request.headers.get('accept') or '')
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(next((r for r in ROWS if r['id'] in u), ROWS[0]) if one else [r for r in ROWS if r['id'] in u] if 'id=eq.' in u else ROWS))
  return await route.fulfill(status=200, content_type='application/json', body='[]')

async def web_part(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True)
  for scheme in ('light', 'dark'):
    c = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme=scheme)
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('SITE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.card.mf'); await asyncio.sleep(1.2)
    r = await pg.evaluate("""() => {
      const cards = [...document.querySelectorAll('.cards > .cardItem, .cards > li')].map((li) => li.querySelector('.card.mf')).filter(Boolean);
      const bg = (el) => getComputedStyle(el, '::before').backgroundImage;
      const reach = (el) => { const a = el.getBoundingClientRect(); return parseFloat(getComputedStyle(el).getPropertyValue('--sp')) || 0; };
      const r0 = cards[0].getBoundingClientRect(), r1 = cards[1].getBoundingClientRect();
      return { holes: cards.some((c) => /circle at 13px/.test(bg(c))), margin: parseFloat(getComputedStyle(cards[0]).marginLeft),
        gap: r1.top - r0.bottom, sp: reach(cards[0]), grain: bg(cards[0]).match(/grain2[^"]*\\.png/)?.[0] || '',
        csn: cards.map((c) => !!c.querySelector('.csn')), cst: cards.map((c) => (c.querySelector('.cst') || {}).textContent),
        // The five paper touches (2.37.0): tears, tilt, whites, a lifted corner, ageing.
        tears: cards.map((c) => getComputedStyle(c).getPropertyValue('--tx').trim() + '/' + getComputedStyle(c).getPropertyValue('--ty').trim()),
        tilt: cards.map((c) => getComputedStyle(c).rotate), shade: cards.map((c) => getComputedStyle(c).getPropertyValue('--sheet-shade').trim()),
        lift: cards.map((c) => getComputedStyle(c, '::after').translate), age: /115% 115%/.test(bg(cards[0])) }; }""")
    print(scheme, 'feed:', r)
    if r['holes']: errs.append(f'{scheme}: a feed card still has binder holes')
    if r['margin'] != 0: errs.append(f'{scheme}: a card keeps the holes margin ({r["margin"]})')
    if r['gap'] <= 2 * r['sp'] + 4: errs.append(f'{scheme}: cards overlap their sheets (gap {r["gap"]}, reach {r["sp"]})')
    want = 'grain2-dark.png' if scheme == 'dark' else 'grain2.png'
    if r['grain'] != want: errs.append(f'{scheme}: the paper does not carry {want}: {r["grain"]!r}')
    if len(set(r['tears'])) < 3: errs.append(f'{scheme}: the cards share one tear: {r["tears"]}')
    if len(set(r['tilt'])) < 3 or any(t not in ('none',) and abs(float(t.replace('deg', ''))) > .3 for t in r['tilt']): errs.append(f'{scheme}: the tilt is missing or too much: {r["tilt"]}')
    if len(set(r['shade'])) < 3: errs.append(f'{scheme}: the whites do not differ: {r["shade"]}')
    if not any(t not in ('none', '0px 0px', '0px') for t in r['lift']): errs.append(f'{scheme}: no corner lifts: {r["lift"]}')
    if not r['age']: errs.append(f'{scheme}: the edges do not age')
    if any(r['csn']): errs.append(f'{scheme}: a post card with its screenshot quotes the words again')
    if not all(t and 'Test Person' in t for t in r['cst']): errs.append(f'{scheme}: a post card does not name the post: {r["cst"]}')
    # 4. The header's Sign in.
    await pg.click('.webSignIn'); await asyncio.sleep(.5)
    s = await pg.evaluate("""() => { const a = document.querySelector('.signAsk.floating'); if (!a) return null; const b = a.getBoundingClientRect();
      return { top: b.top, right: innerWidth - b.right, bg: getComputedStyle(a).backgroundColor, img: getComputedStyle(a).backgroundImage }; }""")
    print(scheme, 'sign-in prompt:', s)
    if not s or s['top'] > 90 or s['right'] > 40: errs.append(f'{scheme}: the sign-in prompt is not under the header at the top right: {s}')
    elif s['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and 'none' == s['img']: errs.append(f'{scheme}: the sign-in prompt is see-through')
    await pg.keyboard.press('Escape'); await pg.evaluate("document.querySelectorAll('.signAsk').forEach((x) => x.remove())")
    # 5. Following, signed out.
    await pg.evaluate("document.querySelector('.feedTabs input[value=\"following\"]').click()"); await asyncio.sleep(1)
    f = await pg.evaluate("""() => { const e = document.querySelector('.cards .emptyState'); return e && { text: e.textContent.replace(/\\s+/g, ' ').trim(),
      signIn: !!e.querySelector('.pSignIn'), ext: !!e.querySelector('.esMake') }; }""")
    print(scheme, 'following:', f)
    if not f or not f['signIn'] or f['ext']: errs.append(f'{scheme}: Following signed out does not offer to sign in: {f}')
    elif 'from the panel' in f['text']: errs.append(f'{scheme}: Following still says "from the panel"')
    await c.close()
  # 10. Five more: fibres, ink, lift on hover, the page underneath, one light.
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page()
  await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.cards > li:nth-child(2) .card.mf'); await asyncio.sleep(1)
  card = pg.locator('.cards > li:nth-child(2) .card.mf'); await card.scroll_into_view_if_needed(); await asyncio.sleep(.4); bb = await card.bounding_box()
  before = await card.evaluate("(c) => getComputedStyle(c).translate")
  await pg.mouse.move(bb['x'] + 100, bb['y'] + 60); await asyncio.sleep(.5)
  f = await pg.evaluate("""() => { const c = document.querySelector('.cards > li:nth-child(2) .card.mf');
    return { fray: /svg/.test(getComputedStyle(c, '::before').backgroundImage) && getComputedStyle(c, '::before').backgroundImage.split('url(').length > 5,
      hover: getComputedStyle(c).translate,
      deco: [...document.querySelectorAll('.paperDeco g[transform] > ellipse.pdShadow, .paperDeco g[transform] > ellipse.pdShadowSoft')].map((e) => e.parentElement.getAttribute('transform')) }; }""")
  print('fibres, hover, shadows:', f['fray'], before, '->', f['hover'], f['deco'][:3])
  if not f['fray']: errs.append('the torn edges have no fibres')
  if f['hover'] in ('none', before): errs.append('a card does not lift under the pointer')
  if any('rotate' in t for t in f['deco']): errs.append('a drawing shadow still turns with it: ' + str(f['deco']))
  await pg.click('.cards > li:nth-child(2) .card.mf .ctake'); await pg.wait_for_selector('.annCard', timeout=10000); await asyncio.sleep(1)
  u = await pg.evaluate("(() => { const u = document.querySelector('.annCard > .underSheet'); return u && { rot: getComputedStyle(u).rotate, z: getComputedStyle(u).zIndex }; })()")
  # 11. Replies on slips, and the paper's thickness (an edge line along the bottom tear, before the fibres).
  sl = await pg.evaluate("""() => { const sec = document.createElement('section'); sec.className = 'comments';
    sec.innerHTML = '<ul class="cList"><li class="cmt">One</li><li class="cmt">Two</li></ul>'; document.querySelector('.annBody').appendChild(sec);
    const li = [...sec.querySelectorAll('li.cmt')], cs = (e, p) => getComputedStyle(e, p);
    const out = { mask: /svg/.test(cs(li[0], '::before').maskImage || cs(li[0], '::before').webkitMaskImage), rot: li.map((x) => cs(x).rotate), border: cs(li[0]).borderBottomStyle,
      urls: cs(document.querySelector('.annCard'), '::before').backgroundImage.split('url(').length - 1 };
    sec.remove(); return out; }""")
  print('slips and thickness:', sl)
  if not sl['mask'] or sl['rot'][0] == sl['rot'][1] or sl['border'] != 'none': errs.append(f'comments are not slips: {sl}')
  if sl['urls'] < 7: errs.append(f"the sheet has no edge line for its thickness ({sl['urls']} pictures)")
  print('the page underneath:', u)
  if not u or u['rot'] in ('none', '0deg'): errs.append(f'the annotation has no page underneath: {u}')
  await c.close()
  # 12. No drawing twice on a page: the Feed heading's plane and the margins' (David, 2026-09-29).
  c = await b.new_context(viewport={'width': 1600, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page(); twice = []
  for k in range(8):
    await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.card.mf'); await asyncio.sleep(.6)
    kinds = await pg.evaluate("[...document.querySelectorAll('[data-pd-kind]')].map((e) => e.dataset.pdKind).filter((k) => k !== 'trail')")
    if len(kinds) != len(set(kinds)): twice.append(kinds)
  print('drawings on the feed, repeated on', len(twice), 'of 8 visits')
  if twice: errs.append(f'a drawing shows twice on one page: {twice}')
  await c.close()
  # 1 and 7 on the home page.
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page()
  await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2)
  br = await pg.evaluate("""() => { const t = document.querySelector('.tiPaper'), sc = document.querySelector('.tryPanel.sceneTry'), c = (e, p) => getComputedStyle(e, p);
    return { brief: /svg/.test(c(t, '::before').maskImage || c(t, '::before').webkitMaskImage), curl: c(document.querySelector('.tiCurl')).display,
      dots: /radial-gradient\(rgba\(60, 50, 20/.test(c(t).backgroundImage), scene: /svg/.test(c(sc, '::before').maskImage || c(sc, '::before').webkitMaskImage) }; }""")
  print('the try-it paper:', br)
  if not br['brief'] or not br['scene'] or br['dots'] or br['curl'] != 'none': errs.append(f"the try-it's paper is not a torn sheet: {br}")
  h = await pg.evaluate("""() => ({ ink: [...document.querySelectorAll('.yQuote mark, .ftHit, .xMark, [data-annotated-self] mark.annotated-hl')].map((m) => getComputedStyle(m).mixBlendMode).slice(0, 4), holes: [...document.querySelectorAll('.ftDemo, .landGet')].some((e) => /circle at 13px/.test(getComputedStyle(e, '::before').backgroundImage)),
    hint: (document.querySelector('.tiHint') || {}).textContent, clip: [...document.querySelectorAll('#panel-audio .stGo')].map((x) => x.textContent.trim()) })""")
  print('home:', h)
  if h['holes']: errs.append('a Features example still has binder holes')
  if not h['ink'] or any(x != 'multiply' for x in h['ink']): errs.append(f"the highlighter does not soak into the paper: {h['ink']}")
  if h['hint'] != 'Select any words in the brief.': errs.append(f"the brief's hint reads {h['hint']!r}")
  if h['clip'] != ['Capture clip']: errs.append(f"the podcast tab's button reads {h['clip']}")
  await b.close()

async def ext_part(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('profUX0929'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
  await ctx.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  pg = await ctx.new_page(); await pg.set_viewport_size({'width': 420, 'height': 900})
  await pg.goto(f'chrome-extension://{sw.url.split("/")[2]}/sidepanel.html'); await asyncio.sleep(3)
  r = await pg.evaluate("""() => {
    const b = document.querySelector('.acctBtn');
    const d = document.createElement('div'); d.className = 'tags'; d.style.width = '360px';
    d.innerHTML = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'].map((t) => `<button class="tagbtn">${t}</button>`).join('');
    document.body.appendChild(d); const last = d.lastElementChild.getBoundingClientRect().width; d.remove();
    return { btn: b ? b.textContent.trim() : null, svg: b ? !!b.querySelector('svg') : null, last,
      titles: ['Can overnight buses work? - The Transit Hour', 'Kenya | Wikipedia', 'Harbor story', 'Sawyer Merritt on X: "Motortrend after"', 'A - B'].map(cleanTitle) }; }""")
  side = await pg.evaluate("""() => { const rec = (i, t) => ({ id: 'r' + i, created: Date.now(), cloud: true, author: { id: 'u', name: 'R', handle: 'r' },
      item: { kind: 'post', text: 'A post', author: 'T', handle: '@T', url: 'https://x.com/t/status/' + i }, take: { text: t, tag: null, poll: null }, comments: [], reactions: [] });
    const recs = [rec(1, 'One'), rec(2, 'Two')]; const m = document.createElement('main'); document.body.appendChild(m);
    AnnotationPage.renderSide(m, { current: recs[0], records: recs, youId: 'u', permalinkOf: (id) => id, onOpen() {}, onFeed() {} });
    const c = (e) => /svg/.test(getComputedStyle(e, '::before').maskImage || getComputedStyle(e, '::before').webkitMaskImage);
    const out = { now: c(m.querySelector('.sideNow')), list: c(m.querySelector('.annside > .sideList')) }; m.remove();
    const d = document.createElement('div'); document.body.appendChild(d); PaperDeco.desk(d);
    out.right = (d.querySelector('.pdR') || {}).innerHTML || ''; d.remove(); return out; }""")
  print('side view sheets:', side['now'], side['list'], '| right margin is a plane:', 'pdFace' in side['right'] and 'pdPage' not in side['right'])
  if not side['now'] or not side['list']: errs.append(f'the panel beside an annotation is not on sheets: {side}')
  if 'pdKeel' not in side['right'] and 'pdFace' not in side['right']: errs.append('the right margin is not a plane')
  print('panel:', r)
  if r['btn'] != 'Sign in' or r['svg']: errs.append(f"the panel's Sign in still carries the Google mark: {r}")
  if r['titles'] != ['Can overnight buses work?', 'Kenya', 'Harbor story', 'the post on X', 'A - B']: errs.append(f"the way back's names: {r['titles']}")
  if r['last'] > 200: errs.append(f'a lone tag chip stretches across the row ({r["last"]} pixels)')
  await ctx.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await web_part(p, errs)
    await ext_part(p, errs)
  print('errors:', errs)
asyncio.run(main())
