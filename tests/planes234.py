# More ways to fold, unfold and fly (2.34.0, David: "more flying animations", "more different animations of paper
# folding into an airplane", "unfolding animations").
#   1. Every way of opening (ten) runs to the end and leaves the card shown where it belongs, with no errors.
#   2. Every way of folding (the five Publish uses) and every way of leaving (five routes) runs, the card folds,
#      flies out and is gone, and nothing is left behind on the page.
#   3. The drawings (the new planes and the new paper) draw in light and dark with no errors.
import asyncio, sys
from playwright.async_api import async_playwright
from _env import *
sys.path.insert(0, '.')
from features234 import site, SUPA
OPENS = ['classic', 'cascade', 'snap', 'flutter', 'spin', 'drift', 'bounce', 'peel', 'tumble', 'float']
KEYS = ['swallow', 'stunt', 'lock', 'banking', 'creased', 'smoothed', 'loose', 'ball', 'lone', 'corner', 'pile']
CARD = """() => { document.body.innerHTML = '<div style="padding:260px 200px"><article class="annCard" id="c" style="width:420px;padding:22px"><p class="take" style="font:500 22px var(--serif)">A take that folds.</p><p>Some words under it, as on a card.</p></article></div>'; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    pg = await b.new_page(viewport={'width': 1100, 'height': 800})
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.route('https://annotated-app.netlify.app/**', site)
    await pg.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await pg.goto('https://annotated-app.netlify.app/?feed&planes'); await asyncio.sleep(2)
    if not await pg.evaluate('Fold.on()'): errs.append('the planes are off in this test')

    for u in OPENS:
      await pg.evaluate(CARD)
      await pg.evaluate("(u) => { window.__done = false; Fold.arrive(document.getElementById('c'), { unfold: u, T: 700, openT: 900, z0: 60 }).then(() => { window.__done = true; }); }", u)
      await asyncio.sleep(1.05)
      if u in ('drift', 'peel', 'tumble', 'bounce'): await pg.screenshot(path=f'open_{u}.png')
      await asyncio.sleep(2.4)
      st = await pg.evaluate("({ done: window.__done, hidden: document.getElementById('c').classList.contains('pl-hidden'), layers: document.querySelectorAll('.pl-layer').length })")
      print(f'open {u:8}', st)
      if not st['done'] or st['hidden'] or st['layers']: errs.append(f'opening "{u}" did not finish cleanly: {st}')

    for fold in ['classic', 'cascade', 'peel', 'snap', 'tumble']:
      for route in ['climb', 'loop', 'sweep', 'zip', 'glide']:
        await pg.evaluate(CARD)
        await pg.evaluate("([f, r]) => { window.__gone = false; Fold.away(document.getElementById('c'), { fold: f, route: r }).then(() => { window.__gone = true; }); }", [fold, route])
        if fold == 'classic' and route in ('loop', 'sweep'):
          await asyncio.sleep(1.2); await pg.screenshot(path=f'away_{route}.png'); await asyncio.sleep(2.2)
        else:
          await asyncio.sleep(3.4)
        st = await pg.evaluate("({ gone: window.__gone, layers: document.querySelectorAll('.pl-layer').length })")
        if not st['gone'] or st['layers']: errs.append(f'folding "{fold}" and leaving by "{route}" did not finish cleanly: {st}')
    print('folds x routes: 25 run')

    for scheme in ('light', 'dark'):
      await pg.emulate_media(color_scheme=scheme)
      bad = await pg.evaluate("(keys) => keys.filter((k) => { try { const h = PaperDeco.ART[k](); return !/<svg/.test(h) || /NaN|undefined/.test(h); } catch (e) { return true; } })", KEYS)
      print(scheme, 'drawings with a problem:', bad)
      if bad: errs.append(f'these drawings failed in {scheme}: {bad}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
