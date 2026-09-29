# The UX audit of 2026-09-25 (tests/audit_shots.py took the pictures).
#   1. A saved post on a feed card keeps its own shape: a short wide picture is not filled to a taller box, which
#      cut off both its sides.
#   2. The take on a feed card is the largest words on it.
#   3. No "New today" reason heads the cards.
#   4. The panel's tags wrap with room inside them, and the selection is counted in words.
#   5. "Not found" is drawn in the site's frame, with the header.
#   6. In dark mode the bar under the home page's paper has light ink.
import asyncio, pathlib, mimetypes, json, time
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
URL = 'https://annotated-app.netlify.app/'
NOW = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime(time.time() - 600))
ROW = {'id': 'post-a4', 'author_id': 'u-a4', 'kind': 'post', 'take_text': 'Sigh is the whole post, and it says enough.', 'tag': None, 'poll': None,
  'source': {'id': '1', 'url': 'https://x.com/example/status/1', 'kind': 'post', 'text': 'Sigh', 'quote': '', 'author': 'Example', 'handle': '@example', 'display': 'screenshot'},
  'media_path': None, 'poster_path': None, 'shot_path': 'u-a4/post-a4/shot.jpg', 'voice_path': None, 'created_at': NOW, 'updated_at': NOW, 'gif': None, 'upload': None,
  'author': {'id': 'u-a4', 'handle': 'example', 'display_name': 'Example Person', 'avatar_url': ''}, 'comments': [], 'reactions': [], 'poll_votes': []}
STORY = ('<!doctype html><title>Harbor story</title><article><h1>Harbor story</h1><p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once.</p></article>')

def wide_jpeg():
  # A short wide picture, the shape of a one line post (598 by 237).
  from PIL import Image
  import io
  im = Image.new('RGB', (598, 237), (10, 10, 10))
  for x in range(0, 598, 40): im.paste((200, 200, 200), (x, 0, x + 4, 237))
  b = io.BytesIO(); im.save(b, 'JPEG'); return b.getvalue()

async def main():
  errs = []
  img = wide_jpeg()
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    async def db(route):
      u = route.request.url
      if '/storage/' in u: return await route.fulfill(status=200, body=img, headers={'Content-Type': 'image/jpeg'})
      if '/rest/v1/annotations' in u and 'select=id' not in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([ROW]))
      await route.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?feed'); await pg.wait_for_selector('.cthumb img'); await asyncio.sleep(1.5)
    r = await pg.evaluate("""(() => { const i = document.querySelector('.cthumb.cwide img'); const b = i.getBoundingClientRect();
      const card = i.closest('.card'); const take = card.querySelector('.ctake');
      const sizes = [...card.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize));
      const cs = getComputedStyle(i), px = (k) => parseFloat(cs[k]) || 0;
      // The picture inside its taped white border (2.35), not the border.
      return { shown: +((b.width - px('paddingLeft') - px('paddingRight')) / (b.height - px('paddingTop') - px('paddingBottom'))).toFixed(2), natural: +(i.naturalWidth / i.naturalHeight).toFixed(2), take: parseFloat(getComputedStyle(take).fontSize), most: Math.max(...sizes),
        why: [...document.querySelectorAll('.cwhy')].map((x) => x.textContent) }; })()""")
    print('1-3.', r)
    if abs(r['shown'] - r['natural']) > .05: errs.append(f"the saved post was reshaped on the card: {r['shown']} for {r['natural']}")
    if r['take'] < r['most'] or r['take'] < 20: errs.append(f"the take is not the largest words on the card: {r['take']} of {r['most']}")
    if any('New today' in w for w in r['why']): errs.append(f"cards still say New today: {r['why']}")
    # 5.
    await pg.goto(URL + '@nobody-at-all'); await asyncio.sleep(2.5)
    nf = await pg.evaluate("({ bar: !!document.querySelector('.sitebar .wmBtn'), title: (document.querySelector('.esTitle') || {}).textContent || null })")
    print('5. not found:', nf)
    if nf != {'bar': True, 'title': 'Not found'}: errs.append(f'the not found page has no frame: {nf}')
    await c.close()
    # 6.
    c = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); await pg.goto(URL + '?noplanes'); await asyncio.sleep(1.5)
    ink = await pg.evaluate("[getComputedStyle(document.querySelector('.tiHint')).color, getComputedStyle(document.querySelector('.tiForMe')).color]")
    lum = lambda s: sum(int(x) for x in s[s.index('(') + 1:s.index(')')].split(',')[:3]) / 3
    print('6. dark bar ink:', ink)
    if any(lum(x) < 150 for x in ink): errs.append(f'the bar under the paper is dark on dark: {ink}')
    await b.close()

    # 4. The panel.
    ctx = await p.chromium.launch_persistent_context(prof('profA4'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html'}, body=STORY))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    st = await ctx.new_page(); await st.goto('https://harborline.example/s'); await asyncio.sleep(1)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    pa = await ctx.new_page(); await pa.set_viewport_size({'width': 400, 'height': 900}); pa.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pa.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2)
    await st.bring_to_front(); await st.evaluate("(()=>{const n=document.getElementById('a').firstChild;const r=document.createRange();r.setStart(n,4);r.setEnd(n,60);getSelection().removeAllRanges();getSelection().addRange(r)})()")
    await asyncio.sleep(1.2); await pa.bring_to_front(); await asyncio.sleep(.5)
    count = await pa.evaluate("(document.querySelector('#articleMode .selCount') || {}).textContent || ''")
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
    tags = await pa.evaluate("""(() => { const bs = [...document.querySelectorAll('#articleMode .tagbtn')].map((x) => x.getBoundingClientRect());
      let overlap = false; for (let i = 1; i < bs.length; i++) if (Math.abs(bs[i].top - bs[i - 1].top) < 2 && bs[i].left < bs[i - 1].right + 3) overlap = true;
      const t = document.querySelector('#articleMode .tagbtn'); const pad = parseFloat(getComputedStyle(t).paddingLeft);
      return { overlap, pad, clipped: [...document.querySelectorAll('#articleMode .tagbtn')].some((x) => x.scrollWidth > x.clientWidth + 1) }; })()""")
    print('4.', repr(count), tags)
    if not count.endswith('words selected'): errs.append(f'the selection is counted as {count!r}')
    if tags['overlap'] or tags['pad'] < 8 or tags['clipped']: errs.append(f'the tags are crowded: {tags}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
