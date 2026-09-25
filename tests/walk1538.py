# The recording of 2026-09-25 at 15:38.
#   1. Home in the panel beside the extension's own feed page opens the panel's Home list (it did nothing).
#   2. "Open the feed as a full page" beside our website moves that tab to the website's feed.
#   3. The annotation page asks for its data together, so it draws sooner with a slow database.
#   4. The account menu and the help screen put each other away.
#   5. The panel's Home remembers its lists across a panel reload, with no "Loading annotations…".
#   6. The home page's podcast example plays: the player's button, and the clipped waveform.
#   7. A video folds into a plane as its frame, and a new clip card shows its first frame before the video.
#   8, 9. "It lands as a page" has four reactions, and the poll editor holds only the question.
#   10. The way back names a post on X "the post on X".
import asyncio, pathlib, mimetypes, json, time
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
UID = 'robo-1538'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}

async def main():
  errs = []
  async with async_playwright() as p:
    # 6, 7, 8, 9. The website.
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?noplanes'); await pg.wait_for_selector('.landFeatures'); await asyncio.sleep(.8)
    await pg.click('.ftPlay'); await asyncio.sleep(1.2)
    pl = await pg.evaluate("document.querySelector('.ftPlay').getAttribute('aria-label')")
    await pg.click('.ftSteps li:nth-child(3) .ftStep'); await asyncio.sleep(.3)
    await pg.click('.ftWave'); await asyncio.sleep(1.2)
    wv = await pg.evaluate("document.querySelector('.ftWave').classList.contains('playing')")
    print('6. the player says', pl, '| the waveform playing', wv)
    if pl != 'Pause' or not wv: errs.append(f'the podcast example does not play: {pl}, {wv}')
    n = await pg.evaluate("({ reacts: document.querySelectorAll('.ftPage .ftR').length, edit: (document.querySelector('.ftPollBtn').click(), document.querySelectorAll('.ftPollEdit input').length), choices: document.querySelectorAll('.ftChoices .ftChoice').length })")
    print('8, 9.', n)
    if n != {'reacts': 4, 'edit': 1, 'choices': 2}: errs.append(f'the page example or poll editor is wrong: {n}')
    # 7. A new clip card, and a video folded into a plane.
    await pg.click('#tab-video'); await asyncio.sleep(1)
    await pg.click('.tp-video .stGo'); await asyncio.sleep(1)
    await pg.fill('.tp-video .stTake textarea', 'A test take'); await pg.click('.tp-video .stMake'); await asyncio.sleep(.5)
    still = await pg.evaluate("(() => { const v = document.querySelector('.tp-video .stClip video'); return v ? v.style.backgroundImage : null; })()")
    print('7. the new clip card still:', (still or '')[:60])
    if not still or 'artemis-i-frames' not in still: errs.append(f'the new clip card has no still: {still}')
    fold = await pg.evaluate("""(async () => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:100px;top:100px;width:300px;background:#fff';
      d.innerHTML = '<p>words</p><video style="width:280px;height:158px"></video>'; const v = d.querySelector('video');
      v.style.backgroundImage = 'url("/media/artemis-i-frames.jpg")'; document.body.appendChild(d);
      const pl = Fold.buildPlane(d, { s0: .5 }); const r = { frames: document.querySelectorAll('.pl-layer .pl-frame').length, videos: document.querySelectorAll('.pl-layer video').length };
      document.querySelectorAll('.pl-layer').forEach((x) => x.remove()); d.remove(); return r; })()""")
    print('   a video folded into a plane:', fold)
    if not fold['frames'] or fold['videos']: errs.append(f'a video folds as a black box: {fold}')
    await b.close()

    # The extension.
    ctx = await p.chromium.launch_persistent_context(prof('prof1538'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://annotated-app.netlify.app/**', site)
    slow = {'on': False}
    async def db(route):
      u = route.request.url
      if slow['on']: await asyncio.sleep(.8)
      if '/rest/v1/profiles' in u:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''} if 'maybeSingle' in u or 'id=eq' in u else []))
      try: await route.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
      except Exception: pass
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s) => chrome.storage.local.set({ 'annotated-auth': JSON.stringify(s) })", SESSION); await asyncio.sleep(.3)
    feed = await ctx.new_page(); await feed.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
    fid = await sw.evaluate(f"chrome.tabs.query({{}}).then((t) => t.find((x) => x.url === 'chrome-extension://{extid}/feed.html').id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={fid}'); await asyncio.sleep(2)
    # 1.
    await pan.click('.homeBtn'); await asyncio.sleep(1.2)
    h = await pan.evaluate("({ browse: !document.querySelector('#browseMode').hidden, title: (document.querySelector('#browseMode h2') || {}).textContent || null })")
    print('1. Home beside the feed page:', h)
    if h != {'browse': True, 'title': 'Home'}: errs.append(f'Home did nothing beside the feed page: {h}')
    # 10.
    t = await pan.evaluate("[cleanTitle('Sawyer Merritt on X: \"Motortrend after driving the new Tesla Semi\" / X'), cleanTitle('A Harbor story')]")
    print('10.', t)
    if t != ['the post on X', 'A Harbor story']: errs.append(f'the way back reads {t}')
    # 4.
    await pan.click('.helpBtn'); await asyncio.sleep(.4)
    await pan.click('.acctBtn'); await asyncio.sleep(.4)
    a = await pan.evaluate("({ help: document.body.classList.contains('welcoming'), menu: !!document.querySelector('.acctPop') })")
    await pan.click('.helpBtn'); await asyncio.sleep(.4)
    a2 = await pan.evaluate("({ help: document.body.classList.contains('welcoming'), menu: !!document.querySelector('.acctPop') })")
    await pan.click('.acctBtn'); await asyncio.sleep(.4)
    a3 = await pan.evaluate("!!document.querySelector('.acctPop')")
    print('4. menu over help:', a, '| help over menu:', a2, '| the menu opens again at one press:', a3)
    if a != {'help': False, 'menu': True} or a2 != {'help': True, 'menu': False} or not a3: errs.append(f'help and the menu overlap: {a}, {a2}, {a3}')
    await pan.keyboard.press('Escape'); await pan.evaluate("Account.close()")
    # 5.
    blank = await ctx.new_page(); await blank.goto('about:blank')
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(3)
    await pan.reload()
    seen = []
    for _ in range(20):
      seen.append(await pan.evaluate("(() => { const m = document.querySelector('#browseMode'); return m && !m.hidden ? /Loading annotations/.test(m.textContent) : null; })()"))
      await asyncio.sleep(.1)
    print('5. "Loading annotations" after reopening the panel:', [x for x in seen if x is not None][:6])
    if any(seen): errs.append('the panel said Loading annotations again after it was reopened')
    # 2.
    site_tab = await ctx.new_page(); await site_tab.goto(URL + '?noplanes'); await asyncio.sleep(1)
    sid = await sw.evaluate("chrome.tabs.query({}).then((t) => t.find((x) => x.url.startsWith('https://annotated-app.netlify.app/')).id)")
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2)
    before = await sw.evaluate("chrome.tabs.query({}).then((t) => t.length)")
    await pan.evaluate("openFull('home', null)"); await asyncio.sleep(1.5)
    after = await sw.evaluate(f"chrome.tabs.query({{}}).then((t) => [t.length, t.find((x) => x.id === {sid}).url])")
    print('2. beside the website, the full feed:', before, after)
    if after[0] != before or not after[1].endswith('/?feed'): errs.append(f'the full feed opened elsewhere: {before} {after}')
    # 3. A published annotation opened with a slow database.
    await pan.evaluate("""Store.put('pub-1538', { item: { kind: 'article', url: 'https://example.test/a', text: 'words', quote: 'words', meta: { title: 'A page' } },
      take: { text: 'A take' }, created: Date.now(), cloud: true, author: { id: '""" + UID + """', name: 'Robo Taxi', handle: 'robotaxi' } })""")
    slow['on'] = True
    ann = await ctx.new_page(); t0 = time.time()
    await ann.goto(f'chrome-extension://{extid}/annotation.html#pub-1538')
    await ann.wait_for_selector('.annCard', timeout=20000); took = time.time() - t0
    slow['on'] = False
    print(f'3. the annotation drew after {took:.1f}s with every request taking 0.8s')
    if took > 3.0: errs.append(f'the annotation page took {took:.1f}s to draw')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
