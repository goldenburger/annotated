# The second exploration of 2026-09-26.
#   1, 2. With the planes on, as a real visitor sees the page, the example plays on a first visit, and soon: it was
#         marked as shown before it waited for the opening flight and never played at all, and it took seven seconds.
#   3. Every paste box in the panel has its own id, so its label points at it.
#   4. The install page's header has Feed.
#   5. An invalid handle says what is wrong with it.
import asyncio, pathlib, mimetypes, json, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file() and (PUB / (path + '.html')).is_file(): f = PUB / (path + '.html')
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
URL = 'https://annotated-app.netlify.app/'
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ME = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = {'id': ME, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1366, 'height': 860})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 1, 2.
    t0 = time.time(); await pg.goto(URL + '?planes')
    marked = None
    for _ in range(150):
      if await pg.evaluate("!!document.querySelector('.tp-article .tiText mark')"): marked = round(time.time() - t0, 1); break
      await asyncio.sleep(.1)
    print('1, 2. the example marked its words after', marked, 'seconds')
    if marked is None: errs.append('the example never played with the planes on')
    elif marked > 6.2: errs.append(f'the example took {marked} seconds to start')
    # 4.
    await pg.goto(URL + 'install'); await asyncio.sleep(1.2)
    nav = await pg.evaluate("[...document.querySelectorAll('.sitenav a')].map((a) => a.textContent.trim())")
    print('4. the install page header:', nav)
    if 'Feed' not in nav: errs.append(f'the install page header is {nav}')
    await b.close()

    # 3, 5. The extension, signed in against a stand-in database.
    ctx = await p.chromium.launch_persistent_context(prof('ex0926b'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    async def db(route):
      if '/rest/v1/profiles' in route.request.url: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([PROFILE]))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await ctx.route(SUPA + '/**', db)
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body='<!doctype html><title>A story</title><p>Some words on a page for the panel to offer.</p>', headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    news = await ctx.new_page(); await news.goto('https://harborline.example/a'); await asyncio.sleep(.5)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pv = await ctx.new_page(); await pv.set_viewport_size({'width': 400, 'height': 900})
    await pv.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    await pv.click('button[aria-label="Home"]'); await asyncio.sleep(1.5)
    ids = await pv.evaluate("[...document.querySelectorAll('.pasteForm input')].map((i) => i.id)")
    labels = await pv.evaluate("[...document.querySelectorAll('.pasteForm')].every((f) => f.querySelector('label').htmlFor === f.querySelector('input').id)")
    print('3. paste boxes:', ids, '| each label points at its own box:', labels)
    if len(ids) < 2 or len(set(ids)) != len(ids) or not labels: errs.append(f'paste boxes share an id: {ids}')
    await pv.click('.acctBtn'); await asyncio.sleep(.6)
    said = {}
    # The box itself holds at most 30 characters, so too long cannot be typed.
    for v in ['x', 'Robo Taxi']:
      await pv.fill('.acctHandle input', v); await asyncio.sleep(.2)
      said[v[:8]] = await pv.inner_text('.acctHMsg')
    print('5. invalid handles say:', said)
    if said['x'] != 'At least 2 characters.' or 'Only lowercase' not in said['Robo Tax']: errs.append(f'invalid handles said {said}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
