# The paper drawings answer the pointer, subtly (2.38.7): a plane lifts, noses up and edges forward while its shadow stays
# and fades; a sheet lifts a hair; a crumpled ball rolls a little. Each piece of a pile on its own.
#   1. On the feed, hovering the right margin's plane lifts it and fades its shadow, and moving away puts it back.
#   2. The desk's empty space still lets the pointer through to the page.
#   3. With reduced motion nothing moves.
#   4. /paper.html marks planes, sheets and balls as such, and a pile's pieces separately.
import asyncio, os
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')

STATE = """() => { const p = document.querySelector('.pdDesk .pdR .pdPiece'); if (!p) return null;
  const l = p.querySelector(':scope > .pdLift'), f = p.querySelector(':scope > .pdFlat');
  return { lift: getComputedStyle(l).transform, shadow: f ? getComputedStyle(f).opacity : null, kind: p.getAttribute('class') }; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    for reduced in (False, True):
      c = await b.new_context(viewport={'width': 2000, 'height': 900}, reduced_motion='reduce' if reduced else 'no-preference')
      await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
      pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
      await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.pdDesk .pdR .pdPiece'); await asyncio.sleep(1)
      box = await pg.evaluate("(() => { const r = document.querySelector('.pdDesk .pdR .pdPiece').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
      await pg.mouse.move(10, 450); await asyncio.sleep(.3)
      rest = await pg.evaluate(STATE)
      await pg.mouse.move(box[0], box[1]); await asyncio.sleep(.9)
      over = await pg.evaluate(STATE)
      if not reduced: await pg.screenshot(path=os.path.join(OUT, 'pdhover.png'), clip={'x': box[0] - 110, 'y': box[1] - 90, 'width': 220, 'height': 180})
      await pg.mouse.move(10, 450); await asyncio.sleep(.9)
      back = await pg.evaluate(STATE)
      label = 'reduced motion' if reduced else 'motion'
      print(f'1. {label}: at rest {rest} | hovered {over} | after {back}')
      if not reduced:
        if over['lift'] in ('none', rest['lift']) or float(over['shadow'] or 1) >= 1: errs.append(f'hovering the plane did not lift it: {over}')
        if back['lift'] != rest['lift']: errs.append(f'the plane did not settle back: {back}')
        # 2. Empty desk space, well away from any drawing, is the page underneath.
        under = await pg.evaluate("(() => { const e = document.elementFromPoint(innerWidth - 20, innerHeight - 20); return e ? (e.closest('.pdDesk') ? 'desk' : e.tagName) : null; })()")
        print('2. empty desk space under the pointer is:', under)
        if under == 'desk': errs.append('the desk layer caught the pointer in empty space')
      elif over['lift'] != rest['lift']: errs.append(f'with reduced motion the plane moved: {over}')
      await c.close()
    # 4.
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page()
    await pg.goto('https://annotated-app.netlify.app/paper.html?noplanes'); await asyncio.sleep(2)
    kinds = await pg.evaluate("""() => { const k = (sel) => document.querySelectorAll(`.ppArt[data-k="${sel}"] .pdPiece`).length;
      const cls = (sel) => [...new Set([...document.querySelectorAll(`.ppArt[data-k="${sel}"] .pdPiece`)].map((e) => e.getAttribute('class').split(' ')[1]))];
      return { dart: cls('dart'), sheet: cls('sheet'), ball: cls('ball'), pairPieces: k('pair'), pilePieces: k('pile') }; }""")
    print('4. marked:', kinds)
    if kinds['dart'] != ['pdIsPlane'] or kinds['sheet'] != ['pdIsPaper'] or kinds['ball'] != ['pdIsBall']: errs.append(f'pieces are not marked by kind: {kinds}')
    if kinds['pairPieces'] != 2: errs.append(f"a pair's planes are not two pieces: {kinds['pairPieces']}")
    await b.close()
  print('errors:', errs)

asyncio.run(main())
