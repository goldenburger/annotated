# The recording of 2026-09-25 at 06:01.
#   1. A published annotation deleted online (the database has no row for it) is taken off this computer when the
#      panel lists it, and the panel says so once. One that was never published stays.
#   2. The extension's own feed page drops it too.
#   3. ?preview=visitor shows the home page as a visitor sees it with the extension installed: the install button,
#      which arrives as a plane, and the steps.
import asyncio, pathlib, mimetypes, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
PUT = """(async () => {
  const now = Date.now();
  await Store.put('gone-1', { item: { kind: 'article', text: 'words', meta: { title: 'A page' } }, take: { text: 'Deleted online' }, created: now, cloud: true });
  await Store.put('here-1', { item: { kind: 'article', text: 'words', meta: { title: 'A page' } }, take: { text: 'Only here' }, created: now - 1000 });
})()"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('prof0601'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    # The database knows no annotations at all, so anything marked published here was deleted online.
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await ctx.route('https://annotated-app.netlify.app/**', site)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2)
    await pan.evaluate(PUT); await asyncio.sleep(.3)
    # 1.
    await pan.click('.youBtn'); await asyncio.sleep(1.5)
    st = await pan.evaluate("""(async () => ({ gone: !!(await Store.get('gone-1')), here: !!(await Store.get('here-1')),
      list: [...document.querySelectorAll('#browseMode .sideList .rlTake')].map((x) => x.textContent.trim()),
      note: (document.querySelector('#browseMode .browseNote') || {}).textContent || '' }))()""")
    print('1. after listing your profile:', st)
    if st['gone'] or not st['here']: errs.append(f'the copy deleted online stayed, or the local one went: {st}')
    if any('Deleted online' in x for x in st['list']): errs.append('the panel listed an annotation deleted online')
    if 'deleted online' not in st['note']: errs.append(f"the panel did not say it was deleted online: {st['note']!r}")
    # 2.
    await pan.evaluate(PUT.replace("'here-1'", "'here-2'")); await asyncio.sleep(.3)
    feed = await ctx.new_page(); feed.on('pageerror', lambda e: errs.append('FEED ' + str(e)))
    await feed.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(3)
    f = await feed.evaluate("""(async () => ({ gone: !!(await Store.get('gone-1')), cards: [...document.querySelectorAll('.cards .ctake')].map((x) => x.textContent.trim()) }))()""")
    print('2. the extension feed page:', f)
    if f['gone'] or any('Deleted online' in x for x in f['cards']): errs.append(f'the feed page kept the annotation deleted online: {f}')
    # 3. The site marks itself installed for the extension; the visitor preview ignores that.
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.set_viewport_size({'width': 1440, 'height': 900}); await pg.goto('https://annotated-app.netlify.app/?preview=visitor&planes')
    held = False
    for _ in range(50):
      await asyncio.sleep(.1)
      if await pg.evaluate("document.querySelector('.heroGet').classList.contains('pl-hidden') && !!document.querySelector('.pl-carrier')"): held = True
    mark = await pg.evaluate("document.documentElement.dataset.annotatedInstalled || null")
    await asyncio.sleep(3)
    v = await pg.evaluate("({ get: !document.querySelector('.heroGetRow').hidden && document.querySelector('.heroGet').offsetWidth > 0 && !document.querySelector('.heroGet').classList.contains('pl-hidden'), steps: !document.querySelector('.landGet').hidden, have: !document.querySelector('.heroHave').hidden })")
    print('3. visitor preview with the extension installed (mark', mark, '): held for its plane', held, '|', v)
    if mark != '1': errs.append('the extension did not mark the site, so the preview proves nothing')
    if not held or v != {'get': True, 'steps': True, 'have': False}: errs.append(f'the visitor preview did not show the install button and steps: {held}, {v}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
