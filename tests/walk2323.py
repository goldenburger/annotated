# The recording of 2026-09-25 at 23:23.
#   1. A profile whose list fails once is asked again, and never says "0 annotations" or "Nothing here yet" on the
#      way. A list that never loads says so, with Try again, rather than calling the profile empty.
#   2. A clip's card waits on the light placeholder, not a black box.
#   3. The panel beside a YouTube video that is still arriving reads "Opening the video…", not the start page.
#   4. Reaching the take puts the cursor in the take box.
#   5, 6. The feature examples fly once a browser visit, and the chips wait faint rather than hidden.
#   7. A website tab behind the latest release reloads when it is looked at again.
#   8. A filter with nothing in it is drawn faint.
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
ME = 'robo-2323'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = {'id': ME, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}
ROW = {'id': 'mine-1', 'kind': 'post', 'author_id': ME, 'created_at': '2026-09-25T20:00:00Z',
       'source': {'kind': 'post', 'text': 'A post.', 'author': 'Sawyer Merritt', 'handle': '@SawyerMerritt', 'url': 'https://x.com/s/status/1'},
       'take_text': 'test 1', 'tag': None, 'poll': None, 'author': PROFILE, 'comments': [], 'reactions': [], 'poll_votes': []}
YT = '''<!doctype html><title>Arriving - YouTube</title><h1 class="title">A video still arriving</h1><video></video>'''
WATCH = """(() => ({ text: document.body.innerText, stats: (document.querySelector('.feedHead .stats') || {}).textContent || '' }))()"""

async def profile_run(b, fails):
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site)
  n = {'list': 0}
  async def db(route):
    u = route.request.url
    if '/rest/v1/profiles' in u and 'handle=eq.robotaxi' in u:
      return await route.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE))
    if '/rest/v1/annotations' in u and 'author_id' in u:
      n['list'] += 1
      if n['list'] <= fails: return await route.fulfill(status=500, content_type='application/json', body='{"message":"boom"}')
      return await route.fulfill(status=200, content_type='application/json', body=json.dumps([ROW]))
    await route.fulfill(status=200, content_type='application/json', body='[]')
  await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
  await c.add_init_script(f"try{{localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))})}}catch(e){{}}")
  pg = await c.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(URL + '@robotaxi', wait_until='commit')
  seen = []
  for _ in range(120):
    try: seen.append(await pg.evaluate(WATCH))
    except Exception: pass
    await asyncio.sleep(.05)
  return c, pg, seen, n['list'], errs

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    # 1. Fails once, then loads.
    c, pg, seen, asked, e = await profile_run(b, 1); errs += e
    empty = [s for s in seen if 'Nothing here yet' in s['text'] or s['stats'].startswith('0 annotations')]
    last = seen[-1]
    print('1. asked', asked, 'times | ever empty:', bool(empty), '| finally:', last['stats'][:40])
    if empty: errs.append('the profile said it was empty while its list was being asked for again')
    if not last['stats'].startswith('1 annotation'): errs.append(f'the profile did not load after one failure: {last["stats"]!r}')
    # 8. Faint filters.
    zero = await pg.evaluate("[...document.querySelectorAll('.feedFilter label')].map((l) => [l.querySelector('input').value, l.classList.contains('zero'), getComputedStyle(l.querySelector('span')).opacity])")
    print('8. filters (kind, faint, opacity):', zero)
    z = {k: (f, o) for k, f, o in zero}
    if not z.get('audio', (0,))[0] or z.get('post', (1,))[0] or z.get('all', (1,))[0] or float(z['audio'][1]) > .6: errs.append(f'the empty filters are not faint: {zero}')
    # 2. The clip placeholder.
    bg = await pg.evaluate("(() => { const s = document.createElement('span'); s.className = 'cthumb cwide cprev'; document.body.appendChild(s); const v = getComputedStyle(s).backgroundColor; s.remove(); return v; })()")
    print('2. a clip card waiting for its picture:', bg)
    if bg in ('rgb(0, 0, 0)', 'rgb(14, 16, 20)'): errs.append(f'a clip card still waits on a black box: {bg}')
    # 7. A tab behind the release reloads when looked at again.
    await pg.evaluate("window.__stale = 1")
    await c.route('https://annotated-app.netlify.app/', lambda r: r.fulfill(status=200, content_type='text/html', body=(PUB / 'index.html').read_text(encoding='utf-8').replace('site.js?v=', 'site.js?v=9.')) if r.request.resource_type == 'fetch' else site(r))
    await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
    await asyncio.sleep(2.5)
    reloaded = await pg.evaluate("!window.__stale")
    print('7. an out of date tab reloaded when looked at:', reloaded)
    if not reloaded: errs.append('a tab behind the release did not reload')
    await c.close()
    # 1b. Never loads.
    c, pg, seen, asked, e = await profile_run(b, 99); errs += e
    await asyncio.sleep(2)
    last = await pg.evaluate(WATCH)
    retry = await pg.evaluate("!!document.querySelector('.esRetry')")
    print('1b. asked', asked, 'times | says:', ' '.join(last['text'].split())[:0] or last['stats'], '| Try again:', retry)
    if 'did not load' not in last['text'] or 'Nothing here yet' in last['text'] or not retry: errs.append('a list that never loaded was called empty')
    await c.close()
    # 5, 6. The examples fly once a visit, and chips wait faint.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?planes'); await asyncio.sleep(1.5)
    faint = await pg.evaluate("(() => { const c = document.querySelector('.ftChips'); return c ? [c.classList.contains('ftFlock'), getComputedStyle(c).visibility, getComputedStyle(c.querySelector('li')).opacity] : null; })()")
    print('6. the chips while they wait:', faint)
    if not faint or not faint[0] or faint[1] != 'visible' or not (0 < float(faint[2]) < .5): errs.append(f'the chips are hidden while they wait: {faint}')
    await pg.evaluate("(document.querySelector('.ftDemo.ftWaiting') || document.querySelector('.ftDemo')).scrollIntoView({ block: 'center' })")
    flew1 = False
    for _ in range(30):
      await asyncio.sleep(.1)
      if await pg.evaluate("!!document.querySelector('.pl-layer')"): flew1 = True; break
    await asyncio.sleep(3)
    await pg.goto(URL + '?planes'); await asyncio.sleep(1.5)
    waiting = await pg.evaluate("document.querySelectorAll('.ftDemo.ftWaiting, .ftChips.ftFlock').length")
    print('5. planes on the first visit:', flew1, '| waiting on the second:', waiting)
    if not flew1: errs.append('the examples did not fly on the first visit')
    if waiting: errs.append('the examples waited to fly again on the second visit')
    await c.close()
    await b.close()

    # 3, 4. The extension.
    ctx = await p.chromium.launch_persistent_context(prof('prof2323'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://www.youtube.com/**', lambda r: r.fulfill(status=200, body=YT, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    yt = await ctx.new_page(); await yt.goto('https://www.youtube.com/watch?v=ARRIVING01'); await asyncio.sleep(.5)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('youtube')).id)")
    pv = await ctx.new_page(); await pv.set_viewport_size({'width': 400, 'height': 760}); pv.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pv.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    st = await pv.evaluate("({ title: document.querySelector('#emptyTitle').textContent, start: !document.querySelector('#emptyAction').hidden && !!document.querySelector('#emptyAction').offsetParent })")
    print('3. beside a video still arriving:', st)
    if st['title'] != 'Opening the video…' or st['start']: errs.append(f'the panel shows the start page while a video arrives: {st}')
    # 4. The take box has the cursor once the take step is reached.
    got = await pv.evaluate("""(async () => { const root = document.createElement('div'); root.innerHTML = '<ol class="steps"><li><i></i>Capture</li><li><i></i>Take</li><li><i></i>Publish</li></ol><textarea class="takeInput"></textarea>';
      document.body.appendChild(root); document.activeElement && document.activeElement.blur && document.activeElement.blur(); PanelKit.setStep(root, 2);
      await new Promise((r) => setTimeout(r, 120)); const ok = document.activeElement === root.querySelector('.takeInput'); root.remove(); return ok; })()""")
    print('4. the take box has the cursor after capture:', got)
    if not got: errs.append('the take box is not focused after capture')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
