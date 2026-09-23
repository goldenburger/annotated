# The recording of 2026-09-23 at 02:22, on Spotify.
#   1. With an episode open, moving the tab to another episode's page is offered ("Now on this tab ... Clip this
#      one instead"), and one press opens it. It is never switched to by itself.
#   2. "Choose a different episode" lets go of the open one and fills the box from the tab.
#   3. The note under the heading goes back to its usual line.
#   4. A box emptied by hand says what to type.
#   5. The clip starts where the app's player is, when the tab is on the same episode.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
FRAME = bytes([0xFF, 0xFB, 0x90, 0xC0]) + b'\x00' * 413
EP = FRAME * 3000   # about 78 seconds
def mp3(route):
    rng = route.request.headers.get('range')
    h = {'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes'}
    if rng and rng.startswith('bytes='):
        a, b = rng[6:].split('-'); a = int(a); b = min(int(b) if b else len(EP) - 1, len(EP) - 1)
        h.update({'Content-Range': f'bytes {a}-{b}/{len(EP)}', 'Content-Length': str(b - a + 1)})
        return route.fulfill(status=206, body=EP[a:b + 1], headers=h)
    return route.fulfill(status=200, body=EP, headers=h)
SPOT = lambda title, pos: (f'<!doctype html><html><head><title>{title}</title></head><body><p>Spotify stand-in</p>'
                           f'<div data-testid="playback-position">{pos}</div></body></html>')
EPS = {'dream': ('Our Big Fat Dream Episode', 'Stuff You Should Know'), 'orleans': ("New Orleans, NFL Stadiums, 'Dallas' | Monday Morning Podcast 9-21-26", 'Monday Morning Podcast')}
CALLS = []
def apple(r):
    from urllib.parse import urlparse, parse_qs
    term = parse_qs(urlparse(r.request.url).query).get('term', [''])[0].lower()
    CALLS.append(term)
    key = 'orleans' if 'orleans' in term else 'dream'
    t, show = EPS[key]
    return r.fulfill(status=200, content_type='application/json', body=json.dumps({'results': [
      {'trackName': t, 'collectionName': show, 'episodeUrl': f'https://audio.example/{key}.mp3', 'trackViewUrl': f'https://podcasts.apple.com/x?i={key}',
       'artworkUrl160': '', 'releaseDate': '2026-09-21T00:00:00Z', 'trackTimeMillis': 78000}]}))

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0222'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://open.spotify.com/episode/dream', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'},
      body=SPOT('Our Big Fat Dream Episode · Stuff You Should Know | Podcast on Spotify', '0:12')))
    await ctx.route('https://open.spotify.com/episode/orleans', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'},
      body=SPOT("New Orleans, NFL Stadiums, 'Dallas' | Monday Morning Podcast 9-21-26 | Podcast on Spotify", '0:05')))
    await ctx.route('https://itunes.apple.com/**', apple)
    await ctx.route('https://audio.example/**', mp3)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    tab = await ctx.new_page(); await tab.goto('https://open.spotify.com/episode/dream'); await asyncio.sleep(.6)
    tid = await sw.evaluate("chrome.tabs.query({url:'https://open.spotify.com/*'}).then(t=>t[0].id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    await pan.click('.fpList button'); await asyncio.sleep(3)
    start = await pan.input_value('.fpClip .rStart')
    print('5. the clip opens at:', start)
    if not start.startswith('0:12'): errs.append(f'the clip did not start where the player was: {start}')

    # 1. The tab moves to another episode's page.
    await tab.goto('https://open.spotify.com/episode/orleans'); await asyncio.sleep(2.5)
    now = await pan.evaluate("(() => { const n = document.querySelector('.fpNow'); return n && !n.hidden ? n.textContent.trim() : ''; })()")
    still = await pan.evaluate("document.querySelector('.fpClip .vTitle').textContent")
    print('1. with the old one open, the panel offers:', repr(now), '| still showing:', repr(still))
    if 'New Orleans' not in now: errs.append(f'the episode on the tab was not offered: {now!r}')
    if 'Dream' not in still: errs.append('the panel switched episodes by itself')
    before = len(CALLS)
    await pan.click('.fpNowGo'); await asyncio.sleep(4)
    print('   searches for one press:', len(CALLS) - before)
    if len(CALLS) - before != 1: errs.append(f'one press searched {len(CALLS) - before} times')
    title = await pan.evaluate("(document.querySelector('.fpClip:not([hidden]) .vTitle') || {}).textContent || ''")
    start2 = await pan.input_value('.fpClip .rStart')
    print('   after Clip this one instead:', repr(title), '| starts at', start2)
    if 'New Orleans' not in title: errs.append(f'one press did not open the episode on the tab: {title!r}')
    if not start2.startswith('0:05'): errs.append(f'the new clip did not start where the player was: {start2}')

    # 2 and 3. Choose a different episode.
    await pan.click('.fpChange'); await asyncio.sleep(2)
    box = await pan.input_value('.fpQ'); note = await pan.inner_text('.fpNote')
    print('2, 3. after Choose a different episode, the box:', repr(box), '| note:', repr(note))
    if 'New Orleans' not in box: errs.append(f'the box did not follow the tab: {box!r}')
    if 'Monday Morning Podcast. From' in note or 'Stuff You Should Know' in note: errs.append(f'the note kept the old show: {note!r}')

    # 4. Emptied by hand.
    await pan.fill('.fpQ', ''); await asyncio.sleep(.3)
    st = await pan.inner_text('.fpStatus')
    print('4. an empty box says:', repr(st))
    if 'Type the show' not in st: errs.append(f'an empty box said {st!r}')
    same = await pan.evaluate("[sameEpisode('Episode 1', 'Episode 12 · Show'), sameEpisode('Episode 1', 'Episode 1 · Show')]")
    print('matcher, Episode 1 against 12 and against itself:', same)
    if same != [False, True]: errs.append(f'the episode matcher said {same}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
