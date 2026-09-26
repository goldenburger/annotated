# The exploration of 2026-09-26, from a fresh install through every screen.
#   1. The examples under Other things it does fly as small planes, and the home page's header stays above them.
#   2. Signed out, the website's feed opens on Everyone and For you does not point a visitor at a profile.
#   3. Signed out, the rail's card says how many are saved on this computer, not "0 followers".
#   4. A passage card that shows its words does not quote them again under the source.
#   5. Words selected inside a post on the X timeline name that post, and the button says Capture from this post.
#   6. Comments on an annotation saved only here say that only you can see them.
#   7, 8. Two wordings: a clip time before the start of the video, and the full stop after the sign-in line.
#   9. Terms and Privacy carry the site's header.
import asyncio, pathlib, mimetypes, json, time
from playwright.async_api import async_playwright
from _env import *
ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'website' / 'public'
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file() and (PUB / (path + '.html')).is_file(): f = PUB / (path + '.html')
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
URL = 'https://annotated-app.netlify.app/'
AUTHOR = {'id': 'a1', 'handle': 'someone', 'display_name': 'Some One', 'avatar_url': ''}
ROW = {'id': 'passage-1', 'kind': 'article', 'author_id': 'a1', 'created_at': '2026-09-25T20:00:00Z',
       'source': {'kind': 'article', 'text': 'The trial will cost $2.4 million over six months.', 'url': 'https://harborline.example/a', 'meta': {'title': 'Overnight buses', 'site': 'Harborline News'}},
       'take_text': 'Mostly a state grant.', 'tag': None, 'poll': None, 'author': AUTHOR, 'comments': [], 'reactions': [], 'poll_votes': []}
TWEET = lambda i, name, handle, text: f'''<article data-testid="tweet" style="padding:12px"><div data-testid="User-Name"><span>{name}</span><span>{handle}</span><a href="/{handle[1:]}/status/1800000000000000{i}"><time datetime="2026-09-19T08:00:00Z">8h</time></a></div><div data-testid="tweetText" lang="en">{text}</div></article>'''
XHOME = '<!doctype html><html><head><title>Home / X</title></head><body>' + TWEET(1, 'Evan', '@StockMKTNewz', 'Yesterday was a very long day for the market and nobody saw it coming.') + '</body></html>'

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1280, 'height': 860})
    await c.add_init_script("try{sessionStorage.setItem('annotated-example-shown','1')}catch(e){}")  # measure only the examples below
    await c.route('https://annotated-app.netlify.app/**', site)
    async def db(route):
      u = route.request.url
      if '/rest/v1/annotations' in u and 'id=in.' not in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([ROW]))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 1.
    await pg.goto(URL + "?planes"); await asyncio.sleep(6)
    await pg.evaluate("""(() => { window.__big = 0; const tick = () => {
      document.querySelectorAll('.pl-layer .pl-carrier:not([data-phase=open])').forEach((cr) => { let l = 1e9, r = -1e9, t = 1e9, bt = -1e9, n = 0;
        cr.querySelectorAll('.pl-leaf').forEach((x) => { const q = x.getBoundingClientRect(); if (!q.width) return; n++; l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); bt = Math.max(bt, q.bottom); });
        if (n) window.__big = Math.max(window.__big, Math.max(r - l, bt - t)); });
      requestAnimationFrame(tick); }; tick(); })()""")
    for i in range(4):
      await pg.evaluate(f"(() => {{ const d = document.querySelectorAll('.ftDemo')[{i}]; if (d) d.scrollIntoView({{ block: 'center' }}); dispatchEvent(new Event('scroll')); }})()"); await asyncio.sleep(3)
    big = await pg.evaluate("window.__big"); z = await pg.evaluate("getComputedStyle(document.querySelector('.landBar')).zIndex")
    print('1. largest example plane in flight:', round(big), '| header z-index', z)
    # The measure counts the folds' hidden faces too, so it reads larger than the plane looks: about 225 here for a plane
    # 110 pixels tall on screen, where the old sizes measured 266 and more.
    if big > 240: errs.append(f'an example plane was {round(big)} pixels across')
    if int(z) <= 60: errs.append('the header sits under the planes')
    # 2, 4. The feed, signed out.
    await pg.goto(URL + '?feed'); await asyncio.sleep(2.5)
    tab = await pg.evaluate("(document.querySelector('.feedTabs input:checked') || {}).value")
    csn = await pg.evaluate("[...document.querySelectorAll('.card')].map((c) => ({ quote: !!c.querySelector('.cquote'), again: (c.querySelector('.csn') || {}).textContent || '' }))")
    print('2. the feed opens on', tab, '| 4. cards:', csn)
    if tab != 'everyone': errs.append(f'signed out the feed opened on {tab}')
    if any(x['quote'] and x['again'] for x in csn): errs.append(f'a passage card quotes its words twice: {csn}')
    await pg.click('.feedTabs label:has(input[value="foryou"])'); await asyncio.sleep(1)
    fy = await pg.evaluate("document.querySelector('#page').innerText")
    if 'under Your profile' in fy: errs.append('For you points a visitor at a profile')
    # 9.
    for doc in ['terms', 'privacy']:
      await pg.goto(URL + doc); await asyncio.sleep(.8)
      h = await pg.evaluate("(() => { const b = document.querySelector('.sitebar'); return b ? b.innerText : null; })()")
      print(f'9. {doc} header:', h and ' '.join(h.split()))
      if not h or 'Feed' not in h: errs.append(f'{doc} has no site header')
    await b.close()

    # 3, 5, 6, 7, 8. The extension.
    ctx = await p.chromium.launch_persistent_context(prof('ex0926'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await ctx.route('https://x.com/**', lambda r: r.fulfill(status=200, body=XHOME, headers={'Content-Type': 'text/html; charset=utf-8'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)
    await pg.evaluate("""async () => { for (const n of [1, 2]) await Store.put('local-' + n, { item: { kind: 'article', text: 'Words ' + n, url: 'https://harborline.example/a', meta: { title: 'A story', site: 'Harborline News' } }, take: { text: 'Take ' + n }, created: Date.now() - n * 1000 }); }""")
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(2.5)
    you = await pg.evaluate("(() => { const s = document.querySelector('.rail .railcard .stats'); return s ? s.textContent.trim() : null; })()")
    print('3. the rail card signed out:', you)
    if not you or 'saved on this computer' not in you or 'follower' in you: errs.append(f'the rail card says {you!r}')
    await pg.goto(f'chrome-extension://{extid}/annotation.html#local-1'); await asyncio.sleep(2.5)
    note = await pg.evaluate("(document.querySelector('.cLocal') || {}).textContent || ''")
    print('6. comments on a saved-only annotation:', note)
    if 'Only you can see' not in note: errs.append('comments on a saved-only annotation do not say who sees them')
    # 5.
    await one_panel(sw)
    x = await ctx.new_page(); await x.goto('https://x.com/home'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('x.com')).id)")
    pv = await ctx.new_page(); await pv.set_viewport_size({'width': 400, 'height': 900})
    await pv.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    await x.bring_to_front()
    await x.evaluate("""(() => { const t = document.querySelector('[data-testid="tweetText"]').firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 26);
      getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); })()""")
    await asyncio.sleep(1.5)
    head = await pv.evaluate("({ title: document.querySelector('#articleMode .aTitle').textContent, btn: document.querySelector('#articleMode .grab').textContent })")
    print('5. the panel with words selected in a post:', head)
    if head['title'] != "Evan's post on X" or head['btn'] != 'Capture from this post': errs.append(f'the panel does not name the post: {head}')
    await ctx.close()
  # 7, 8.
  vp = (ROOT / 'extension' / 'videopanel.js').read_text(encoding='utf-8'); cp = (ROOT / 'extension' / 'compose.js').read_text(encoding='utf-8')
  if 'before the start of the video.' not in vp: errs.append('the clip time wording')
  if 'publish it for everyone</button>.</p>' not in cp: errs.append('the full stop after the sign-in line')
  print('errors:', errs)

asyncio.run(main())
