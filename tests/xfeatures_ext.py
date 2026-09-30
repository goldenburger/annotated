# Features borrowed from X (2.40.0), in the extension, signed in against a stand-in database.
#   1. The panel's bell shows a dot when something is new, and opens Activity, new ones marked, which clears the dot.
#   2. Your profile in the panel puts your pinned annotation first, marked Pinned.
#   3. The panel's Home leaves out someone you blocked.
#   4. The extension's annotation page offers Pin on your own and Block on someone else's, and saves them.
import asyncio, json, time
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
UID = '11111111-1111-4111-8111-111111111111'
# A session supabase-js accepts without asking anyone, as in handlesave.py (which runs itself on import).
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test', 'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}

AUTH = '22222222-2222-4222-8222-222222222222'
BLK = '33333333-3333-4333-8333-333333333333'
iso = lambda dt: dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
NOW = datetime.now(timezone.utc)
ME = {'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}
THEM = {'id': AUTH, 'handle': 'sawyer', 'display_name': 'Sawyer Merritt', 'avatar_url': ''}
BAD = {'id': BLK, 'handle': 'pest', 'display_name': 'Pest', 'avatar_url': ''}
def row(id, author, take, when):
  return {'id': id, 'author_id': author['id'], 'kind': 'article', 'created_at': iso(when), 'take_text': take, 'tag': None, 'poll': None, 'gif': None,
          'voice_path': None, 'upload': None, 'media_path': None, 'poster_path': None, 'shot_path': None, 'edited_at': None, 'quote_of': None, 'quoted': None,
          'source': {'text': 'Some words.', 'meta': {'title': 'Harbor story', 'url': 'https://news.example/harbor', 'site': 'News'}},
          'author': author, 'comments': [], 'first': [], 'reactions': [], 'poll_votes': []}
A1 = row('first-of-mine-aa11', ME, 'The first of mine.', NOW - timedelta(hours=5))
A2 = row('second-of-mine-bb22', ME, 'The second of mine.', NOW - timedelta(hours=1))
THEIRS = row('their-take-cc33', THEM, 'Their take.', NOW - timedelta(hours=2))
PEST = row('pest-take-dd44', BAD, 'Pest was here.', NOW - timedelta(hours=3))
ROWS = {r['id']: r for r in (A1, A2, THEIRS, PEST)}

async def main():
  errs = []
  state = {'pin': A1['id'], 'blocks': [], 'pinSaves': [],
           'activity': [{'kind': 'reaction', 'actor_id': AUTH, 'handle': 'sawyer', 'display_name': 'Sawyer Merritt', 'avatar_url': '', 'annotation_id': A2['id'], 'take': 'The second of mine.', 'snippet': '🔥', 'at': iso(NOW - timedelta(minutes=3))}]}
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profXF'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    async def rest(route):
      r = route.request; u = unquote(r.url); m = r.method
      one = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
      J = lambda body, status=200, headers=None: route.fulfill(status=status, content_type='application/json', headers=headers or {}, body=json.dumps(body))
      if '/rpc/activity' in u: return await J(state['activity'])
      if '/profiles' in u:
        if m == 'PATCH': state['pin'] = json.loads(r.post_data or '{}').get('pinned_id'); state['pinSaves'].append(state['pin']); return await J([{'pinned_id': state['pin']}])
        if 'select=pinned_id' in u: return await J({'pinned_id': state['pin']} if one else [{'pinned_id': state['pin']}])
        prof_ = THEM if AUTH in u else ME
        return await J(prof_ if one else [prof_])
      if '/blocks' in u:
        if m in ('POST', 'DELETE'): state['blocks'].append((m, r.post_data)); return await J([], 201)
        return await J([{'target_id': BLK, 'kind': 'block'}])
      if '/annotations' in u:
        if m == 'HEAD': return await route.fulfill(status=200, headers={'Content-Range': '0-0/2', 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range'}, body='')
        for id_, rw in ROWS.items():
          if f'id=eq.{id_}' in u: return await J(rw if one else [rw])
        if 'id=in.' in u: return await J([{'id': k} for k in ROWS])
        rows = [A1, A2] if 'author_id=eq.' + UID in u else [THEIRS, PEST, A1, A2]
        return await J(rows)
      return await J([])
    await ctx.route(SUPA + '/rest/v1/**', rest)
    await ctx.route(SUPA + '/auth/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user'])))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s), 'annotated-welcome-seen': '1'})", SESSION)
    await sw.evaluate(f"chrome.storage.local.set({{'annotatedActivitySeen:{UID}': Date.now() - 3600000}})")
    await asyncio.sleep(.4)
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 420, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(3)

    # 1.
    dot = await pg.evaluate("(() => { const b = document.querySelector('.brand .actBtn'); return b ? { dot: !b.querySelector('.actDot').hidden, label: b.getAttribute('aria-label') } : null; })()")
    print('1. bell:', dot)
    if not dot or not dot['dot']: errs.append(f'the panel shows no new activity: {dot}')
    await pg.click('.brand .actBtn'); await pg.wait_for_selector('#browseMode .activity .actList', timeout=8000); await asyncio.sleep(.5)
    rows = await pg.evaluate("[...document.querySelectorAll('#browseMode .actItem')].map((li) => [li.classList.contains('new'), li.textContent.replace(/\\s+/g, ' ').trim()])")
    print('   activity:', rows)
    if len(rows) != 1 or not rows[0][0] or 'reacted to your annotation' not in rows[0][1]: errs.append(f'the panel\'s activity is not right: {rows}')
    await asyncio.sleep(.5)
    cleared = await pg.evaluate("document.querySelector('.brand .actBtn .actDot').hidden")
    if not cleared: errs.append('the dot stayed after Activity was read')

    # 2.
    await pg.click('.brand .youBtn'); await pg.wait_for_selector('#browseMode .sideList li button', timeout=8000); await asyncio.sleep(1.5)
    first = await pg.evaluate("(() => { const b = document.querySelector('#browseMode .sideList li button'); return { id: b.dataset.id, pin: !!b.querySelector('.cpin') }; })()")
    print('2. first on your profile:', first)
    if first != {'id': A1['id'], 'pin': True}: errs.append(f'the pinned annotation is not first in the panel: {first}')

    # 3.
    await pg.click('.brand .homeBtn'); await asyncio.sleep(3)
    await pg.evaluate("(() => { const e = [...document.querySelectorAll('#browseMode .browseTabs input')].find((i) => i.value === 'everyone'); if (e) e.click(); })()"); await asyncio.sleep(2)
    ids = await pg.evaluate("[...document.querySelectorAll('#browseMode .sideList li button')].map((b) => b.dataset.id)")
    print('3. panel Home:', ids)
    if PEST['id'] in ids: errs.append('a blocked person is still in the panel\'s Home')
    if THEIRS['id'] not in ids: errs.append(f'the panel\'s Home lost someone not blocked: {ids}')

    # 4.
    ap = await ctx.new_page(); ap.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await ap.goto(f'chrome-extension://{extid}/annotation.html#{A2["id"]}'); await ap.wait_for_selector('.annCard .moreBtn', timeout=10000); await asyncio.sleep(1)
    await ap.click('.annCard .moreBtn'); await ap.click('.annCard .pinBtn'); await asyncio.sleep(1)
    print('4. pinned from the extension page:', state['pinSaves'])
    if state['pinSaves'][-1:] != [A2['id']]: errs.append(f'pinning from the extension page did not save: {state["pinSaves"]}')
    await ap.goto(f'chrome-extension://{extid}/annotation.html#{THEIRS["id"]}'); await asyncio.sleep(.3); await ap.reload(); await ap.wait_for_selector('.annCard .moreBtn', timeout=10000); await asyncio.sleep(1)
    await ap.click('.annCard .moreBtn'); await ap.click('.annCard .muteBtn'); await asyncio.sleep(1)
    print('   mute sent:', state['blocks'][-1:] if state['blocks'] else None)
    if not state['blocks'] or '"kind":"mute"' not in (state['blocks'][-1][1] or '').replace(' ', ''): errs.append(f'mute did not save: {state["blocks"]}')
    # 5. Beside one of your own published annotations that is not kept on this computer, the panel shows it and lists yours
    #    (it said "You have no annotations yet"; panel tour of 2026-09-29).
    await ap.goto(f'chrome-extension://{extid}/annotation.html#{A2["id"]}'); await asyncio.sleep(2.5)
    atid = await sw.evaluate("chrome.tabs.query({}).then((ts) => ts.find((x) => x.url.includes('annotation.html')).id)")
    side = await ctx.new_page(); await side.set_viewport_size({'width': 400, 'height': 900})
    await side.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await side.goto(f'chrome-extension://{extid}/sidepanel.html?tab={atid}'); await asyncio.sleep(5)
    said = await side.evaluate("document.querySelector('#annMode')?.innerText || ''")
    print('5. beside your published annotation:', said.replace(chr(10), ' | ')[:200])
    if 'no annotations yet' in said or 'The second of mine.' not in said: errs.append(f'the panel beside your published annotation does not know it: {said[:200]!r}')
    await ctx.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
