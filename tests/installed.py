# Where the front page and the extension meet.
#   1. Installed with no front page open (as here, and as from GitHub), nothing opens.
#   2. Installed from the front page: that tab, left behind while the extensions page is in front, moves to
#      /?installed and comes forward (background.js showInstalled), and the page says annotated is installed and
#      what to do next, with the steps put away. A front page that is itself in front is left alone.
#   3. A take on the brief is a demonstration: it is never handed to the extension, stays in Yours so far, and a
#      handover left by an older version is cleared when the panel opens.
#   4. Yours so far says once, under the row, what the extension does, and not while it is installed.
import asyncio, pathlib, mimetypes, json
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
    ctx = await p.chromium.launch_persistent_context(prof('profInstalled'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    await asyncio.sleep(1.5)
    # 1.
    urls = await sw.evaluate("chrome.tabs.query({}).then((t) => t.map((x) => x.url || x.pendingUrl))")
    print('1. tabs after installing with no front page open:', urls)
    if any('netlify' in u for u in urls): errs.append('installing opened the website with no front page open')
    # 2.
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL); await asyncio.sleep(1)
    # As when installing: the extensions page in front, the front page behind it.
    front = await sw.evaluate("chrome.tabs.query({ url: 'https://annotated-app.netlify.app/*' }).then(async (t) => { await chrome.tabs.update(t[0].id, { active: true }); await chrome.tabs.create({ url: 'about:blank', active: true }); return (await chrome.tabs.get(t[0].id)).active; })")
    await sw.evaluate("showInstalled()"); await asyncio.sleep(2.5)
    now = await pg.evaluate("""() => ({ url: location.search, have: (document.querySelector('.heroHave:not([hidden])') || {}).textContent || null,
      steps: !!document.querySelector('.landGet:not([hidden])') })""")
    print('2. the front page tab after installing:', now)
    if now['url'] != '?installed' or not now['have'] or not now['have'].startswith('annotated is installed. Pin it') or now['steps']:
      errs.append(f'the front page tab did not move to its installed state: {now}')
    # 3.
    await pg.evaluate("""() => { localStorage.setItem('annotated-tryit', JSON.stringify({ quote: 'must link back', take: 'Brief take.', at: 123 }));
      localStorage.setItem('annotated-yours', JSON.stringify([{ kind: 'article', take: 'Brief take.', quote: 'must link back', source: 'The annotated.com brief', tryitAt: 123, at: Date.now() },
        { kind: 'video', take: 'A clip take.', what: 'Clip 2:57 to 3:19 of 5:47', source: 'NASA', at: Date.now() }])); }""")
    await pg.goto(URL); await asyncio.sleep(2)
    after = await pg.evaluate("[...document.querySelectorAll('.llRow .yours .ctake')].map((x) => x.textContent)")
    handed = await sw.evaluate("chrome.storage.local.get('annotatedTryit').then((o) => o.annotatedTryit || null)")
    print('3. the front page after a take on the brief:', after, '| handed over:', handed)
    if after != ['Brief take.', 'A clip take.']: errs.append(f'the cards changed: {after}')
    if handed: errs.append('a take on the brief was handed to the extension')
    await sw.evaluate("chrome.storage.local.set({ annotatedTryit: { quote: 'old', take: 'Old.', at: 1 }, annotatedTryitPublished: 1 })")
    extid = sw.url.split('/')[2]
    pan = await ctx.new_page(); await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    left = await sw.evaluate("chrome.storage.local.get(['annotatedTryit', 'annotatedTryitPublished'])")
    print('   an older handover after the panel opened:', left)
    if left: errs.append(f'an older handover was left behind: {left}')
    await pan.close()
    # 4.
    await pg.evaluate("""() => localStorage.setItem('annotated-yours', JSON.stringify([{ kind: 'article', take: 'Brief take.', quote: 'x', source: 'The annotated.com brief', tryitAt: 9, at: Date.now() },
      { kind: 'post', take: 'Post take.', quote: 'y', source: 'An example post on X', at: Date.now() }]))""")
    await pg.reload(); await asyncio.sleep(1.5)
    # Said once under the row, not on every card (David, 2026-09-25), and hidden once the extension is here.
    words = await pg.evaluate("""() => ({ onCards: document.querySelectorAll('.llRow .yours .yGet').length,
      once: [...document.querySelectorAll('.llGet')].map((x) => [x.textContent, x.hidden]) })""")
    print('4. what the row offers:', words)
    if words != {'onCards': 0, 'once': [['Get the extension to do this on any page', True]]}: errs.append(f'the row offers the wrong thing: {words}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
