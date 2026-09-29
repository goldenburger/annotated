# The tenth audit pass of 2026-09-29.
#   1. A reply that fails after another annotation was opened in the same tab is not drawn into that one.
#   2. A deleted comment is sent once: the page closing and the Undo timer do not both send it.
#   3. Folding a video into a plane draws and encodes its frame once, not once for each of the ten pieces.
#   4. Two quick presses of Show me an example run one example.
import asyncio, json, time
from urllib.parse import unquote
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site
from audit9 import ROW, SESSION, UID, AUTH, AID

ROW2 = dict(ROW, id='other-take-cd34', take_text='Another take.', poll=None)

def make_db(log, slow_fail_comment):
  async def db(route):
    r = route.request; u = unquote(r.url); log.append((r.method, u))
    if '/auth/v1/user' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user']))
    if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': UID, 'handle': 'me', 'display_name': 'Me', 'avatar_url': ''} if 'vnd.pgrst.object' in (r.headers.get('accept') or '') else [{'id': UID, 'handle': 'me', 'display_name': 'Me', 'avatar_url': ''}]))
    if '/rest/v1/comments' in u and r.method == 'POST':
      if slow_fail_comment['on']:
        await asyncio.sleep(2)
        return await route.fulfill(status=400, content_type='application/json', body=json.dumps({'message': 'That is a lot of comments at once.'}))
      return await route.fulfill(status=201, content_type='application/json', body=json.dumps({'id': 77}))
    if '/rest/v1/comments' in u and r.method == 'DELETE': return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'id': 77, 'upload': None}]))
    if '/rest/v1/annotations' in u:
      one = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
      row = ROW2 if 'other-take' in u else ROW
      rows = [row] if 'id=eq.' in u else [ROW, ROW2]
      return await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '0-0/2', 'Access-Control-Expose-Headers': 'Content-Range'}, body=json.dumps(row if one else rows))
    return await route.fulfill(status=200, content_type='application/json', body='[]')
  return db

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1400, 'height': 900}); log = []; slow = {'on': True}
    await c.add_init_script(f"try{{ localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))}) }}catch(e){{}}")
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', make_db(log, slow))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    # 1.
    await pg.goto(f'https://annotated-app.netlify.app/@robotaxi/{AID}'); await pg.wait_for_selector('.cText'); await asyncio.sleep(1.5)
    await pg.fill('.cText', 'My reply to the first'); await pg.click('.cPost'); await asyncio.sleep(.3)
    await pg.goto(f'https://annotated-app.netlify.app/@robotaxi/other-take-cd34'); await pg.wait_for_selector('.cText'); await asyncio.sleep(3.5)
    leak = await pg.evaluate("({ list: document.querySelector('.cList').textContent.includes('My reply to the first'), box: document.querySelector('.cText').value })")
    print('1. the other annotation after the first reply failed:', leak)
    if leak['list'] or leak['box']: errs.append(f'a failed reply was drawn into another annotation: {leak}')
    # 2.
    slow['on'] = False
    await pg.goto(f'https://annotated-app.netlify.app/@robotaxi/{AID}'); await pg.wait_for_selector('.cText'); await asyncio.sleep(1.5)
    await pg.fill('.cText', 'Delete me'); await pg.click('.cPost'); await asyncio.sleep(1.5)
    log.clear()
    await pg.click('.cDel'); await asyncio.sleep(.5)
    await pg.evaluate("dispatchEvent(new Event('pagehide'))"); await asyncio.sleep(7)
    dels = sum(1 for m, u in log if m == 'DELETE' and '/comments' in u)
    print('2. deletes sent when the page hid and the Undo timer ran out:', dels)
    if dels != 1: errs.append(f'the delete was sent {dels} times')
    await c.close()
    # 3 and 4 on the home page.
    c = await b.new_context(viewport={'width': 1400, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?planes'); await asyncio.sleep(4)
    enc = await pg.evaluate("""async () => {
      const v = document.createElement('video'); v.muted = true; v.src = '/media/panel-demo.mp4'; v.style.width = '320px';
      const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:40px;top:40px;width:320px'; box.appendChild(v); document.body.appendChild(box);
      await new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 4000); });
      let n = 0; const real = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...a) { n++; return real.apply(this, a); };
      try { const f = Fold.away(box); if (f && f.cancel) setTimeout(() => f.cancel(), 400); } catch (e) { return 'error ' + e.message; }
      await new Promise((r) => setTimeout(r, 600));
      HTMLCanvasElement.prototype.toDataURL = real;
      return { encodes: n, ready: v.readyState }; }""")
    print('3. frame encodes for one folded video:', enc)
    if isinstance(enc, dict) and enc['ready'] >= 2 and enc['encodes'] > 1: errs.append(f"a video's frame was encoded {enc['encodes']} times")
    if not isinstance(enc, dict): errs.append(f'the fold check did not run: {enc}')
    await pg.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(3)
    await pg.evaluate("window.__ex = 0; document.addEventListener('annotated-tryit-example', () => window.__ex++)")
    await pg.evaluate("(() => { const b = document.querySelector('.tiShowMe'); b.click(); setTimeout(() => b.click(), 60); })()"); await asyncio.sleep(9)
    marks = await pg.evaluate("({ examples: window.__ex, nested: document.querySelectorAll('.tiText mark mark').length })")
    print('4. two quick presses of Show me an example:', marks)
    if marks['examples'] > 1 or marks['nested']: errs.append(f'two examples ran: {marks}')
    # 5. The plane lands where the card stays: the card does not move once it has unfolded (recording of 2026-09-29 at
    #    20:27, where the page below moved up during the flight and the card slid up after landing).
    await c.close()
    c = await b.new_context(viewport={'width': 1700, 'height': 1250})
    await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?planes'); await asyncio.sleep(6)
    await pg.evaluate("""(() => { window.__landed = null; const row = document.querySelector('.llRow');
      new MutationObserver(() => { const c = row.querySelector('.cardItem > .card'); if (c && !c.classList.contains('pl-hidden') && !window.__landed) { window.__landed = { at: performance.now(), y: null }; requestAnimationFrame(() => requestAnimationFrame(() => { window.__landed.y = Math.round(c.getBoundingClientRect().top + scrollY); })); } })
        .observe(row, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true }); })()""")
    await pg.evaluate("""(() => { const n = document.querySelector('.tiText p').firstChild, t = n.nodeValue; const r = document.createRange();
      r.setStart(n, t.indexOf('quickly')); r.setEnd(n, t.indexOf('video') + 5); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    await asyncio.sleep(1); await pg.click('.tiBtn'); await asyncio.sleep(1.5)
    await pg.fill('#tiInput', 'test'); await pg.click('.tiMake'); await asyncio.sleep(8)
    land = await pg.evaluate("(() => { const c = document.querySelector('.llRow .cardItem > .card'); return { landed: window.__landed, now: c ? Math.round(c.getBoundingClientRect().top + scrollY) : null }; })()")
    moved = abs(land['now'] - land['landed']['y']) if land['landed'] and land['now'] is not None else None
    print('5. the card when its plane had landed and after:', land, '| moved', moved)
    if moved is None or moved > 12: errs.append(f'the card moved {moved} px after its plane landed')
    await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
