# The recording of 2026-09-25 at 06:58.
#   1. With the extension installed, the install button still arrives by plane, and downloads the extension; the
#      steps stay hidden and "You're set" names the annotated plane in the toolbar, not a pen.
#   2. Signed in, the home page's header has You, as every page of the site does, and the Feed button has no
#      house on it (the logo is the home page).
#   3. The logo on the home page goes to the top instead of loading the page again.
#   4. "?feed=" left by the sign-in library reads "?feed".
#   5. An empty feed offers the extension, not the home page, whose takes are never published.
#   6. The extension's full list is headed Feed, and the panel's Home opens "the feed".
#   7. The panel's Home draws its start tools at once, before the database answers, and the account button stays
#      out of sight until the panel knows who is signed in.
#   8. The help screen's headline matches the website's.
#   9. Opened from Publish, the Published toast waits for the plane, and the plane is a small card of the take and
#      quote, not the whole annotation.
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

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    # 1. The extension's mark, as article.js sets it.
    await c.add_init_script("document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.annotatedInstalled = '1'; })")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?planes'); await asyncio.sleep(.5)
    flew = False
    for _ in range(50):
      await asyncio.sleep(.1)
      if await pg.evaluate("document.querySelector('.heroGet').classList.contains('pl-hidden') && !!document.querySelector('.pl-carrier')"): flew = True
    await asyncio.sleep(3)
    v = await pg.evaluate("""(() => { const g = document.querySelector('.heroGet');
      return { shown: !document.querySelector('.heroGetRow').hidden && g.offsetWidth > 0 && !g.classList.contains('pl-hidden'),
        href: g.getAttribute('href'), download: g.hasAttribute('download'), steps: !document.querySelector('.landGet').hidden,
        have: document.querySelector('.heroHave').hidden ? null : document.querySelector('.heroHave').textContent.trim() }; })()""")
    print('1. installed: a plane brought the button', flew, '|', v)
    if not flew or not v['shown']: errs.append(f'with the extension installed the install button did not arrive by plane: {flew}, {v}')
    if v['href'] != '/annotated-extension.zip' or not v['download'] or v['steps']: errs.append(f'the installed button does not download the extension, or the steps show: {v}')
    if not v['have'] or 'annotated plane' not in v['have'] or 'pen' in v['have'] or 'What people' in v['have']: errs.append(f"the installed line reads {v['have']!r}")
    # 3.
    await pg.evaluate("scrollTo(0, 600); window.__stay = 1"); await asyncio.sleep(.3)
    await pg.click('.landBar .wmBtn'); await asyncio.sleep(1.2)
    t = await pg.evaluate("({ stay: window.__stay === 1, y: Math.round(scrollY) })")
    print('3. the logo on the home page:', t)
    if not t['stay'] or t['y'] > 5: errs.append(f'the logo loaded the home page again, or did not go to the top: {t}')
    await c.close()

    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 2. Landing.mount as site.js calls it for someone signed in.
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(.6)
    h = await pg.evaluate("""(() => { const d = document.createElement('div'); document.body.appendChild(d); let went = 0;
      Landing.mount(d, { signedIn: true, me: { name: 'Robo Taxi', avatar: '' }, onProfile: () => { went++; } });
      const you = d.querySelector('.landBar .navProfile'); if (you) you.click();
      const r = { you: you ? you.textContent.trim() : null, went, signIn: !!d.querySelector('.landBar .webSignIn'), feed: !!d.querySelector('.landBar .navFeed') };
      d.remove(); return r; })()""")
    print('2. signed in, the home page header:', h)
    if h != {'you': 'R You', 'went': 1, 'signIn': False, 'feed': True}: errs.append(f'the signed-in home page header is {h}')
    # 4.
    await pg.goto(URL + '?feed='); await asyncio.sleep(2.2)
    q = await pg.evaluate("location.search")
    print('4. the address after ?feed=:', q)
    if q != '?feed': errs.append(f'the address reads {q!r}')
    # 5. The feed is empty (the database answers nothing), and signed out.
    e = await pg.evaluate("""(() => { const m = document.querySelector('.esMake');
      return { make: m ? m.textContent.trim() : null, href: m ? m.getAttribute('href') : null, house: !!document.querySelector('.navFeed svg'), text: (document.querySelector('.emptyState') || {}).textContent || '' }; })()""")
    print('5. an empty feed offers:', e['make'], e['href'], '| house on Feed:', e['house'])
    if e['make'] != 'Get the extension to publish one' or e['href'] != '/install' or 'home page' in e['text']: errs.append(f'the empty feed offers {e}')
    if e['house']: errs.append('the Feed button still carries a house')
    await b.close()

    # 6, 7, 8. The extension.
    ctx = await p.chromium.launch_persistent_context(prof('prof0658'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    stall = asyncio.Event()
    async def slow(route):
      # The database takes a second and a half to answer anything, as it seemed to in the recording.
      await asyncio.sleep(1.5)
      try: await route.fulfill(status=200, content_type='application/json', body=exists_reply(route.request.url) or '[]')
      except Exception: pass
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', slow)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    # Signed in, as in the recording, so who it is takes the database's answer to know.
    session = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
      'user': {'id': 'robo-0658', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
    await sw.evaluate("(s) => chrome.storage.local.set({ 'annotated-auth': JSON.stringify(s) })", session); await asyncio.sleep(.3)
    blank = await ctx.new_page(); await blank.goto('about:blank')
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}')
    seen = None; acct = []
    for i in range(30):
      await asyncio.sleep(.1)
      r = await pan.evaluate("""(() => { const s = document.querySelector('#browseMode:not([hidden]) .startBlock'); const a = document.querySelector('.acctBtn');
        return { start: !!s, acct: a ? (a.classList.contains('acctPending') ? 'pending' : a.textContent.trim()) : null }; })()""")
      acct.append(r['acct'])
      if r['start'] and seen is None: seen = (i + 1) * .1
    print('7. the start tools were there after', seen, 's | account button:', sorted(set(a for a in acct if a)))
    if seen is None or seen > 1.5: errs.append(f'the panel Home waited for the database before drawing anything: {seen}')
    if 'Sign in' in acct: errs.append(f'the account button said Sign in to someone signed in: {sorted(set(a for a in acct if a))}')
    for _ in range(40):
      await asyncio.sleep(.5)
      if not await pan.evaluate("/Loading annotations/.test(document.querySelector('#browseMode').textContent)"): break
    later = await pan.evaluate("({ acct: document.querySelector('.acctBtn').classList.contains('acctPending'), loading: /Loading annotations/.test(document.querySelector('#browseMode').textContent), full: (document.querySelector('#browseMode .browseFullBtn') || {}).textContent || '' })")
    print('   later:', later)
    if later['acct'] or later['loading']: errs.append(f'the panel stayed on its first draw: {later}')
    if 'Open the feed as a full page' not in later['full']: errs.append(f"the panel's way to the full list reads {later['full']!r}")
    # 8.
    t = await pan.evaluate("PanelKit && document.querySelector('#welcomeTitle') ? document.querySelector('#welcomeTitle').textContent : null")
    if t is None:
      await pan.click('.helpBtn'); await asyncio.sleep(.4)
      t = await pan.evaluate("(document.querySelector('#welcomeTitle') || {}).textContent || null")
    print('8. the help headline:', t)
    if t != 'Say what you think about anything.': errs.append(f'the help headline reads {t!r}')
    # 6.
    feed = await ctx.new_page(); feed.on('pageerror', lambda e: errs.append('FEED ' + str(e)))
    await feed.goto(f'chrome-extension://{extid}/feed.html')
    try: await feed.wait_for_selector('.sitemain h1', timeout=25000)
    except Exception: pass
    h1 = await feed.evaluate("({ h1: (document.querySelector('.sitemain h1') || {}).textContent || null, title: document.title })")
    print('6. the extension feed page:', h1)
    if h1 != {'h1': 'Feed', 'title': 'Feed | annotated'}: errs.append(f'the extension feed page reads {h1}')
    # 9. A published annotation opened from Publish: the Published toast waits for the plane, and the plane is a
    #    small card rather than the whole annotation (2:57, 2:58).
    await pan.evaluate("""Store.put('pub-0658', { item: { kind: 'article', url: 'https://example.test/a', text: 'are doing this cyber design instead', quote: 'are doing this cyber design instead', meta: { title: 'A story' } },
      take: { text: 'test 1' }, created: Date.now(), cloud: true, author: { id: 'robo-0658', name: 'Robo Taxi', handle: 'robotaxi' } })""")
    await sw.evaluate("chrome.storage.session.set({ annFrom: 'publish' })")
    ann = await ctx.new_page(); ann.on('pageerror', lambda e: errs.append('ANN ' + str(e)))
    await ann.add_init_script("try{localStorage.setItem('annotated-planes','on')}catch(e){}")
    await ann.set_viewport_size({'width': 1300, 'height': 900})
    await ann.goto(f'chrome-extension://{extid}/annotation.html#pub-0658')
    held, widest, landed = [], 0, False
    for _ in range(80):
      await asyncio.sleep(.1)
      r = await ann.evaluate("""(() => { const b = document.querySelector('.banner');
        let w = 0; document.querySelectorAll('.pl-layer *').forEach((x) => { const r = x.getBoundingClientRect(); w = Math.max(w, r.width, r.height); });
        return { landing: !!document.querySelector('.pl-landing'), banner: b ? Number(getComputedStyle(b).opacity) : null, w: Math.round(w) }; })()""")
      if r['landing']: held.append(r['banner']); landed = True
      widest = max(widest, r['w'])
      if landed and not r['landing']: break
    await asyncio.sleep(1)
    end = await ann.evaluate("({ banner: document.querySelector('.banner') ? Number(getComputedStyle(document.querySelector('.banner')).opacity) : null, text: (document.querySelector('.banner .toastText') || {}).textContent || null, card: Number(getComputedStyle(document.querySelector('.annCard')).opacity) })")
    print('9. from Publish: toast while landing', sorted(set(held)), '| widest piece', widest, '| after', end)
    if not landed: errs.append('no plane landed on the annotation page')
    if any(o is not None and o > .05 for o in held): errs.append(f'the Published toast showed while the plane was landing: {sorted(set(held))}')
    if widest > 600: errs.append(f'the plane on the annotation page was {widest} pixels across (964 before the fix)')
    if end['text'] != 'Published' or (end['banner'] or 0) < .99 or end['card'] < .99: errs.append(f'the toast or the card did not come in after the plane: {end}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
