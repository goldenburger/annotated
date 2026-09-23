# The recording of 2026-09-23 at 02:48. "I can't seem to get back to the start up page."
#   1. Home in the panel carries the start page (talked about, places to start, paste a link, a podcast by
#      name) above For you, Following and Everyone, whatever the tab is showing.
#   2. Beside the feed and your profile the panel shows the way back, named, and the start page under it,
#      where it used to be one sentence and one button. The way back brings that tab to the front.
#   3. Home opens on the same tab in the panel and on the page, and an empty For you gives way to Everyone
#      unless For you was pressed. An empty For you says one thing, not two.
#   4. Your own page is called Your profile in the panel and in its tab.
#   5. The top bar's Home and Your profile tips sit beside the icon, inside the bar, not over the heading.
#   A link pasted from Home opens beside the page, which may hold a clip or a take in progress.
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
STORY = ('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story - YouTube</title></head><body><article>'
         '<h1>Harbor story</h1><p>The council met on a Tuesday to talk about the overnight buses.</p></article></body></html>')

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0248'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    html = lambda body: (lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=body))
    await ctx.route('https://harborline.example/story', html(STORY))
    await ctx.route('https://pasted.example/**', html('<!doctype html><title>Pasted</title><p>Pasted page.</p>'))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(.8)
    tid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)

    # 5. The tip beside the icon.
    tip = await pan.evaluate("""() => { const b = document.querySelector('.homeBtn'), s = getComputedStyle(b, '::after');
      return { top: s.top, left: s.left, btnH: b.getBoundingClientRect().height, btnW: b.getBoundingClientRect().width }; }""")
    print('5. the Home tip is placed at', tip)
    # A hidden tip is not laid out, so its placement is read as written: halfway down, past the right edge.
    if tip['top'] not in ('50%', f"{tip['btnH'] / 2:g}px") or not (tip['left'].startswith('calc(100%') or float(tip['left'].rstrip('px') or 0) >= tip['btnW']):
      errs.append(f'the Home tip is not beside the icon: {tip}')

    # 1. Home on a page with something to annotate.
    await pan.click('.homeBtn'); await pan.wait_for_selector('#browseMode .startBlock', timeout=15000); await asyncio.sleep(.6)
    home = await pan.evaluate("""() => { const s = document.querySelector('#browseMode .startBlock');
      const tabs = document.querySelector('#browseMode .browseTabs');
      return { paste: !!s.querySelector('.pasteForm'), podcast: !!s.querySelector('.fpAny'), sites: s.querySelectorAll('.goSite').length,
        aboveTabs: !!(tabs && (s.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING)),
        current: (document.querySelector('#browseMode .browseTabs input:checked') || {}).value || '' }; }""")
    print('1. Home beside a story:', home)
    if not (home['paste'] and home['podcast'] and home['sites'] == 5): errs.append(f'Home did not carry the start page: {home}')
    if not home['aboveTabs']: errs.append('the start page is not above the tabs')

    # A link pasted from Home opens beside, and the story stays.
    before = len(ctx.pages)
    await pan.fill('#browseMode .pasteForm input', 'pasted.example/one'); await pan.press('#browseMode .pasteForm input', 'Enter'); await asyncio.sleep(1.5)
    msg = await pan.inner_text('#browseMode .pasteMsg')
    print('   pasted from Home:', repr(msg), '| story still at', story.url, '| pages', before, '->', len(ctx.pages))
    if story.url != 'https://harborline.example/story': errs.append('a link pasted from Home replaced the page you were on')
    if len(ctx.pages) != before + 1: errs.append('a link pasted from Home did not open a tab of its own')
    for pg in ctx.pages:
      if 'pasted.example' in pg.url: await pg.close()

    # 3. Which tab Home opens on.
    pick = await pan.evaluate("""() => { const t = (fy, ev) => ({ foryou: { records: Array(fy).fill({}) }, following: { records: [] }, everyone: { records: Array(ev).fill({}) } });
      const empty = Cloud.homeTabs([], { followed: new Set() }, { id: 'me' }, []);
      return { emptyForYou: Cloud.startTab(t(0, 3), 'foryou'), full: Cloud.startTab(t(2, 3), 'foryou'), pressed: Cloud.startTab(t(0, 3), 'foryou', true),
        saved: Cloud.startTab(t(0, 3), 'following'), bothEmpty: Cloud.startTab(t(0, 0), 'foryou'), unknown: Cloud.startTab(t(1, 1), 'nonsense'),
        emptyNote: empty.foryou.note, emptyLine: empty.foryou.empty }; }""")
    print('3. opening tab:', pick)
    want = {'emptyForYou': 'everyone', 'full': 'foryou', 'pressed': 'foryou', 'saved': 'following', 'bothEmpty': 'foryou', 'unknown': 'foryou'}
    for k, v in want.items():
      if pick[k] != v: errs.append(f'{k}: Home would open on {pick[k]}, wanted {v}')
    if pick['emptyNote']: errs.append(f"an empty For you still explains itself twice: {pick['emptyNote']!r}")
    if 'Your profile' not in pick['emptyLine']: errs.append(f"the empty line points at the old name: {pick['emptyLine']!r}")
    # The panel and the page read the same choice.
    await pan.click('#browseMode .browseTabs label:has-text("Following") input'); await asyncio.sleep(1)
    same = await pan.evaluate("localStorage.getItem('annotated-feed-tab')")
    print('   pressing Following in the panel stores', repr(same))
    if same != 'following': errs.append('the panel does not share the chosen tab with the page')
    await pan.evaluate("localStorage.removeItem('annotated-feed-tab')")

    # 4. Your profile.
    await pan.click('.youBtn'); await asyncio.sleep(1.2)
    title = await pan.inner_text('#browseMode h2')
    print('4. the person button opens:', repr(title))
    if title != 'Your profile': errs.append(f'your own page is called {title!r} in the panel')

    # 2. Beside your profile.
    feed = await ctx.new_page(); await feed.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(1.5)
    ftitle = await feed.title()
    fid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('feed.html')).id)")
    side = await ctx.new_page(); await side.set_viewport_size({'width': 400, 'height': 900}); side.on('pageerror', lambda e: errs.append('SIDE ' + str(e)))
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={fid}'); await asyncio.sleep(1.5)
    await side.evaluate(f"lastSourceTab = {tid}; annKey = null;"); await asyncio.sleep(1.5)
    m = await side.evaluate("""() => ({ back: (document.querySelector('.sideBack') || {}).textContent || '',
      what: (document.querySelector('.mirrorWhat') || {}).textContent || '',
      paste: !!document.querySelector('.mirrorStart .pasteForm'), podcast: !!document.querySelector('.mirrorStart .fpAny'),
      list: !!document.querySelector('#annMode .sideList') })""")
    print('2. beside your profile:', m, '| its tab is called', repr(ftitle))
    if 'Harbor story' not in m['back'] or 'YouTube' in m['back']: errs.append(f"the way back does not name where it goes: {m['back']!r}")
    if not (m['paste'] and m['podcast']): errs.append('beside your profile there is no start page')
    if 'profile' not in m['what'].lower(): errs.append(f"it did not say what is open: {m['what']!r}")
    if m['list']: errs.append('the panel repeats the list the page is showing')
    if ftitle != 'Your profile | annotated': errs.append(f'the profile tab is called {ftitle!r}')
    await feed.bring_to_front(); await asyncio.sleep(.4)
    await side.click('.sideBack'); await asyncio.sleep(1)
    active = await sw.evaluate(f"chrome.tabs.get({tid}).then(t=>t.active)")
    print('   after the way back, the story tab is in front:', active)
    if not active: errs.append('the way back did not bring the story to the front')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
