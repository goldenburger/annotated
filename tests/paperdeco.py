# Paper on the desk (paperdeco.js, David, 2026-09-25).
#   1. The feed, a profile and "Not found" carry the desk in their margins on a wide screen, and not on a narrow one.
#   2. The drawings never take a click, are hidden from screen readers, and never widen the page.
#   3. An empty list shows its crumpled sheet and plane; the home page ends on the desk.
#   4. The panel's help screen has its plane and trail, and a list in the panel ends on the small pile.
#   5. In the interface itself: a trail under the Feed heading and What else it does, a plane gliding over loading
#      outlines, the annotation card's folded corner, a dart resting on empty comments, the mark as the toast's tick.
import asyncio, pathlib, mimetypes
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
CHECK = """(() => { const d = document.querySelector('.pdDesk'); const shown = !!d && getComputedStyle(d).display !== 'none';
  const svgs = [...document.querySelectorAll('.paperDeco')];
  return { desk: shown, svgs: svgs.length, silent: svgs.every((s) => s.closest('[aria-hidden="true"]') && getComputedStyle(s).pointerEvents === 'none'),
    wide: document.documentElement.scrollWidth > innerWidth + 1, empty: !!document.querySelector('.emptyState .pdEmpty, .shellEmpty .pdEmpty') }; })()"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    for w, want in [(1530, True), (1100, False), (390, False)]:
      c = await b.new_context(viewport={'width': w, 'height': 900})
      await c.route('https://annotated-app.netlify.app/**', site)
      await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
      pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
      for path in ['?feed', '@nobody-here']:
        await pg.goto(URL + path); await asyncio.sleep(2.5)
        r = await pg.evaluate(CHECK)
        print(w, path, r)
        if r['desk'] != want: errs.append(f'{w} {path}: the desk shown {r["desk"]}, wanted {want}')
        if not r['silent'] or r['wide']: errs.append(f'{w} {path}: a drawing takes clicks, is read aloud, or widens the page: {r}')
        if not r['empty']: errs.append(f'{w} {path}: the empty list has no drawing')
      # 5. Paper in the interface: the Feed heading's trail, the loading outline's plane.
      await pg.goto(URL + '?feed'); await asyncio.sleep(2.5)
      ui = await pg.evaluate("""(() => { const d = document.createElement('div'); d.innerHTML = '<div class="skel"><div class="skelBody"><div class="skelCol"></div></div></div>'; document.body.appendChild(d);
        const bg = getComputedStyle(d.querySelector('.skelCol'), '::before').backgroundImage; d.remove();
        return { rule: !!document.querySelector('.feedHead .pdRule'), glide: bg.includes('svg') }; })()""")
      if ui != {'rule': True, 'glide': True}: errs.append(f'{w}: the feed heading or the loading outline has no paper: {ui}')
      await pg.goto(URL + '?noplanes'); await asyncio.sleep(2)
      foot = await pg.evaluate("document.querySelectorAll('.pdFoot .paperDeco').length")
      if not await pg.evaluate("!!document.querySelector('.landFeatures .pdRule')"): errs.append(f'{w}: What else it does has no trail under it')
      if foot < 2: errs.append(f'{w}: the home page does not end on the desk ({foot})')
      await c.close()
    await b.close()

    ctx = await p.chromium.launch_persistent_context(prof('profPaperDeco'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page(); await blank.goto('about:blank')
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 370, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(2.5)
    help_ = await pan.evaluate("!!document.querySelector('.welcome .pd-trail .paperDeco')")
    await pan.evaluate("Store.put('d1', { item: { kind: 'article', url: 'https://e.test/a', text: 'w', meta: { title: 'A page' } }, take: { text: 'A take' }, created: Date.now() })")
    await pan.click('.welcome .wGo'); await asyncio.sleep(1)
    await pan.click('.youBtn'); await asyncio.sleep(1.5)
    corner = await pan.evaluate("!!document.querySelector('#browseMode .pd-corner .paperDeco')")
    print('4. help plane', help_, '| the list ends on a pile', corner)
    if not help_ or not corner: errs.append(f'the panel is missing its paper: {help_}, {corner}')
    # 5. The annotation page: its card's folded corner, the dart resting on the empty comments, the toast's mark.
    ann = await ctx.new_page(); await ann.set_viewport_size({'width': 1280, 'height': 900})
    await ann.goto(f'chrome-extension://{extid}/annotation.html#d1'); await ann.wait_for_selector('.annCard'); await asyncio.sleep(1)
    a = await ann.evaluate("""({ fold: getComputedStyle(document.querySelector('.annBody .annCard .foldBtn')).backgroundImage.includes('gradient'),  // the corner is the fold button since 2.35
      resting: !!document.querySelector('.cList li.empty .pdWaiting'),
      mark: (() => { const d = document.createElement('span'); d.className = 'toastCheck'; d.innerHTML = Brand.mark(); return !!d.querySelector('.wmPlaneSvg'); })() })""")
    print('5.', a)
    if a != {'fold': True, 'resting': True, 'mark': True}: errs.append(f'the annotation page is missing its paper: {a}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
