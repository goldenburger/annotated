# The recording of 2026-09-25 at 20:19 (walk2019.py is the one of 2026-09-24).
#   1. The paper decorations come in many versions: piles, corners, trails and empty-list drawings differ from one
#      call to the next, and a full page's margins are not the same on every visit.
#   2. The examples under What else it does each open in their own way, and in flight no plane is wider than its
#      card or cut off by the window's edge.
#   3. The loading outline is visible (grey lines on a sheet), and its avatar is a light placeholder.
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
WATCH = """(() => { window.__fl = []; const orig = Fold.arrive; Fold.arrive = function (el, o) {
  const rec = { card: Math.round(el.getBoundingClientRect().width), max: 0, cut: 0, unfold: o && o.unfold, demo: el.classList.contains('ftDemo') }; window.__fl.push(rec);
  const tick = () => { let l = 1e9, t = 1e9, R = -1e9, B = -1e9, n = 0;
    document.querySelectorAll('.pl-layer .pl-carrier:not([data-phase=open]) .pl-leaf').forEach((x) => { const b = x.getBoundingClientRect(); if (!b.width) return; n++; l = Math.min(l, b.left); t = Math.min(t, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom); });
    if (n) { rec.max = Math.max(rec.max, Math.round(Math.max(R - l, B - t))); if (R > innerWidth + 2 || l < -2) rec.cut = 1; }
    if (!rec.done) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return orig.call(this, el, o).then((v) => { rec.done = true; return v; }); }; })()"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1530, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 1.
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1.5)
    v = await pg.evaluate("""(() => { const n = (f) => new Set(Array.from({ length: 12 }, f)).size;
      return { pile: n(() => PaperDeco.ART.pile()), corner: n(() => PaperDeco.ART.corner()), trail: n(() => PaperDeco.ART.trail()), empty: n(() => PaperDeco.emptyArt()), kinds: Object.keys(PaperDeco.ART).length }; })()""")
    print('1. different drawings in 12 calls:', v)
    if v['pile'] < 6 or v['corner'] < 3 or v['trail'] < 3 or v['empty'] < 3 or v['kinds'] < 10: errs.append(f'the decorations do not vary enough: {v}')
    desks = set()
    for _ in range(5):
      await pg.goto(URL + '?feed'); await asyncio.sleep(1.2)
      desks.add(await pg.evaluate("(() => { const d = document.querySelector('.pdDesk'); return d ? [...d.children].map((x) => x.className + (x.style.getPropertyValue('--pdy') || '')).join('|') : ''; })()"))
    print('   different desks in 5 visits:', len(desks))
    if len(desks) < 3: errs.append(f'the margins look the same visit after visit: {len(desks)}')
    # 3.
    boot = await pg.evaluate("""(() => { const d = document.createElement('div'); d.innerHTML = '<div class="bootSkel"><div class="bootMain"><span class="bootLine w40"></span></div></div><div class="skel"><span class="avatar xs"></span></div>'; document.body.appendChild(d);
      const r = { line: getComputedStyle(d.querySelector('.bootLine')).backgroundColor, sheet: getComputedStyle(d.querySelector('.bootMain')).borderTopStyle, avatar: getComputedStyle(d.querySelector('.skel .avatar')).backgroundColor, page: getComputedStyle(document.body).backgroundColor }; d.remove(); return r; })()""")
    print('3. the loading outline:', boot)
    if boot['line'] == boot['page'] or boot['sheet'] != 'solid': errs.append(f'the loading outline cannot be seen: {boot}')
    if boot['avatar'] in ('rgb(28, 36, 51)', 'rgb(22, 24, 29)'): errs.append(f"the outline's avatar is a dark dot: {boot['avatar']}")
    await c.close()
    # 2.
    c = await b.new_context(viewport={'width': 1530, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?planes'); await asyncio.sleep(5)
    await pg.evaluate(WATCH)
    for i in range(1, 4):
      await pg.evaluate(f"document.querySelectorAll('.ftDemo')[{i}].scrollIntoView({{block:'center'}}); window.dispatchEvent(new Event('scroll'))")
      await asyncio.sleep(3.6)
    fl = [r for r in await pg.evaluate("window.__fl") if r['demo']]
    print('2. flights:', fl)
    if len(fl) < 3: errs.append(f'the examples did not fly in: {fl}')
    if len(set(r['unfold'] for r in fl)) < len(fl): errs.append(f'two examples opened the same way: {[r["unfold"] for r in fl]}')
    for r in fl:
      if r['max'] > r['card'] or r['cut']: errs.append(f'a plane was wider than its card or cut by the edge: {r}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
