# The dark mode pass of 2026-09-30. On a dark page:
#   1. The wordmark's swipe covers its letters (it was 84% of the word, and the tops of the dark letters vanished).
#   2. A Features example's quote is marked the full height of its letters (the same, on small serif quotes).
#   3. The clip, podcast and post tabs' bars keep the paper's dark ink (they took the page's light ink, faint on cream).
#   4. The brief's bar, which sits on the dark page, keeps light ink.
#   5. The loading outline's bars are dark, not cream.
import asyncio
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W
B = 'https://annotated-app.netlify.app'
LUM = "(c) => { const m = c.match(/\\d+(\\.\\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }"
async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(3)
    wm = await pg.evaluate("(() => { const w = document.querySelector('.landBar .wmWord'), s = w.querySelector('svg').getBoundingClientRect(), t = w.querySelector('span').getBoundingClientRect(); return { svgTop: Math.round(s.top), svgBottom: Math.round(s.bottom), textTop: Math.round(t.top), textBottom: Math.round(t.bottom) }; })()")
    print('1. wordmark:', wm)
    if wm['svgTop'] > wm['textTop'] + 2 or wm['svgBottom'] < wm['textBottom'] - 2: errs.append(f'the wordmark swipe does not cover its letters: {wm}')
    mk = await pg.evaluate("(() => { const m = document.querySelector('.ftDemo mark'); return m ? getComputedStyle(m).backgroundImage : null; })()")
    print('2. Features mark background image:', mk)
    if mk and 'gradient' in mk: errs.append(f'a Features quote is still marked by a band shorter than its letters: {mk}')
    bar = await pg.evaluate("(() => { const s = document.querySelector('.tiBar .tiHint, .tiBar p, .tiBar span'); return s ? getComputedStyle(s).color : null; })()")
    for t in ('YouTube clip', 'Podcast', 'Post on X'):
      await pg.click(f'.tryTab:has-text("{t}")'); await asyncio.sleep(1.2)
      ink = await pg.evaluate("(() => { const p = [...document.querySelectorAll('.tryPanel')].find((x) => !x.hidden); const h = p && p.querySelector('.stBar .stHint, .stBar p'); return h ? getComputedStyle(h).color : null; })()")
      lum = await pg.evaluate(f"({LUM})({ink!r})") if ink else None
      print(f'3. {t} bar ink:', ink, lum)
      if lum is None or lum > .5: errs.append(f'the {t} tab bar has light ink on its paper: {ink}')
    if bar:
      bl = await pg.evaluate(f"({LUM})({bar!r})")
      print('4. brief bar ink:', bar, bl)
      if bl < .5: errs.append(f'the brief bar, on the dark page, lost its light ink: {bar}')
    await c.close()
    c = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    async def slow(route): await asyncio.sleep(6); await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', slow)
    pg = await c.new_page(); await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(1.2)
    sk = await pg.evaluate("(() => { const i = document.querySelector('.skel i'); return i ? getComputedStyle(i).backgroundImage : null; })()")
    print('5. loading outline:', (sk or '')[:90])
    if not sk or '239, 235, 223' in sk or '#EFEBDF' in sk.upper(): errs.append(f'the loading outline is cream in dark mode: {sk}')
    await b.close()
  print('errors:', errs)
asyncio.run(main())