# The recording of 2026-09-24 at 19:34.
#   1. Beside annotated's own feed page, Home and Your profile in the panel move that page, and the panel never
#      draws its own list meanwhile (it used to for a second, with "Back to annotated", before putting back its
#      line about the page beside it).
#   2. The help screen has a button to annotated's home page, and the account menu has About annotated.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SESSION = {'access_token': 'x', 'refresh_token': 'y', 'expires_at': 9999999999, 'expires_in': 3600, 'token_type': 'bearer',
           'user': {'id': 'u1', 'email': 'a@b.c', 'user_metadata': {'full_name': 'Robo Taxi'}, 'app_metadata': {}, 'aud': 'authenticated'}}

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW1934'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    async def db(route):
      u = route.request.url
      body = [{'id': 'u1', 'handle': 'testhandle', 'name': 'Robo Taxi', 'avatar': None}] if '/profiles' in u else []
      await route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    feed = await ctx.new_page(); await feed.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
    fid = await sw.evaluate("chrome.tabs.query({}).then((t) => t.find((x) => (x.url || '').includes('feed.html')).id)")
    side = await ctx.new_page(); await side.set_viewport_size({'width': 400, 'height': 900})
    side.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={fid}'); await asyncio.sleep(2)
    # The panel's idea of the active tab is the feed page.
    await side.evaluate(f"activeTabNow = () => chrome.tabs.get({fid})")

    # 1.
    await side.click('.topProfile, [aria-label="Your profile"]')
    seen = []
    for _ in range(15):
      seen.append(await side.evaluate("!document.querySelector('#browseMode').hidden")); await asyncio.sleep(.1)
    url = await sw.evaluate(f"chrome.tabs.get({fid}).then((t) => t.url)")
    print('1. the panel drew its own list:', any(seen), '| the page went to', url.split('/')[-1])
    if any(seen): errs.append('the panel drew its own profile list beside annotated\'s page')
    if not url.endswith('feed.html#profile'): errs.append(f'Your profile did not move the page: {url}')
    await side.click('.topHome, [aria-label="Home"]'); await asyncio.sleep(1)
    url = await sw.evaluate(f"chrome.tabs.get({fid}).then((t) => t.url)")
    print('   Home moved it to', url.split('/')[-1])
    if not url.endswith('feed.html'): errs.append(f'Home did not move the page: {url}')

    # The logo on the extension's own page opens annotated's home page (recording of 2026-09-24 at 21:03).
    logo = await feed.evaluate("(() => { const a = document.querySelector('.sitebar .wmBtn'); return a && { tag: a.tagName, href: a.getAttribute('href') }; })()")
    print("   the page's logo:", logo)
    if logo != {'tag': 'A', 'href': 'https://annotated-app.netlify.app/'}: errs.append(f"the logo does not open annotated's home page: {logo}")
    # 2.
    await side.click('.helpBtn'); await asyncio.sleep(.6)
    h = await side.evaluate("(() => { const a = document.querySelector('.wSite'); return a && { text: a.textContent.trim(), href: a.getAttribute('href'), tag: a.tagName }; })()")
    print("2. the help screen's link:", h)
    if not h or h['href'] != 'https://annotated-app.netlify.app/' or not h['text'].startswith("Open annotated's home page"): errs.append(f'no button to the home page on the help screen: {h}')
    about = await side.evaluate("(() => { const a = document.querySelector('.acctAbout'); return a && a.getAttribute('href'); })()")
    print('   About annotated in the account menu:', about)
    if about is None:
      src = open(EXT + '/account.js', encoding='utf-8').read()
      if 'acctAbout' not in src or 'https://annotated-app.netlify.app/' not in src: errs.append('no About annotated in the account menu')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
