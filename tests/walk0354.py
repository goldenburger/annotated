# The recording of 2026-09-25 at 03:54, and the notes after it.
#   1. The plane's shadow never gets a negative blur (Chrome listed "Invalid keyframe value for property filter").
#   2. A front page left open picks up Yours so far from another tab, and a sign-in or sign-out elsewhere.
#   3. The example plays whenever Yours so far is empty, even with the brief's last take still kept.
#   4. The hero's line and the installed line are the new words.
#   5. With the extension signed in, the website's sign-in button names that account, and a different account
#      signed in on the site gets a line offering to switch.
#   6. With the planes on, the install button arrives as a plane after the brief and is there afterwards.
import asyncio, pathlib, mimetypes, json, time, re
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
CARD = {'kind': 'post', 'take': 'From the other tab.', 'quote': 'Hardware is hard.', 'source': 'Elon Musk on X', 'at': now}

async def main():
  errs = []
  # 1.
  fold = (pathlib.Path(__file__).resolve().parent.parent / 'extension' / 'fold.js').read_text(encoding='utf-8')
  if 'blur(${Math.max(0, 1.5 + r.z / 45)' not in fold: errs.append('the shadow blur can still go below zero')
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    # 3. The brief's last take is kept, Yours so far is empty: the example still plays.
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(.5)
    await pg.evaluate("localStorage.setItem('annotated-tryit', JSON.stringify({ quote: 'x', take: 'y', at: 1 })); localStorage.removeItem('annotated-yours'); sessionStorage.removeItem('annotated-example-shown')")
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(9)
    ex = await pg.evaluate("!!document.querySelector('.tiLift:not([hidden])') || !!document.querySelector('.llRow .yours.example')")
    print('3. the example played with an empty Yours so far:', ex)
    if not ex: errs.append('the example did not play with Yours so far empty')
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(9)
    again = await pg.evaluate("!!document.querySelector('.tiLift:not([hidden])') || !!document.querySelector('.llRow .yours.example')")
    print('   and again on the next load in the same visit:', again)
    if again: errs.append('the example played twice in one visit')
    # Show me an example plays it again whenever asked (recording of 2026-09-25 at 05:34).
    await pg.click('.tiShowMe'); await asyncio.sleep(5)
    replay = await pg.evaluate("!!document.querySelector('.tiLift:not([hidden])') || !!document.querySelector('.tiText mark.annotated-hl')")
    print('   Show me an example plays it again:', replay)
    if not replay: errs.append('Show me an example did not play the example')
    # 4.
    words = await pg.evaluate("({ sub: document.querySelector('.heroSub').textContent, kick: document.querySelector('.heroKicker').textContent })")
    print('4.', words)
    if words['sub'] != 'Highlight a sentence, clip a video or podcast, or quote a post. Add what you think. Share the link.': errs.append(f"the line under the headline reads {words['sub']!r}")
    # 2. Another tab adds a card; this one shows it.
    await pg.evaluate("localStorage.removeItem('annotated-yours')"); await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
    other = await c.new_page(); await other.goto(URL + '?noplanes'); await asyncio.sleep(.8)
    await other.evaluate(f"localStorage.setItem('annotated-yours', {json.dumps(json.dumps([CARD]))})"); await asyncio.sleep(.6)
    got = await pg.evaluate("[...document.querySelectorAll('.llRow .yours .ctake')].map((x) => x.textContent)")
    print('2. a card made in another tab shows here:', got)
    if got != ['From the other tab.']: errs.append(f'the other tab\'s card did not show: {got}')
    # A sign-in in another tab: this tab reloads when it is next looked at.
    await pg.evaluate("window.__stay = 1")
    await other.evaluate("localStorage.setItem('annotated-auth', JSON.stringify({ access_token: 'a', user: { id: 'u1' } }))"); await asyncio.sleep(.3)
    await pg.bring_to_front(); await asyncio.sleep(1.2)
    reloaded = await pg.evaluate("typeof window.__stay === 'undefined'")
    print('   the tab reloaded after a sign-in elsewhere:', reloaded)
    if not reloaded: errs.append('a sign-in in another tab left this tab as it was')
    await other.evaluate("localStorage.removeItem('annotated-auth')"); await other.close(); await asyncio.sleep(.5)
    # 5. The extension is signed in as Robo Taxi (as article.js reports it).
    await pg.goto(URL + '?noplanes'); await asyncio.sleep(1)
    await pg.evaluate("Object.assign(document.documentElement.dataset, { annotatedInstalled: '1', annotatedUserId: 'robo-1', annotatedUserName: 'Robo Taxi', annotatedUserEmail: 'robo@example.test' }); document.dispatchEvent(new CustomEvent('annotated-user'))"); await asyncio.sleep(.4)
    label = await pg.evaluate("[...document.querySelectorAll('.webSignIn')].map((x) => x.textContent.trim())")
    print('5. the sign-in button reads:', label)
    if not label or any(l != 'Sign in as Robo' for l in label): errs.append(f'the sign-in button does not name the extension\'s account: {label}')
    mm = await pg.evaluate("""() => { matchExtension({ id: 'david-1', name: 'David Winston' }); const b = document.querySelector('.acctMismatch'); return b && b.textContent.trim(); }""")
    print('   with another account signed in here:', mm)
    if not mm or 'Robo Taxi' not in mm or 'Use Robo here' not in mm: errs.append(f'no line offering to switch accounts: {mm}')
    await c.close()
    # 6.
    c = await b.new_context(viewport={'width': 1440, 'height': 900})
    await c.route('https://annotated-app.netlify.app/**', site)
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(URL + '?planes'); await asyncio.sleep(.6)
    hidden_early = await pg.evaluate("document.querySelector('.heroGet').classList.contains('pl-hidden')")
    flew = False
    for _ in range(60):
      await asyncio.sleep(.1)
      if await pg.evaluate("(() => { const g = document.querySelector('.heroGet'); return !!document.querySelector('.pl-carrier') && g.classList.contains('pl-hidden'); })()"): flew = True
    await asyncio.sleep(3)
    shown = await pg.evaluate("!document.querySelector('.heroGet').classList.contains('pl-hidden') && document.querySelector('.heroGet').offsetWidth > 0")
    print('6. install button held back', hidden_early, '| a plane flew', flew, '| shown after', shown)
    if not (hidden_early and flew and shown): errs.append(f'the install button did not arrive as a plane: {hidden_early}, {flew}, {shown}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
