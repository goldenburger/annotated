# The recording of 2026-09-24 at 21:48, and the notes after it.
#   1. Your cards from before fly in again on each visit (the planes queue them), as asked for again.
#   2. With the extension installed, a card in Yours so far opens the tab it was made in.
#   3. The foot of the home page turns the paper planes off and on (annotated-planes-off), and with them off,
#      nothing flies and the brief is shown at once.
#   4. Audit of 2026-09-24: a new take started while a reset is pending opens an empty box with no old ending;
#      "Mark a sentence for me" after a finished take puts the old card away; Undo ends when a new take is made;
#      cards redrawn after a removal are not queued to fly in again.
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
now = int(time.time() * 1000)
YOURS = [{'kind': 'post', 'take': 'Post take.', 'quote': 'y', 'source': 'An example post on X', 'at': now - 3000},
         {'kind': 'audio', 'take': 'Moment take.', 'what': 'Audio clip 1:16 to 1:38 of 11:04', 'source': 'NASA', 'at': now - 4000}]

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await c.add_init_script(f"try {{ if (!localStorage.getItem('annotated-yours')) localStorage.setItem('annotated-yours', {json.dumps(json.dumps(YOURS))}); }} catch (e) {{}}")
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 1.
    await pg.goto(URL + '?planes'); await asyncio.sleep(1)
    queued = await pg.evaluate("[...document.querySelectorAll('.llRow .yours > .card')].map((x) => x.dataset.plQueued === '1')")
    print('1. your earlier cards queued to fly in:', queued)
    if queued != [True, True]: errs.append(f'your earlier cards do not fly in: {queued}')
    # 2.
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
    await pg.evaluate("document.documentElement.dataset.annotatedInstalled = '1'; document.dispatchEvent(new CustomEvent('annotated-installed'))"); await asyncio.sleep(.3)
    await pg.evaluate("document.querySelector('.landLatest').scrollIntoView()"); await asyncio.sleep(.3)
    await pg.click('.llRow .yours:nth-child(2) .card .ctake'); await asyncio.sleep(1)
    tab = await pg.evaluate("document.querySelector('.tryTab[aria-selected=\"true\"]').id")
    print('2. a podcast card opened the tab', tab)
    if tab != 'tab-audio': errs.append(f'the card did not open its tab: {tab}')
    # 3.
    sw = await pg.evaluate("(document.querySelector('.planesSwitch') || {}).textContent || null")
    print('3. the switch reads', repr(sw))
    if sw != 'Turn paper planes off': errs.append(f'no switch for the planes: {sw!r}')
    await pg.goto(URL + '?planes'); await asyncio.sleep(.5)
    async with pg.expect_navigation():
      await pg.click('.planesSwitch')
    await pg.goto(URL + '?planes'); await asyncio.sleep(.4)
    st = await pg.evaluate("({ planes: document.querySelectorAll('.pl-layer').length, waiting: document.documentElement.classList.contains('planes-waiting'), sw: document.querySelector('.planesSwitch').textContent, fold: Fold.on() })")
    print('   with the planes turned off:', st)
    if st != {'planes': 0, 'waiting': False, 'sw': 'Turn paper planes on', 'fold': False}: errs.append(f'turning the planes off did not stop them: {st}')
    # 4.
    await pg.evaluate("localStorage.removeItem('annotated-planes-off')")
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
    await pg.evaluate("document.dispatchEvent(new CustomEvent('annotated-tryit-touched'))"); await asyncio.sleep(.3)
    await pg.click('.tiForMe'); await asyncio.sleep(1.4)
    await pg.fill('#tiInput', 'First.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1)
    await pg.evaluate("document.querySelector('.tiRedo').click()")
    await pg.click('.tiForMe'); await asyncio.sleep(1.4)
    box = await pg.evaluate("({ value: document.querySelector('#tiInput').value, after: !document.querySelector('.tiAfter').hidden, open: !document.querySelector('.tiTake').hidden })")
    print('4. a take started during a reset:', box)
    if box != {'value': '', 'after': False, 'open': True}: errs.append(f'the take box reopened with the old take: {box}')
    await pg.fill('#tiInput', 'Second.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1)
    await pg.click('.tiForMe'); await asyncio.sleep(1.4)
    old = await pg.evaluate("({ lift: !document.querySelector('.tiLift').hidden && document.querySelector('.tiLift').classList.contains('up'), after: !document.querySelector('.tiAfter').hidden, open: !document.querySelector('.tiTake').hidden })")
    print('   Mark a sentence for me after a finished take:', old)
    if old != {'lift': False, 'after': False, 'open': True}: errs.append(f'the old card stayed over the new take: {old}')
    await pg.evaluate("document.querySelector('.landLatest').scrollIntoView()"); await asyncio.sleep(.3)
    await pg.hover('.llRow .yours:first-child'); await pg.click('.llRow .yours:first-child .yDel'); await asyncio.sleep(.3)
    await pg.evaluate("scrollTo(0, 0)"); await pg.fill('#tiInput', 'Third.'); await pg.keyboard.press('Enter'); await asyncio.sleep(.6)
    und = await pg.evaluate("!document.querySelector('.llUndo').hidden")
    print('   Undo still offered after a new take:', und)
    if und: errs.append('Undo stayed after a new take, and would have wiped it')
    await pg.goto(URL + '?planes'); await asyncio.sleep(4.5)
    await pg.evaluate("document.querySelector('.llClear').click()"); await asyncio.sleep(.3)
    await pg.evaluate("document.querySelector('.llUndoBtn').click()"); await asyncio.sleep(.5)
    requeued = await pg.evaluate("[...document.querySelectorAll('.llRow .yours > .card')].filter((c) => c.classList.contains('pl-hidden')).length")
    print('   cards hidden to fly again after Undo:', requeued)
    if requeued: errs.append(f'{requeued} redrawn cards were queued to fly in again')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
