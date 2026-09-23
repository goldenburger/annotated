# The front page's try-it (website/public/tryit.js) and the handover to the extension.
#   1. Selecting words in the brief shows its own Annotate button, and the extension's does not appear there.
#   2. Annotate inks the words with the real pen (one mark to a word), and a take makes the card, with the take
#      on top and the quote under it, kept in the page's storage.
#   3. With the extension installed, that page hands the draft over, and the panel's Home offers to publish it.
#      Not now takes it away.
#   4. Another site's page with the same storage key hands nothing over.
import asyncio, pathlib, mimetypes
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'

def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  ctype = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': ctype})

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profTryit'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://elsewhere.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html'},
      body="<!doctype html><title>x</title><p>x</p><script>localStorage.setItem('annotated-tryit', JSON.stringify({quote:'planted words', take:'planted take', at:1}))</script>"))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    # 4. Another site first.
    other = await ctx.new_page(); await other.goto('https://elsewhere.example/'); await other.reload(); await asyncio.sleep(1.5)
    planted = await sw.evaluate("chrome.storage.local.get('annotatedTryit').then(o => o.annotatedTryit || null)")
    print('4. another site handed over:', planted)
    if planted: errs.append('a page on another site put a draft in front of the panel')
    await other.close()

    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1440, 'height': 900}); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tiText'); await asyncio.sleep(1.5)
    await pg.mouse.click(1300, 800)
    await pg.evaluate("""(() => { const n = document.querySelector('.tiText p').firstChild, t = n.nodeValue; const r = document.createRange();
      r.setStart(n, t.indexOf('quickly')); r.setEnd(n, t.indexOf('video') + 5); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    await asyncio.sleep(.8)
    seen = await pg.evaluate("""() => ({ ours: !document.querySelector('.tiBtn').hidden, hint: document.querySelector('.tiHint').textContent,
      theirs: [...document.querySelectorAll('.annotated-ui')].some((h) => h.style.display === 'block') })""")
    print('1. selected in the brief:', seen)
    if not seen['ours']: errs.append("the try-it's Annotate button did not appear")
    if seen['theirs']: errs.append("the extension's own Annotate button appeared inside the try-it as well")
    if seen['hint'] != '7 words selected.': errs.append(f"the bar said {seen['hint']!r}")

    # The same selection outside the box does bring the extension's button, so the check above means something.
    await pg.evaluate("""(() => { const n = document.querySelector('.heroSub').firstChild; const r = document.createRange();
      r.setStart(n, 0); r.setEnd(n, 20); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    await asyncio.sleep(.8)
    outside = await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].some((h) => h.style.display === 'block')")
    print('   outside the box the extension offers its button:', outside)
    if not outside: errs.append("the extension's button did not appear outside the box either, so the check proves nothing")
    await pg.evaluate("""(() => { const n = document.querySelector('.tiText p').firstChild, t = n.nodeValue; const r = document.createRange();
      r.setStart(n, t.indexOf('quickly')); r.setEnd(n, t.indexOf('video') + 5); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    await asyncio.sleep(.8)
    await pg.click('.tiBtn'); await asyncio.sleep(1.8)
    inked = await pg.evaluate("document.querySelectorAll('.tiText mark.annotated-hl').length")
    print('2. marks drawn:', inked)
    if inked != 7: errs.append(f'the pen drew {inked} marks for seven words')
    await pg.fill('#tiInput', 'Clip is the verb that matters here.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1.2)
    card = await pg.evaluate("""() => ({ take: (document.querySelector('.tiTakeOut') || {}).textContent, quote: (document.querySelector('.tiInk') || {}).textContent,
      kept: JSON.parse(localStorage.getItem('annotated-tryit') || 'null') })""")
    print('   the card:', card['take'], '|', card['quote'])
    if card['take'] != 'Clip is the verb that matters here.' or card['quote'] != '“quickly clip media, text, audio, or video,”': errs.append(f'the card read {card}')
    lifted = await pg.evaluate("""() => ({ up: document.querySelector('.tiLift').classList.contains('up'), shadow: document.querySelector('.tiShadow').classList.contains('on'),
      wire: document.querySelector('.tiWire').classList.contains('on'), z: getComputedStyle(document.querySelector('.tiLift')).transform })""")
    print('   the take lifted off the paper:', lifted)
    if not (lifted['up'] and lifted['shadow'] and lifted['wire']): errs.append(f'the take did not lift with its shadow and line: {lifted}')
    if not card['kept']: errs.append('the annotation was not kept in the page')

    # 3. The handover and the offer.
    await asyncio.sleep(.8)
    got = await sw.evaluate("chrome.storage.local.get('annotatedTryit').then(o => o.annotatedTryit || null)")
    print('3. handed to the extension:', got)
    if not got or got.get('take') != 'Clip is the verb that matters here.': errs.append(f'the draft was not handed over: {got}')
    blank = await ctx.new_page()
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(2.5)
    offer = await pan.evaluate("""() => { const b = document.querySelector('#browseMode .tryitCarry'); return b ? { take: b.querySelector('.tcTake').textContent,
      btn: b.querySelector('.tcPub').textContent, first: b.previousElementSibling && b.previousElementSibling.classList.contains('browseHead') } : null; }""")
    print('   the panel offers:', offer)
    if not offer or offer['take'] != 'Clip is the verb that matters here.' or offer['btn'] != 'Publish it': errs.append(f'Home did not offer it: {offer}')
    elif not offer['first']: errs.append('the offer was not the first thing under Home')
    await pan.click('#browseMode .tcNo'); await asyncio.sleep(.5)
    gone = await sw.evaluate("chrome.storage.local.get('annotatedTryit').then(o => o.annotatedTryit || null)")
    if gone or await pan.query_selector('#browseMode .tryitCarry'): errs.append('Not now left the offer behind')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
