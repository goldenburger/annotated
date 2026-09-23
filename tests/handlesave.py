# Saving a handle, and the panel never showing an empty box. In the recording of 2026-09-22 the handle was
# written into the avatar, which is the first span inside the same block, so the circle filled with "@testh"
# and the line underneath went on showing the old handle. Pressing Home in the panel also left it blank for
# about a second, because everything was hidden before the list was fetched.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
UID = '11111111-1111-4111-8111-111111111111'
# A session supabase-js will accept without asking anyone, because it has not expired.
SESSION = {
  'access_token': 'header.' + 'e30' + '.sig', 'refresh_token': 'r', 'token_type': 'bearer',
  'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test',
           'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'},
}
PROFILE = [{'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}]
STORY = ('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article>'
         '<h1>Harbor story</h1><p>The council met on a Tuesday to talk about the overnight buses.</p>'
         '</article></body></html>')
# Which part of the panel is on screen, and how much is in it. A section is a wrapper whose own box has no
# height of its own, so what it holds is what counts.
LOOK = """() => {
  const on = [...document.querySelectorAll('#videoMode,#articleMode,#postMode,#podcastMode,#annMode,#browseMode,#empty')]
    .filter((s) => !s.hidden);
  return on.map((s) => s.id).join(',') + '|' + on.reduce((n, s) => n + s.textContent.trim().length, 0);
}"""

async def main():
  errs = []
  saved = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profHS'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)

    async def rest(route):
      r = route.request
      if r.method == 'PATCH':
        saved.append(r.post_data)
        await route.fulfill(status=200, content_type='application/json', body='[]'); return
      await route.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE))
    # Playwright tries the most recently added route first, so the catch-all goes on before the one that matters.
    await ctx.route(SUPA + '/rest/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    await ctx.route(SUPA + '/rest/v1/profiles*', rest)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=STORY, headers={'Content-Type': 'text/html; charset=utf-8'}))

    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    await asyncio.sleep(.4)

    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 420, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(2.2)

    signed = await pg.evaluate("() => (Account.me ? Account.me.handle : null)")
    print('signed in as:', signed)
    if signed != 'robotaxi':
      print('errors:', ['the fake session did not sign anyone in, so nothing below was tried'])
      await ctx.close(); return

    # 1. The popover shows the name, the handle and a letter in the circle.
    await pg.click('.acctBtn'); await asyncio.sleep(.4)
    before = await pg.evaluate("""() => {
      const w = document.querySelector('.acctPop .who');
      return { avatar: w.querySelector('.avatar').textContent.trim(),
               handle: w.querySelector('.acctAt').textContent.trim(),
               // The bug was that these two were the same element.
               firstSpanIsAvatar: w.querySelector('span') === w.querySelector('.avatar') };
    }""")
    print('to begin with:', before)
    if before['avatar'] != 'R': errs.append(f"the circle held {before['avatar']!r} rather than a letter")
    if before['handle'] != '@robotaxi': errs.append(f"the handle line read {before['handle']!r}")
    if not before['firstSpanIsAvatar']: errs.append('the avatar is no longer the first span, so this test is checking the wrong thing')

    # 2. Save a new one. It goes to the handle, and the circle keeps its letter.
    await pg.fill('.acctPop .acctHandle input', 'testhandle')
    await pg.click('.acctPop .acctHandle button')
    await asyncio.sleep(1.0)
    after = await pg.evaluate("""() => {
      const w = document.querySelector('.acctPop .who');
      return { avatar: w.querySelector('.avatar').textContent.trim(),
               handle: w.querySelector('.acctAt').textContent.trim(),
               said: (document.querySelector('.acctHMsg') || {}).textContent || '',
               top: (document.querySelector('.acctBtn') || {}).textContent.trim() };
    }""")
    print('after saving:', after)
    print('it sent:', saved)
    if after['handle'] != '@testhandle': errs.append(f"the handle line still read {after['handle']!r}")
    if after['avatar'] != 'R': errs.append(f"the circle turned into {after['avatar']!r}")
    if after['top'] != 'R': errs.append(f"the button in the top bar turned into {after['top']!r}")
    if 'old handle' not in after['said']: errs.append('it did not say that links to the old handle stop working')
    if not saved or 'testhandle' not in (saved[0] or ''): errs.append('the new handle was never sent')

    # 3. Pressing Home never leaves the panel empty, at any moment. The panel needs a page beside it first,
    #    or there is nothing for Home to interrupt.
    await pg.keyboard.press('Escape'); await asyncio.sleep(.3)
    story = await ctx.new_page()
    await story.goto('https://harborline.example/story'); await asyncio.sleep(1.0)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    # The panel has to be the tab in front, or nothing in it has a height to measure.
    await pg.bring_to_front()
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.2)
    first = await pg.evaluate(LOOK)
    print('before Home was pressed:', first)
    if first.endswith('|0'): errs.append('the panel had nothing in it before Home was pressed, so this proves nothing')
    shown = []
    async def watch():
      for _ in range(40):
        shown.append(await pg.evaluate(LOOK))
        await asyncio.sleep(.05)
    task = asyncio.ensure_future(watch())
    await pg.click('.homeBtn')
    await task
    empty = [s for s in shown if s.endswith('|0')]
    print('looks seen while Home opened:', len(set(shown)), '| empty moments:', len(empty))
    print('the states it passed through:', list(dict.fromkeys(shown))[:6])
    if empty: errs.append(f'the panel was empty for {len(empty)} of {len(shown)} looks after Home was pressed')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
