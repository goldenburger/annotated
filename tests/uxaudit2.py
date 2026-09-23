# The second UX audit of 2026-09-23, three changes.
#   1. An annotation kept on this computer has one notice, with Sign in and publish on the page itself, and a
#      sign-in that does not finish says so. The toast saying the same thing above it is gone.
#   2. The Home page says why a tab is empty, and offers your own annotations when you have some.
#   3. Your own profile page has no second card saying You, and signed out it offers signing in instead of
#      follower counts.
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
    ctx = await p.chromium.launch_persistent_context(prof('profUX2'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=STORY))
    # One annotation saved here, made the way a person makes one, signed out.
    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(.8)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    pa = await ctx.new_page(); await pa.set_viewport_size({'width': 400, 'height': 900})
    await pa.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2)
    await story.bring_to_front(); await story.evaluate(PICK); await asyncio.sleep(1.2); await pa.bring_to_front()
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
    await pa.fill('#articleMode .takeInput', 'The first take'); await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard', timeout=20000)
    aid = (await pa.evaluate("Store.allMeta()"))[0]['id']
    await pa.close()
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1300, 'height': 900}); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)

    # 2. Home, signed out, with one annotation saved here.
    await pg.reload(); await asyncio.sleep(2)
    home = await pg.evaluate("""() => { const e = document.querySelector('.emptyState'); return e ? { says: e.textContent, mine: (e.querySelector('.esMine') || {}).textContent || '' } : null; }""")
    print('2. Home with one saved here:', home)
    if not home or 'Publish an annotation from the panel' in home['says']: errs.append(f'Home gave the generic reason: {home}')
    if not home or home['mine'] != 'See your 1 annotation': errs.append(f"Home did not offer your own: {home and home['mine']!r}")
    if home and home['mine']:
      await pg.click('.esMine'); await asyncio.sleep(1.5)
      if '#profile' not in pg.url: errs.append(f'See your 1 annotation went to {pg.url}')

    # 3. Your own profile, signed out.
    await pg.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(2)
    prof_ = await pg.evaluate("""() => ({ stats: (document.querySelector('.feedHead .stats') || {}).textContent || '',
      signIn: !!document.querySelector('.feedHead .pSignIn'), railYou: !!document.querySelector('.rail .railcard .who') })""")
    print('3. your profile signed out:', prof_)
    if prof_['stats'] != '1 annotation saved on this computer. Sign in to publish it under your name.': errs.append(f"the header read {prof_['stats']!r}")
    if not prof_['signIn']: errs.append('your profile signed out did not offer signing in')
    if prof_['railYou']: errs.append('your profile still repeated a You card beside itself')

    # 1. One of them on its own page.
    await pg.goto(f'chrome-extension://{extid}/annotation.html#{aid}'); await asyncio.sleep(2)
    ann = await pg.evaluate("""() => ({ toast: !!document.querySelector('.banner'), note: (document.querySelector('.localNote') || {}).textContent || '',
      btn: (document.querySelector('.shareNow') || {}).textContent || '' })""")
    print('1. its page:', ann)
    if ann['toast']: errs.append('a second notice said Saved on this computer above the first')
    if 'Only on this computer' not in ann['note'] or 'from the panel' in ann['note']: errs.append(f"the notice read {ann['note']!r}")
    if ann['btn'] != 'Sign in and publish': errs.append(f"the notice offered {ann['btn']!r}")
    await pg.evaluate("() => { Backend.signIn = async () => { throw new Error('Sign-in was cancelled.'); }; }")
    await pg.click('.shareNow'); await asyncio.sleep(1.2)
    said = await pg.evaluate("(() => { const e = document.querySelector('.shareErr'); return e && !e.hidden ? e.textContent : ''; })()")
    label = await pg.inner_text('.shareNow')
    print('   a sign-in that does not finish:', repr(said), '| the button reads', repr(label))
    if 'still only on this computer' not in said or label != 'Sign in and publish': errs.append(f'an unfinished sign-in left {said!r} and {label!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
