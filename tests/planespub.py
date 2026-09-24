# The paper planes in the extension (fold.js, panel-kit.js sendOff and published, annotation-page.js).
#   1. Publish in the panel: what is being published folds into a plane at once, the take box keeps its place
#      unseen, and the plane flies off, up and out of the panel to the right, rather than circling and coming
#      back (the recording of 2026-09-24 at 19:06). The card is shown, with its check, once the plane has gone.
#   2. View page from there: the annotation's page opens with it dropping in and opening.
#   3. Display settings has "Paper planes when you publish", and with it off, publishing sends no plane.
# Test browsers get no planes unless they ask, so this one asks (localStorage annotated-planes = on).
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-planes','on')}catch(e){}"
STORY = ('<!doctype html><title>Harbor story</title><article><h1>Harbor story</h1>'
         '<p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once.</p></article>')
PICK = """([a, z])=>{const n=document.getElementById('a').firstChild;const r=document.createRange();r.setStart(n,a);r.setEnd(n,z);getSelection().removeAllRanges();getSelection().addRange(r)}"""
STATE = """() => { const c = document.querySelector('#articleMode .pubcard');
  const b = document.querySelector('#articleMode .aCompose');
  return { planes: document.querySelectorAll('.pl-layer').length, box: b.hidden ? 'gone' : getComputedStyle(b).visibility,
    card: !!c, cardHidden: !!(c && c.classList.contains('pl-hidden')), fresh: !!(c && c.classList.contains('fresh')) }; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profPlanesPub'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=STORY))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(.8)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    pa = await ctx.new_page(); await pa.set_viewport_size({'width': 400, 'height': 900}); pa.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pa.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2)

    async def capture_and_publish(text, at=(4, 60)):
      await story.bring_to_front(); await story.evaluate(PICK, list(at)); await asyncio.sleep(1.2); await pa.bring_to_front()
      await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
      await pa.fill('#articleMode .takeInput', text)
      await pa.click('#articleMode .publish')

    # 1.
    await capture_and_publish('Every member on time is the real news.')
    await asyncio.sleep(.25)
    s = await pa.evaluate(STATE)
    print('1. just pressed:', s)
    if not s['planes'] or s['box'] not in ('hidden', 'gone'): errs.append(f'publishing sent no plane, or the take box did not keep its place unseen: {s}')
    await pa.wait_for_selector('#articleMode .pubcard', timeout=20000); await asyncio.sleep(.2)
    s = await pa.evaluate(STATE)
    print('   the card drawn, the plane still up:', s)
    if not s['cardHidden'] or not s['planes']: errs.append(f'the card showed before the plane landed: {s}')
    path = []
    for _ in range(60):
      r = await pa.evaluate("(() => { const c = document.querySelector('.pl-carrier'); if (!c) return null; const b = c.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()")
      if not r: break
      path.append(r); await asyncio.sleep(.1)
    print('   the plane went through', path[::4], 'then left')
    if not path or not (path[-1][0] > 400 * .75 or path[-1][1] < 60): errs.append(f'the plane did not fly off out of the panel: {path[-3:]}')
    await asyncio.sleep(.3)
    s = await pa.evaluate(STATE)
    print('   gone, and the card:', s)
    if s['planes'] or s['cardHidden'] or not s['fresh']: errs.append(f'the card did not show once the plane had gone: {s}')

    # 2.
    async with ctx.expect_page() as info:
      await pa.click('#articleMode .pubcard .view')
    page = await info.value
    await page.wait_for_load_state(); await asyncio.sleep(.6)
    arrive = await page.evaluate("({ planes: document.querySelectorAll('.pl-layer').length, card: !!document.querySelector('.annCard'), banner: (document.querySelector('.banner') || {}).textContent || null, fold: typeof Fold !== 'undefined' && Fold.on() })")
    await asyncio.sleep(3)
    after = await page.evaluate("({ planes: document.querySelectorAll('.pl-layer').length, hidden: document.querySelector('.annCard').classList.contains('pl-hidden') })")
    print('2. the page from Publish:', arrive, after)
    if not arrive['planes'] or after['planes'] or after['hidden']: errs.append(f'the annotation did not land on its page: {arrive} {after}')
    await page.close()

    # 3.
    await pa.bring_to_front()
    await pa.click('.gearBtn, [aria-label="Display settings"]'); await asyncio.sleep(.4)
    label = await pa.evaluate("(document.querySelector('.dmPlanes') || {}).closest?.('label')?.textContent?.trim() || null")
    print('3. the setting:', label)
    if label != 'Paper plane animations': errs.append(f'no setting for the planes: {label!r}')
    await pa.evaluate("document.querySelector('.dmPlanes').click()"); await asyncio.sleep(.3)
    await pa.keyboard.press('Escape'); await asyncio.sleep(.3)
    await pa.click('#articleMode .pubcard .new'); await asyncio.sleep(.6)
    await capture_and_publish('And a second one, with the planes off.', (62, 100))
    seen = 0
    for _ in range(12):
      seen += (await pa.evaluate(STATE))['planes']; await asyncio.sleep(.1)
    await pa.wait_for_selector('#articleMode .pubcard', timeout=20000)
    print('   planes seen with the setting off:', seen)
    if seen: errs.append('a plane flew with the setting off')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
