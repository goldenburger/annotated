# The walk-through of 2026-09-22, the last one that day.
#   An annotation kept only on this computer offered File a claim, and the form said "Claim received" while
#   sending nothing. The button now comes with publishing.
#   Dates given as a plain day, or as midnight in Greenwich, came out a day early anywhere west of it: an
#   episode released on September 1 read "Aug 31". The browser here runs on Los Angeles time to show it.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
APPLE = {'results': [{'trackName': 'Can overnight buses work?', 'collectionName': 'The Transit Hour', 'episodeUrl': 'https://cdn.transithour.example/ep41.mp3',
                      'artworkUrl160': '', 'releaseDate': '2026-09-01T00:00:00Z', 'trackTimeMillis': 1800000}]}
RENDER = """async (a) => { const box = document.createElement('div'); document.body.appendChild(box);
  await AnnotationPage.render(box, { id: 'x1', item: { kind: 'article', text: 'A passage.', meta: { site: 'Bee', title: 'T', url: 'https://bee.example/a', published: '2026-09-17', author: 'Ana' } },
    take: { text: 'a take' }, permalink: 'https://x/y', comments: [], reactions: [], siteNav: false, showBanner: false, localOnly: a.local }, {});
  const out = { claim: !!box.querySelector('.claim'), card: (box.querySelector('.srccard') || {}).textContent || '' }; box.remove(); return out; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW23'), headless=True, executable_path=CHROME, timezone_id='America/Los_Angeles',
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://itunes.apple.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(APPLE)))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    pan = await ctx.new_page(); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)
    print('time zone here:', await pan.evaluate("Intl.DateTimeFormat().resolvedOptions().timeZone"))

    local = await pan.evaluate(RENDER, {'local': True})
    shared = await pan.evaluate(RENDER, {'local': False})
    print('only on this computer:', local['claim'], '| published:', shared['claim'])
    if local['claim']: errs.append('an annotation kept only here still offers File a claim')
    if not shared['claim']: errs.append('a published annotation lost File a claim')
    print('the source card says:', shared['card'].strip().replace('\n', ' ')[:120])
    if 'September 17, 2026' not in shared['card']: errs.append(f"a plain date came out wrong: {shared['card']!r}")

    await pan.evaluate(f'feedAsked.add({tid}); refresh()'); await asyncio.sleep(2.5)
    await pan.fill('.fpQ', 'overnight buses'); await pan.press('.fpQ', 'Enter'); await asyncio.sleep(2)
    row = (await pan.inner_text('.fpList')).replace('\n', ' | ')
    print('the episode row:', row)
    if 'Sep 1, 2026' not in row: errs.append(f'the release date came out a day early: {row!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
