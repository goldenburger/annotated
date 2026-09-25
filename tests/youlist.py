# Yours, not this computer's. The recording of 2026-09-22 at 22:17 signed in as Robo Taxi, published two,
# signed out, and signed in as David Winston. The panel's You went on listing Robo Taxi's two, signed out and
# signed in as David, and offered to delete them. The page's "Your recent annotations" did the same. Both now
# list only what the person signed in wrote, or what nobody has published, and the panel draws You again when
# the account changes. The panel beside someone else's annotation also says whose it is.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ROBO, DAVID = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
PROFILES = {ROBO: {'id': ROBO, 'handle': 'testhandle', 'display_name': 'Robo Taxi', 'avatar_url': ''},
            DAVID: {'id': DAVID, 'handle': 'davidwinston', 'display_name': 'David Winston', 'avatar_url': ''}}
def sess(uid):
  return {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
          'user': {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'x@example.test', 'app_metadata': {},
                   'user_metadata': {'full_name': PROFILES[uid]['display_name']}, 'created_at': '2026-09-01T00:00:00Z'}}
SEED = """(a) => { const post = (n) => ({ kind: 'post', text: 'Post ' + n, author: 'Jo Bhakdi', handle: '@JOBhakdi', url: 'https://x.com/j/status/' + n });
  const by = (id, name, handle) => ({ id, name, handle, avatar: '' });
  return Promise.all([
    Store.put('test-1', { item: post(1), take: { text: 'test 1' }, created: Date.now() - 3e6, cloud: true, author: by(a.robo, 'Robo Taxi', 'testhandle') }),
    Store.put('test-2', { item: post(2), take: { text: 'test 2' }, created: Date.now() - 2e6, cloud: true, author: by(a.robo, 'Robo Taxi', 'testhandle') }),
    Store.put('test-3', { item: post(3), take: { text: 'test 3' }, created: Date.now() - 1e6, cloud: true, author: by(a.david, 'David Winston', 'davidwinston') }),
    Store.put('here-1', { item: post(4), take: { text: 'never published' }, created: Date.now() - 5e5 }),
  ]); }"""
LIST = "() => [...document.querySelectorAll('#browseMode .sideList li .rlTake')].map((e) => e.firstChild.textContent.trim())"

async def main():
  errs = []
  who = {'id': DAVID}
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profYOU'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    async def db(route):
      u = route.request.url
      ex = exists_reply(u)
      if ex is not None: return await route.fulfill(status=200, content_type='application/json', body=ex)
      if '/auth/v1/' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(sess(who['id'])['user']))
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([PROFILES[who['id']]]))
      await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '*/0'}, body='[]')
    await ctx.route(SUPA + '/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", sess(DAVID))
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)
    await pan.evaluate(SEED, {'robo': ROBO, 'david': DAVID})

    await pan.click('.brand .youBtn'); await asyncio.sleep(2)
    got = await pan.evaluate(LIST)
    print('You, as David:', got)
    if sorted(got) != ['never published', 'test 3']: errs.append(f'You as David listed {got}')

    # Signed out, with You still open: it draws again, with only what nobody has published.
    await pan.click('.acctBtn'); await asyncio.sleep(.4); await pan.click('.acctOut'); await asyncio.sleep(2.5)
    got = await pan.evaluate(LIST)
    print('You, signed out:', got)
    if got != ['never published']: errs.append(f'You signed out listed {got}')

    # Signed in as David again, the page's recent list and the panel beside someone else's annotation.
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", sess(DAVID)); await asyncio.sleep(1.5)
    ap = await ctx.new_page(); await ap.set_viewport_size({'width': 1200, 'height': 900})
    ap.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await ap.goto(f'chrome-extension://{extid}/annotation.html#test-2'); await asyncio.sleep(3)
    recent = await ap.evaluate("""() => { const h = [...document.querySelectorAll('.rail h2')].find((x) => x.textContent === 'Your recent annotations');
      return h ? [...h.parentElement.querySelectorAll('.rlTake')].map((e) => e.textContent.trim()) : []; }""")
    print("the page's recent list, as David:", recent)
    if any(t in ('test 1', 'test 2') for t in recent): errs.append(f"the page listed Robo Taxi's annotations as yours: {recent}")
    side = await pan.evaluate("""() => { const box = document.createElement('div'); document.body.appendChild(box);
      const recs = [{ id: 'test-2', created: Date.now(), cloud: true, author: { id: '%s', name: 'Robo Taxi', handle: 'testhandle' },
        item: { kind: 'post', text: 't', author: 'Jo', handle: '@jo', url: 'https://x.com/j/status/2' }, take: { text: 'test 2' }, comments: [], reactions: [] }];
      AnnotationPage.renderSide(box, { current: recs[0], records: recs, youId: '%s', permalinkOf: () => 'https://x/y', onOpen() {}, onFeed() {}, onDelete() {}, localAware: true });
      const t = box.querySelector('.snLabel').textContent; box.remove(); return t; }""" % (ROBO, DAVID))
    print('the panel beside it says:', repr(side))
    if side != 'By Robo Taxi': errs.append(f"the panel beside someone else's annotation says {side!r}")
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
