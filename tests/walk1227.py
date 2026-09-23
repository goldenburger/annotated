# The recording of 2026-09-23 at 12:27, the new front page with the extension installed.
#   1. A click inside the try-it no longer lets the extension wipe its strokes, and the try-it starts clean if
#      its marks go missing anyway.
#   2. New words selected while the take box is open offer "Use these words instead", keeping what was typed.
#   3. Make the annotation waits for words, and its message sits under the box and clears on typing.
#   4. A quote over two paragraphs keeps a break between them ("URL. The", not "URL.The").
#   5. The card is placed by the paper's layout, the same after a scroll, and under the paper when no room above.
#   6. Follow signed out asks inline, with a button, and never says it failed. No browser dialog.
#   8. The feed under the scenes leaves out what they show.
#   9. The hero's Get the Chrome extension leads to the steps, and Look around first to the scenes.
#  10. Scene motion plays while the scene is mid screen, not as it enters.
#  11. A scene's card picture is held to the drawing's height.
#  12. Downloading ticks the first step and brings the second forward, which has a Copy button.
import asyncio, json, pathlib, mimetypes
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
AUTHOR = {'id': 'a-1', 'handle': 'robo', 'display_name': 'Robo Taxi', 'avatar_url': ''}
def row(i, kind, source):
  return {'id': f'w-{kind}', 'author_id': 'a-1', 'kind': kind, 'take_text': f'A take on the {kind}', 'tag': None, 'poll': None, 'gif': None,
          'created_at': f'2026-09-2{i}T10:00:00Z', 'source': source, 'author': AUTHOR, 'comments': [], 'reactions': [], 'poll_votes': []}
ROWS = [row(1, 'video', {'title': 'A clip', 'start': 40, 'end': 48, 'duration': 150, 'url': 'https://www.youtube.com/watch?v=abc', 'poster': 'https://img.example/p.png'}),
        row(2, 'post', {'text': 'A post.', 'author': 'Someone', 'handle': '@someone', 'url': 'https://x.com/someone/status/1', 'shot': 'https://img.example/tall.png'}),
        row(3, 'article', {'text': 'Another passage entirely.', 'meta': {'title': 'Story', 'site': 'News', 'url': 'https://news.example/s'}})]
PEOPLE = [{'id': 'p-2', 'handle': 'someone', 'name': 'Someone Else', 'avatar': '', 'annotations': 3}]

def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def main():
  errs = []
  from PIL import Image
  import io
  def png(w, h):
    b = io.BytesIO(); Image.new('RGB', (w, h), (40, 40, 48)).save(b, 'PNG'); return b.getvalue()
  async def db(route):
    u = route.request.url
    if '/rpc/people_to_follow' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'id': 'p-2', 'handle': 'someone', 'display_name': 'Someone Else', 'avatar_url': '', 'annotations': 3}]))
    if '/rest/v1/annotations' in u and 'id=eq.' not in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(ROWS))
    await route.fulfill(status=200, content_type='application/json', body='[]')
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW1227'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://annotated-app.netlify.app/**', site)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    await ctx.route('https://img.example/p.png', lambda r: r.fulfill(status=200, body=png(640, 360), headers={'Content-Type': 'image/png'}))
    await ctx.route('https://img.example/tall.png', lambda r: r.fulfill(status=200, body=png(600, 1200), headers={'Content-Type': 'image/png'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1440, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    dialogs = []
    pg.on('dialog', lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto('https://annotated-app.netlify.app/'); await pg.wait_for_selector('.tiText'); await asyncio.sleep(2.5)
    await pg.mouse.click(1300, 860)
    SEL = """((a, b) => { const ps = document.querySelectorAll('.tiText p'); const n1 = ps[a[0]].firstChild, n2 = ps[b[0]].firstChild;
      const r = document.createRange(); r.setStart(n1, n1.nodeValue.indexOf(a[1])); r.setEnd(n2, n2.nodeValue.indexOf(b[1]) + b[1].length);
      getSelection().removeAllRanges(); getSelection().addRange(r); })"""
    # 4. Two paragraphs.
    await pg.evaluate(f"{SEL}([1, 'original'], [2, 'cleanest'])"); await asyncio.sleep(.5)
    await pg.click('.tiBtn'); await asyncio.sleep(1.6)
    # 3.
    off = await pg.evaluate("document.querySelector('.tiMake').disabled")
    if not off: errs.append('Make the annotation was on with an empty box')
    await pg.focus('#tiInput'); await pg.keyboard.press('Enter'); await asyncio.sleep(.3)
    say = await pg.evaluate("(() => { const s = document.querySelector('.tiSay'); return s.hidden ? '' : s.textContent; })()")
    await pg.keyboard.type('x'); await asyncio.sleep(.2)
    gone = await pg.evaluate("document.querySelector('.tiSay').hidden && !document.querySelector('.tiMake').disabled")
    print('3. an empty Enter says', repr(say), '| typing clears it and turns the button on:', gone)
    if say != 'Write a sentence first.' or not gone: errs.append(f'the take box message was {say!r}, cleared {gone}')
    await pg.keyboard.press('Backspace')
    # 1. Clicking inside the take box, with the extension loaded, leaves the strokes alone.
    before = await pg.evaluate("document.querySelectorAll('.tiText mark.annotated-hl').length")
    await pg.click('#tiInput'); await asyncio.sleep(.6)
    after = await pg.evaluate("document.querySelectorAll('.tiText mark.annotated-hl').length")
    print('1. strokes before and after a click in the take box:', before, after)
    if not before or after != before: errs.append(f'a click in the take box wiped the strokes, {before} -> {after}')
    # 2. New words while the box is open.
    await pg.keyboard.type('My first thought')
    await pg.evaluate(f"{SEL}([0, 'sidebar'], [0, 'extension'])"); await asyncio.sleep(.5)
    offered = await pg.evaluate("!document.querySelector('.tiSwap').hidden")
    await pg.click('.tiUse'); await asyncio.sleep(1.4)
    kept = await pg.input_value('#tiInput')
    now = await pg.evaluate("[...document.querySelectorAll('.tiText mark.annotated-hl')].map((m) => m.textContent).join('').trim()")
    print('2. offered:', offered, '| the take kept:', repr(kept), '| now marked:', repr(now))
    if not offered or kept != 'My first thought' or now != 'sidebar Chrome extension': errs.append(f'changing words mid-take went wrong: {offered}, {kept!r}, {now!r}')
    # Back to the two paragraphs, for the quote.
    await pg.evaluate(f"{SEL}([1, 'original'], [2, 'cleanest'])"); await asyncio.sleep(.4); await pg.click('.tiUse'); await asyncio.sleep(1.4)
    await pg.click('.tiMake'); await asyncio.sleep(1.4)
    quote = await pg.evaluate("document.querySelector('.tiInk').textContent")
    stored = await pg.evaluate("JSON.parse(localStorage.getItem('annotated-tryit')).quote")
    print('4. the card quotes', repr(quote))
    if 'URL. The' not in quote or '\n' not in stored: errs.append(f'two paragraphs ran together: {quote!r} / {stored!r}')
    # 5. The card after a scroll.
    t0 = await pg.evaluate("[document.querySelector('.tiLift').style.top, document.querySelector('.tiLift').classList.contains('under')]")
    await pg.mouse.wheel(0, 180); await asyncio.sleep(.6); await pg.mouse.move(1200, 200); await asyncio.sleep(.6)
    t1 = await pg.evaluate("[document.querySelector('.tiLift').style.top, document.querySelector('.tiLift').classList.contains('under')]")
    covers = await pg.evaluate("""(() => { const c = document.querySelector('.tiLift').getBoundingClientRect(), p = [...document.querySelectorAll('.tiText p')].pop().getBoundingClientRect();
      return c.top < p.bottom && c.bottom > p.top; })()""")
    print('5. the card before and after a scroll:', t0, t1, '| over the last line of the brief:', covers)
    if t0 != t1: errs.append(f'the card moved after a scroll: {t0} -> {t1}')
    if t1[1] and covers: errs.append('hanging below, the card covers the brief')
    # 1. Marks taken away underneath the try-it: it starts clean.
    await pg.evaluate("document.querySelector('.tiRedo').click()"); await asyncio.sleep(.8)
    await pg.evaluate(f"{SEL}([0, 'sidebar'], [0, 'extension'])"); await asyncio.sleep(.4); await pg.click('.tiBtn'); await asyncio.sleep(1.4)
    await pg.evaluate("document.querySelectorAll('.tiText mark.annotated-hl').forEach((m) => { m.replaceWith(...m.childNodes); })")
    await pg.fill('#tiInput', 'test'); await pg.click('.tiMake'); await asyncio.sleep(.8)
    clean = await pg.evaluate("({ box: document.querySelector('.tiTake').hidden, lift: document.querySelector('.tiLift').hidden, hint: document.querySelector('.tiHint').textContent })")
    print('   with its marks taken away it starts clean:', clean)
    if not (clean['box'] and clean['lift']): errs.append(f'the try-it did not start clean when its marks went missing: {clean}')

    # 5. Words on the first line leave no room above, so the card hangs under the paper, clear of the brief.
    await pg.evaluate(f"{SEL}([0, 'Annotated'], [0, 'sidebar'])"); await asyncio.sleep(.4); await pg.click('.tiBtn'); await asyncio.sleep(1.4)
    await pg.fill('#tiInput', 'The first line'); await pg.click('.tiMake'); await asyncio.sleep(1.4)
    low = await pg.evaluate("""(() => { const c = document.querySelector('.tiLift'), r = c.getBoundingClientRect(), paper = document.querySelector('.tiPaper').getBoundingClientRect(),
      bar = document.querySelector('.tiBar').getBoundingClientRect();
      return { under: c.classList.contains('under'), clearOfPaper: r.top >= paper.bottom - 30, clearOfBar: r.bottom <= bar.top + 2 }; })()""")
    print('5. with no room above, the card:', low)
    if not all(low.values()): errs.append(f'the card with no room above sat wrong: {low}')
    await pg.evaluate("document.querySelector('.tiRedo').click()"); await asyncio.sleep(.8)
    # 9.
    await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(.4)
    await pg.click('.heroGet'); await asyncio.sleep(1.4)
    at = await pg.evaluate("Math.round(document.querySelector('#get').getBoundingClientRect().top)")
    await pg.evaluate("scrollTo(0, 0)"); await asyncio.sleep(.4)
    await pg.click('.heroLook'); await asyncio.sleep(1.4)
    at2 = await pg.evaluate("Math.round(document.querySelector('.scenes').getBoundingClientRect().top)")
    print('9. Get the Chrome extension lands', at, 'px from the top of the steps, Look around first', at2, 'from the scenes')
    if not (-5 <= at <= 120) or not (-5 <= at2 <= 120): errs.append(f'the hero buttons led elsewhere: {at}, {at2}')
    # 8.
    shown = await pg.evaluate("[...document.querySelectorAll('.scCard.real .card')].map((c) => c.dataset.id)")
    feed = await pg.evaluate("[...document.querySelectorAll('.sitegrid .cards .card')].map((c) => c.dataset.id)")
    print('8. in the scenes', shown, '| in the feed', feed)
    if set(shown) & set(feed): errs.append('the feed repeated what the scenes show')
    # 11.
    h = await pg.evaluate("(() => { const i = document.querySelector('.sc-post .scCard img'); return i ? Math.round(i.getBoundingClientRect().height) : null; })()")
    print('11. the post card picture in its scene is', h, 'px tall')
    if not h or h > 200: errs.append(f'the post card picture swamps its scene at {h}px')
    # 10. Scroll a scene to just entering, then to mid screen.
    # The scenes work by hand now, so what plays by scrolling is the real card each one ends on.
    frac = "(() => +getComputedStyle(document.querySelector('.sc-video .scCard')).opacity)()"
    top = await pg.evaluate("document.querySelector('.sc-video').getBoundingClientRect().top + scrollY")
    await pg.evaluate(f"scrollTo(0, {top} - innerHeight + 120)"); await asyncio.sleep(.5)
    entering = await pg.evaluate(frac)
    await pg.evaluate(f"scrollTo(0, {top} - innerHeight * .3)"); await asyncio.sleep(.5)
    middle = await pg.evaluate(frac)
    print('10. the clip scene card is shown', entering, 'entering and', middle, 'mid screen')
    if entering > 0.3 or middle < 0.95: errs.append(f'the scene played at the wrong point: {entering} entering, {middle} mid screen')
    # 12.
    await pg.evaluate("document.querySelector('#get').scrollIntoView()")
    await pg.evaluate("document.querySelector('#get a[download]').addEventListener('click', (e) => e.preventDefault())")
    await pg.click('#get .giDo a[download]'); await asyncio.sleep(.4)
    st = await pg.evaluate("({ done: document.querySelector('.giSteps li').classList.contains('done'), now: document.querySelector('.giSteps li:nth-child(2)').classList.contains('now'), copy: !!document.querySelector('.giCopy') })")
    print('12. after the download:', st)
    if not all(st.values()): errs.append(f'the steps did not follow the download: {st}')
    # 6.
    fb = await pg.query_selector('.rail .followBtn')
    if not fb: errs.append('no Follow button in people worth following')
    else:
      await fb.click(); await asyncio.sleep(.6)
      ask = await pg.evaluate("(() => { const a = document.querySelector('.signAsk'); return a ? { text: a.textContent, near: !a.classList.contains('floating') } : null; })()")
      failed = await pg.evaluate("!!document.querySelector('.followErr')")
      print('6. Follow signed out:', ask, '| said it failed:', failed, '| browser dialogs:', dialogs)
      if not ask or 'Sign in with Google to follow people' not in ask['text'] or not ask['near']: errs.append(f'Follow signed out asked {ask}')
      if failed: errs.append('Follow signed out said it failed')
    if dialogs: errs.append(f'a browser dialog appeared: {dialogs}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
