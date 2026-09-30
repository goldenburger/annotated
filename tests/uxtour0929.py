# The UX tour of 2026-09-29 (about a hundred interactions with the site in light, dark and phone). Its fixes:
#   1. While words are chosen, the try-it's bar hides the ways to begin (Mark a sentence for me, Show me an example).
#   2. Annotate this, signed out, asks you to sign in rather than opening a box that cannot publish.
#   3. Your card counts all of yours beside someone else's profile (it said 0) and on a tag page (it said 1).
#   4. Nobody you muted is suggested under People worth following.
#   5. The menu's edit item says the minutes left on a line of its own.
#   6. A comment's reactions and Reply share one row.
#   7. Open Doodles: Activity signed out, Not found, and the install steps, where the drawing does not cover the steps.
#   8. The home page's header has the bell, with a dot when something is new.
import asyncio, json
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W
B = 'https://annotated-app.netlify.app'
async def ctx(b, signed, state=None):
  c = await b.new_context(viewport={'width': 1440, 'height': 900})
  await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1');" + (f"localStorage.setItem('annotated-auth', {json.dumps(json.dumps(W.SESSION))});" if signed else '') + "}catch(e){}")
  await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db(state if state is not None else {}))
  return c
async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await ctx(b, False); pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(2.5)
    await pg.evaluate("""(() => { const p = document.querySelector('.tiText p'); const n = p.firstChild, t = n.nodeValue; const r = document.createRange(); const i = t.indexOf('select'); r.setStart(n, Math.max(0,i)); r.setEnd(n, Math.min(t.length, i + 40)); getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); })()"""); await asyncio.sleep(1)
    links = await pg.evaluate("[...document.querySelectorAll('.tiBar .tiForMe, .tiBar .tiShowMe')].map((b) => !!b.offsetParent)")
    print('1. ways to begin shown while words are chosen:', links)
    if any(links): errs.append(f'the try-it bar still offers ways to begin: {links}')
    art = await pg.evaluate("""(() => { const g = document.querySelector('#get'), a = g.querySelector('.giArt .pdDoodle'); if (!a) return null; const ar = a.getBoundingClientRect();
      const hit = [...g.querySelectorAll('.giSteps li span, .giSteps li b')].some((s) => { const r = s.getBoundingClientRect(); return !(r.right < ar.left || r.left > ar.right || r.bottom < ar.top || r.top > ar.bottom); });
      return { w: Math.round(ar.width), hit }; })()""")
    print('7. install doodle:', art)
    if not art or art['w'] < 40 or art['hit']: errs.append(f'the install doodle is missing or covers the steps: {art}')
    await pg.goto(f'{B}/@nobody/nothing'); await asyncio.sleep(2.5)
    nf = await pg.evaluate("!!document.querySelector('.shellEmpty .pdDd-sit')")
    await pg.goto(f'{B}/?activity'); await asyncio.sleep(2.5)
    ao = await pg.evaluate("!!document.querySelector('.activity .pdDd-phone')")
    print('   Not found and Activity doodles:', nf, ao)
    if not nf or not ao: errs.append(f'a doodle is missing: not found {nf}, activity {ao}')
    await pg.goto(f'{B}/@sawyer/{W.A_SAW["id"]}?noplanes'); await asyncio.sleep(2.5)
    await pg.click('.quoteBtn'); await asyncio.sleep(.8)
    q = await pg.evaluate("({ box: !document.querySelector('.quoteBox').hidden, ask: !!document.querySelector('.signAsk') })")
    print('2. Annotate this signed out:', q)
    if q['box'] or not q['ask']: errs.append(f'Annotate this signed out did not ask to sign in first: {q}')
    await c.close()
    c = await ctx(b, True, {'blocks': [(W.PRI['id'], 'mute')]}); pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(3.5)
    bell = await pg.evaluate("(() => { const b = document.querySelector('.landBar .navAct'); return b ? !b.querySelector('.actDot').hidden : null; })()")
    print('8. home page bell with a dot:', bell)
    if not bell: errs.append(f'the home page has no bell or no dot: {bell}')
    for url, what in ((f'{B}/@sawyer?noplanes', 'their profile'), (f'{B}/?tag=Explainer&noplanes', 'a tag page')):
      await pg.goto(url); await asyncio.sleep(3)
      card = await pg.evaluate(r"document.querySelector('.rail .railcard')?.innerText.replace(/\s+/g, ' ')")
      print(f'3. your card on {what}:', card)
      if '2 annotations' not in (card or ''): errs.append(f'your card on {what} miscounts: {card}')
    await pg.goto(f'{B}/@davidw/{W.A_MINE["id"]}?noplanes'); await asyncio.sleep(3)
    ppl = await pg.evaluate("[...document.querySelectorAll('.peopleList .rlTake')].map((x) => x.innerText)")
    print('4. suggested with Priya muted:', ppl)
    if 'Priya Raman' in ppl: errs.append('a muted person is suggested')
    await pg.click('.annCard .moreBtn'); await asyncio.sleep(.4)
    ed = await pg.evaluate("(() => { const e = document.querySelector('.annCard .editBtn .editLeft'); return e ? e.textContent : null; })()")
    print('5. edit item:', ed)
    if not ed or not ed.endswith('left to edit'): errs.append(f'the edit item does not say the minutes left: {ed}')
    row = await pg.evaluate("[...document.querySelectorAll('.cList > li.cmt')].map((li) => !!li.querySelector(':scope > .cBody > .cActs > .cReplyBtn'))")
    print('6. Reply beside reactions:', row)
    if not row or not all(row): errs.append(f'Reply is not beside the reactions: {row}')
    await b.close()
  print('errors:', errs)
if __name__ == '__main__':
  asyncio.run(main())
