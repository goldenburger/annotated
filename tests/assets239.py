# Real paper and CC0 art (2.39.0).
#   1. Every scan, doodle and face the styles and scripts name is there and is an image.
#   2. An empty list shows someone reading, drawn with both its masks, and a second empty list shows a different one.
#   3. The made-up example readers have faces; real people's posts keep their initial.
#   4. A coffee ring and a pencil smudge draw, and differ from one call to the next.
#   5. Sheets use the scanned grain and wrinkles, and the In Chrome tape is the scan.
import asyncio, os
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site

PUB = os.path.join(ROOT, 'website', 'public')
FILES = ['paper/scan-l.png', 'paper/scan-d.png', 'paper/wrinkle2.png', 'paper/tape.png', 'paper/desk-l.jpg', 'paper/desk-d.jpg',
         'peeps/sam.svg', 'peeps/priya.svg', 'peeps/leo.svg'] + [f'doodles/{k}-{m}.svg' for k in ('chair', 'floor', 'phone', 'book') for m in ('ink', 'hi')]

async def main():
  errs = []
  for f in FILES:
    for base in ([PUB] if f.startswith('peeps/') else [PUB, os.path.join(ROOT, 'extension')]):
      p = os.path.join(base, f)
      if not os.path.exists(p) or os.path.getsize(p) < 200: errs.append(f'missing or empty: {p}')
  print('1. files checked:', len(FILES))
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1600, 'height': 1000})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    bad = []
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 and any(k in r.url for k in ('/paper/', '/doodles/', '/peeps/')) else None)
    await pg.goto('https://annotated-app.netlify.app/?feed'); await pg.wait_for_selector('.pdDoodle', timeout=8000); await asyncio.sleep(1)
    dd = await pg.evaluate("""(() => { const d = document.querySelector('.pdDoodle'), r = d.getBoundingClientRect();
      const m = (pe) => getComputedStyle(d, pe).maskImage || getComputedStyle(d, pe).webkitMaskImage;
      return { w: Math.round(r.width), h: Math.round(r.height), hi: m('::before'), ink: m('::after'), kind: d.className,
        again: [PaperDeco.doodle(), PaperDeco.doodle(), PaperDeco.doodle()] }; })()""")
    print('2. the empty feed draws', dd['kind'], dd['w'], 'x', dd['h'])
    if dd['w'] < 40 or dd['h'] < 40: errs.append(f'the doodle has no size: {dd}')
    if 'doodles/' not in (dd['hi'] or '') or 'doodles/' not in (dd['ink'] or ''): errs.append(f'the doodle lacks a mask: {dd}')
    a = dd['again']
    if a[0] == a[1] or a[1] == a[2]: errs.append(f'the same doodle twice in a row: {a}')
    await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2.5)
    await pg.evaluate("document.querySelector('.ftAv.ftFace').scrollIntoView()"); await asyncio.sleep(1.5)
    faces = await pg.evaluate("""(() => ({ faces: [...document.querySelectorAll('.ftAv.ftFace img')].map((i) => [i.getAttribute('src'), i.naturalWidth]),
      initials: [...document.querySelectorAll('.ftRHead .ftAv')].filter((a) => !a.querySelector('img') && a.textContent.trim().length === 1).length }))()""")
    print('3. faces', faces['faces'], '| real posts with an initial', faces['initials'])
    if len(faces['faces']) != 3 or any(w == 0 for _, w in faces['faces']): errs.append(f'the readers lack faces: {faces}')
    if not faces['initials']: errs.append('the real posts lost their initials')
    stains = await pg.evaluate("""(() => { const r1 = PaperDeco.ART.ring(), r2 = PaperDeco.ART.ring(), s1 = PaperDeco.ART.smudge(), s2 = PaperDeco.ART.smudge();
      const n = (h, sel) => { const d = document.createElement('div'); d.innerHTML = h; return d.querySelectorAll(sel).length; };
      return { ring: n(r1, '.pdRingEdge'), smudge: n(s1, '.pdLead'), differ: r1 !== r2 && s1 !== s2 }; })()""")
    print('4. stains', stains)
    if stains['ring'] < 2 or stains['smudge'] < 5 or not stains['differ']: errs.append(f'the stains did not draw: {stains}')
    paper = await pg.evaluate("""(() => { const s = getComputedStyle(document.documentElement);
      const f = document.querySelector('.lcFrame'); return { grain: s.getPropertyValue('--grain-light'), wrinkle: s.getPropertyValue('--wrinkle'),
        tape: f ? getComputedStyle(f, '::before').backgroundImage : 'none' }; })()""")
    print('5. paper', paper)
    if 'scan-l.png' not in paper['grain'] or 'wrinkle2.png' not in paper['wrinkle']: errs.append(f'the sheets do not use the scans: {paper}')
    if 'tape.png' not in paper['tape']: errs.append(f'the tape is not the scan: {paper["tape"]}')
    await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await asyncio.sleep(1.5)
    if bad: errs.append(f'assets failed to load: {bad}')
    await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
