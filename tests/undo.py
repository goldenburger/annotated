# Undo right after publishing (panel-kit.js published, sidepanel.js unpublish), asked for on 2026-09-24.
#   1. The card offers Undo at once. Pressing it deletes what was just made (here saved on this computer, being
#      signed out), and puts the take box back with the words still in it, ready to publish again.
#   2. Published again, Undo is offered again, and it goes by itself after ten seconds.
#   3. Pressing anything else on the card takes Undo away.
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
    ctx = await p.chromium.launch_persistent_context(prof('profUndo'), headless=True, executable_path=CHROME,
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
    await pa.fill('#articleMode .takeInput', 'Evry member on time.')
    count = lambda: pa.evaluate("Store.allMeta().then((a) => a.length)")

    # 1.
    await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard .pubUndo', timeout=20000)
    n1 = await count()
    await pa.click('#articleMode .pubUndo'); await asyncio.sleep(1)
    back = await pa.evaluate("""() => ({ box: !document.querySelector('#articleMode .aCompose').hidden, card: !document.querySelector('#articleMode .aPublished').hidden,
      take: document.querySelector('#articleMode .takeInput').value })""")
    n2 = await count()
    print('1. saved', n1, '| after Undo', n2, back)
    if n1 != 1 or n2 != 0: errs.append(f'Undo did not delete what was saved: {n1} then {n2}')
    if back != {'box': True, 'card': False, 'take': 'Evry member on time.'}: errs.append(f'Undo did not put the take back: {back}')

    # 2.
    await pa.fill('#articleMode .takeInput', 'Every member on time.')
    await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard', timeout=20000); await asyncio.sleep(.3)
    offered = await pa.evaluate("!!document.querySelector('#articleMode .pubUndo')")
    await asyncio.sleep(10.5)
    later = await pa.evaluate("!!document.querySelector('#articleMode .pubUndo')")
    print('2. offered again:', offered, '| still there after ten seconds:', later, '| kept:', await count())
    if not offered or later: errs.append(f'Undo was not offered, or stayed past ten seconds: {offered} {later}')

    # 3.
    await pa.click('#articleMode .pubcard .new'); await asyncio.sleep(.6)
    await story.bring_to_front(); await story.evaluate(PICK.replace('setStart(n,4)', 'setStart(n,62)').replace('setEnd(n,60)', 'setEnd(n,100)')); await asyncio.sleep(1.2); await pa.bring_to_front()
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
    await pa.fill('#articleMode .takeInput', 'A third.')
    await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard .pubUndo', timeout=20000)
    async with ctx.expect_page() as info:
      await pa.click('#articleMode .pubcard .view')
    await (await info.value).close()
    gone = await pa.evaluate("!document.querySelector('#articleMode .pubUndo')")
    print('3. Undo gone after View page:', gone)
    if not gone: errs.append('Undo stayed after another button on the card was pressed')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
