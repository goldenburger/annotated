# The home page's sections slide rather than jump while a take is made (recording of 2026-09-29 at 16:31: Annotate
# opened the take box and everything below jumped 200 pixels in one frame, and Yours so far vanished and came back).
# The top of In Chrome is read every frame through select, Annotate, write, Make the annotation, and the card landing.
# A jump is a move of more than 40 pixels between two frames that stays; a reading the same frame puts right before it
# is painted (the sampler runs before the page's ResizeObserver) is not one.
#   1. With the planes off and on, no jumps, and In Chrome ends where a slide would take it.
#   2. With reduced motion nothing slides, and Yours so far still appears with the card.
import asyncio
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db

SAMPLE = """() => { window.__y = []; const tick = () => { const e = document.querySelector('.landChrome');
  if (e) window.__y.push([Math.round(performance.now()), Math.round(e.getBoundingClientRect().top + scrollY)]); requestAnimationFrame(tick); }; tick(); }"""

# Frames drawn back to back (under 40 ms apart). Headless Edge draws with a software GPU that can stall for 200 ms while
# the paper's shadows move, and a slide across a stall arrives further on; that is the test machine, not a jump.
def jumps(samples):
  ys = [y for _, y in samples]
  # A reading taken before the page's ResizeObserver set the frame right is dropped when the next reading undoes it.
  keep = [i for i in range(len(ys)) if not (0 < i < len(ys) - 1 and abs(ys[i] - ys[i - 1]) > 40 and abs(ys[i + 1] - ys[i - 1]) < 5)]
  out = []
  for a, b in zip(keep, keep[1:]):
    if b != a + 1 and b != a + 2: continue
    if samples[b][0] - samples[a][0] < 40 and abs(ys[b] - ys[a]) > 40: out.append(ys[b] - ys[a])
  return out

async def flow(b, query, reduced=False):
  c = await b.new_context(viewport={'width': 1700, 'height': 1250}, reduced_motion='reduce' if reduced else 'no-preference')
  await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
  pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto('https://annotated-app.netlify.app/' + query); await asyncio.sleep(4)
  await pg.evaluate(SAMPLE)
  await pg.evaluate("""(() => { const n = document.querySelector('.tiText p').firstChild, t = n.nodeValue; const r = document.createRange();
    r.setStart(n, t.indexOf('quickly')); r.setEnd(n, t.indexOf('video') + 5); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
  await asyncio.sleep(1); await pg.click('.tiBtn'); await asyncio.sleep(2)
  await pg.fill('#tiInput', 'test'); await asyncio.sleep(.5)
  await pg.click('.tiMake'); await asyncio.sleep(7)
  ys = await pg.evaluate('window.__y')
  yours = await pg.evaluate("document.querySelectorAll('.landLatest .llRow > li').length")
  shown = await pg.evaluate("!document.querySelector('.landLatest').hidden")
  await c.close()
  return ys, jumps(ys), yours, shown, errs

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    for name, q in (('planes off', '?noplanes'), ('planes on', '?planes')):
      ys, j, yours, shown, pe = await flow(b, q)
      moved = sum(1 for a, c in zip(ys, ys[1:]) if a[1] != c[1])
      print(f'1. {name}: {len(ys)} frames, In Chrome moved in {moved}, from {ys[0][1]} to {ys[-1][1]}, jumps {j} | Yours so far shown {shown} with {yours}')
      if j: errs.append(f'{name}: the page below jumped {j}')
      if not shown or yours < 1: errs.append(f'{name}: Yours so far did not show the new card')
      errs += [f'{name}: {e}' for e in pe]
    ys, j, yours, shown, pe = await flow(b, '?noplanes', reduced=True)
    print(f'2. reduced motion: Yours so far shown {shown} with {yours}, errors {pe}')
    if not shown or yours < 1: errs.append('reduced motion: Yours so far did not show the new card')
    errs += [f'reduced: {e}' for e in pe]
    await b.close()
  print('errors:', errs)

if __name__ == "__main__": asyncio.run(main())
