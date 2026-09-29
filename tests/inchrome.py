# The home page shows the real extension (comparison with the other entries, 2026-09-29): a section "In Chrome" under
# Yours so far plays 0:03 to 0:30 of the submitted demo, silently, in a browser frame, only while it is in sight.
#   1. The section is there, after Yours so far and before Features, and its video is not fetched until it is seen.
#   2. Scrolled into sight, the video loads and plays, muted, and it pauses once scrolled away.
#   3. With reduced motion it does not play by itself and offers its controls.
#   4. A phone width gets one column and no sideways scroll.
import asyncio, os
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site, db

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1280, 'height': 800})
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    asked = []
    pg.on('request', lambda r: asked.append(r.url) if 'panel-demo.mp4' in r.url else None)
    await pg.goto('https://annotated-app.netlify.app/?preview=visitor&noplanes'); await asyncio.sleep(3)
    order = await pg.evaluate("[...document.querySelectorAll('.landMain > section, .landMain > div')].map((e) => e.className.split(' ')[0])")
    print('1. sections:', order, '| video asked for before scrolling:', len(asked))
    if 'landChrome' not in order: errs.append('the In Chrome section is missing')
    else:
      i = order.index('landChrome')
      if 'landFeatures' in order and order.index('landFeatures') < i: errs.append('In Chrome comes after Features')
      if 'landLatest' in order and order.index('landLatest') > i: errs.append('In Chrome comes before Yours so far')
    # With Yours so far empty the section can start on screen, and then it is right to fetch it at once.
    shown = await pg.evaluate("(() => { const r = document.querySelector('.lcVideo').getBoundingClientRect(); return Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / r.height; })()")
    print('   share of the video on screen at first:', round(shown, 2))
    if asked and shown < 0.3: errs.append('the demo video was fetched before it was in sight')
    if not asked and shown > 0.4: errs.append('the demo video was on screen and not fetched')
    await pg.evaluate("document.querySelector('.landChrome').scrollIntoView({ block: 'center' })"); await asyncio.sleep(3)
    st = await pg.evaluate("(() => { const v = document.querySelector('.lcVideo'); return { t: v.currentTime, paused: v.paused, muted: v.muted, src: v.currentSrc.split('/').pop() }; })()")
    await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'inchrome_desktop.png'))
    print('2. in sight:', st)
    if st['paused'] or st['t'] <= 0 or not st['muted'] or st['src'] != 'panel-demo.mp4': errs.append(f'the demo did not play muted in sight: {st}')
    await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(1)
    if not await pg.evaluate("document.querySelector('.lcVideo').paused"): errs.append('the demo kept playing out of sight')
    # 5. The hero is as tall as the tab shown, so the next section starts on the first screen of a laptop, and choosing
    #    a taller tab grows it once without shrinking back when a shorter one is chosen again.
    await pg.goto('https://annotated-app.netlify.app/?preview=visitor&noplanes'); await asyncio.sleep(3)
    top = await pg.evaluate("Math.round(document.querySelector('.landHero').nextElementSibling ? document.querySelector('.landHero').getBoundingClientRect().bottom : 0)")
    hs = []
    for k in ('Article', 'YouTube clip', 'Article', 'Podcast'):
      await pg.click(f'.tryTab:has-text("{k}")'); await asyncio.sleep(.6)
      hs.append(await pg.evaluate("Math.round(document.querySelector('.heroTry').getBoundingClientRect().height)"))
    print('5. hero ends at', top, '| try-it heights by tab:', hs)
    if top > 560: errs.append(f'the hero runs to {top} pixels, leaving the next section below the fold')
    if not (hs[1] > hs[0] and hs[2] == hs[1] and hs[3] == hs[1]): errs.append(f'the try-it did not grow once and hold: {hs}')
    await c.close()
    # 3.
    c = await b.new_context(viewport={'width': 1280, 'height': 800}, reduced_motion='reduce')
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page()
    await pg.goto('https://annotated-app.netlify.app/?preview=visitor&noplanes'); await asyncio.sleep(2)
    await pg.evaluate("document.querySelector('.landChrome').scrollIntoView({ block: 'center' })"); await asyncio.sleep(2)
    rm = await pg.evaluate("(() => { const v = document.querySelector('.lcVideo'); return { paused: v.paused, controls: v.controls }; })()")
    print('3. reduced motion:', rm)
    if not rm['paused'] or not rm['controls']: errs.append(f'with reduced motion the demo played or had no controls: {rm}')
    await c.close()
    # 4.
    c = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page()
    await pg.goto('https://annotated-app.netlify.app/?preview=visitor&noplanes'); await asyncio.sleep(2)
    await pg.evaluate("document.querySelector('.landChrome').scrollIntoView({ block: 'start' })"); await asyncio.sleep(1.5)
    ph = await pg.evaluate("(() => { const f = document.querySelector('.lcFrame').getBoundingClientRect(), c = document.querySelector('.lcCopy').getBoundingClientRect(); return { wide: document.documentElement.scrollWidth, frameW: Math.round(f.width), below: f.top >= c.bottom - 1 }; })()")
    await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'inchrome_phone.png'))
    print('4. phone:', ph)
    if ph['wide'] > 390 or not ph['below'] or ph['frameW'] < 300: errs.append(f'the phone layout is off: {ph}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
