# The recording of 2026-09-25 at 14:08.
#   1. You on the home page goes to your profile, with the database slow, from the handle this browser last saw,
#      and never to the feed.
#   2. A profile page reads its list again when its tab comes back into view.
#   3. The panel's list is not drawn again when nothing on it changed, and the full-page button says Opening.
#   5. While a plane flies the page does not scroll sideways.
#   6, 7. Help's button says Got it, and beside annotated's home page help does not offer to open it.
#   8. The empty profile says the same thing on the full page as in the panel.
#   9. A download button says Downloaded once pressed.
#   10. The panel's Home, opened a second time, shows the lists it last showed, not "Loading annotations…".
#   11. The outline drawn while a page loads carries Feed and You.
#   12. The footer is hidden while the page is still its outline.
#   14. No stroke under the take.
import asyncio, pathlib, mimetypes, json, time
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
UID = 'robo-1408'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    lists = {'n': 0}
    async def db(route):
      u = route.request.url
      if '/rest/v1/profiles' in u:
        await asyncio.sleep(6)   # the account is slow to read, as it seemed to be at 2:16
        try: await route.fulfill(status=200, content_type='application/json', body='[]')
        except Exception: pass
        return
      if '/rest/v1/annotations' in u: lists['n'] += 1
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    await c.add_init_script(f"try{{localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))}); localStorage.setItem('annotated-last-handle', JSON.stringify({{ id: '{UID}', handle: 'robotaxi' }}))}}catch(e){{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 12. The footer while the page is its outline.
    await pg.goto(URL + '?noplanes', wait_until='commit')
    foot = None
    for _ in range(40):
      foot = await pg.evaluate("(() => { const f = document.querySelector('.webFoot'), p = document.getElementById('page'); if (!f || !p) return null; return { outline: !!p.querySelector(':scope > .bootSkel, :scope > .skel'), styled: getComputedStyle(f).display === 'flex', vis: getComputedStyle(f).visibility }; })()")
      if foot and foot['outline'] and foot['styled']: break
      await asyncio.sleep(.02)
    await asyncio.sleep(1.5)
    # The page draws too quickly here to catch its outline, so the outline is put back to see the footer's rule.
    foot = await pg.evaluate("""(() => { const p = document.getElementById('page'), f = document.querySelector('.webFoot'), keep = [...p.childNodes];
      const s = document.createElement('div'); s.className = 'bootSkel'; p.replaceChildren(s); const during = getComputedStyle(f).visibility;
      p.replaceChildren(...keep); return { during, after: getComputedStyle(f).visibility }; })()""")
    print('12. the footer while the page is its outline, and after:', foot)
    if foot != {'during': 'hidden', 'after': 'visible'}: errs.append(f'the footer shows on its own while the page loads: {foot}')
    # 9.
    await pg.evaluate("document.querySelector('.landGet').hidden = false")
    await pg.evaluate("document.querySelector('.giDo .primary').addEventListener('click', (e) => e.preventDefault(), true)")
    await pg.click('.giDo .primary'); await asyncio.sleep(.2)
    dl = await pg.evaluate("document.querySelector('.giDo .primary').textContent.trim()")
    print('9. the download button after a press:', dl)
    if dl != 'Downloaded': errs.append(f'the download button reads {dl!r}')
    # 1.
    await pg.click('.landBar .navProfile')
    await pg.wait_for_url('**/@robotaxi', timeout=8000)
    print('1. You went to', pg.url)
    if not pg.url.endswith('/@robotaxi'): errs.append(f'You went to {pg.url}')
    await c.close()

    # 2, 11. A profile page, signed in, with a quick database.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    counts = {'n': 0}
    async def db2(route):
      u = route.request.url
      if '/rest/v1/profiles' in u and 'handle=eq.robotaxi' in u:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}))
      if '/rest/v1/annotations' in u and 'author_id' in u: counts['n'] += 1
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db2)
    await c.add_init_script(f"try{{localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))})}}catch(e){{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '@robotaxi', wait_until='commit')
    skel = None
    for _ in range(60):
      skel = await pg.evaluate("(() => { const s = document.querySelector('#page > .skel'); return s ? [...s.querySelectorAll('.sitenav .navBtn')].map((x) => x.textContent.trim()) : null; })()")
      if skel: break
      await asyncio.sleep(.02)
    print('11. the outline header:', skel)
    if not skel or skel[0] != 'Feed' or 'You' not in skel[1]: errs.append(f'the outline has no Feed and You: {skel}')
    await pg.wait_for_selector('.feedHead, .sitemain', timeout=10000); await asyncio.sleep(1)
    before = counts['n']
    await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
    await asyncio.sleep(1.7)
    await pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
    await asyncio.sleep(1.5)
    print('2. profile lists asked for before and after coming back:', before, counts['n'])
    if counts['n'] <= before: errs.append('the profile did not read its list again on coming back to its tab')
    # 8. The empty profile's words, here and in the panel.
    words = await pg.evaluate("(document.querySelector('.emptyState') || {}).textContent || ''")
    print('8. the empty profile says:', ' '.join(words.split())[:120])
    if 'Select words on any page, or clip a video or podcast' not in words: errs.append(f'the empty profile says {words!r}')
    # 5.
    ov = await pg.evaluate("""(() => { const l = document.createElement('div'); l.className = 'pl-layer'; document.body.appendChild(l);
      const v = getComputedStyle(document.documentElement).overflowX; l.remove(); return [v, getComputedStyle(document.documentElement).overflowX]; })()""")
    print('5. sideways overflow while a plane flies, and after:', ov)
    if ov[0] != 'hidden' or ov[1] == 'hidden': errs.append(f'the page can scroll sideways under a plane: {ov}')
    await b.close()

    # 3, 6, 7, 10, 14. The extension.
    ctx = await p.chromium.launch_persistent_context(prof('prof1408'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body=exists_reply(r.request.url) or '[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    home = await ctx.new_page(); await home.goto(URL + '?noplanes'); await asyncio.sleep(.5)
    hid = await sw.evaluate("chrome.tabs.query({}).then((t) => t.find((x) => x.url.startsWith('https://annotated-app.netlify.app/')).id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={hid}'); await asyncio.sleep(2)
    # 6, 7.
    await pan.click('.helpBtn'); await asyncio.sleep(1)
    h = await pan.evaluate("({ go: document.querySelector('.welcome .wGo').textContent.trim(), site: !document.querySelector('.welcome .wSite').hidden })")
    print('6, 7. help beside the home page:', h)
    if h['go'] != 'Got it' or h['site']: errs.append(f'help reads {h}')
    await pan.keyboard.press('Escape'); await asyncio.sleep(.5)
    # 3.
    await pan.evaluate("PanelKit && null")
    same = await pan.evaluate("""(() => { const d = document.createElement('div'); document.body.appendChild(d);
      const rec = { id: 'a', created: 1, take: { text: 'One' }, item: { kind: 'article', meta: { title: 'A page' } } };
      let full = 0; const o = { title: 'Your profile', records: [rec], onOpen() {}, onFull() { full++; } };
      AnnotationPage.renderBrowse(d, o); const btn = d.querySelector('.browseFullBtn');
      AnnotationPage.renderBrowse(d, o); const kept = d.querySelector('.browseFullBtn') === btn;
      btn.click(); const said = btn.textContent.trim();
      AnnotationPage.renderBrowse(d, { ...o, records: [] }); const redrawn = d.querySelector('.browseFullBtn') !== btn;
      d.remove(); return { kept, said, full, redrawn }; })()""")
    print('3. the same list drawn twice:', same)
    if same != {'kept': True, 'said': 'Opening…', 'full': 1, 'redrawn': True}: errs.append(f'the panel list redraws or the button is silent: {same}')
    # 10.
    await pan.evaluate("closeBrowse()"); await asyncio.sleep(.8)
    await pan.evaluate("openBrowse('home')")
    seen = []
    for _ in range(10):
      seen.append(await pan.evaluate("/Loading annotations/.test(document.querySelector('#browseMode').textContent)"))
      await asyncio.sleep(.05)
    print('10. "Loading annotations" on the second Home:', any(seen))
    if any(seen): errs.append('the panel said Loading annotations again on reopening Home')
    # 14.
    await pan.evaluate("Store.put('mine-1408', { item: { kind: 'article', url: 'https://example.test/a', text: 'words', meta: { title: 'A page' } }, take: { text: 'A take' }, created: Date.now() })")
    ann = await ctx.new_page(); await ann.goto(f'chrome-extension://{extid}/annotation.html#mine-1408'); await ann.wait_for_selector('.annCard .take'); await asyncio.sleep(.5)
    st = await ann.evaluate("getComputedStyle(document.querySelector('.annCard .take'), '::after').display")
    print('14. the stroke under the take:', st)
    if st != 'none': errs.append(f'the take still has its stroke: {st}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
