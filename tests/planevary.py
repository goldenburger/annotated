# The paper planes on a page are never the same plane twice, and they change from visit to visit (David, 2026-09-29:
# the same swallow top right and bottom left of the feed). PaperDeco.choose leaves out a plane already on the page and
# favours those this browser has not shown lately.
#   1. On the feed, across twenty visits, no plane shows in two places on one page (the Feed heading, the margins, the
#      panel corner or anything else carrying data-pd-shape).
#   2. Over those visits the right margin shows at least seven different planes and never the same one twice running.
#   3. /paper.html still draws each named plane exactly as asked, repeats and all.
import asyncio, collections
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db

SHAPES = """() => [...document.querySelectorAll('.pd, .pdDesk > *, .pdEmpty, .paperDeco')].filter((c) => !c.parentElement.closest('.pd, .pdEmpty, .pdDesk > *'))
  .map((c) => ({ where: (c.className.baseVal ?? c.className) + '', shapes: [...new Set([...c.querySelectorAll('[data-pd-shape]')].map((e) => e.dataset.pdShape))] }))
  .filter((x) => x.shapes.length)"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1500, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    rights, heads, dupes = [], [], []
    for i in range(20):
      await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.pdDesk .pdR', timeout=15000); await asyncio.sleep(.6)
      found = await pg.evaluate(SHAPES)
      # By family: a dart beside a banking plane reads as the same plane twice (2.38.6).
      FAM = {'dart': 'dart', 'banking': 'dart', 'landed': 'dart', 'lock': 'dart', 'glider': 'long', 'needle': 'long'}
      count = collections.Counter(FAM.get(s, s) for f in found for s in set(f['shapes']))
      twice = [k for k, n in count.items() if n > 1]
      if twice: dupes.append((i, twice, found))
      right = await pg.evaluate("[...new Set([...document.querySelectorAll('.pdDesk .pdR [data-pd-shape]')].map((e) => e.dataset.pdShape))].join('+')")
      rights.append(right)
      heads.append(await pg.evaluate("[...new Set([...document.querySelectorAll('.pd-feedTop [data-pd-shape]')].map((e) => e.dataset.pdShape))].join('+')"))
    print('1. pages with a plane twice:', len(dupes), dupes[:2])
    print('2. right margin over 20 visits:', rights)
    if dupes: errs.append(f'{len(dupes)} of 20 pages showed one plane in two places')
    if len(set(rights)) < 7: errs.append(f'the right margin showed only {len(set(rights))} different planes in 20 visits')
    print('   Feed heading over 20 visits:', heads)
    if len(set(heads)) < 6: errs.append(f'the Feed heading showed only {len(set(heads))} different planes')
    if any(heads[i] == heads[i - 1] for i in range(1, len(heads))): errs.append('the Feed heading showed the same plane twice running')
    running = [rights[i] for i in range(1, len(rights)) if rights[i] == rights[i - 1]]
    if running: errs.append(f'the right margin showed the same plane twice running: {running}')
    seen = await pg.evaluate("JSON.parse(localStorage.getItem('annotated-pd-seen') || '[]')")
    print('   remembered as shown lately:', seen[-8:])
    # 3.
    await pg.goto('https://annotated-app.netlify.app/paper.html?noplanes'); await asyncio.sleep(2)
    got = await pg.evaluate("""() => [...document.querySelectorAll('.ppArt')].map((b) => [b.dataset.k, [...new Set([...b.querySelectorAll('[data-pd-shape]')].map((e) => e.dataset.pdShape))].join('+')])""")
    wrong = [(k, s) for k, s in got if k in ('dart', 'glider', 'swallow', 'stunt', 'lock', 'banking', 'needle', 'hammer', 'topDown', 'headOn', 'pair', 'landed') and s != k]
    print('3. gallery planes drawn as named:', not wrong, wrong)
    if wrong: errs.append(f'the gallery drew other planes than asked: {wrong}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
