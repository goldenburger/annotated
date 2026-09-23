# The recording of 2026-09-23 at 03:16.
#   1. Opening one of annotated's pages makes Supabase tell every other page "signed in" again. The panel
#      redrew on each, and a press landing during a redraw was lost (Back at 1:12, Back to ... at 1:49 and
#      2:16). Now an announcement that changes nobody reaches no listener, and the view beside the feed is
#      kept as it is. Back to ... says so when its tab has closed.
#   2. The podcast finder never searches an address, says it is waiting for the app on an episode page, and
#      uses the name a Most talked about row gave it until the page names the episode.
#   3. Most talked about is asked again when annotations change, rather than ten minutes later.
#   4. A page already open in a tab is switched to rather than opened again.
#   5. A tab still loading says what is opening rather than showing the empty start page.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ME = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {},
           'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
STORY = '<!doctype html><title>Harbor story</title><article><h1>Harbor story</h1><p>The council met on a Tuesday to talk about the buses.</p></article>'
ROW = {'kind': 'article', 'title': 'Harbor story', 'url': 'https://harborline.example/story', 'video_id': None,
       'annotations': 1, 'people': 1, 'replies': 0, 'reactions': 0, 'score': 1}

async def quiet(c):
  try: await c
  except Exception: pass

async def main():
  errs = []
  answer = {'rows': [ROW]}
  searches = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0316'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    html = lambda body: (lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=body))
    await ctx.route('https://harborline.example/story**', html(STORY))
    # A Spotify episode page that has not named its episode yet: its title is its own address.
    await ctx.route('https://open.spotify.com/episode/dream', html('<!doctype html><title>open.spotify.com/episode/dream</title><p>Spotify stand-in</p>'))
    async def slow(route):
      await asyncio.sleep(4); await route.fulfill(status=200, headers={'Content-Type': 'text/html'}, body='<!doctype html><title>Slow</title><p>Slow page, finally here.</p>')
    await ctx.route('https://slow.example/**', slow)
    def apple(r):
      from urllib.parse import urlparse, parse_qs
      searches.append(parse_qs(urlparse(r.request.url).query).get('term', [''])[0])
      return r.fulfill(status=200, content_type='application/json', body=json.dumps({'results': []}))
    await ctx.route('https://itunes.apple.com/**', apple)
    async def db(route):
      u = route.request.url
      if '/rpc/talked_about' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(answer['rows']))
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': ME, 'handle': 'robo', 'display_name': 'Robo Taxi', 'avatar_url': ''}))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await ctx.route(SUPA + '/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(.8)
    tid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")

    # 1. Beside the feed, then another page of ours opens.
    feed = await ctx.new_page(); await feed.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
    fid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('feed.html')).id)")
    side = await ctx.new_page(); await side.set_viewport_size({'width': 400, 'height': 900}); side.on('pageerror', lambda e: errs.append('SIDE ' + str(e)))
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={fid}'); await asyncio.sleep(2)
    await side.evaluate(f"lastSourceTab = {tid}; annKey = null;"); await asyncio.sleep(1.5)
    await side.evaluate("window.__heard = 0; Backend.onChange(() => { window.__heard++; }); document.querySelector('.sideBack').__mark = 1")
    await asyncio.sleep(1)
    base = await side.evaluate("window.__heard")
    other = await ctx.new_page(); await other.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(2.5)
    kept = await side.evaluate("(() => { const b = document.querySelector('.sideBack'); return { same: !!(b && b.__mark), heard: window.__heard }; })()")
    print('1. after another page of ours opens, the button beside the feed is the same one:', kept['same'], '| changes heard:', kept['heard'] - base)
    if not kept['same']: errs.append('the panel redrew the view beside the feed when another page of ours opened')
    if kept['heard'] - base: errs.append(f"an announcement that changed nobody reached a listener {kept['heard'] - base} times")
    await other.close()
    await feed.bring_to_front(); await asyncio.sleep(.3)
    b = await side.query_selector('.sideBack'); box = await b.bounding_box()
    await side.mouse.move(box['x'] + 30, box['y'] + 10); await side.mouse.down(); await asyncio.sleep(.4); await side.mouse.up(); await asyncio.sleep(1)
    active = await sw.evaluate(f"chrome.tabs.get({tid}).then(t=>t.active)")
    print('   a slow press on Back to ... brings the story forward:', active)
    if not active: errs.append('Back to ... did not bring the story forward')
    # The tab closes while the button still names it.
    await story.close(); await asyncio.sleep(.8)
    await side.click('.sideBack'); await asyncio.sleep(.6)
    note = await side.inner_text('.sideBackNote')
    print('   with that tab closed, Back to ... says:', repr(note))
    if 'closed' not in note: errs.append(f'Back to ... said {note!r} for a closed tab')
    await side.close()

    # 2. The finder on a Spotify page named by its address.
    spot = await ctx.new_page(); await spot.goto('https://open.spotify.com/episode/dream'); await asyncio.sleep(.6)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://open.spotify.com/*'}).then(t=>t[0].id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2.5)
    box1 = await pan.input_value('.fpQ'); st1 = await pan.inner_text('.fpStatus')
    print('2. named by its address, the finder has', repr(box1), 'and says', repr(st1), '| searched', searches)
    if box1 or any('spotify.com' in s for s in searches): errs.append(f'the finder used the address: box {box1!r}, searches {searches}')
    if 'Waiting for Spotify' not in st1: errs.append(f'the finder said {st1!r} while the page had not named the episode')
    await pan.evaluate(f"rowNames.set({sid}, {{ url: 'https://open.spotify.com/episode/dream', title: 'Our Big Fat Dream Episode' }})"); await asyncio.sleep(1.5)
    box2 = await pan.input_value('.fpQ')
    print('   with the name a row gave it:', repr(box2), '| searched', searches[-1:])
    if 'Our Big Fat Dream Episode' not in box2 or not searches or 'Dream' not in searches[-1]: errs.append(f'the row name was not used: {box2!r}, {searches}')

    # 3. Most talked about follows a change to the annotations.
    await pan.click('.homeBtn'); await pan.wait_for_selector('#browseMode .startBlock', timeout=15000); await asyncio.sleep(1.2)
    rows1 = await pan.evaluate("document.querySelectorAll('#browseMode .talkRow').length")
    answer['rows'] = []
    await sw.evaluate("chrome.storage.local.set({annotatedStamp: Date.now()})"); await asyncio.sleep(1.5)
    shown = await pan.evaluate("(() => { const t = document.querySelector('#browseMode .talked'); return { rows: document.querySelectorAll('#browseMode .talkRow').length, hidden: !t || t.hidden }; })()")
    print('3. talked about rows before and after the annotations changed:', rows1, shown)
    if rows1 != 1: errs.append(f'Most talked about showed {rows1} rows to begin with')
    if shown['rows'] or not shown['hidden']: errs.append('Most talked about went on showing a source with no annotations left')

    # 4. A page already open is switched to.
    story2 = await ctx.new_page(); await story2.goto('https://harborline.example/story?utm_source=x'); await asyncio.sleep(.6)
    await spot.bring_to_front(); await asyncio.sleep(.3)
    n0 = len(ctx.pages)
    await pan.evaluate("goTo('https://harborline.example/story')"); await asyncio.sleep(1)
    s2 = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>({n: t.length, active: t.some(x=>x.active)}))")
    print('4. opening a page already open:', s2, '| pages', n0, '->', len(ctx.pages))
    if s2['n'] != 1 or not s2['active'] or len(ctx.pages) != n0: errs.append(f'the open page was opened again: {s2}')
    apple_a = await pan.evaluate("[sameAddress('https://podcasts.apple.com/us/podcast/x/id1?i=5', 'https://podcasts.apple.com/us/podcast/x/id1?i=6'), sameAddress('https://www.youtube.com/watch?v=abc&t=30', 'https://youtube.com/watch?v=abc')]")
    if apple_a != [False, True]: errs.append(f'two Apple episodes or one YouTube video were told apart wrongly: {apple_a}')
    await pan.close()

    # 5. A tab still arriving.
    slowp = await ctx.new_page()
    slid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan2 = await ctx.new_page(); await pan2.set_viewport_size({'width': 400, 'height': 900})
    await pan2.goto(f'chrome-extension://{extid}/sidepanel.html?tab={slid}'); await asyncio.sleep(1.5)
    asyncio.ensure_future(quiet(slowp.goto('https://slow.example/page'))); await asyncio.sleep(1.5)
    opening = await pan2.evaluate(f"(async () => ({{ title: document.querySelector('#emptyTitle').textContent, start: !document.querySelector('#emptyAction').hidden, host: openingHost, busy: busyRefresh, tab: await chrome.tabs.get({slid}).then(t => t.status + ' ' + t.pendingUrl) }}))()")
    print('5. while the page arrives the panel says', opening)
    if not opening['title'].startswith('Opening slow.example') or opening['start']: errs.append(f'a loading tab showed {opening}')
    await asyncio.sleep(4.5)
    after = await pan2.evaluate("document.querySelector('#emptyTitle').textContent")
    print('   once it has arrived:', repr(after))
    if after.startswith('Opening'): errs.append('the panel still said Opening after the page arrived')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
