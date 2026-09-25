# The recording of 2026-09-22 at 05:03. The annotation page was blank white for about six seconds, the
# Annotate button sat on top of the line above the passage, the panel beside your own profile was a second
# copy of it with a link to the page already open, and a part sentence went out past the line saying so for
# the third recording running.
import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"

# Three columns, so both margins beside the writing belong to something else and the button has nowhere free.
BOXED = ('<!doctype html><html><head><meta charset="utf-8"><title>Boxed in</title></head>'
         '<body style="margin:0;background:#fff;color:#16181d;font:17px/1.7 Georgia,serif">'
         '<div style="display:flex;gap:0;align-items:flex-start">'
         '<nav style="width:38vw;min-height:100vh;background:#eef1f6">Menu</nav>'
         '<article style="width:24vw"><p id="p">The council met on a Tuesday to talk about the overnight buses. '
         'Every member arrived on time for once, which the clerk noted in the minutes with some surprise, and '
         'the meeting ran for rather longer than anyone had planned for that afternoon.</p></article>'
         '<aside style="width:38vw;min-height:100vh;background:#eef1f6">More</aside></div></body></html>')

# A part sentence publishes at once, as chosen. Publish used to ask about it first, and any words may be
# annotated now, a headline or half a sentence included.
ASK = r"""async () => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const post = { ok: true, text: 'A post about the market today.', author: 'Mike Investing', handle: '@MrMikeInvesting',
                 posted: '2026-09-16T09:00:00Z', url: 'https://x.com/MrMikeInvesting/status/1', id: '1', quote: 'about the', vw: 900 };
  const sent = [];
  const api = PostPanel.create(d, { info: async () => post, capture: async () => ({ ...post }), clearCaptured() {} },
    { log() {}, onPublish: async (i) => { sent.push(i.quote); return { permalink: 'https://x/y' }; }, onView() {}, findDuplicate: () => null });
  await api.refresh();
  await new Promise((r) => setTimeout(r, 200));
  d.querySelector('.pGrab').click();
  await new Promise((r) => setTimeout(r, 400));
  d.querySelector('.takeInput').value = 'a take';
  d.querySelector('.takeInput').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  d.querySelector('.publish').click();
  await new Promise((r) => setTimeout(r, 400));
  const asked = { shown: !d.querySelector('.pFragAsk').hidden, published: sent.length,
                  words: (d.querySelector('.pFragAsk') || {}).textContent || '' };
  await new Promise((r) => setTimeout(r, 400));
  const after = { shown: !d.querySelector('.pFragAsk').hidden, published: sent.length, quote: sent[0] || '' };
  d.remove();
  return { asked, after };
}"""

# A whole sentence goes straight out, with nothing to answer.
NOASK = r"""async () => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const post = { ok: true, text: 'A post about the market today.', author: 'Mike', handle: '@mike',
                 posted: '2026-09-16T09:00:00Z', url: 'https://x.com/mike/status/2', id: '2', quote: 'A post about the market today.', vw: 900 };
  const sent = [];
  const api = PostPanel.create(d, { info: async () => post, capture: async () => ({ ...post }), clearCaptured() {} },
    { log() {}, onPublish: async (i) => { sent.push(i.quote); return { permalink: 'https://x/y' }; }, onView() {}, findDuplicate: () => null });
  await api.refresh();
  await new Promise((r) => setTimeout(r, 200));
  d.querySelector('.pGrab').click();
  await new Promise((r) => setTimeout(r, 400));
  d.querySelector('.takeInput').value = 'a take';
  d.querySelector('.takeInput').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  d.querySelector('.publish').click();
  await new Promise((r) => setTimeout(r, 700));
  const out = { asked: !d.querySelector('.pFragAsk').hidden, published: sent.length };
  d.remove();
  return out;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profREC2'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://boxed.example/**', lambda r: r.fulfill(status=200, body=BOXED, headers={'Content-Type': 'text/html'}))
    # The database takes its time, so there is a window in which the page has nothing of its own to show yet.
    async def slow(route):
        await asyncio.sleep(1.6)
        await route.fulfill(status=200, body='[]', headers={'Content-Type': 'application/json'})
    await ctx.route('**/rest/v1/annotations*', slow)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    # 1. The page is never blank. Either the skeleton is up or the annotation is.
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1000, 'height': 800})
    await pg.goto(f'chrome-extension://{extid}/annotation.html#no-such-annotation-zz', wait_until='commit')
    seen, blanks = [], 0
    for _ in range(45):
        try:
            state = await pg.evaluate("""() => { const b = document.getElementById('page');
              if (!b) return 'gone';
              if (b.querySelector('.bootSkel')) return 'skeleton';
              return b.textContent.trim() ? 'content' : 'blank'; }""")
        except Exception:
            state = 'gone'
        seen.append(state)
        if state == 'blank': blanks += 1
        if state == 'content' and 'skeleton' in seen: break
        await asyncio.sleep(0.12)
    order = [s for i, s in enumerate(seen) if i == 0 or s != seen[i - 1]]
    print('while the annotation page loaded it went:', ' then '.join(order))
    if blanks: errs.append(f'the annotation page was blank on {blanks} of {len(seen)} looks while it loaded')
    if 'skeleton' not in seen: errs.append('the skeleton never showed, so there was nothing to hold the screen')
    if 'content' not in seen: errs.append('the page never finished loading')
    await pg.close()

    # 2. With both margins taken the button goes over the line above, faintly.
    news = await ctx.new_page(); await news.set_viewport_size({'width': 1200, 'height': 800})
    await news.goto('https://boxed.example/a'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('boxed')).id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.8)
    await news.bring_to_front()
    await news.evaluate("""() => { const n = document.getElementById('p').firstChild;
      const r = document.createRange(); r.setStart(n, 10); r.setEnd(n, 70);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    await asyncio.sleep(1)
    boxed = await news.evaluate("""() => { const h = [...document.querySelectorAll('.annotated-ui')].find((x) => x.style.display === 'block');
      if (!h) return { there: false };
      const row = h.shadowRoot.querySelector('.row'), b = h.getBoundingClientRect();
      const p = document.getElementById('p').getBoundingClientRect();
      return { there: true, shy: row.classList.contains('shy'),
               opacity: getComputedStyle(row).opacity,
               overText: !(b.right <= p.left || b.left >= p.right) }; }""")
    print('boxed in on both sides, the button is:', boxed)
    if not boxed['there']: errs.append('the Annotate button never appeared')
    elif boxed['overText'] and not boxed['shy']:
        errs.append('the button sits over the writing at full strength, so it hides the line above')
    elif boxed['shy'] and float(boxed['opacity']) > 0.6:
        errs.append(f"the button says it is out of the way but is still at {boxed['opacity']}")

    # 3. Beside your own profile the panel says so rather than showing the same list again.
    await news.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(2.4)
    side = await pan.evaluate("""() => ({ mirror: !!document.querySelector('.annside.mirror'),
      list: !!document.querySelector('.sideList'),
      openProfile: !!document.querySelector('.sideFeedBtn'),
      says: (document.querySelector('.mirrorWhat') || {}).textContent || '',
      back: !!document.querySelector('.sideBack') })""")
    print('beside your own profile the panel shows:', side)
    if not side['mirror']: errs.append('the panel put the same list beside the page already showing it')
    if side['list'] or side['openProfile']: errs.append('the panel still offers to open the page you are on')
    if 'profile' not in side['says'].lower(): errs.append(f"it did not say what is open: {side['says']!r}")
    if not side['back']: errs.append('there was no way back to what you were reading')

    # 4. Publish publishes a part sentence at once, with nothing asked, and a whole one too.
    a = await pan.evaluate(ASK)
    print('a part sentence: asked', a['asked']['shown'], '| published:', a['after'])
    if a['asked']['shown']: errs.append('Publish still asks about a part sentence')
    if a['after']['published'] != 1: errs.append(f"a part sentence did not publish: {a['after']}")
    if a['after']['quote'] != 'about the': errs.append(f"it published {a['after']['quote']!r}")

    n = await pan.evaluate(NOASK)
    print('a whole sentence:', n)
    if n['asked']: errs.append('a whole sentence was questioned as well')
    if n['published'] != 1: errs.append('a whole sentence did not publish')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
