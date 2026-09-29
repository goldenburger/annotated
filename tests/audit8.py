# The eighth audit pass (after 2.38.7).
# Website:
#   1. Clear all in Yours so far does not jump the page below (its edges were left at nothing and snapped back 67 px).
#   2. Nothing slides as the home page opens; a region takes its first size as it is.
#   3. The In Chrome demo is not fetched when only a sliver of it is in sight.
#   4. A drawing lit by the pointer stays lit a few pixels outside its box (lifting pulled its edge in and it flickered).
# Extension:
#   5. Signing out when the library cannot (offline, token expired) still takes the session out of storage.
#   6. A profile read that fails keeps the handle rather than reporting none.
#   7. A preference changed here is announced once, not again when storage echoes it.
#   8. Making a GIF of a clip whose download never answers gives up with a message.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db
from nobounce import SAMPLE, jumps

YOURS = [{'kind': 'article', 'take': f'Take {i}', 'quote': 'must link back to its original source URL', 'source': 'The annotated.com brief', 'at': 1000 + i} for i in range(3)]

async def web(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True)
  c = await b.new_context(viewport={'width': 1600, 'height': 900})
  await c.add_init_script(f"try{{ if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); sessionStorage.setItem('seeded', '1'); }} sessionStorage.setItem('annotated-example-shown','1') }}catch(e){{}}")
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  asked = []
  pg.on('request', lambda r: asked.append(r.url) if 'panel-demo.mp4' in r.url else None)
  # 2. From the first frames: the section below the hero stays put while the page fills.
  await pg.goto('https://annotated-app.netlify.app/?noplanes'); await pg.evaluate(SAMPLE); await asyncio.sleep(2.5)
  ys = await pg.evaluate('window.__y')
  # Web fonts arriving reflow the brief a little, which may ease by a few pixels; what must not happen is the try-it
  # sliding open from its empty tabs, hundreds of pixels.
  far = max((abs(y - ys[-1][1]) for _, y in ys), default=0)
  print('2. furthest In Chrome sat from where it settled while the page opened:', far, 'px | jumps', jumps(ys))
  if far > 40 or jumps(ys): errs.append(f'the page slid or jumped as it opened ({far} px)')
  # 1. Clear all.
  await pg.evaluate("window.__y = []")
  await pg.click('.llClear'); await asyncio.sleep(2)
  ys = await pg.evaluate('window.__y'); j = jumps(ys)
  print('1. Clear all: jumps', j, '| end', ys[-1][1] if ys else None)
  if j: errs.append(f'Clear all jumped the page below: {j}')
  await c.close()
  # 3. A sliver of the demo in sight, in a fresh browser with saved cards, so the demo starts below the fold (Clear all
  # above lifted it into view, and fetching it then was right).
  c = await b.new_context(viewport={'width': 1600, 'height': 900})
  await c.add_init_script(f"try{{ localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); sessionStorage.setItem('annotated-example-shown','1') }}catch(e){{}}")
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page()
  await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2.5)
  below = await pg.evaluate("document.querySelector('.lcVideo').getBoundingClientRect().top > innerHeight")
  if not below: errs.append('the test could not start with the demo below the fold')
  await pg.evaluate("(() => { const v = document.querySelector('.lcVideo'), r = v.getBoundingClientRect(); scrollTo(0, scrollY + r.top - innerHeight + r.height * .1); })()"); await asyncio.sleep(1.2)
  # Whether the video was given its file (the file is cached from the first page, so no request would show).
  given = "!!document.querySelector('.lcVideo').getAttribute('src')"
  sliver = await pg.evaluate(given)
  await pg.evaluate("document.querySelector('.lcVideo').scrollIntoView({ block: 'center' })"); await asyncio.sleep(1.5)
  full = await pg.evaluate(given)
  print('3. demo given its file with a tenth in sight:', sliver, '| in full sight:', full)
  if sliver: errs.append('the demo was fetched with only a sliver in sight')
  if not full: errs.append('the demo was not fetched in full sight')
  await c.close()
  # 4. Hover hysteresis on the feed's right margin plane.
  c = await b.new_context(viewport={'width': 1600, 'height': 900})
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page()
  await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.pdDesk .pdR .pdPiece'); await asyncio.sleep(1)
  r = await pg.evaluate("(() => { const r = document.querySelector('.pdDesk .pdR .pdPiece').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
  await pg.mouse.move(r[0] + r[2] / 2, r[1] + r[3] / 2); await asyncio.sleep(.8)
  await pg.mouse.move(r[0] + r[2] + 4, r[1] + r[3] / 2); await asyncio.sleep(.5)
  still_lit = await pg.evaluate("document.querySelector('.pdDesk .pdR .pdPiece').classList.contains('pdOn')")
  await pg.mouse.move(r[0] + r[2] + 30, r[1] + r[3] / 2); await asyncio.sleep(.5)
  off = await pg.evaluate("document.querySelector('.pdDesk .pdR .pdPiece').classList.contains('pdOn')")
  print('4. lit 4 px outside its box:', still_lit, '| 30 px outside:', off)
  if not still_lit or off: errs.append('the hover has no room at the edge, or keeps too much')
  await b.close()

async def ext(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('profAUD8'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  extid = sw.url.split('/')[2]
  pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
  # 5.
  out = await pg.evaluate("""async () => {
    await chrome.storage.local.set({ 'annotated-auth': '{"access_token":"x"}' });
    Backend.client.auth.signOut = async () => ({ error: new Error('offline') });
    await Backend.signOut();
    return (await chrome.storage.local.get('annotated-auth'))['annotated-auth'] || null; }""")
  print('5. stored session after an offline sign-out:', out)
  if out: errs.append('an offline sign-out left the session in storage')
  # 6.
  prof6 = await pg.evaluate("""async () => {
    const user = { id: 'u1', email: 'a@b.c', user_metadata: { full_name: 'Ann' } };
    Backend.client.auth.getSession = async () => ({ data: { session: { user } } });
    let fail = false;
    Backend.client.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (fail ? { data: null, error: { message: 'down' } } : { data: { id: 'u1', handle: 'ann', display_name: 'Ann' }, error: null }) }) }) });
    const a = await Backend.profile(); fail = true; const b = await Backend.profile();
    return [a && a.handle, b && b.handle]; }""")
  print('6. handle when read, then when the read fails:', prof6)
  if prof6 != ['ann', 'ann']: errs.append(f'a failed profile read changed the handle: {prof6}')
  # 7.
  calls = await pg.evaluate("""async () => {
    let n = 0; Prefs.onChange(() => n++);
    const before = Prefs.get().density;
    await Prefs.set('density', before === 'compact' ? 'comfortable' : 'compact');
    await new Promise((r) => setTimeout(r, 600));
    await Prefs.set('density', before);
    await new Promise((r) => setTimeout(r, 600));
    return n; }""")
  print('7. announcements for two preference changes:', calls)
  if calls != 2: errs.append(f'two preference changes were announced {calls} times')
  # 8.
  await ctx.route('https://stall.example/**', lambda route: None)   # never answered
  t0 = time.time()
  msg = await pg.evaluate("""async () => {
    const s = document.createElement('script'); s.src = 'gifmaker.js'; document.head.appendChild(s); await new Promise((r) => { s.onload = r; s.onerror = r; });
    try { await GifMaker.fromVideo('https://stall.example/clip.webm', { start: 0, end: 2 }, () => {}); return 'finished'; } catch (e) { return String(e.message || e); } }""")
  print(f'8. a stalled clip: {msg!r} after {round(time.time() - t0, 1)} s')
  if 'could not be read' not in msg: errs.append(f'a stalled clip did not give up: {msg}')
  await ctx.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await web(p, errs)
    await ext(p, errs)
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
