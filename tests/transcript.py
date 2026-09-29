# The transcript beside a YouTube clip (2.38.0, David's idea from the recording of 2026-09-29 at 06:35: the panel is
# empty under Capture clip while you look for the moment).
#   1. The panel reads YouTube's own transcript (opened out of sight and put back hidden) and draws it under Capture clip.
#   2. The line being spoken is marked and followed; reading ahead stops following until Back to now.
#   3. The clip's lines are marked; clicking a line jumps the video there; selecting lines makes them the clip.
#   4. Find words marks the lines that have them and counts them; words it cannot find say so.
#   5. Every word is drawn as text (a segment carrying markup stays text), and a video with no transcript shows no sheet.
#   6. Captured, the sheet folds and the clip's words travel with it to the annotation's page.
import asyncio, re, os
from playwright.async_api import async_playwright
from _env import *
SRC = open('src.webm', 'rb').read()
LINES = [(0, 'Welcome back to the show.'), (4, 'Today we talk about rockets.'), (9, 'The booster came back in one piece.'),
         (14, 'Nobody expected the banana moment.'), (19, 'That was the week everything changed.'), (24, '<img src=x onerror="window.__owned=1">'),
         (29, 'And then the second flight went up.'), (34, 'It landed right on the tower.'), (39, 'Thanks for watching.')]
def seg(t, text):
  m, s = divmod(t, 60)
  import html
  return (f'<transcript-segment-view-model><div class="ts">{m}:{s:02d}</div><div class="a11y">{t} seconds</div>'
          f'<span class="tx">{html.escape(text)}</span></transcript-segment-view-model>')
PANEL = ''.join(seg(t, x) for t, x in LINES)
YT = '''<!doctype html><title>Rocket talk - YouTube</title>
<ytd-watch-flexy><div id="movie_player"><video class="html5-main-video" src="/media/src.webm" width="640"></video></div>
<ytd-watch-metadata><h1 class="title">Rocket talk</h1>
<div id="description-inline-expander"><button id="expand">...more</button>
<ytd-video-description-transcript-section-renderer hidden><button aria-label="Show transcript">Show transcript</button></ytd-video-description-transcript-section-renderer></div></ytd-watch-metadata></ytd-watch-flexy>
<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>
<script>
document.getElementById('expand').onclick = () => { document.querySelector('ytd-video-description-transcript-section-renderer').hidden = false; };
document.querySelector('[aria-label="Show transcript"]').onclick = () => { const p = document.querySelector('ytd-engagement-panel-section-list-renderer');
  p.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'); window.__opened = (window.__opened || 0) + 1;
  setTimeout(() => { p.innerHTML = PANEL_HTML; }, 300); };
</script>'''.replace('PANEL_HTML', repr(PANEL))
NONE = '''<!doctype html><title>Silent film - YouTube</title><div id="movie_player"><video class="html5-main-video" src="/media/src.webm" width="640"></video></div><h1 class="title">Silent film</h1>'''

async def route(r):
  u = r.request.url
  if '/media/' in u:
    rng = r.request.headers.get('range'); n = len(SRC)
    if rng:
      a, b = re.match(r'bytes=(\d*)-(\d*)', rng).groups(); a = int(a or 0); b = int(b) if b else n - 1
      return await r.fulfill(status=206, body=SRC[a:b + 1], headers={'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {a}-{b}/{n}'})
    return await r.fulfill(status=200, body=SRC, headers={'Content-Type': 'video/webm'})
  await r.fulfill(status=200, body=NONE if 'NOTRANS' in u else YT, headers={'Content-Type': 'text/html; charset=utf-8'})

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('transcript'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--autoplay-policy=no-user-gesture-required', '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://www.youtube.com/**', route)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    await one_panel(sw)
    yt = ctx.pages[0] if ctx.pages else await ctx.new_page()
    for extra in ctx.pages[1:]: await extra.close()
    await yt.set_viewport_size({'width': 1000, 'height': 800})
    await yt.goto('https://www.youtube.com/watch?v=TRANS00001'); await yt.wait_for_function('document.querySelector("video").readyState >= 2')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(v=>v.url.includes('youtube')).id)")
    fut = asyncio.ensure_future(ctx.wait_for_event('page'))
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{sw.url.split('/')[2]}/sidepanel.html?tab={tid}',width:420,height:1000}})")
    pv = await fut; await pv.set_viewport_size({'width': 420, 'height': 1000}); pv.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    try: await pv.wait_for_selector('#videoMode .vTrans:not([hidden]) .trList li', timeout=15000)
    except Exception: errs.append('no transcript sheet appeared')
    r = await pv.evaluate("""() => ({ n: document.querySelectorAll('#videoMode .trList li').length, texts: [...document.querySelectorAll('#videoMode .trX')].map((x) => x.textContent),
      after: document.querySelector('.vTrans').compareDocumentPosition(document.querySelector('#videoMode section.act')) & Node.DOCUMENT_POSITION_PRECEDING })""")
    page = await yt.evaluate("({ vis: document.querySelector('ytd-engagement-panel-section-list-renderer').getAttribute('visibility'), owned: !!window.__owned, opened: window.__opened || 0 })")
    print('1.', r['n'], 'lines; under Capture clip:', bool(r['after']), '| YouTube panel left', page)
    if r['n'] != len(LINES): errs.append(f'the transcript has {r["n"]} lines, not {len(LINES)}')
    if not r['after']: errs.append('the transcript is not under Capture clip')
    if page['vis'] != 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN': errs.append("YouTube's transcript panel was left open")
    # 5. Markup stays text.
    if '<img src=x onerror="window.__owned=1">' not in r['texts'] or page['owned'] or await pv.evaluate('!!window.__owned') or await pv.evaluate("!!document.querySelector('.trList img')"):
      errs.append('a line carrying markup was not drawn as text')
    # 2. Following the video.
    await yt.evaluate('document.querySelector("video").currentTime = 15'); await asyncio.sleep(2.5)
    now = await pv.evaluate("(document.querySelector('.trList li.now .trX') || {}).textContent")
    print('2. at 0:15 the marked line is:', now)
    if now != 'Nobody expected the banana moment.': errs.append(f'the line being spoken is not marked: {now!r}')
    await pv.hover('.trList'); await pv.mouse.wheel(0, 200); await asyncio.sleep(.4)
    ahead = await pv.evaluate("!document.querySelector('.trNow').hidden")
    await pv.click('.trNow'); await asyncio.sleep(.4)
    back = await pv.evaluate("document.querySelector('.trNow').hidden")
    print('   reading ahead offers Back to now:', ahead, '| pressed, it follows again:', back)
    if not ahead or not back: errs.append('reading ahead does not stop following, or Back to now does not bring it back')
    # 3. Click a line, then select lines.
    await pv.click('.trList li:nth-child(8) .trX'); await asyncio.sleep(1.2)
    t = await yt.evaluate('document.querySelector("video").currentTime')
    print('3. clicking the 0:34 line put the video at', round(t, 1))
    if abs(t - 34) > 1.2: errs.append(f'clicking a line did not jump the video there ({t})')
    box = await pv.evaluate("""() => { const a = document.querySelectorAll('.trList li')[2].querySelector('.trX').getBoundingClientRect(), z = document.querySelectorAll('.trList li')[3].querySelector('.trX').getBoundingClientRect();
      return [a.left + 2, a.top + a.height / 2, z.right - 2, z.top + z.height / 2]; }""")
    await pv.mouse.move(box[0], box[1]); await pv.mouse.down(); await pv.mouse.move(box[2], box[3], steps=8); await pv.mouse.up(); await asyncio.sleep(1)
    rng = await pv.evaluate("({ s: document.querySelector('#videoMode .rStart').value, e: document.querySelector('#videoMode .rEnd').value, said: document.querySelector('#videoMode .rMoved').textContent, inClip: [...document.querySelectorAll('.trList li.in')].map((l) => +l.dataset.i) })")
    print('   selecting the 0:09 and 0:14 lines made the clip', rng)
    if rng['s'] != '0:09.0' or rng['e'] != '0:19.0' or rng['inClip'] != [2, 3]: errs.append(f'selecting lines did not make them the clip: {rng}')
    if os.environ.get('SHOT'): await pv.screenshot(path=os.environ['SHOT'])
    # 4. Find words.
    await pv.fill('.trQ', 'banana'); await asyncio.sleep(.6)
    f = await pv.evaluate("({ count: document.querySelector('.trCount').textContent, hits: [...document.querySelectorAll('.trList li.hit')].map((l) => +l.dataset.i) })")
    await pv.fill('.trQ', 'zeppelin'); await asyncio.sleep(.6)
    none = await pv.evaluate("document.querySelector('.trCount').textContent")
    await pv.fill('.trQ', ''); await asyncio.sleep(.4)
    print('4. banana:', f, '| zeppelin:', none)
    if f['hits'] != [3] or f['count'] != '1 of 1': errs.append(f'find did not mark the line: {f}')
    if none != 'Not said in this video': errs.append(f'words it cannot find: {none!r}')
    # 6. Capture: the sheet folds, the words travel.
    await pv.click('#videoMode .capBtn')
    try: await pv.wait_for_selector('#videoMode .vCompose:not([hidden])', timeout=30000)
    except Exception: errs.append('the clip was not captured')
    folded = await pv.evaluate("document.querySelector('.vTrans').classList.contains('folded')")
    await pv.fill('#videoMode .takeInput', 'The banana moment.')
    newpage = asyncio.ensure_future(ctx.wait_for_event('page'))
    await pv.evaluate("() => Prefs.set('afterPublish','page')"); await publish_now(pv, '#videoMode .publish')
    words = None
    try:
      ann = await asyncio.wait_for(newpage, 15); await ann.wait_for_selector('.ann:not(.loading)', timeout=10000)
      words = await ann.evaluate("(document.querySelector('.clipWords p') || {}).textContent")
    except Exception as e: errs.append('the annotation page did not open: ' + str(e)[:80])
    print('6. folded after capture:', folded, '| on the page:', words)
    if not folded: errs.append('the transcript did not fold once the take was being written')
    if words != 'The booster came back in one piece. Nobody expected the banana moment.': errs.append(f"the clip's words did not travel with it: {words!r}")
    # 5. No transcript, no sheet.
    await yt.goto('https://www.youtube.com/watch?v=NOTRANS001'); await asyncio.sleep(6)
    hidden = await pv.evaluate("document.querySelector('#videoMode .vTrans').hidden")
    print('5. a video with no transcript hides the sheet:', hidden)
    if not hidden: errs.append('a video with no transcript still shows the sheet')
    await ctx.close()
  print('errors:', errs)
asyncio.run(main())
