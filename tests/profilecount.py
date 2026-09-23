# Your own profile counts what is yours. The recording of 2026-09-22 at 20:59 showed "8 annotations, 0
# followers" on a profile whose card said one follower, for someone the database says wrote six. The eight
# took in two annotations another account had left on this computer, and the followers were only ever
# asked for on other people's profiles. The same recording opened one of your own annotations from trending
# two minutes after publishing it and the page said Published, as if it had just happened.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ME, THEM = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000,
           'expires_at': int(time.time()) + 360000,
           'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {},
                    'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = {'id': ME, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}
ROW = {'id': 'mine-shared', 'kind': 'post', 'author_id': ME, 'created_at': '2026-09-22T20:00:00Z',
       'source': {'kind': 'post', 'text': 'Form 144 is a heads-up.', 'author': 'AleXandra Merz', 'handle': '@TeslaBoomerMama', 'url': 'https://x.com/m/status/1'},
       'take_text': 'test 2', 'tag': None, 'poll': None, 'author': PROFILE, 'comments': [{'count': 0}], 'reactions': []}
SEED = """async (a) => {
  const post = (n) => ({ kind: 'post', text: 'Post ' + n, author: 'Sawyer Merritt', handle: '@SawyerMerritt', url: 'https://x.com/s/status/' + n });
  await Store.put('mine-shared', { item: post(1), take: { text: 'test 2' }, created: Date.now() - 120000, cloud: true,
    author: { id: a.me, name: 'Robo Taxi', handle: 'robotaxi', avatar: '' } });
  await Store.put('theirs-1', { item: post(2), take: { text: 'test 1 from dswin gmail' }, created: Date.now() - 100000, cloud: true,
    author: { id: a.them, name: 'David Winston', handle: 'davidwinston', avatar: '' } });
  await Store.put('theirs-2', { item: post(3), take: { text: 'test 1 different user' }, created: Date.now() - 90000, cloud: true,
    author: { id: a.them, name: 'David Winston', handle: 'davidwinston', avatar: '' } });
  await Store.put('here-only', { item: post(4), take: { text: 'saved while signed out' }, created: Date.now() - 80000 });
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profCOUNT'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    async def db(route):
      u = route.request.url
      if '/rest/v1/follows' in u:
        # One person follows me and I follow nobody, which is what the database held in the recording.
        n = 1 if f'followee_id=eq.{ME}' in u else 0
        return await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': f'*/{n}'}, body='[]')
      if '/rest/v1/annotations' in u and 'select=' in u and 'author_id=eq.' in u:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps([ROW]))
      if '/rest/v1/profiles' in u:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps([PROFILE]))
      await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '*/0'}, body='[]')
    await ctx.route(SUPA + '/**', db)
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)

    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)
    await pg.evaluate(SEED, {'me': ME, 'them': THEM})
    await pg.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(3)
    head = (await pg.inner_text('.feedHead .stats')).strip()
    body = await pg.evaluate('document.body.innerText'); takes = [t for t in ['test 2', 'saved while signed out', 'dswin', 'different user'] if t in body]
    card = (await pg.inner_text('.rail .stats')).strip() if await pg.query_selector('.rail .stats') else ''
    print('profile says:', head, '| the card says:', card)
    print('listed:', takes)
    if not head.startswith('2 annotations'): errs.append(f'your profile counted {head!r}, wanted 2')
    if '1 follower' not in head: errs.append(f'your profile said {head!r}, wanted 1 follower')
    if 'test 2' not in takes or 'saved while signed out' not in takes: errs.append(f'your own were not both listed: {takes}')
    if any('dswin' in t or 'different user' in t for t in takes): errs.append('your profile listed annotations another account wrote')
    if card and '1 follower' not in card: errs.append(f'the card said {card!r}')
    await pg.screenshot(path='profilecount.png')

    # Opened from a list, your own annotation is not news.
    await pg.goto(f'chrome-extension://{extid}/annotation.html#here-only'); await asyncio.sleep(2.5)
    banner = await pg.evaluate("!!document.querySelector('.banner.toast')")
    print('opened from a list, the page says Published:', banner)
    if banner: errs.append('an annotation opened from a list said Published')
    # Arriving from Publish, it is.
    await sw.evaluate("chrome.storage.session.set({annFrom:'publish'})")
    await pg.goto(f'chrome-extension://{extid}/annotation.html#mine-shared'); await asyncio.sleep(2.5)
    banner = await pg.evaluate("!!document.querySelector('.banner.toast')")
    print('arriving from Publish, the page says Published:', banner)
    if not banner: errs.append('arriving from Publish no longer said Published')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
