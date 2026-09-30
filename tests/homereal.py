# 2.41, after comparing our recording with the other entries (2026-09-30).
#   1. The home page shows real published annotations (Robo Taxi's, at David's word) with the feed's own cards: under the
#      hero, before In Chrome, one per source, tagged first, a card opening its annotation's page.
#   2. With the database down the row stays hidden and the page is otherwise whole.
#   3. A clip card in Yours so far shows its video only once a frame has been painted. 'playing' came first and the card
#      was a black box for a second (recording of 2026-09-30 at 02:36, 0:58). Simulated: the painted-frame callback is held
#      back, and the video must not be revealed until it is let go.
#   4. The same for a clip preview on a feed card, which the new row uses.
#   5. The try-it is as tall as the tab shown: Post on X after the YouTube clip sat over blank paper, since the tallest
#      tab's height was held (David, 2026-09-30).
#   6. One card in Yours so far is half the row and its picture fills the card; it was a quarter, and the picture only
#      as wide as its text (David, 2026-09-30: "way too tiny").
#   7. The six David chose come first, in his order, and the rule fills in for any that are gone.
import asyncio, json
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W
B = 'https://annotated-app.netlify.app'
REAL = 'ddf86e69-51d6-4226-a9ce-839829be9be5'
HOLD = """
window.__rvfc = [];
HTMLVideoElement.prototype.requestVideoFrameCallback = function (cb) { window.__rvfc.push(cb); return window.__rvfc.length; };
Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this.__on; } });
Object.defineProperty(HTMLMediaElement.prototype, 'seeking', { configurable: true, get() { return false; } });
Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 4; } });
HTMLMediaElement.prototype.play = function () { this.__on = true; setTimeout(() => this.dispatchEvent(new Event('playing')), 30); return Promise.resolve(); };
HTMLMediaElement.prototype.pause = function () { this.__on = false; };
window.__release = () => { const q = window.__rvfc.splice(0); q.forEach((f) => f(performance.now(), {})); return q.length; };
"""
YOURS = [{'kind': 'video', 'take': 'Liftoff, lit the whole way.', 'thumb': {'src': '/media/artemis-i-frames.jpg', 'idx': 84, 'cols': 12, 'rows': 15},
          'a': 164, 'z': 186, 'source': 'NASA, To the Moon and Back: The Journey of Artemis I', 'what': 'Clip 2:44 to 3:06 of 5:47', 'at': 1}]

class AsReal:
  """The stand-in world answers Robo Taxi's list with everyone's annotations."""
  def __init__(self, route): self._r = route
  def __getattr__(self, k): return getattr(self._r, k)
  @property
  def request(self):
    r = self._r.request
    url = r.url.replace(f'author_id=eq.{REAL}&', '').replace(f'&author_id=eq.{REAL}', '').replace(f'author_id=eq.{REAL}', '')
    class Q:
      def __getattr__(s, k): return getattr(r, k)
    q = Q(); q.url = url
    return q

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    # 1. The row, from the stand-in.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    db = W.make_db({})
    asked = []
    async def real_db(route):
      if REAL in route.request.url: asked.append(route.request.url); return await db(AsReal(route))
      return await db(route)
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', real_db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(3.5)
    info = await pg.evaluate("""(() => { const r = document.querySelector('.landReal'); if (!r) return null;
      const order = [...document.querySelectorAll('.landMain > *')].map((x) => x.className.split(' ')[0]);
      return { hidden: r.hidden, cards: r.querySelectorAll('.card.mf').length, tags: [...r.querySelectorAll('.card.mf')].map((c) => !!c.querySelector('.tag')),
        sources: [...r.querySelectorAll('.cst')].map((x) => x.textContent), order }; })()""")
    print('1. real row:', json.dumps(info)[:600])
    if not asked: errs.append("the home page did not ask for Robo Taxi's annotations")
    if not info or info['hidden'] or info['cards'] < 3: errs.append(f'the real row is missing: {info}')
    else:
      if len(set(info['sources'])) != len(info['sources']): errs.append(f'the real row repeats a source: {info["sources"]}')
      t = info['tags']
      if any(t[i + 1] and not t[i] for i in range(len(t) - 1)): errs.append(f'untagged before tagged: {t}')
      o = info['order']
      if 'landReal' not in o or 'landChrome' not in o or o.index('landReal') > o.index('landChrome'): errs.append(f'the real row is not before In Chrome: {o}')
      elif o.index('landReal') < o.index('landLatest'): errs.append(f'the real row is above Yours so far: {o}')
      first = await pg.evaluate("document.querySelector('.landReal .card.mf').dataset.id")
      await pg.click('.landReal .card.mf .ctake'); await asyncio.sleep(1.5)
      print('   opened:', pg.url)
      if f'/{first}' not in pg.url or '/@' not in pg.url: errs.append(f'a card did not open its annotation: {pg.url}')
    await c.close()
    # 2. The database down.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', lambda r: r.fulfill(status=500, body='{}', content_type='application/json'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(9)
    down = await pg.evaluate("({ hidden: document.querySelector('.landReal').hidden, chrome: !!document.querySelector('.landChrome'), get: !!document.querySelector('#get') })")
    print('2. database down:', down)
    if not down['hidden'] or not down['chrome'] or not down['get']: errs.append(f'with the database down the page is not whole: {down}')
    await c.close()
    # 3. Yours so far's clip card waits for a painted frame.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.add_init_script(HOLD + "try{localStorage.setItem('annotated-yours', " + json.dumps(json.dumps(YOURS)) + "); sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(1)
    await pg.evaluate("document.querySelector('.landLatest .yThumb').scrollIntoView({block:'center'})"); await asyncio.sleep(1.2)
    before = await pg.evaluate("({ on: document.querySelector('.landLatest .yClip').__on === true, shown: document.querySelector('.landLatest .yThumb').classList.contains('playing') })")
    n = await pg.evaluate("window.__release()"); await asyncio.sleep(.3)
    after = await pg.evaluate("document.querySelector('.landLatest .yThumb').classList.contains('playing')")
    print('3. Yours so far clip: playing', before['on'], 'shown before a frame', before['shown'], 'frames let go', n, 'shown after', after)
    if not before['on']: errs.append('the clip card never started its video')
    if before['shown']: errs.append('the clip card showed its video before a frame was painted (the black box)')
    if not after: errs.append('the clip card never showed its video after a frame was painted')
    await c.close()
    # 4. A feed card's clip preview.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.add_init_script(HOLD)
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?feed&noplanes'); await asyncio.sleep(3)
    await pg.evaluate("document.querySelector('video.cpv').scrollIntoView({block:'center'})"); await asyncio.sleep(1.5)
    fb = await pg.evaluate("({ on: document.querySelector('video.cpv').__on === true, live: document.querySelector('video.cpv').closest('.cthumb').classList.contains('live') })")
    await pg.evaluate("window.__release()"); await asyncio.sleep(.3)
    fa = await pg.evaluate("document.querySelector('video.cpv').closest('.cthumb').classList.contains('live')")
    print('4. feed preview: playing', fb['on'], 'shown before a frame', fb['live'], 'shown after', fa)
    if not fb['on']: errs.append('the feed preview never started')
    if fb['live']: errs.append('the feed preview showed its video before a frame was painted')
    if not fa: errs.append('the feed preview never showed its video')
    await c.close()
    # 5 and 6.
    c = await b.new_context(viewport={'width': 1320, 'height': 1000})
    await c.add_init_script("try{localStorage.setItem('annotated-yours', " + json.dumps(json.dumps(YOURS)) + "); sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")
    await c.route(B + '/**', W.site); await c.route(W.SUPA + '/**', W.make_db({}))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(B + '/?noplanes'); await asyncio.sleep(2.5)
    gaps = []
    for k in ('YouTube clip', 'Post on X'):
      await pg.click(f'.tryTab:has-text("{k}")'); await asyncio.sleep(1.2)
      gaps.append(await pg.evaluate("(() => { const p = [...document.querySelectorAll('.tryPanel')].find((x) => !x.hidden).getBoundingClientRect(); return Math.round(document.querySelector('.heroTryBox').getBoundingClientRect().bottom - p.bottom); })()"))
    print('5. blank paper under the tab:', gaps)
    if max(gaps) > 4: errs.append(f'the try-it holds blank paper under the tab: {gaps}')
    card = await pg.evaluate("(() => { const row = document.querySelector('.llRow').getBoundingClientRect(), c = document.querySelector('.llRow .yours .card').getBoundingClientRect(), t = document.querySelector('.llRow .yThumb').getBoundingClientRect(); return { row: Math.round(row.width), card: Math.round(c.width), thumb: Math.round(t.width) }; })()")
    print('6. one clip card:', card)
    if card['card'] < card['row'] * .45: errs.append(f'one card is under half the row: {card}')
    if card['thumb'] < card['card'] * .85: errs.append(f'the picture does not fill its card: {card}')
    picked = await pg.evaluate("""(() => {
      const r = (id, tag, t, url) => ({ id, created: t, take: { text: 'A take long enough to show', tag }, item: { kind: 'post', url } });
      const all = [r('x-new', 'Hot take', 9, 'u1'), r('delaying-because-the-car-will-actually-n-fktn', null, 1, 'u2'), r('if-90-of-ai-runs-free-on-your-own-comput-r7jd', 'Explainer', 2, 'u3'), r('y-old', null, 3, 'u4')];
      return Landing.pickReal(all).map((x) => x.id); })()""")
    print('7. picked:', picked)
    if picked[:2] != ['if-90-of-ai-runs-free-on-your-own-comput-r7jd', 'delaying-because-the-car-will-actually-n-fktn'] or picked[2:] != ['x-new', 'y-old']:
      errs.append(f'the chosen annotations are not first, or the rest did not fill in: {picked}')
    await c.close(); await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())