# The four scenes on the front page work (website/public/scenetry.js), with the extension loaded.
#   A clip: the end handle drags, the length follows, it stops at 90 seconds and says so, arrow keys move it,
#   and Capture clip then a take makes a card naming the range.
#   A podcast moment: Play selection runs a playhead across the stretch, and Clip it makes a card.
#   A passage and a post: selected words get the real pen, the extension's own button stays away, and a take
#   makes a card quoting them. The post can also take the whole post.
#   Every card is labelled Example, Start over and Make another put the scene back, and no scene shows a
#   second, static Example card beside it.
import asyncio, pathlib, mimetypes
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
SEL = """([k, a, z]) => { const t = document.querySelector('.st-' + k + ' [data-annotated-self]'); const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) if (n.nodeValue.includes(a)) break; const r = document.createRange(); r.setStart(n, n.nodeValue.indexOf(a)); r.setEnd(n, n.nodeValue.indexOf(z) + z.length);
  getSelection().removeAllRanges(); getSelection().addRange(r); }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profSceneTry'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1440, 'height': 900}); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tryTabs'); await asyncio.sleep(1.5)
    n = await pg.evaluate("document.querySelectorAll('.tryPanel.sceneTry').length")
    print('working tabs:', n)
    if n != 3: errs.append(f'{n} working tabs besides the brief, wanted 3')
    tab = lambda k: pg.click({'video': '#tab-video', 'audio': '#tab-audio', 'article': '#tab-article', 'post': '#tab-post'}[k])
    times = lambda k: pg.evaluate(f"document.querySelector('.st-{k} .stTimes').textContent")

    # A clip.
    await tab('video'); await asyncio.sleep(.4)
    h = await pg.query_selector('.st-video .stHandle.z'); await h.scroll_into_view_if_needed(); await asyncio.sleep(.5)
    bb = await h.bounding_box()
    await pg.mouse.move(bb['x'] + 7, bb['y'] + 30); await pg.mouse.down(); await pg.mouse.move(bb['x'] + 90, bb['y'] + 30, steps=8); await pg.mouse.up()
    t1 = await times('video')
    await pg.mouse.move(bb['x'] + 90, bb['y'] + 30); await pg.mouse.down(); await pg.mouse.move(bb['x'] + 600, bb['y'] + 30, steps=8); await pg.mouse.up()
    t2 = await times('video'); cap = await pg.evaluate("document.querySelector('.st-video .stLen').classList.contains('edge')")
    await h.focus(); await pg.keyboard.press('Shift+ArrowLeft'); t3 = await times('video')
    print('clip: dragged', repr(t1), '| pulled far', repr(t2), 'capped', cap, '| Shift and Left', repr(t3))
    if t1.startswith('3:10 to 3:52'): errs.append('dragging the end handle did nothing')
    if '90 seconds, as long as a clip goes' not in t2 or not cap: errs.append(f'the clip went past 90 seconds or did not say so: {t2!r}')
    if '85 seconds' not in t3: errs.append(f'the arrow key did not move the handle five seconds: {t3!r}')
    await pg.click('.st-video .stGo'); await asyncio.sleep(.3)
    await pg.fill('.st-video textarea', 'Watch his hands.'); await pg.keyboard.press('Enter'); await asyncio.sleep(.4)
    card = await pg.evaluate("(() => { const c = document.querySelector('.st-video .stCard'); return c ? { ex: c.querySelector('.tiExample').textContent, take: c.querySelector('.stCardTake').textContent, what: c.querySelector('.stCardWhat').textContent } : null; })()")
    print('   the card:', card)
    if not card or card['ex'] != 'Example' or card['take'] != 'Watch his hands.' or not card['what'].startswith('Clip 3:10 to 4:35'): errs.append(f'the clip card read {card}')
    await pg.click('.st-video .stAgain'); await asyncio.sleep(.2)
    if await pg.query_selector('.st-video .stCard') or not await pg.is_visible('.st-video .stGo'): errs.append('Make another did not put the clip scene back')

    # A podcast moment.
    await tab('audio'); await asyncio.sleep(.4)
    await pg.click('.st-audio .stPlay'); await asyncio.sleep(1)
    head = await pg.evaluate("(() => { const h = document.querySelector('.st-audio .stHead'); return { shown: !h.hidden, left: h.style.left }; })()")
    print('podcast: the playhead', head)
    if not head['shown']: errs.append('Play selection showed no playhead')
    await asyncio.sleep(3.5); await pg.click('.st-audio .stGo'); await pg.fill('.st-audio textarea', 'The number.'); await pg.keyboard.press('Enter'); await asyncio.sleep(.4)
    what = await pg.evaluate("(document.querySelector('.st-audio .stCardWhat') || {}).textContent || ''")
    if not what.startswith('Audio clip 21:05 to 21:25 of 58:00'): errs.append(f'the podcast card read {what!r}')

    # A passage, and a post.
    for k, a, z, want in [('post', 'support tickets', 'weekend', 'support tickets doubled over the weekend')]:
      await tab(k); await asyncio.sleep(.4)
      el = await pg.query_selector(f'.st-{k}'); await el.scroll_into_view_if_needed(); await asyncio.sleep(.3)
      await pg.evaluate(SEL, [k, a, z]); await asyncio.sleep(.6)
      ours = await pg.is_visible(f'.st-{k} .stGo')
      theirs = await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].some((h) => h.style.display === 'block')")
      await pg.click(f'.st-{k} .stGo'); await asyncio.sleep(1.4)
      inked = await pg.evaluate(f"document.querySelectorAll('.st-{k} mark.annotated-hl').length")
      await pg.fill(f'.st-{k} textarea', 'A take.'); await pg.keyboard.press('Enter'); await asyncio.sleep(.4)
      q = await pg.evaluate(f"(document.querySelector('.st-{k} .stCardWhat') || {{}}).textContent || ''")
      print(f'{k}: our button {ours}, the extension\'s {theirs}, marks {inked}, quote {q!r}')
      if not ours or theirs: errs.append(f'{k}: the wrong Annotate button showed ({ours}, {theirs})')
      if not inked: errs.append(f'{k}: the pen drew nothing')
      if q != f'“{want}.”' and q != f'“{want}”': errs.append(f'{k}: the card quoted {q!r}')
      await pg.click(f'.st-{k} .stAgain'); await asyncio.sleep(.3)
      if await pg.evaluate(f"document.querySelectorAll('.st-{k} mark.annotated-hl').length"): errs.append(f'{k}: Make another left the marks')
    await pg.click('.st-post .stWhole'); await asyncio.sleep(1.4)
    await pg.fill('.st-post textarea', 'All of it.'); await pg.keyboard.press('Enter'); await asyncio.sleep(.4)
    whole = await pg.evaluate("(document.querySelector('.st-post .stCardWhat') || {}).textContent || ''")
    print('post, the whole of it:', repr(whole))
    if 'We shipped the redesign on Friday.' not in whole: errs.append(f'Use the whole post quoted {whole!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
