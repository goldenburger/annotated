# Play with sound plays the card's own video (David's recording of 2026-09-29 at 07:05: it opened a second player of
# the same clip under the card while the silent preview went on above it).
#   1. Pressed, the card's picture unmutes, gets its controls and plays; no second player is added; the page stays on the feed.
#   2. A press on the playing video's own controls does not open the annotation.
#   3. Play with sound on another card quiets the first one again.
import asyncio, json, pathlib, mimetypes, re
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
SRC = open('src.webm', 'rb').read()
A = '22222222-2222-4222-8222-222222222222'
def row(i):
  return {'id': f'00000000-0000-4000-8000-00000000000{i}', 'author_id': A, 'kind': 'video', 'created_at': f'2026-09-27T1{i}:00:00Z', 'take_text': f'Clip number {i}.',
    'tag': None, 'poll': None, 'gif': None, 'voice_path': None, 'upload': None, 'media_path': A + f'/c{i}/clip.webm', 'poster_path': A + f'/c{i}/poster.png', 'shot_path': None,
    'source': {'title': 'Rocket talk', 'videoId': f'VID00000{i}', 'channel': 'Test', 'start': 10, 'end': 25, 'duration': 150},
    'author': {'id': A, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}, 'comments': [], 'reactions': [], 'poll_votes': []}
ROWS = [row(1), row(2)]
def site(route):
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
async def db(route):
  u = route.request.url
  if '/storage/' in u and u.endswith('.png'):
    return await route.fulfill(status=200, body=(PUB / 'icon.png').read_bytes(), headers={'Content-Type': 'image/png'})
  if '/storage/' in u:
    rng = route.request.headers.get('range'); n = len(SRC)
    if rng:
      a, b = re.match(r'bytes=(\d*)-(\d*)', rng).groups(); a = int(a or 0); b = int(b) if b else n - 1
      return await route.fulfill(status=206, body=SRC[a:b + 1], headers={'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {a}-{b}/{n}'})
    return await route.fulfill(status=200, body=SRC, headers={'Content-Type': 'video/webm'})
  if '/rest/v1/annotations' in u and 'select=id' in u.replace('%2C', ','):
    return await route.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
  if '/rest/v1/annotations' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(ROWS))
  return await route.fulfill(status=200, content_type='application/json', body='[]')

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    c = await b.new_context(viewport={'width': 1300, 'height': 1000})
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.cplayBtn'); await asyncio.sleep(1.5)
    first = pg.locator('.cardItem').nth(0)
    await first.locator('.cplayBtn').click(); await asyncio.sleep(1.5)
    s = await pg.evaluate("""() => { const v = document.querySelectorAll('.cardItem')[0].querySelector('video.cpv');
      return { players: document.querySelectorAll('.cardPlayer').length, sound: v.dataset.sound, muted: v.muted, controls: v.controls, playing: !v.paused, url: location.search,
        button: getComputedStyle(document.querySelectorAll('.cardItem')[0].querySelector('.cplayBtn')).display }; }""")
    print('1. after Play with sound:', s)
    if s['players']: errs.append('a second player was added under the card')
    if s['sound'] != '1' or s['muted'] or not s['controls'] or not s['playing']: errs.append(f"the card's own video is not playing with sound: {s}")
    if s['button'] != 'none': errs.append('Play with sound still sits on the playing video')
    # 2. Its own controls do not open the annotation.
    await pg.locator('.cardItem').nth(0).locator('video.cpv').click(position={'x': 40, 'y': 20}); await asyncio.sleep(1)
    print('2. after a click on the video, the address is', await pg.evaluate('location.pathname + location.search'))
    if '/@' in await pg.evaluate('location.pathname'): errs.append('a click on the playing video opened the annotation')
    # 3. The other card's Play with sound quiets the first.
    await pg.locator('.cardItem').nth(1).locator('.cplayBtn').click(); await asyncio.sleep(1.2)
    t = await pg.evaluate("""() => [...document.querySelectorAll('.cardItem')].slice(0, 2).map((li) => { const v = li.querySelector('video.cpv'); return { sound: !!v.dataset.sound, muted: v.muted, controls: v.controls }; })""")
    print('3. after the second card:', t)
    if t[0]['sound'] or not t[0]['muted'] or t[0]['controls'] or not t[1]['sound']: errs.append(f'switching cards did not quiet the first: {t}')
    await b.close()
  print('errors:', errs)
asyncio.run(main())
