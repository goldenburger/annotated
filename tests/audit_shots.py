# UX audit screenshots (2026-09-25). Every screen of the website and the panel, in the states that matter, read
# from the live database without writing to it. Not a test: it prints what it saw and leaves pictures in OUT.
import asyncio, pathlib, mimetypes, sys, os
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
OUT = pathlib.Path(os.environ.get('AUDIT_OUT', str(pathlib.Path(__file__).resolve().parent / 'audit_out')))
OUT.mkdir(parents=True, exist_ok=True)
URL = 'https://annotated-app.netlify.app/'
STORY = ('<!doctype html><title>Harbor story</title><style>body{font:18px/1.6 Georgia;max-width:680px;margin:40px auto;padding:0 20px}</style>'
         '<article><h1>The night buses are back</h1><p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once. '
         'By the end of the night they had agreed to bring back three routes that were cut in 2019, starting in March.</p>'
         '<p>Riders who work late shifts had asked for them for years. The cost is about four million a year.</p></article>')

def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def readonly(route):
  # Reads go to the live database; anything that would write is refused here.
  if route.request.method in ('GET', 'HEAD', 'OPTIONS') or '/rpc/' in route.request.url: return await route.continue_()
  await route.fulfill(status=403, content_type='application/json', body='{"message":"audit is read only"}')

async def shoot(pg, name, full=True):
  await pg.screenshot(path=str(OUT / f'{name}.png'), full_page=full)
  print('shot', name)

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    for tag, vp, scheme in [] if os.environ.get('AUDIT_PANEL_ONLY') else [('desk', {'width': 1440, 'height': 900}, 'light'), ('dark', {'width': 1440, 'height': 900}, 'dark'), ('phone', {'width': 390, 'height': 844}, 'light')]:
      c = await b.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1)
      await c.route('https://annotated-app.netlify.app/**', site)
      await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', readonly)
      pg = await c.new_page(); pg.on('pageerror', lambda e, t=tag: errs.append(f'{t} PAGE {e}'))
      pg.on('console', lambda m, t=tag: errs.append(f'{t} CONSOLE {m.text}') if m.type == 'error' and 'Content Security' not in m.text else None)
      for name, path in [('home', '?noplanes'), ('feed', '?feed'), ('install', 'install'), ('privacy', 'privacy')]:
        await pg.goto(URL + path); await asyncio.sleep(3)
        await shoot(pg, f'site_{name}_{tag}')
      # An annotation and its author's profile, from the live feed.
      await pg.goto(URL + '?feed'); await asyncio.sleep(3)
      link = await pg.evaluate("(() => { const c = document.querySelector('.cards .card, .cards [role=link]'); return c ? (c.getAttribute('href') || c.dataset.href || null) : null; })()")
      await pg.click('.cards .card'); await asyncio.sleep(3)
      await shoot(pg, f'site_annotation_{tag}')
      plink = await pg.evaluate("(() => { const a = [...document.querySelectorAll('a')].find((x) => /\\/@[^/]+$/.test(x.getAttribute('href') || '')); return a ? a.getAttribute('href') : null; })()")
      await pg.goto(URL + (plink.lstrip('/') if plink else '@testhandle')); await asyncio.sleep(3)
      await shoot(pg, f'site_profile_{tag}')
      await pg.goto(URL + '@nobody-at-all'); await asyncio.sleep(3)
      await shoot(pg, f'site_notfound_{tag}')
      await c.close()

    # The panel, signed out, beside the page kinds it knows.
    ctx = await p.chromium.launch_persistent_context(prof('profAudit'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', readonly)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=STORY))
    await ctx.route('https://annotated-app.netlify.app/**', site)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    async def panel_for(url, name, before=None, first=False):
      t = await ctx.new_page(); await t.goto(url); await asyncio.sleep(1.5)
      tid = await sw.evaluate(f"chrome.tabs.query({{}}).then((ts) => ts.find((x) => x.url.startsWith({url[:40]!r})).id)")
      pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900})
      pan.on('pageerror', lambda e: errs.append(f'PANEL {name} {e}'))
      if not first: await pan.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
      await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
      if before: await before(t, pan)
      await pan.screenshot(path=str(OUT / f'panel_{name}.png'), full_page=True); print('shot panel', name)
      return t, pan
    t, pan = await panel_for('about:blank', 'welcome', first=True)
    await pan.close(); await t.close()
    t, pan = await panel_for('about:blank', 'home')
    await pan.click('.youBtn'); await asyncio.sleep(1.5); await pan.screenshot(path=str(OUT / 'panel_profile.png'), full_page=True)
    await pan.click('.gearBtn'); await asyncio.sleep(.6); await pan.screenshot(path=str(OUT / 'panel_display.png'), full_page=True)
    await pan.keyboard.press('Escape'); await asyncio.sleep(.3)
    await pan.click('.acctBtn'); await asyncio.sleep(.8)
    await pan.close(); await t.close()
    async def pick(t, pan):
      await t.bring_to_front()
      await t.evaluate("(() => { const n = document.getElementById('a').firstChild; const r = document.createRange(); r.setStart(n, 60); r.setEnd(n, 104); getSelection().removeAllRanges(); getSelection().addRange(r); })()")
      await asyncio.sleep(1.2); await pan.bring_to_front(); await asyncio.sleep(.6)
      await pan.screenshot(path=str(OUT / 'panel_article_selected.png'), full_page=True)
      await pan.click('#articleMode .grab'); await asyncio.sleep(3)
      await pan.screenshot(path=str(OUT / 'panel_article_captured.png'), full_page=True)
      await pan.fill('#articleMode .takeInput', 'Four million a year for three routes is cheap for what riders get.')
      await pan.screenshot(path=str(OUT / 'panel_article_take.png'), full_page=True)
      await pan.click('#articleMode .publish'); await asyncio.sleep(4)
    t, pan = await panel_for('https://harborline.example/story', 'article_published', before=pick)
    await pan.close(); await t.close()
    t, pan = await panel_for(URL + '?noplanes', 'beside_site')
    await pan.close(); await t.close()
    feed = await ctx.new_page(); await feed.set_viewport_size({'width': 1100, 'height': 900})
    await feed.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(3)
    await feed.screenshot(path=str(OUT / 'ext_feed.png'), full_page=True)
    await feed.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(3)
    await feed.screenshot(path=str(OUT / 'ext_profile.png'), full_page=True)
    ids = await feed.evaluate("Store.allMeta().then((r) => r.map((x) => x.id))")
    if ids:
      await feed.goto(f'chrome-extension://{extid}/annotation.html#{ids[0]}'); await asyncio.sleep(3)
      await feed.screenshot(path=str(OUT / 'ext_annotation.png'), full_page=True)
    await ctx.close()
    await b.close()
  print('errors:', errs)

asyncio.run(main())
