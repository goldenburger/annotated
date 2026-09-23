# The third UX audit of 2026-09-23, two changes.
#   1. Saved while offline, the card says so once and its button waits for the connection, then wakes up by
#      itself. It used to say "Publish it from its page when you are back online" above Sign in and publish.
#   2. The poll question's hint fits its box. It read "Ask a question (optional), like Is this figure accurat".
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
STORY = ('<!doctype html><title>Harbor story</title><article><h1>Harbor story</h1>'
         '<p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once.</p></article>')
PICK = """(()=>{const n=document.getElementById('a').firstChild;const r=document.createRange();r.setStart(n,4);r.setEnd(n,60);getSelection().removeAllRanges();getSelection().addRange(r)})()"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profUX3'), headless=True, executable_path=CHROME,
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
    await story.bring_to_front(); await story.evaluate(PICK); await asyncio.sleep(1.2); await pa.bring_to_front()
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)

    # 2. The poll hint.
    await pa.click('#articleMode .pollBtn'); await asyncio.sleep(.3)
    fit = await pa.evaluate("(() => { const i = document.querySelector('#articleMode .peQ'); const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(i).font; return { hint: i.placeholder, fits: c.measureText(i.placeholder).width <= i.clientWidth - 16 }; })()")
    print('2. the poll hint:', fit)
    if not fit['fits']: errs.append(f"the poll hint does not fit its box: {fit['hint']!r}")
    await pa.click('#articleMode .peRemove'); await asyncio.sleep(.2)

    # 1. Saved while offline.
    await pa.fill('#articleMode .takeInput', 'Every member on time is the real news.')
    await ctx.set_offline(True); await asyncio.sleep(.3)
    await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard', timeout=20000); await asyncio.sleep(.5)
    card = await pa.evaluate("""() => { const c = document.querySelector('#articleMode .pubcard'), b = c.querySelector('.pubLater');
      return { note: c.querySelector('.pubhead p').textContent, btn: b ? b.textContent : '', off: b ? b.disabled : null }; }""")
    print('1. saved offline:', card)
    if card['note'] != 'You are offline, so it is saved on this computer.': errs.append(f"the note read {card['note']!r}")
    if card['btn'] != "Publish when you're back online" or not card['off']: errs.append(f'the button offered what cannot work offline: {card}')
    await ctx.set_offline(False); await asyncio.sleep(.8)
    back = await pa.evaluate("(() => { const b = document.querySelector('#articleMode .pubLater'); return { btn: b.textContent, off: b.disabled }; })()")
    print('   back online the button reads:', back)
    if back['btn'] != 'Sign in and publish' or back['off']: errs.append(f'the button did not wake up when the connection came back: {back}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
