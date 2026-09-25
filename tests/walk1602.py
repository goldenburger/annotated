# The recording of 2026-09-25 at 16:02.
#   1. Home in the panel beside a feed page opens the panel's list whatever follows in the feed's address ("#",
#      "#tag=…"), and Your profile beside the profile page does the same.
#   2. From Publish, the annotation page shows nothing of itself before its plane: no back link, rail or comments.
#   3. The home page's loading outline carries the real header.
#   4. The first Home with nothing kept hides its tabs while it loads, rather than showing For you and jumping.
import asyncio, pathlib, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'

async def main():
  errs = []
  # 3.
  html = (PUB / 'index.html').read_text(encoding='utf-8')
  boot = html[html.index('bootSkel'):html.index('</div></div>', html.index('bootSkel'))]
  print('3. the loading outline has the header:', 'wmPlaneSvg' in boot and 'Feed' in boot)
  if not ('wmPlaneSvg' in boot and 'Feed' in boot): errs.append('the home page loads on a white screen')
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('prof1602'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    slow = {'on': True}
    async def db(route):
      if slow['on']: await asyncio.sleep(1.2)
      try: await route.fulfill(status=200, content_type='application/json', body=exists_reply(route.request.url) or '[]')
      except Exception: pass
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    # 4. A blank tab and a fresh panel, the database slow.
    blank = await ctx.new_page(); await blank.goto('about:blank')
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}')
    seen = []
    for _ in range(25):
      await asyncio.sleep(.1)
      seen.append(await pan.evaluate("(() => { const m = document.querySelector('#browseMode'); if (!m || m.hidden) return null; return { loading: /Loading annotations/.test(m.textContent), tabs: !!m.querySelector('.browseTabs') }; })()"))
    both = [s for s in seen if s and s['loading'] and s['tabs']]
    print('4. frames loading with tabs shown:', len(both), 'of', len([s for s in seen if s]))
    if both: errs.append('the first Home showed its tabs while loading')
    slow['on'] = False
    # 1.
    feed = await ctx.new_page(); await feed.goto(f'chrome-extension://{extid}/feed.html#'); await asyncio.sleep(1)
    fid = await sw.evaluate("chrome.tabs.query({}).then((t) => t.find((x) => x.url.includes('feed.html')).id)")
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={fid}'); await asyncio.sleep(2)
    await pan.click('.homeBtn'); await asyncio.sleep(1.2)
    h = await pan.evaluate("({ browse: !document.querySelector('#browseMode').hidden, title: (document.querySelector('#browseMode h2') || {}).textContent || null })")
    print('1. Home beside feed.html#:', h)
    if h != {'browse': True, 'title': 'Home'}: errs.append(f'Home did nothing beside feed.html#: {h}')
    await pan.evaluate("closeBrowse()"); await feed.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(1.2)
    await pan.click('.youBtn'); await asyncio.sleep(1.2)
    h2 = await pan.evaluate("({ browse: !document.querySelector('#browseMode').hidden, title: (document.querySelector('#browseMode h2') || {}).textContent || null })")
    print('   Your profile beside the profile page:', h2)
    if h2 != {'browse': True, 'title': 'Your profile'}: errs.append(f'Your profile did nothing beside the profile page: {h2}')
    # 2.
    await pan.evaluate("Store.put('pub-1602', { item: { kind: 'article', url: 'https://example.test/a', text: 'words', quote: 'words', meta: { title: 'A page' } }, take: { text: 'A take' }, created: Date.now() })")
    await sw.evaluate("chrome.storage.session.set({ annFrom: 'publish' })")
    ann = await ctx.new_page(); ann.on('pageerror', lambda e: errs.append('ANN ' + str(e)))
    await ann.add_init_script("""try{localStorage.setItem('annotated-planes','on')}catch(e){}
      window.__shown = [];
      new MutationObserver(() => { if (document.querySelector('.pl-layer')) return; for (const s of ['.topRow', '.rail', '.comments', '.annCard']) { const e = document.querySelector(s); if (e && e.getBoundingClientRect().height && Number(getComputedStyle(e).opacity) > .05 && !window.__shown.includes(s)) window.__shown.push(s + ' ' + document.getElementById('page').className + ' ' + getComputedStyle(e).opacity); } })
        .observe(document, { subtree: true, childList: true, attributes: true });""")
    await ann.set_viewport_size({'width': 1300, 'height': 900})
    await ann.goto(f'chrome-extension://{extid}/annotation.html#pub-1602')
    flew = False
    for _ in range(40):
      await asyncio.sleep(.1)
      if await ann.evaluate("!!document.querySelector('.pl-layer')"): flew = True; break
    shown = await ann.evaluate("window.__shown")
    if not flew: errs.append('no plane came in, so the check proves nothing')
    print('2. shown before the plane:', shown)
    if shown: errs.append(f'the annotation page showed {shown} before its plane')
    await asyncio.sleep(4)
    after = await ann.evaluate("({ card: Number(getComputedStyle(document.querySelector('.annCard')).opacity), rail: Number(getComputedStyle(document.querySelector('.rail')).opacity), held: document.querySelector('.pl-landing, .pl-arriving') !== null })")
    print('   after it landed:', after)
    if after != {'card': 1, 'rail': 1, 'held': False}: errs.append(f'the page did not come in after the plane: {after}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
