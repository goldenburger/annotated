# The recording of 2026-09-25 at 21:28.
#   1. The loading outline's plane flies nose first along a path and lands: it ends still, level, on the outline,
#      not sliding sideways off the far edge.
#   2. However a plane opens (classic, cascade, snap, flutter, spin), it never grows large while it is still folded:
#      while its halves are more than 60 degrees from open, it is at most a third of the way to full size.
#   3. The empty feed's "Get the extension to publish one" is hidden once the extension has marked the page.
#   4. The redrawn paper: the crumpled balls are all different, and nothing draws NaN or undefined.
import asyncio, pathlib, mimetypes, math
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
OPEN = """async (style) => {
  const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:200px;top:200px;width:600px;height:400px;background:#fff;border:1px solid #ccc';
  d.innerHTML = '<p style="padding:20px">A card</p>'; document.body.appendChild(d);
  const plane = Fold.buildPlane(d, { s0: .3 });
  const sheet = plane.sheet || document.querySelector('.pl-layer .pl-sheet');
  let worst = 0;
  const run = plane.open(1200, false, style);
  // The two halves: the pieces whose opening turns about the plane's centre line, rotate3d(1, 0, 0, ...).
  const halves = document.getAnimations().filter((a) => a.effect && a.effect.getKeyframes().some((k) => /rotate3d\(1, 0, 0/.test(k.transform || ''))).map((a) => a.effect.target);
  const t0 = performance.now();
  await new Promise((res) => { const tick = () => {
    const m = new DOMMatrix(getComputedStyle(sheet).transform); const scale = Math.hypot(m.m11, m.m12, m.m13);
    let closed = 0;
    halves.forEach((h) => { const t = getComputedStyle(h).transform; if (!t || t === 'none') return; const hm = new DOMMatrix(t); const ang = Math.acos(Math.max(-1, Math.min(1, hm.m22))) * 180 / Math.PI; closed = Math.max(closed, ang); });
    if (closed > 60) worst = Math.max(worst, (scale - .3) / .7);
    if (performance.now() - t0 < 1900) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  await run; document.querySelectorAll('.pl-layer').forEach((x) => x.remove()); d.remove();
  return Math.round(worst * 100) / 100; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1.2)
    # 2.
    for style in ['classic', 'cascade', 'snap', 'flutter', 'spin']:
      w = await pg.evaluate(OPEN, style)
      print(f'2. {style}: largest while folded = {w} of the way to full size')
      if w > .34: errs.append(f'{style}: the plane grew to {w} of full size while still folded')
    # 4.
    r = await pg.evaluate("""(() => { const balls = new Set(Array.from({ length: 10 }, () => PaperDeco.ART.ball())); let bad = 0;
      for (let i = 0; i < 20; i++) for (const k in PaperDeco.ART) if (/NaN|undefined/.test(PaperDeco.ART[k]())) bad++;
      return { balls: balls.size, bad }; })()""")
    print('4.', r)
    if r['balls'] < 10 or r['bad']: errs.append(f'the paper drawings repeat or draw badly: {r}')
    # 1.
    await pg.evaluate("""document.getElementById('page').innerHTML = '<div class="skel"><div class="skelBody"><div class="skelCol"><i class="sk1"></i><i class="sk2"></i></div></div></div>'""")
    await asyncio.sleep(.3)
    mid = await pg.evaluate("getComputedStyle(document.querySelector('.skelCol'), '::before').offsetDistance")
    await asyncio.sleep(2.4)
    end = await pg.evaluate("""(() => { const s = getComputedStyle(document.querySelector('.skelCol'), '::before'); return { dist: s.offsetDistance, path: s.offsetPath, rotate: s.offsetRotate, anim: s.animationIterationCount }; })()""")
    print('1. the loading plane mid flight', mid, '| at the end', end)
    if end['dist'] != '100%' or 'path(' not in end['path'] or end['anim'] == 'infinite' or 'auto' not in end['rotate']: errs.append(f'the loading plane does not fly nose first and land: {end}')
    # 3.
    await pg.goto(URL + '?feed'); await asyncio.sleep(2)
    before = await pg.evaluate("(() => { const m = document.querySelector('.esMake'); return m ? getComputedStyle(m).display : null; })()")
    await pg.evaluate("document.documentElement.dataset.annotatedInstalled = '1'"); await asyncio.sleep(.2)
    after = await pg.evaluate("(() => { const m = document.querySelector('.esMake'); return m ? getComputedStyle(m).display : null; })()")
    print('3. the install offer before and after the mark:', before, after)
    if before in (None, 'none') or after != 'none': errs.append(f'the install offer did not follow the mark: {before} {after}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
