# The UX audit of 2026-09-23, ten changes.
#   1. Beside a tab with nothing to annotate the panel is Home, with a line saying what to open, and no Back.
#   2. Home and Your profile say where Back goes ("Back to Harbor story", "Back to Home").
#   3. The article panel offers clipping a podcast only on a page with audio of its own.
#   4. Signed out the button says Save on this computer and the last step says Save.
#   5. Saved signed out, the card leads with Sign in and publish, and a sign-in that does not finish says so.
#   6. The take box comes before the tags.
#   7. The whole sentence is offered after capture, not before it as well.
#   8. Your profile signed out says what a profile is and offers signing in.
#   9. The first welcome beside a new tab ends on Show me where to start.
#  10. Following signed out offers signing in.
import asyncio
from playwright.async_api import async_playwright
from _env import *
STORY = ('<!doctype html><title>Harbor story</title><article><h1>Harbor story</h1>'
         '<p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once.</p></article>')
PICK = """(()=>{const n=document.getElementById('a').firstChild;const r=document.createRange();r.setStart(n,12);r.setEnd(n,40);getSelection().removeAllRanges();getSelection().addRange(r)})()"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profUX'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'}, body=STORY))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page()
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(2)

    # 9. The first welcome, beside a new tab.
    go = await pan.inner_text('.wGo')
    print('9. the first welcome beside a new tab ends on:', repr(go))
    if go != 'Show me where to start': errs.append(f'the welcome beside a new tab said {go!r}')
    hidden_home = await pan.evaluate("getComputedStyle(document.querySelector('#browseMode')).display === 'none'")
    if not hidden_home: errs.append('Home showed underneath the welcome')
    # Pressing Home with the welcome up closes the welcome. Home used to open behind it, and nothing changed.
    await pan.click('.homeBtn'); await asyncio.sleep(1.2)
    gone = await pan.evaluate("!document.body.classList.contains('welcoming') && getComputedStyle(document.querySelector('#browseMode')).display !== 'none'")
    print('   Home pressed with the welcome up shows Home:', gone)
    if not gone: errs.append('Home opened behind the welcome')

    # 1. Home beside the new tab.
    home = await pan.evaluate("""() => ({ shown: !document.querySelector('#browseMode').hidden, empty: !document.querySelector('#empty').hidden,
      hint: (document.querySelector('#browseMode .startHint') || {}).textContent || '', back: !!document.querySelector('#browseMode .browseBack'),
      title: (document.querySelector('#browseMode h2') || {}).textContent || '' })""")
    print('1. beside a new tab:', home)
    if not home['shown'] or home['empty'] or home['title'] != 'Home': errs.append(f'the panel beside a new tab was not Home: {home}')
    if 'in this tab' not in home['hint']: errs.append('Home beside a new tab did not say what to open')
    if home['back']: errs.append('Home beside a new tab offered a Back with nowhere to go')

    # 10. Following, signed out.
    await pan.click('#browseMode .browseTabs label:has-text("Following") input'); await asyncio.sleep(1)
    f = await pan.evaluate("(document.querySelector('#browseMode .browseAct') || {}).textContent || ''")
    print('10. Following signed out offers:', repr(f))
    if f != 'Sign in': errs.append(f'Following signed out offered {f!r}')
    await pan.evaluate("localStorage.removeItem('annotated-feed-tab')")

    # 8 and 2. Your profile signed out, and its way back from a bare tab.
    await pan.click('.youBtn'); await asyncio.sleep(1.2)
    prof_ = await pan.evaluate("""() => ({ act: (document.querySelector('#browseMode .browseAct') || {}).textContent || '',
      empty: (document.querySelector('#browseMode .browseEmpty') || {}).textContent || '', back: (document.querySelector('#browseMode .browseBack') || {}).textContent || '' })""")
    print('8. Your profile signed out:', prof_)
    if prof_['act'] != 'Sign in' or 'under your name' not in prof_['empty']: errs.append(f'Your profile signed out did not explain itself: {prof_}')
    if prof_['back'].strip() != 'Back to Home': errs.append(f"Your profile beside a new tab went back to {prof_['back']!r}")
    await pan.click('#browseMode .browseBack'); await asyncio.sleep(1)
    again = await pan.evaluate("(document.querySelector('#browseMode h2') || {}).textContent || ''")
    if again != 'Home': errs.append(f'Back to Home led to {again!r}')
    await pan.close()

    # An article.
    story = await ctx.new_page(); await story.goto('https://harborline.example/story'); await asyncio.sleep(.8)
    sid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    pa = await ctx.new_page(); await pa.set_viewport_size({'width': 400, 'height': 900}); pa.on('pageerror', lambda e: errs.append('APANEL ' + str(e)))
    await pa.goto(f'chrome-extension://{extid}/sidepanel.html?tab={sid}'); await asyncio.sleep(2)
    # 3.
    pod = await pa.evaluate("!!document.querySelector('#articleMode .fpFind')")
    print('3. a plain article offers clipping a podcast:', pod)
    if pod: errs.append('a plain article still offered to clip a podcast')
    # 2. Home over the article.
    await pa.click('.homeBtn'); await pa.wait_for_selector('#browseMode .browseBack', timeout=15000)
    back = (await pa.inner_text('#browseMode .browseBack')).strip()
    print('2. Home over the article goes back to:', repr(back))
    if back != 'Back to Harbor story': errs.append(f'Home over the article said {back!r}')
    await pa.click('#browseMode .browseBack'); await asyncio.sleep(1.2)
    if not await pa.is_visible('#articleMode'): errs.append('Back to Harbor story did not return to the article')
    # 7. Selected, before capture.
    await story.bring_to_front(); await story.evaluate(PICK); await asyncio.sleep(1.2); await pa.bring_to_front(); await asyncio.sleep(.3)
    offer = await pa.is_visible('#articleMode .exactBtn')
    print('7. the sentence offered before capture:', offer)
    if offer: errs.append('the whole sentence was offered before capture as well')
    await pa.click('#articleMode .grab'); await pa.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000); await asyncio.sleep(.6)
    after = await pa.is_visible('#articleMode .aFragFix')
    if not after: errs.append('the whole sentence was not offered after capture')
    # 6 and 4.
    order = await pa.evaluate("""() => { const c = document.querySelector('#articleMode .aCompose');
      const t = c.querySelector('.takefield'), g = c.querySelector('.tags'); return !!(t.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING); }""")
    print('6. the tags come after the take box:', order)
    if not order: errs.append('the tags still come before the take box')
    await pa.fill('#articleMode .takeInput', 'Every member on time is the real news.'); await asyncio.sleep(.3)
    words = await pa.evaluate("""() => ({ button: document.querySelector('#articleMode .publish').textContent,
      step: [...document.querySelectorAll('#articleMode .steps li:nth-child(3) span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent).join('') })""")
    print('4. signed out the button and the step say:', words)
    if words['button'] != 'Save on this computer' or words['step'] != 'Save': errs.append(f'signed out it still said Publish: {words}')
    # 5.
    await pa.click('#articleMode .publish'); await pa.wait_for_selector('#articleMode .pubcard', timeout=20000); await asyncio.sleep(.5)
    card = await pa.evaluate("""() => { const c = document.querySelector('#articleMode .pubcard');
      return { head: c.querySelector('.pubhead b').textContent, first: (c.querySelector('.pubLater') || {}).textContent || '',
        viewQuiet: c.querySelector('.view').classList.contains('ghost') }; }""")
    print('5. the saved card:', card)
    if card['head'] != 'Saved' or card['first'] != 'Sign in and publish' or not card['viewQuiet']: errs.append(f'the saved card did not lead with signing in: {card}')
    # Signing in cannot finish here, and the card has to say so rather than sit on Publishing.
    await pa.evaluate("() => { Backend.signIn = async () => { throw new Error('Sign-in was cancelled.'); }; }")
    await pa.click('#articleMode .pubLater'); await asyncio.sleep(.6)
    # Signing in offers Google or X first (2.34.0); Google is chosen here.
    await pa.click('.acctPop .acctIn[data-provider="google"]'); await asyncio.sleep(1.2)
    msg = await pa.evaluate("(() => { const e = document.querySelector('#articleMode .pubLaterErr'); return e && !e.hidden ? e.textContent : ''; })()")
    label = await pa.inner_text('#articleMode .pubLater')
    print('   a sign-in that does not finish:', repr(msg), '| the button reads', repr(label))
    if 'still saved on this computer' not in msg or label != 'Sign in and publish': errs.append(f'an unfinished sign-in left {msg!r} and {label!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
