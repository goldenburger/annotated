# Features borrowed from X (2.40.0), on the website against a stand-in database, signed in.
#   1. Your own annotation: Pin to your profile saves pinned_id and marks it Pinned; Unpin clears it.
#   2. The edit window: Edit is offered on a new annotation (with the minutes left) and not on one an hour old.
#   3. Someone else's annotation: Block saves a block and says what it does; Mute the same with its own words.
#   4. Annotate this publishes an annotation of your own that names the one it answers, then opens it.
#   5. An annotation of an annotation draws the one it answers, which opens it; one whose original is gone says so.
#   6. Replies: a reply sits under the comment it answers, and Reply sends parent_id.
#   7. A profile's pinned annotation comes first, marked Pinned.
#   8. Activity: the bell shows a dot when something is new, and /?activity lists it, new ones marked.
#   9. The feed leaves out people you blocked.
import asyncio, json, time
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site
from audit9 import UID, AUTH, SESSION

BLK = '33333333-3333-4333-8333-333333333333'
iso = lambda dt: dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
NOW = datetime.now(timezone.utc)
ME = {'id': UID, 'handle': 'me', 'display_name': 'Me Myself', 'avatar_url': ''}
THEM = {'id': AUTH, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}
BAD = {'id': BLK, 'handle': 'pest', 'display_name': 'Pest', 'avatar_url': ''}
def row(id, author, take, when, **kw):
  r = {'id': id, 'author_id': author['id'], 'kind': 'article', 'created_at': iso(when), 'take_text': take, 'tag': None, 'poll': None, 'gif': None,
       'voice_path': None, 'upload': None, 'media_path': None, 'poster_path': None, 'shot_path': None, 'edited_at': None, 'quote_of': None, 'quoted': None,
       'source': {'text': 'Overnight buses will run on three routes.', 'meta': {'title': 'Harbor story', 'url': 'https://news.example/harbor', 'site': 'News'}},
       'author': author, 'comments': [], 'first': [], 'reactions': [], 'poll_votes': []}
  r.update(kw); return r
MINE = row('my-take-aa11', ME, 'My fresh take.', NOW - timedelta(minutes=2))
OLD = row('my-old-take-bb22', ME, 'An older take.', NOW - timedelta(hours=1))
THEIRS = row('their-take-cc33', THEM, 'Their take on it.', NOW - timedelta(hours=3))
PEST = row('pest-take-dd44', BAD, 'Pest was here.', NOW - timedelta(hours=4))
QUOTE = row('quote-take-ee55', THEM, 'Answering your take.', NOW - timedelta(minutes=30), quote_of=MINE['id'],
            quoted={'id': MINE['id'], 'kind': 'article', 'take_text': 'My fresh take.', 'tag': None, 'source': MINE['source'], 'shot_path': None, 'poster_path': None, 'created_at': MINE['created_at'], 'author': ME})
ORPHAN = row('orphan-take-ff66', THEM, 'Its original went.', NOW - timedelta(minutes=40), quote_of=None, quoted=None)
ORPHAN['quote_of'] = 'deleted-take-zz99'
ROWS = {r['id']: r for r in (MINE, OLD, THEIRS, PEST, QUOTE, ORPHAN)}

def make_db(state, log):
  async def db(route):
    r = route.request; u = unquote(r.url); m = r.method; log.append((m, u, r.post_data))
    one = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
    J = lambda body, status=200, headers=None: route.fulfill(status=status, content_type='application/json', headers=headers or {}, body=json.dumps(body))
    if '/auth/v1/user' in u: return await J(SESSION['user'])
    if '/rest/v1/rpc/activity' in u: return await J(state['activity'])
    if '/rest/v1/profiles' in u:
      if m == 'PATCH':
        state['pin'] = json.loads(r.post_data or '{}').get('pinned_id'); return await J([{'pinned_id': state['pin']}])
      if 'select=pinned_id' in u: return await J({'pinned_id': state['pin']} if one else [{'pinned_id': state['pin']}])
      prof = THEM if 'robotaxi' in u else ME
      return await J(prof if one else [prof])
    if '/rest/v1/blocks' in u:
      if m in ('POST', 'DELETE'): state['blocks'].append((m, r.post_data, u)); return await J([], 201 if m == 'POST' else 200)
      return await J(state['blocklist'])
    if '/rest/v1/comments' in u:
      if m == 'POST': state['posted'].append(json.loads(r.post_data)); return await J({'id': 88}, 201)
      if 'annotation_id=eq.their-take-cc33' in u:
        return await J([{'id': 5, 'parent_id': None, 'body': 'First thought.', 'gif': None, 'upload': None, 'created_at': iso(NOW - timedelta(hours=2)), 'author_id': AUTH, 'author': THEM, 'comment_reactions': []},
                        {'id': 6, 'parent_id': 5, 'body': 'A reply to it.', 'gif': None, 'upload': None, 'created_at': iso(NOW - timedelta(hours=1)), 'author_id': BLK, 'author': BAD, 'comment_reactions': []}])
      return await J([])
    if '/rest/v1/annotations' in u:
      if m == 'HEAD': return await route.fulfill(status=200, headers={'Content-Range': '0-0/2', 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range'}, body='')
      if m == 'POST': state['annotations'].append(json.loads(r.post_data)); return await J([], 201)
      for id_, rw in ROWS.items():
        if f'id=eq.{id_}' in u: return await J(rw if one else [rw])
      if 'author_id=eq.' + UID in u: rows = [MINE, OLD]
      else: rows = [THEIRS, PEST, MINE]
      return await J(rows, 200, {'Content-Range': f'0-{len(rows) - 1}/{len(rows)}', 'Access-Control-Expose-Headers': 'Content-Range'})
    return await J([])
  return db

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1400, 'height': 1000})
    state = {'pin': None, 'blocks': [], 'blocklist': [], 'posted': [], 'annotations': [],
             'activity': [{'kind': 'reply', 'actor_id': AUTH, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': '', 'annotation_id': MINE['id'], 'take': 'My fresh take.', 'snippet': 'Good point.', 'at': iso(NOW - timedelta(minutes=5))},
                          {'kind': 'follow', 'actor_id': AUTH, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': '', 'annotation_id': None, 'take': None, 'snippet': None, 'at': iso(NOW - timedelta(days=2))}]}
    log = []
    await c.add_init_script(f"try{{ localStorage.setItem('annotated-auth', {json.dumps(json.dumps(SESSION))}); if (!sessionStorage.getItem('seen0')) {{ localStorage.setItem('annotated-activity-seen:{UID}', String(Date.now() - 86400000)); sessionStorage.setItem('seen0', '1'); }} }}catch(e){{}}")
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', make_db(state, log))
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    base = 'https://annotated-app.netlify.app'
    menu = lambda: pg.evaluate("[...document.querySelectorAll('.annCard .menu > button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())")

    # 1 and 2.
    await pg.goto(f'{base}/@me/{MINE["id"]}'); await pg.wait_for_selector('.annCard .moreBtn'); await asyncio.sleep(1)
    items = await menu()
    print('1. my menu:', items)
    if not any(i.startswith('Edit your take') and 'left to edit' in i for i in items): errs.append(f'no edit with minutes left on a new annotation: {items}')
    await pg.click('.annCard .moreBtn'); await pg.click('.annCard .pinBtn'); await asyncio.sleep(.8)
    pinned = await pg.evaluate("({ mark: !!document.querySelector('.who .pinMark'), say: document.querySelector('.blockSay').textContent })")
    print('   pinned:', state['pin'], pinned)
    if state['pin'] != MINE['id'] or not pinned['mark']: errs.append(f'pinning did not save or show: {state["pin"]}, {pinned}')
    await pg.click('.annCard .moreBtn'); await pg.click('.annCard .pinBtn'); await asyncio.sleep(.8)
    if state['pin'] is not None or await pg.locator('.who .pinMark').count(): errs.append('unpinning did not clear the pin')
    await pg.goto(f'{base}/@me/{OLD["id"]}'); await pg.wait_for_selector('.annCard .moreBtn'); await asyncio.sleep(1)
    items = await menu()
    print('2. an hour-old annotation\'s menu:', items)
    if any(i.startswith('Edit') for i in items): errs.append(f'edit offered past its window: {items}')

    # 3.
    await pg.goto(f'{base}/@robotaxi/{THEIRS["id"]}'); await pg.wait_for_selector('.annCard .moreBtn'); await asyncio.sleep(1)
    items = await menu()
    print('3. their menu:', items)
    if 'Mute Robo Taxi' not in items or 'Block Robo Taxi' not in items: errs.append(f'no mute or block: {items}')
    await pg.click('.annCard .moreBtn'); await pg.click('.annCard .blockBtn'); await asyncio.sleep(.8)
    said = await pg.inner_text('.blockSay')
    sent = [x for x in state['blocks'] if x[0] == 'POST']
    print('   blocked:', sent[-1][1] if sent else None, '|', said)
    if not sent or '"kind":"block"' not in sent[-1][1].replace(' ', '') or 'blocked Robo Taxi' not in said: errs.append(f'block did not save or say so: {sent}, {said!r}')
    items = await menu()
    if 'Unblock Robo Taxi' not in items: errs.append(f'the menu does not offer Unblock: {items}')

    # 6. (on the same page) replies.
    nest = await pg.evaluate("(() => { const r = document.querySelector('.cReplies .cReplyItem'); return r ? r.closest('li.cmt:not(.cReplyItem)').querySelector('.cBody > p').textContent + ' > ' + r.querySelector('p').textContent : null; })()")
    print('6. nested:', nest)
    if nest != 'First thought. > A reply to it.': errs.append(f'the reply is not under its comment: {nest}')
    await pg.click('.cReplyBtn'); await pg.fill('.cReplyText', 'My answer.'); await pg.click('.cReplyPost'); await asyncio.sleep(1)
    last = state['posted'][-1] if state['posted'] else {}
    print('   reply sent:', last)
    if last.get('parent_id') != 5 or last.get('body') != 'My answer.': errs.append(f'the reply did not name its comment: {last}')
    shown = await pg.evaluate("[...document.querySelectorAll('.cReplies .cReplyItem p')].map((p) => p.textContent)")
    if 'My answer.' not in shown: errs.append(f'the new reply is not shown under its comment: {shown}')

    # 4. Annotate this.
    await pg.click('.quoteBtn'); await pg.fill('.quoteText', 'I read it differently.'); await pg.click('.quotePost'); await asyncio.sleep(1.5)
    q = state['annotations'][-1] if state['annotations'] else {}
    print('4. annotated:', {k: q.get(k) for k in ('quote_of', 'take_text', 'author_id', 'kind')}, '->', pg.url)
    if q.get('quote_of') != THEIRS['id'] or q.get('take_text') != 'I read it differently.' or q.get('author_id') != UID: errs.append(f'the annotation of an annotation was not sent right: {q}')
    if '/@me/i-read-it-differently' not in pg.url: errs.append(f'it did not open the new annotation: {pg.url}')

    # 5. A quote shows the one it answers.
    await pg.goto(f'{base}/@robotaxi/{QUOTE["id"]}'); await pg.wait_for_selector('.quoted'); await asyncio.sleep(.8)
    qt = await pg.inner_text('.quoted')
    print('5. quoted card:', qt.replace('\n', ' | '))
    if 'My fresh take.' not in qt: errs.append(f'the quoted annotation is not drawn: {qt!r}')
    await pg.click('.quoted'); await asyncio.sleep(1.2)
    if MINE['id'] not in pg.url: errs.append(f'the quoted card did not open its annotation: {pg.url}')
    await pg.goto(f'{base}/@robotaxi/{ORPHAN["id"]}'); await pg.wait_for_selector('.quotedGone'); await asyncio.sleep(.5)

    # 7. Pinned first on a profile.
    state['pin'] = OLD['id']
    await pg.goto(f'{base}/@me'); await pg.wait_for_selector('.cards .card'); await asyncio.sleep(1)
    first = await pg.evaluate("(() => { const c = document.querySelector('.cards .card'); return { id: c.dataset.id, pin: !!c.querySelector('.cpin') }; })()")
    print('7. first card on the profile:', first)
    if first != {'id': OLD['id'], 'pin': True}: errs.append(f'the pinned annotation is not first: {first}')

    # 8. Activity.
    dot = await pg.evaluate("(() => { const b = document.querySelector('.navAct'); return b ? { shown: !b.hidden, dot: !b.querySelector('.actDot').hidden } : null; })()")
    print('8. bell:', dot)
    if not dot or not dot['shown'] or not dot['dot']: errs.append(f'no bell or no dot: {dot}')
    await pg.click('.navAct'); await pg.wait_for_selector('.activity .actList'); await asyncio.sleep(.5)
    rows = await pg.evaluate("[...document.querySelectorAll('.actItem')].map((li) => [li.classList.contains('new'), li.textContent.replace(/\\s+/g, ' ').trim()])")
    print('   activity:', rows)
    if len(rows) != 2 or not rows[0][0] or rows[1][0] or 'replied to your comment' not in rows[0][1] or 'followed you' not in rows[1][1]: errs.append(f'activity is not listed right: {rows}')
    await pg.click('.actItem .actRow'); await asyncio.sleep(1.2)
    if MINE['id'] not in pg.url: errs.append(f'an activity row did not open its annotation: {pg.url}')

    # 9. Blocked people out of the feed.
    state['blocklist'] = [{'target_id': BLK, 'kind': 'block'}]
    await pg.goto(f'{base}/?feed'); await pg.wait_for_selector('.cards'); await asyncio.sleep(1.5)
    await pg.evaluate("(() => { const e = [...document.querySelectorAll('.feedTabs input')].find((i) => i.value === 'everyone'); if (e) e.click(); })()"); await asyncio.sleep(1)
    ids = await pg.evaluate("[...document.querySelectorAll('.cards .card')].map((c) => c.dataset.id)")
    print('9. feed:', ids)
    if PEST['id'] in ids: errs.append('a blocked person is still in the feed')
    if THEIRS['id'] not in ids: errs.append(f'the feed lost someone not blocked: {ids}')
    await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
