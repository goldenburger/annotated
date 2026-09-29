# A post on X with a video (2.36.0). The recording of 2026-09-29 at 02:24 annotated one and got a screenshot of the
# player. The panel now opens on the video's trimmer, names the post it is from, and captures a real clip; the
# published annotation links to the post, not to YouTube. Quote the post switches back to the words, and words
# selected with the Annotate button are quoted as before.
import asyncio, re
from playwright.async_api import async_playwright
from _env import *
SRC = open('src.webm', 'rb').read()
POST = '''<!doctype html><html><head><title>Test Person on X: "Watch this launch" / X</title></head><body style="font:15px system-ui;max-width:600px;margin:20px">
<article data-testid="tweet"><div data-testid="User-Name"><span>Test Person</span><span>@testperson</span></div>
<div data-testid="tweetText"><span>Watch this launch. The second stage lights right on time.</span></div>
<div data-testid="videoPlayer"><video src="/media/src.webm" width="560" muted playsinline></video></div>
<a href="/testperson/status/1111111111111111111"><time datetime="2026-09-28T15:00:00.000Z">Sep 28</time></a></article>
</body></html>'''
# A GIF: an MP4 from another host that does not allow its frames to be read. And a post whose only video is inside the
# post it quotes (X draws a quoted post as a link card). Both are quoted as posts (audit of 2026-09-29).
GIF = POST.replace('/media/src.webm', 'https://video.twimg.example/tweet_video/gif.webm').replace('1111111111111111111', '3333333333333333333')
QUOTED = POST.replace('<div data-testid="videoPlayer">', '<div role="link"><div data-testid="videoPlayer">').replace('playsinline></video></div>', 'playsinline></video></div></div>').replace('1111111111111111111', '4444444444444444444')
PLAIN = POST.replace('<div data-testid="videoPlayer"><video src="/media/src.webm" width="560" muted playsinline></video></div>', '').replace('1111111111111111111', '2222222222222222222')

async def route(r):
  u = r.request.url
  if '/media/' in u:
    rng = r.request.headers.get('range'); n = len(SRC)
    if rng:
      a, b = re.match(r'bytes=(\d*)-(\d*)', rng).groups(); a = int(a or 0); b = int(b) if b else n - 1
      await r.fulfill(status=206, body=SRC[a:b + 1], headers={'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {a}-{b}/{n}'})
    else: await r.fulfill(status=200, body=SRC, headers={'Content-Type': 'video/webm'})
  elif '3333333333333333333' in u: await r.fulfill(status=200, body=GIF, headers={'Content-Type': 'text/html; charset=utf-8'})
  elif '4444444444444444444' in u: await r.fulfill(status=200, body=QUOTED, headers={'Content-Type': 'text/html; charset=utf-8'})
  elif '2222222222222222222' in u: await r.fulfill(status=200, body=PLAIN, headers={'Content-Type': 'text/html; charset=utf-8'})
  else: await r.fulfill(status=200, body=POST, headers={'Content-Type': 'text/html; charset=utf-8'})

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('xvideo'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--autoplay-policy=no-user-gesture-required', '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://x.com/**', route)
    await ctx.route('https://video.twimg.example/**', lambda r: r.fulfill(status=200, body=SRC, headers={'Content-Type': 'video/webm'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    await one_panel(sw)
    x = await ctx.new_page(); await x.set_viewport_size({'width': 1000, 'height': 800}); x.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await x.goto('https://x.com/testperson/status/1111111111111111111')
    await x.wait_for_function('document.querySelector("video").readyState >= 2')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(v=>v.url.includes('x.com')).id)")
    fut = asyncio.ensure_future(ctx.wait_for_event('page'))
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{sw.url.split('/')[2]}/sidepanel.html?tab={tid}',width:420,height:1000}})")
    pv = await fut; await pv.set_viewport_size({'width': 420, 'height': 1000}); pv.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    try: await pv.wait_for_selector('#videoMode:not([hidden]) .vTitle', timeout=10000)
    except Exception: errs.append('the video trimmer did not open for a post with a video')
    head = await pv.evaluate("({ title: (document.querySelector('#videoMode .vTitle') || {}).textContent, meta: (document.querySelector('#videoMode .vMeta') || {}).textContent, modes: [...document.querySelectorAll('#videoMode .modeSeg label')].map(l => l.textContent.trim()) })")
    print('trimmer:', head)
    if head['meta'] != '@testperson on X': errs.append('the trimmer does not name the post: ' + str(head['meta']))
    if 'Watch this launch' not in (head['title'] or ''): errs.append('the title is not the post')
    if head['modes'] != ['Clip the video', 'Quote the post']: errs.append('no switch between the video and the words')
    # Capture two seconds.
    await x.evaluate('document.querySelector("video").currentTime = 1'); await asyncio.sleep(.8); await pv.click('#videoMode .setStart')
    await x.evaluate('document.querySelector("video").currentTime = 4'); await asyncio.sleep(.8); await pv.click('#videoMode .setEnd')
    await pv.click('#videoMode .capBtn')
    try:
      await pv.wait_for_selector('#videoMode .vCompose:not([hidden])', timeout=30000)
      print('status:', ' '.join((await pv.inner_text('#videoMode .vStatus')).split())[:160])
    except Exception: errs.append('the clip was not captured: ' + ' '.join((await pv.inner_text('#videoMode')).split())[:200])
    # Published, it links to the post on X.
    await pv.fill('#videoMode .takeInput', 'Right on time.')
    newpage = asyncio.ensure_future(ctx.wait_for_event('page'))
    await pv.evaluate("() => Prefs.set('afterPublish','page')"); await publish_now(pv, '#videoMode .publish')
    try:
      ann = await asyncio.wait_for(newpage, 15); ann.on('pageerror', lambda e: errs.append('ANN ' + str(e)))
      await ann.wait_for_selector('.ann:not(.loading)', timeout=10000)
      src = await ann.evaluate("({ bar: (document.querySelector('.srcbar') || {}).textContent, href: (document.querySelector('.srcbar') || {}).href, clip: !!document.querySelector('.clipVideo'), top: [...document.querySelectorAll('.topRow a, .topRow button')].map(a => a.textContent.trim()) })")
      print('annotation page:', ' '.join((src['bar'] or '').split()), src['href'], src['top'])
      if not src['clip']: errs.append('the annotation has no clip')
      if src['href'] != 'https://x.com/testperson/status/1111111111111111111': errs.append('the source does not link to the post: ' + str(src['href']))
      if 'YouTube' in (src['bar'] or ''): errs.append('the source bar says YouTube')
      if not any(t in ('See the post on X', 'Back to the post') for t in src['top']): errs.append('the way back does not name the post')
      await ann.close()
    except Exception as e: errs.append('the annotation page did not open: ' + str(e)[:120])
    # Quote the post switches to the words.
    await x.bring_to_front(); await pv.bring_to_front()
    await pv.click('#videoMode .modeSeg label:has-text("Quote the post")')
    try: await pv.wait_for_selector('#postMode:not([hidden]) .modeSeg', timeout=8000)
    except Exception: errs.append('Quote the post did not switch to the post panel')
    # X's own view of the same post (/video/1) keeps the panel and what it holds (audit of 2026-09-29).
    await pv.click('#postMode .modeSeg label:has-text("Clip the video")'); await asyncio.sleep(3)
    await x.evaluate("history.pushState({}, '', '/testperson/status/1111111111111111111/video/1')"); await asyncio.sleep(3)
    same = await pv.evaluate("!document.querySelector('#videoMode').hidden && !!document.querySelector('#videoMode .modeSeg')")
    print('/video/1 keeps the clip panel:', same)
    if not same: errs.append("X's /video/1 view of the post dropped the clip panel")
    # A GIF, whose frames cannot be read, and a video inside a quoted post are quoted as posts.
    for pid, what in (('3333333333333333333', 'a GIF'), ('4444444444444444444', 'a video inside a quoted post')):
      await x.goto(f'https://x.com/testperson/status/{pid}'); await asyncio.sleep(5)
      st = await pv.evaluate("({ post: !document.querySelector('#postMode').hidden, video: !document.querySelector('#videoMode').hidden })")
      if pid.startswith('3'):
        xi = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(v=>v.url.includes('x.com'))).then((t) => chrome.tabs.sendMessage(t.id, { type: 'xv-info' }))")
        print('   the GIF reports', {k: xi.get(k) for k in ('ok', 'blocked', 'duration')})
        if not xi.get('blocked'): errs.append(f'the GIF was not found unreadable: {xi}')
      print(what, '->', st)
      if not st['post'] or st['video']: errs.append(f'{what} was offered as a clip: {st}')
    # A post without a video opens on the words, with no switch.
    await x.goto('https://x.com/testperson/status/2222222222222222222'); await asyncio.sleep(4)
    plain = await pv.evaluate("({ post: !document.querySelector('#postMode').hidden, video: !document.querySelector('#videoMode').hidden, seg: !!document.querySelector('#postMode .modeSeg') })")
    print('plain post:', plain)
    if not plain['post'] or plain['video'] or plain['seg']: errs.append('a post with no video did not open on its words alone')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
