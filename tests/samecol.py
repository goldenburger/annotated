# 2.42.6, one left column everywhere (David's recording of 2026-10-02 at 06:04: "this search should be up", "you have
# inconsistencies", "This left side window is how all the other left windows should look"). The feed's column is the
# reference: search, Yours, Which annotations with Sort (Newest, Most discussed, Top picks), Show with counts, Your
# tags, the button. Every page that has the column has those, in that order. Top picks from a profile opens the
# feed's For you in that order.
import asyncio, json
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W
B = 'https://annotated-app.netlify.app'
SIG = r"""(() => { const s = document.querySelector('.lside'); if (!s) return null;
  return [...s.querySelectorAll('.lsFind, .lsYours, .feedTabs, .feedSort, .feedFilter, .lsTags h2, .lsMake')].filter((e) => e.offsetParent).map((e) =>
    e.classList.contains('lsFind') ? 'search' : e.classList.contains('lsYours') ? 'yours' : e.classList.contains('lsMake') ? 'button' : e.tagName === 'H2' ? 'tags'
    : e.getAttribute('aria-label') + ':' + [...e.querySelectorAll('label')].map((l) => l.innerText.replace(/\s+\d+$/, '').replace(/\s+/g, ' ').trim()).join('/')); })()"""
WANT = ['search', 'yours', 'Which annotations:For you/Following/Everyone', 'Sort:Newest/Most discussed/Top picks', 'Show:All/Clips/Audio/Passages/Posts', 'tags', 'button']
async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 1000})
    await c.add_init_script(f"try{{localStorage.setItem('annotated-auth', {json.dumps(json.dumps(W.SESSION))});}}catch(e){{}}")
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    for name, path in (('feed', '/?feed&noplanes'), ('activity', '/?activity'), ('profile', '/@davidw?noplanes'), ('tag', '/?tag=Explainer&noplanes'), ('annotation', f'/@sawyer/{W.A_SAW["id"]}?noplanes')):
      await pg.goto(B + path); await asyncio.sleep(4)
      got = await pg.evaluate(SIG)
      print(name, got)
      if got != WANT: errs.append(f'the {name} column differs from the feed\'s: {got}')
    await pg.goto(B + '/@davidw?noplanes'); await asyncio.sleep(3.5)
    await pg.evaluate("document.querySelector('.feedSort input[value=best]').click()"); await asyncio.sleep(3.5)
    bf = await pg.evaluate("({ url: location.search, tab: (document.querySelector('.feedTabs input:checked') || {}).value, sort: (document.querySelector('.feedSort input:checked') || {}).value })")
    print('Top picks from a profile:', bf)
    if 'feed' not in bf['url'] or bf['tab'] != 'foryou' or bf['sort'] != 'best': errs.append(f'Top picks from a profile did not open For you ranked: {bf}')
    await b.close()
  print('errors:', errs)
asyncio.run(main())