# 2.42, the feed's left column (David, 2026-09-30: sticky, useful, on paper).
#   1. Wide (1440): the controls are a column left of the list and stay in view as you scroll; the rail stays in view too,
#      its foot reachable when it is taller than the window. It never stuck before: stretched to the list's height.
#   2. Search narrows the list by take, quote, source or person, the kind counts follow it, a filter keeps it, and a search
#      with nothing found says so and clears.
#   3. Your tags are in the column (and not twice, in the rail too).
#   4. "Annotate something" with the extension says how; without it, the way to get it.
#   5. Narrower (1180): the controls are a bar under the list's heading, above the first card.
#   6. A phone: heading, controls, cards, rail, in one column, no sideways scroll.
#   7. A profile has the column too, without For you, Following and Everyone.
import asyncio, json
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W
B = 'https://annotated-app.netlify.app'
BOX = "(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) }; }"
async def ctx(b, w, h, signed=True, installed=False):
  c = await b.new_context(viewport={'width': w, 'height': h})
  s = "try{sessionStorage.setItem('annotated-example-shown','1');" + (f"localStorage.setItem('annotated-auth', {json.dumps(json.dumps(W.SESSION))});" if signed else '') + "}catch(e){}"
  if installed: s += "document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.annotatedInstalled = '1'; });"
  await c.add_init_script(s)
  await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
  return c
async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await ctx(b, 1440, 700)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(3.5)
    side, main, rail = await pg.evaluate(BOX, '.lside'), await pg.evaluate(BOX, '.sitemain'), await pg.evaluate(BOX, '.rail')
    print('1. at the top: side', side, 'list', main, 'rail', rail)
    if not side or side['r'] > main['l']: errs.append(f'the controls are not a column left of the list: {side} {main}')
    await pg.evaluate('scrollTo(0, 700)'); await asyncio.sleep(.6)
    side2, rail2 = await pg.evaluate(BOX, '.lside'), await pg.evaluate(BOX, '.rail')
    print('   scrolled: side', side2, 'rail', rail2)
    if not (60 <= side2['t'] <= 100): errs.append(f'the controls did not stay in view: {side2}')
    if rail2['b'] < 200 or rail2['t'] > 100 or rail2['b'] > 700 + 2: errs.append(f'the rail did not stay in view with its foot reachable: {rail2}')
    tags = await pg.evaluate("({ side: document.querySelectorAll('.lside .railTag').length, railShown: [...document.querySelectorAll('.rail .railTagsCard')].some((x) => x.offsetParent) })")
    print('3. your tags:', tags)
    if not tags['side'] or tags['railShown']: errs.append(f'your tags are not in the column once: {tags}')
    # 2. Search.
    n0 = await pg.evaluate("document.querySelectorAll('.cards .card.mf').length")
    await pg.fill('.lsQ', 'overnight buses'); await asyncio.sleep(.6)
    got = await pg.evaluate("({ takes: [...document.querySelectorAll('.cards .ctake')].map((x) => x.textContent), all: document.querySelector('.feedFilter input[value=all] + span').textContent })")
    print('2. search "overnight buses":', got, 'of', n0)
    if not got['takes'] or len(got['takes']) >= n0: errs.append(f'search did not narrow the list: {got}')
    if str(len(got['takes'])) not in got['all']: errs.append(f'the counts did not follow the search: {got}')
    await pg.click('.feedFilter input[value=article]', force=True); await asyncio.sleep(.4)
    kept = await pg.evaluate("document.querySelector('.lsQ').value")
    if kept != 'overnight buses': errs.append(f'choosing a kind lost the search: {kept!r}')
    await pg.click('.feedFilter input[value=all]', force=True); await asyncio.sleep(.3)
    await pg.fill('.lsQ', 'nothing like this at all'); await asyncio.sleep(.6)
    none = await pg.evaluate("document.querySelector('.cards').innerText")
    print('   nothing found:', none.replace('\n', ' | ')[:90])
    if 'Nothing matches' not in none: errs.append('a search with nothing found did not say so')
    await pg.click('.esClearQ'); await asyncio.sleep(.4)
    back = await pg.evaluate("({ n: document.querySelectorAll('.cards .card.mf').length, q: document.querySelector('.lsQ').value })")
    if back['n'] != n0 or back['q']: errs.append(f'Clear the search did not bring the list back: {back}')
    # 4. Without the extension.
    web = await pg.evaluate("({ get: !!document.querySelector('.lsGet')?.offsetParent, have: !!document.querySelector('.lsHave')?.offsetParent })")
    print('4. without the extension:', web)
    if not web['get'] or web['have']: errs.append(f'without the extension the column did not offer to get it: {web}')
    await c.close()
    c = await ctx(b, 1440, 900, installed=True)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(3.5)
    await pg.click('.lsHave'); await asyncio.sleep(.3)
    ins = await pg.evaluate("({ get: !!document.querySelector('.lsGet')?.offsetParent, tip: document.querySelector('.lsTip').offsetParent ? document.querySelector('.lsTip').textContent : '' })")
    print('   with it:', ins)
    if ins['get'] or 'toolbar' not in ins['tip']: errs.append(f'with the extension, Annotate something did not say how: {ins}')
    await c.close()
    # 5. Narrower.
    c = await ctx(b, 1180, 900)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(3.5)
    head, side, card = await pg.evaluate(BOX, '.feedHead'), await pg.evaluate(BOX, '.lside'), await pg.evaluate(BOX, '.cards .card.mf')
    print('5. at 1180: heading', head, 'bar', side, 'first card', card)
    if not (head['b'] <= side['t'] + 2 and side['b'] <= card['t'] + 2): errs.append(f'the bar is not between the heading and the list: {head} {side} {card}')
    await c.close()
    # 6. A phone.
    c = await ctx(b, 390, 844)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(3.5)
    ph = await pg.evaluate("(() => { const t = (s) => Math.round(document.querySelector(s).getBoundingClientRect().top); return { head: t('.feedHead'), side: t('.lside'), cards: t('.cards'), rail: t('.rail'), wide: document.documentElement.scrollWidth }; })()")
    print('6. phone:', ph)
    if not (ph['head'] < ph['side'] < ph['cards'] < ph['rail']) or ph['wide'] > 390: errs.append(f'the phone layout is off: {ph}')
    await c.close()
    # 7. A profile.
    c = await ctx(b, 1440, 900)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/@sawyer?noplanes'); await asyncio.sleep(3.5)
    pr = await pg.evaluate("({ side: !!document.querySelector('.lside'), tabs: !!document.querySelector('.lside .feedTabs'), kinds: !!document.querySelector('.lside .feedFilter') })")
    print('7. profile:', pr)
    if pr != {'side': True, 'tabs': False, 'kinds': True}: errs.append(f'the profile column is off: {pr}')
    await c.close(); await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())