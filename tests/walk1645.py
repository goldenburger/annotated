# The recording of 2026-09-25 at 16:45.
#   1. A link in the account menu (About annotated) closes the menu.
#   2. A clip card in Yours so far has a light placeholder, and the clip's frames are fetched as the page opens.
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
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': 'u1645', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@e.t', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    card = {'kind': 'video', 'take': 'test 2', 'source': 'NASA', 'what': 'Clip 2:44 to 3:06 of 5:47', 'a': 164, 'z': 186, 'at': int(time.time() * 1000),
      'thumb': {'src': '/media/artemis-i-frames.jpg', 'idx': 90, 'cols': 12, 'rows': 15}}
    await c.add_init_script(f"try{{localStorage.setItem('annotated-yours', {json.dumps(json.dumps([card]))})}}catch(e){{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(1.5)
    r = await pg.evaluate("""({ bg: getComputedStyle(document.querySelector('.llRow .yours .yThumb')).backgroundColor,
      fetched: performance.getEntriesByType('resource').some((e) => e.name.includes('artemis-i-frames.jpg')) })""")
    print('2.', r)
    if r['bg'] in ('rgb(14, 15, 18)',) or not r['fetched']: errs.append(f'the clip card is black while loading, or its frames were not fetched: {r}')
    # 3. With the planes on, each example under What else it does arrives as a plane when it comes into view.
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?planes'); await asyncio.sleep(6)
    before = await pg.evaluate("[...document.querySelectorAll('.ftDemo')].map((d) => d.classList.contains('pl-hidden'))")
    await pg.evaluate("document.querySelector('.ftDemo').scrollIntoView({ block: 'center' })")
    flew = False
    for _ in range(30):
      await asyncio.sleep(.1)
      if await pg.evaluate("!!document.querySelector('.pl-layer')"): flew = True; break
    await pg.screenshot(path=str(pathlib.Path(__file__).resolve().parent / 'audit_out_ftplane.png'))
    await asyncio.sleep(4)
    after = await pg.evaluate("(() => { const d = document.querySelector('.ftDemo'); return { hidden: d.classList.contains('pl-hidden'), op: Number(getComputedStyle(d).opacity) }; })()")
    print('3. hidden before', before, '| a plane flew', flew, '| after', after)
    if not before or not all(before) or not flew or after != {'hidden': False, 'op': 1}: errs.append(f'the examples did not arrive by plane: {before}, {flew}, {after}')
    # 4. The row of smaller features waits, then arrives as a little flock and every chip ends up in place.
    waiting = await pg.evaluate("document.querySelector('.ftChips').classList.contains('ftFlock')")
    await pg.evaluate("document.querySelector('.ftChips').scrollIntoView({ block: 'center' })")
    planes = 0
    for _ in range(40):
      await asyncio.sleep(.1)
      planes = max(planes, await pg.evaluate("document.querySelectorAll('.pl-layer').length"))
    await asyncio.sleep(5)
    shown = await pg.evaluate("[...document.querySelectorAll('.ftChips li')].every((l) => getComputedStyle(l).opacity === '1') && getComputedStyle(document.querySelector('.ftChips')).visibility === 'visible'")
    print('4. chips waiting', waiting, '| planes at once', planes, '| all shown after', shown)
    if not waiting or planes < 2 or not shown: errs.append(f'the chips did not arrive as a flock: {waiting}, {planes}, {shown}')
    await b.close()

    ctx = await p.chromium.launch_persistent_context(prof('prof1645'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    async def db(route):
      u = route.request.url
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': 'u1645', 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    await ctx.route('https://annotated-app.netlify.app/**', site)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s) => chrome.storage.local.set({ 'annotated-auth': JSON.stringify(s) })", SESSION); await asyncio.sleep(.3)
    blank = await ctx.new_page(); await blank.goto('about:blank')
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(3)
    await pan.click('.acctBtn'); await asyncio.sleep(.6)
    opened = await pan.evaluate("!!document.querySelector('.acctPop .acctAbout')")
    async with ctx.expect_page():
      await pan.click('.acctPop .acctAbout')
    await asyncio.sleep(.6)
    still = await pan.evaluate("!!document.querySelector('.acctPop')")
    print('1. menu opened', opened, '| still open after About:', still)
    if not opened or still: errs.append(f'the account menu stayed open after About annotated: {opened}, {still}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
