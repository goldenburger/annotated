# The account menu explains the handle and holds the account-wide actions. David asked what the handle box
# was for ("it lets me pick a nick name?") and said Delete all was hard to find. The menu now says what a
# handle is, shows the link it makes as you type, gives the rules before any mistake, keeps Save off until
# the handle has changed, warns about old links before saving, and offers Your profile and Delete all.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
UID = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000,
           'expires_at': int(time.time()) + 360000,
           'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test',
                    'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = [{'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}]
READ = """() => { const p = document.querySelector('.acctPop'); if (!p) return null; const t = (s) => ((p.querySelector(s) || {}).textContent || '').trim();
  return { what: t('.acctHRule'), link: p.querySelector('.acctHLink').hidden ? '' : t('.acctHLink'), rule: t('.acctHRule'), ruleBad: !!p.querySelector('.acctHRule.bad'), msg: t('.acctHMsg'),
           saveOff: p.querySelector('.acctHSave').disabled, profile: !!p.querySelector('.acctProfile'), delAll: !!p.querySelector('.acctDelAll:not([hidden])') }; }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profACCT'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route(SUPA + '/rest/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    await ctx.route(SUPA + '/rest/v1/profiles*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE)))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 420, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)
    # With nothing of yours, Delete all is not offered (recording of 2026-09-25 at 03:14).
    await pg.click('.acctBtn'); await asyncio.sleep(.6)
    none = await pg.evaluate(READ)
    print('with nothing to delete, Delete all offered:', none and none['delAll'])
    if not none or none['delAll']: errs.append('Delete all was offered with nothing to delete')
    await pg.keyboard.press('Escape'); await asyncio.sleep(.3)
    # Something of yours on this computer, so Delete all has something to count.
    await pg.evaluate("Store.put('mine-1', { item: { kind: 'post', text: 'p', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' }, take: { text: 'mine' }, created: Date.now() })")

    await pg.click('.acctBtn'); await asyncio.sleep(.5)
    a = await pg.evaluate(READ)
    print('opened:', a)
    await pg.screenshot(path='acctmenu.png')
    if not a: errs.append('the account menu did not open')
    else:
      # Shortened on 2026-09-23 at David's request: one line under the box, and the link only once it would change.
      if 'On everything you publish' not in a['what']: errs.append(f"it does not say where a handle shows: {a['what']!r}")
      if a['link']: errs.append(f"the link showed before anything changed: {a['link']!r}")
      if '2 to 30' not in a['rule']: errs.append(f"the rules are not shown: {a['rule']!r}")
      if not a['saveOff']: errs.append('Save was on before anything changed')
      if not a['profile'] or not a['delAll']: errs.append(f'the actions are missing: {a}')
      # The keyboard lands in the menu and stays there.
      first = await pg.evaluate("(document.activeElement || {}).className || ''")
      print('focus when it opens:', first)
      if 'acctProfile' not in first: errs.append(f'focus did not move into the menu, it is on {first!r}')
      inside = []
      for _ in range(7):
        await pg.keyboard.press('Tab'); await asyncio.sleep(.05)
        inside.append(await pg.evaluate("!!(document.activeElement && document.activeElement.closest('.acctPop'))"))
      print('Tab stays in the menu:', inside)
      if not all(inside): errs.append('Tab left the menu while it was open')
      await pg.fill('#acctH', 'robo_taxi'); await asyncio.sleep(.2)
      b = await pg.evaluate(READ)
      print('typed a new one:', b)
      if b['link'] != 'New link: annotated-app.netlify.app/@robo_taxi': errs.append(f"the link did not follow the typing: {b['link']!r}")
      if b['saveOff']: errs.append('Save stayed off for a good new handle')
      if '@robotaxi will stop working' not in b['msg']: errs.append(f"it did not warn before saving: {b['msg']!r}")
      await pg.fill('#acctH', 'Robo Taxi!'); await asyncio.sleep(.2)
      c = await pg.evaluate(READ)
      print('typed a bad one:', c)
      if not c['ruleBad'] or not c['saveOff']: errs.append(f'a bad handle was not marked: {c}')
      if c['link']: errs.append(f"a bad handle made a link of its own: {c['link']!r}")

    # Delete all opens your list with the question already asked.
    await pg.click('.acctDelAll'); await asyncio.sleep(1.5)
    d = await pg.evaluate("""() => ({ browse: !document.getElementById('browseMode').hidden, title: (document.querySelector('#browseMode h2') || {}).textContent || '',
      ask: !!document.querySelector('#browseMode .delAllAsk:not([hidden])'), says: (document.querySelector('#browseMode .delAllAsk p') || {}).textContent || '' })""")
    print('after Delete all:', d)
    await pg.screenshot(path='acctmenu_delall.png')
    if not d['browse'] or not d['ask']: errs.append(f'Delete all did not open the list with the question asked: {d}')
    if '1 annotation will be deleted' not in d['says']: errs.append(f"it said {d['says']!r}")

    # Your profile opens your list.
    await pg.click('#browseMode .browseBack'); await asyncio.sleep(1)
    await pg.click('.acctBtn'); await asyncio.sleep(.4); await pg.click('.acctProfile'); await asyncio.sleep(1.5)
    e = await pg.evaluate("({ browse: !document.getElementById('browseMode').hidden, list: document.querySelectorAll('#browseMode .sideList li button').length })")
    print('after Your profile:', e)
    if not e['browse'] or e['list'] != 1: errs.append(f'Your profile did not open your list: {e}')

    # The profile page's Delete all is a button now, not a faint link.
    fp = await ctx.new_page(); await fp.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(2.5)
    cls = await fp.evaluate("(document.querySelector('.delAllOpen') || {}).className || ''")
    print('the profile page offers:', cls)
    if 'ghost' not in cls or 'danger' not in cls: errs.append(f'Delete all on the profile page is {cls!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
