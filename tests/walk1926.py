# The recording of 2026-09-25 at 19:26.
#   1. With annotated's Feed open in a second window, View page after publishing opens the annotation in the window
#      you are in, where it used to move the other window's tab and leave that window behind.
#   2. A page of ours already shown in another window is switched to, and that window is brought forward.
#   3. The examples under What else it does start low, so no plane is ever much larger than the card it becomes.
import asyncio, pathlib
from playwright.async_api import async_playwright
from _env import *
FEATURES = (pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public' / 'features.js').read_text(encoding='utf-8')

async def main():
  errs = []
  # 3.
  import re
  zs = [int(z) for z in re.findall(r"z0: (\d+), T:", FEATURES)]
  print('3. the examples start at heights', zs)
  if not zs or max(zs) > 200: errs.append(f'an example plane starts too high: {zs}')
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('prof1926'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body=exists_reply(r.request.url) or '[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    # A second window holding annotated's Feed, as at 0:07 of the recording.
    other = await sw.evaluate(f"chrome.windows.create({{ url: 'chrome-extension://{extid}/feed.html' }}).then((w) => w.id)")
    await asyncio.sleep(1.5)
    # The window you are in: a page, and the panel beside it.
    here = await sw.evaluate("chrome.windows.create({ url: 'about:blank', focused: true }).then((w) => ({ win: w.id, tab: w.tabs[0].id }))")
    await asyncio.sleep(1)
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f"chrome-extension://{extid}/sidepanel.html?tab={here['tab']}"); await asyncio.sleep(2)
    await pan.evaluate("Store.put('w1', { item: { kind: 'article', url: 'https://e.test/a', text: 'w', meta: { title: 'A page' } }, take: { text: 'A take' }, created: Date.now() })")
    # 1. View page, as the published card calls it.
    await pan.evaluate("viewPublished({ id: 'w1' })"); await asyncio.sleep(1.5)
    tabs = await sw.evaluate("chrome.tabs.query({}).then((t) => t.map((x) => ({ w: x.windowId, url: x.url, active: x.active })))")
    mine = [t for t in tabs if 'annotation.html#w1' in t['url']]
    feed_other = [t for t in tabs if t['w'] == other and 'feed.html' in t['url']]
    print('1. the annotation opened in windows', [t['w'] for t in mine], '| you are in', here['win'], '| the other window still shows the feed:', bool(feed_other))
    if not mine or mine[0]['w'] != here['win'] or not mine[0]['active']: errs.append(f'View page did not open the annotation in the window you are in: {mine}')
    if not feed_other: errs.append('View page moved the Feed tab in the other window')
    # 2. Asking for the Feed, which the other window shows: that tab is switched to, and no second copy is opened.
    #    (Headless Edge keeps no window focus, so the window coming forward is not checked here.)
    before = await sw.evaluate("chrome.tabs.query({}).then((t) => t.filter((x) => x.url.includes('feed.html')).length)")
    await pan.evaluate("openExtPage('feed.html')"); await asyncio.sleep(1)
    after = await sw.evaluate(f"chrome.tabs.query({{}}).then((t) => ({{ n: t.filter((x) => x.url.includes('feed.html')).length, active: t.some((x) => x.windowId === {other} && x.url.includes('feed.html') && x.active) }}))")
    print('2. Feed tabs before and after', before, after)
    if after['n'] != before or not after['active']: errs.append(f'asking for the Feed opened another copy or did not switch to it: {before} {after}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
