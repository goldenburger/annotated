# The Following tab in the panel. In the recording of 2026-09-22 at 16:56 it said "Follow people to see their
# annotations here" and showed nothing, while the same tab on the full page beside it listed two annotations
# from the person being followed. The follow itself was in the database, made about half a minute earlier.
# This drives the panel against a database of our own, so what it was told and what it showed can be compared.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ME, THEM = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
SESSION = {
  'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer',
  'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test',
           'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'},
}
PROFILES = {ME: {'id': ME, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''},
            THEM: {'id': THEM, 'handle': 'davidwinston', 'display_name': 'David Winston', 'avatar_url': ''}}
THEIR_ANNOTATION = {
  'id': 'theirs-1', 'author_id': THEM, 'kind': 'post', 'take_text': 'test 1 from dswin gmail',
  'tag': None, 'poll': None, 'gif': None, 'created_at': '2026-09-22T16:54:42Z',
  'source': {'kind': 'post', 'text': 'Tesla has just added another 9 Cybercabs', 'quote': 'another 9 Cybercabs',
             'author': 'Sawyer Merritt', 'handle': '@SawyerMerritt', 'url': 'https://x.com/SawyerMerritt/status/9'},
  'author': PROFILES[THEM], 'comments': [{'count': 0}], 'reactions': [],
}
STORY = ('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article>'
         '<h1>Harbor story</h1><p>The council met on a Tuesday to talk about the overnight buses.</p></article></body></html>')

async def main():
  errs = []
  follows = []          # who this account follows, changed between reads the way a real follow would be
  asked = []            # every follows query the extension made, so a stale answer can be told from a wrong one

  def body(route, data, count=None):
    h = {'Content-Type': 'application/json'}
    if count is not None: h['Content-Range'] = f'0-{max(count - 1, 0)}/{count}'
    return route.fulfill(status=200, headers=h, body=json.dumps(data))

  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profFT2'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)

    async def rest(route):
      u = route.request.url
      if '/rest/v1/follows' in u:
        asked.append(round(time.time() - t0, 1))
        if 'follower_id=eq.' + ME in u: await body(route, [{'followee_id': f} for f in follows], len(follows)); return
        if 'followee_id=eq.' in u: await body(route, [], 0); return
        await body(route, [], 0); return
      if '/rest/v1/profiles' in u:
        who = THEM if THEM in u else ME
        await body(route, [PROFILES[who]]); return
      if '/rest/v1/annotations' in u: await body(route, [THEIR_ANNOTATION]); return
      if '/rest/v1/rpc/' in u: await body(route, []); return
      await body(route, [])
    await ctx.route(SUPA + '/**', rest)
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=STORY, headers={'Content-Type': 'text/html; charset=utf-8'}))

    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    t0 = time.time()

    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(1.0)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.2)

    async def following():
      await pan.click('.homeBtn'); await asyncio.sleep(1.4)
      await pan.click('.browseTabs label:has-text("Following") input'); await asyncio.sleep(1.4)
      return await pan.evaluate("""() => ({
        note: (document.querySelector('.browseNote') || {}).textContent || '',
        rows: [...document.querySelectorAll('#browseMode .sideList li button')].map((b) => b.dataset.id),
        empty: (document.querySelector('.browseEmpty') || {}).textContent || '' })""")

    # 1. Following nobody. The note says so and the empty line is about following, not about capturing.
    first = await following()
    print('following nobody:', first)
    if first['rows']: errs.append(f"it listed {first['rows']} while following nobody")
    if 'Follow people' not in first['note']: errs.append(f"the note read {first['note']!r}")
    if 'Capture something' in first['empty']: errs.append(f"the empty line read {first['empty']!r}, which is about your own annotations")

    # 2. Pressing Follow has to leave a mark every window can see, or the other windows go on showing what
    #    they were already holding. This uses the panel's own Follow, so the mark is the real one.
    follows.append(THEM)
    await pan.click('.browseBack'); await asyncio.sleep(.8)
    stamp = "chrome.storage.local.get('annotatedFollows').then(o=>o.annotatedFollows||0)"
    was = await sw.evaluate(stamp)
    saved = await pan.evaluate(
      "async (a) => (await Cloud.discovery({ id: a.me }, {})).onFollow(a.them, true)", {'me': ME, 'them': THEM})
    await asyncio.sleep(.8)
    now = await sw.evaluate(stamp)
    print('Follow saved:', saved, '| the mark moved:', was != now)
    if not saved: errs.append('Follow itself did not save')
    if was == now: errs.append('following someone left no mark for the other windows to see')

    # 3. The panel shows them now, because the mark made it throw away what it was holding.
    third = await following()
    print('after following them:', third)
    print('the follows table was asked at:', asked)
    if third['rows'] != ['theirs-1']:
      errs.append(f"it listed {third['rows']} after a follow, wanted the one annotation they published")
    if 'person you follow' not in third['note']: errs.append(f"the note still read {third['note']!r}")

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
