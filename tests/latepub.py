# Publishing that takes longer than its time limit. The panel stops waiting and keeps the annotation on this
# computer, and if the publish lands afterwards the copy here learns it is shared, so pressing Publish it now
# later does not put it up twice. The limit is a minute in real use, so the test shortens it through
# window.__publishLimit and holds the stand-in database's answer past it.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
ME = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000,
           'expires_at': int(time.time()) + 360000,
           'user': {'id': ME, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {},
                    'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = {'id': ME, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}
SEL = '''()=>{const p=document.querySelectorAll("p")[2];const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}'''

async def main():
  errs = []
  inserted = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profLATE'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    async def db(route):
      r = route.request; u = r.url
      if '/storage/' in u and r.method != 'GET':
        # The screenshot upload is slow, well past the shortened limit.
        await asyncio.sleep(5)
        return await route.fulfill(status=200, content_type='application/json', body='{"Key":"x"}')
      if '/rest/v1/annotations' in u and r.method == 'POST':
        inserted.append(time.time())
        return await route.fulfill(status=201, content_type='application/json', body='[]')
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([PROFILE]))
      await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '0-0/0'}, body='[]')
    await ctx.route(SUPA + '/**', db)
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)

    news = await ctx.new_page(); await news.goto('https://harborline.example/2026/09/17/overnight-buses-trial')
    nid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={nid}',width:420,height:1000}})")
    ap = await ctx.wait_for_event('page'); await asyncio.sleep(2.5)
    ap.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await ap.evaluate('window.__publishLimit = 1500')
    await news.bring_to_front()
    for _ in range(6):
      await news.evaluate(SEL); await asyncio.sleep(.8)
      if await news.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"): break
    await news.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()")
    await ap.wait_for_selector('.aCompose:not([hidden])', timeout=25000); await asyncio.sleep(.8)
    await ap.fill('#articleMode .takeInput', 'Slow to publish.')
    t0 = time.time()
    await publish_now(ap, '#articleMode .publish')
    await ap.wait_for_selector('#articleMode .aPublished:not([hidden])', timeout=20000)
    answered = time.time() - t0
    said = await ap.inner_text('#articleMode .aPublished')
    print(f'the panel answered after {answered:.1f} seconds:', said[:170].replace('\n', ' | '))
    if answered > 6: errs.append(f'the panel waited {answered:.1f} seconds with a limit of one and a half')
    if 'did not answer in time' not in said: errs.append(f'the card did not say it ran out of time: {said!r}')
    before = await ap.evaluate("Store.allMeta().then(r=>r.map(x=>!!x.cloud))")
    print('marked shared right after:', before)
    if any(before): errs.append('it was marked shared before the publish had landed')
    await asyncio.sleep(8)
    after = await ap.evaluate("Store.allMeta().then(r=>r.map(x=>[!!x.cloud, x.author && x.author.handle]))")
    print('after the slow publish landed:', after, '| rows written:', len(inserted))
    if len(inserted) != 1: errs.append(f'{len(inserted)} rows were written, wanted exactly one')
    if not after or after[0] != [True, 'robotaxi']: errs.append(f'the copy here did not learn it was shared: {after}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
