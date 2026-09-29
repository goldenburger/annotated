# The ninth audit pass of 2026-09-29.
# Website (a stand-in database):
#   1. Signed out, a reply, a reaction and a vote are taken back when nothing was saved, and the reply's words go back in
#      the box (they stayed on the page as yours and were lost on the way to sign in).
#   2. Signed in, a deleted comment leaves the database only once its Undo has gone, and not at all after Undo.
#   3. A tag's page asks the database for that tag, not the newest hundred.
#   4. A profile says how many there are, from the database's count, not how many were fetched.
#   5. Switching For you, Following and Everyone does not read the list again.
#   6. A feed keeps its filter when it is drawn again on coming back to the tab.
#   7. The claim form holds what the database takes.
# Extension:
#   8. Comments carried over keep a GIF-only reply, and at most eight reactions go.
#   9. The annotation page does not wait on a profile read that never answers.
#  10. Opening the same page twice in a row opens one tab.
import asyncio, json, time
from urllib.parse import unquote
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site

UID = '11111111-1111-4111-8111-111111111111'
AUTH = '22222222-2222-4222-8222-222222222222'
AID = 'poll-take-ab12'
ROW = {'id': AID, 'author_id': AUTH, 'kind': 'article', 'created_at': '2026-09-28T10:00:00Z', 'take_text': 'A take with a poll.', 'tag': 'explainer',
  'poll': {'question': 'Which?', 'options': ['One', 'Two']}, 'gif': None, 'voice_path': None, 'upload': None, 'media_path': None, 'poster_path': None, 'shot_path': None,
  'source': {'text': 'Some words.', 'meta': {'title': 'A story', 'url': 'https://example.com/a'}},
  'author': {'id': AUTH, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}, 'comments': [], 'reactions': [], 'poll_votes': []}
SESSION = {'access_token': 'x', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 7200, 'refresh_token': 'r',
  'user': {'id': UID, 'aud': 'authenticated', 'email': 'me@example.com', 'user_metadata': {'full_name': 'Me Myself'}}}

def make_db(log):
  async def db(route):
    r = route.request; u = unquote(r.url); log.append((r.method, u))
    if '/auth/v1/user' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user']))
    if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': UID, 'handle': 'me', 'display_name': 'Me Myself', 'avatar_url': ''} if 'vnd.pgrst.object' in (r.headers.get('accept') or '') else [{'id': UID, 'handle': 'me', 'display_name': 'Me Myself', 'avatar_url': ''}]))
    if '/rest/v1/comments' in u and r.method == 'POST': return await route.fulfill(status=201, content_type='application/json', body=json.dumps({'id': 77}))
    if '/rest/v1/comments' in u and r.method == 'DELETE': return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'id': 77, 'upload': None}]))
    if '/rest/v1/annotations' in u and r.method == 'HEAD':
      return await route.fulfill(status=200, headers={'Content-Range': '0-0/137', 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range'}, body='')
    if '/rest/v1/annotations' in u:
      one = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
      return await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '0-0/137', 'Access-Control-Expose-Headers': 'Content-Range'}, body=json.dumps(ROW if one else [ROW]))
    return await route.fulfill(status=200, content_type='application/json', body='[]')
  return db

async def web(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True)
  # 1. Signed out.
  c = await b.new_context(viewport={'width': 1400, 'height': 900}); log = []
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', make_db(log))
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(f'https://annotated-app.netlify.app/@robotaxi/{AID}'); await pg.wait_for_selector('.cText'); await asyncio.sleep(1)
  await pg.fill('.cText', 'My reply'); await pg.click('.cPost'); await asyncio.sleep(1)
  after = await pg.evaluate("({ items: document.querySelectorAll('.cList li.cmt').length, box: document.querySelector('.cText').value })")
  await pg.evaluate("document.querySelectorAll('.signAsk, .signPrompt').forEach((e) => e.remove())")
  await pg.click('.pollOpt[data-i="0"]'); await asyncio.sleep(1)
  vote = await pg.evaluate("document.querySelectorAll('.pollOpt.mine').length")
  print('1. signed out: replies on the page', after['items'], '| box holds', repr(after['box']), '| poll options marked yours', vote)
  if after['items'] or after['box'] != 'My reply': errs.append(f'an unsaved reply stayed, or its words were lost: {after}')
  if vote: errs.append('an unsaved vote stayed')
  # 7.
  lim = await pg.evaluate("(() => { if (!document.getElementById('cWhat')) { const b = [...document.querySelectorAll('button')].find((x) => /File a claim/.test(x.textContent)); if (b) b.click(); } const w = document.getElementById('cWhat'), n = document.getElementById('cName'); return w && n ? [n.maxLength, w.maxLength] : null; })()")
  print('7. claim form limits:', lim)
  if lim != [200, 2000]: errs.append(f'the claim form has no limits: {lim}')
  await c.close()
  # 2. Signed in: delete, then Undo; delete and wait.
  c = await b.new_context(viewport={'width': 1400, 'height': 900}); log = []
  await c.add_init_script(f"try{{ localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))}) }}catch(e){{}}")
  await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', make_db(log))
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(f'https://annotated-app.netlify.app/@robotaxi/{AID}'); await pg.wait_for_selector('.cText'); await asyncio.sleep(1.5)
  await pg.fill('.cText', 'Keep me'); await pg.click('.cPost'); await asyncio.sleep(1.5)
  await pg.click('.cDel'); await asyncio.sleep(.5); await pg.click('.cUndoBtn'); await asyncio.sleep(7)
  undone = sum(1 for m, u in log if m == 'DELETE' and '/comments' in u)
  back = await pg.evaluate("document.querySelectorAll('.cList li.cmt').length")
  await pg.click('.cDel'); await asyncio.sleep(2)
  early = sum(1 for m, u in log if m == 'DELETE' and '/comments' in u)
  await asyncio.sleep(5.5)
  late = sum(1 for m, u in log if m == 'DELETE' and '/comments' in u)
  print('2. deletes sent after Undo:', undone, '| comment back on the page:', back, '| deletes 2 s after deleting:', early, '| after 7.5 s:', late)
  if undone or back != 1: errs.append('Undo did not keep the comment, or it was deleted anyway')
  if early or late != 1: errs.append(f'the delete was not held until Undo had gone ({early}, {late})')
  # 5. Tab presses on the feed.
  log.clear()
  await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await pg.wait_for_selector('.browseTabs, .feedTabs, .tabs', timeout=15000); await asyncio.sleep(1.5)
  n0 = sum(1 for m, u in log if m == 'GET' and '/rest/v1/annotations' in u and 'select=' in u and 'comments' in u)
  for label in ('Everyone', 'For you', 'Following'):
    b2 = await pg.query_selector(f'label:has-text("{label}"), button:has-text("{label}")')
    if b2: await b2.click(); await asyncio.sleep(.8)
  n1 = sum(1 for m, u in log if m == 'GET' and '/rest/v1/annotations' in u and 'select=' in u and 'comments' in u)
  print('5. list reads on opening the feed:', n0, '| after three tab presses:', n1)
  if n1 != n0: errs.append(f'a tab press read the list again ({n0} then {n1})')
  # 6. The filter kept over a redraw on coming back.
  await asyncio.sleep(1)
  val = await pg.evaluate("(() => { const i = document.querySelector('.feedFilter input:not([value=\"all\"])'); if (!i) return null; i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); return i.value; })()")
  if val:
    await asyncio.sleep(.5)
    await pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }""")
    await asyncio.sleep(1.7)
    await pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }""")
    await asyncio.sleep(2.5)
    kept = await pg.evaluate(f"(document.querySelector('.feedFilter input:checked') || {{}}).value")
    print('6. filter chosen', val, '| after the redraw:', kept)
    if kept != val: errs.append(f'the filter went back to {kept}')
  else: errs.append('no filter to choose on the feed')
  # 3. A tag page.
  log.clear()
  await pg.goto('https://annotated-app.netlify.app/?tag=explainer&noplanes'); await asyncio.sleep(3)
  tagged = any('tag=eq.explainer' in u for m, u in log if '/rest/v1/annotations' in u)
  print('3. the tag asked of the database:', tagged)
  if not tagged: errs.append('a tag page filtered in the browser')
  # 4. A profile's count.
  await pg.goto('https://annotated-app.netlify.app/@robotaxi'); await asyncio.sleep(3)
  stats = await pg.evaluate("(document.querySelector('.stats') || {}).textContent || ''")
  print('4. profile header:', ' '.join(stats.split())[:80])
  if '137 annotations' not in stats: errs.append(f'the profile counted what it fetched: {stats[:60]}')
  await b.close()

async def ext(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('profAUD9'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  extid = sw.url.split('/')[2]
  pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
  await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
  # 8.
  sent = await pg.evaluate("""async () => {
    const got = { comments: [], reactions: [] };
    const fake = (table) => ({ insert: async (rows) => { got[table].push(...(Array.isArray(rows) ? rows : [rows])); return { error: null }; } });
    Backend.client.from = (t) => fake(t);
    await Cloud.carryOver('x-1', 'u1', [{ text: 'words', t: 1 }, { text: '', gif: { id: 'g', url: 'https://media.giphy.com/media/g/giphy.gif' }, t: 2 }, { text: '', t: 3 }],
      ['1','2','3','4','5','6','7','8','9','10'].map((n) => ({ emoji: String.fromCodePoint(0x1F600 + Number(n)), mine: true })));
    return { comments: got.comments.length, gifKept: got.comments.some((r) => r.gif), reactions: got.reactions.length }; }""")
  print('8. carried over:', sent)
  if sent != {'comments': 2, 'gifKept': True, 'reactions': 8}: errs.append(f'carrying over lost or overflowed: {sent}')
  # 10.
  panel = await ctx.new_page(); await panel.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
  n = await panel.evaluate("""async () => {
    const url = chrome.runtime.getURL('annotation.html#twice-ab12');
    await Promise.all([openExtPage('annotation.html#twice-ab12'), new Promise((r) => setTimeout(r, 30)).then(() => openExtPage('annotation.html#twice-ab12'))]);
    await new Promise((r) => setTimeout(r, 800));
    return (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url) === url).length; }""")
  print('10. tabs showing the page after two quick opens:', n)
  if n != 1: errs.append(f'two quick opens made {n} tabs')
  # 9.
  await pg.evaluate("""Store.put('slow-1', { item: { kind: 'article', text: 'Words', meta: { title: 'A story', url: 'https://example.com/s' } }, take: { text: 'Kept here' }, created: Date.now() })""")
  # Online, but nothing gets through: every request fails, and the client retries a refresh for seconds.
  await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda route: route.abort())
  await pg.evaluate("chrome.storage.local.set({ 'annotated-auth': JSON.stringify({ access_token: 'x', expires_at: 1, refresh_token: 'r', user: { id: 'u1' } }) })")
  t0 = time.time()
  pg2 = await ctx.new_page(); await pg2.goto(f'chrome-extension://{extid}/annotation.html#slow-1')
  shown = None
  for _ in range(40):
    await asyncio.sleep(.25)
    if await pg2.evaluate("!!document.querySelector('.take') && (document.querySelector('.take').textContent || '').includes('Kept here')"): shown = round(time.time() - t0, 1); break
  print('9. a kept annotation shown with the database silent after:', shown, 's')
  # Who you are and the rail each wait three seconds at most, one after the other (the rail needs who you are).
  if shown is None or shown > 8: errs.append(f'the page waited on the profile ({shown})')
  await ctx.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await web(p, errs)
    await ext(p, errs)
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
