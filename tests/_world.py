# A lived-in stand-in for the database, for UX tours and tests: several people, every kind of annotation, replies,
# reactions, a poll, a quote, a pin, follows and activity. Nothing reaches the real database.
import json, time, pathlib, mimetypes
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote, urlparse

PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
NOW = datetime.now(timezone.utc)
iso = lambda dt: dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
ago = lambda **kw: iso(NOW - timedelta(**kw))

ME = {'id': '11111111-1111-4111-8111-111111111111', 'handle': 'davidw', 'display_name': 'David Winston', 'avatar_url': ''}
SAW = {'id': '22222222-2222-4222-8222-222222222222', 'handle': 'sawyer', 'display_name': 'Sawyer Merritt', 'avatar_url': ''}
PRI = {'id': '33333333-3333-4333-8333-333333333333', 'handle': 'priya', 'display_name': 'Priya Raman', 'avatar_url': ''}
LEO = {'id': '44444444-4444-4444-8444-444444444444', 'handle': 'leo', 'display_name': 'Leo Park', 'avatar_url': ''}
PEOPLE = [ME, SAW, PRI, LEO]
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
  'user': {'id': ME['id'], 'aud': 'authenticated', 'role': 'authenticated', 'email': 'david@example.test', 'app_metadata': {'providers': ['google']},
           'user_metadata': {'full_name': 'David Winston'}, 'created_at': '2026-09-01T00:00:00Z', 'identities': [{'provider': 'google'}]}}

def ann(id, who, kind, take, when, source, **kw):
  r = {'id': id, 'author_id': who['id'], 'kind': kind, 'created_at': when, 'take_text': take, 'tag': None, 'poll': None, 'gif': None,
       'voice_path': None, 'upload': None, 'media_path': None, 'poster_path': None, 'shot_path': None, 'edited_at': None,
       'quote_of': None, 'quoted': None, 'source': source, 'author': who}
  r.update(kw); return r

ART = {'text': 'The council voted 7 to 2 on Tuesday to run overnight buses on three routes for a six-month trial, starting in November.',
       'fragmentUrl': 'https://harborline.example/overnight-buses#:~:text=The%20council', 'meta': {'title': 'Overnight buses will run on three routes', 'url': 'https://harborline.example/overnight-buses', 'site': 'Harborline News', 'author': 'Dana Ruiz', 'published': '2026-09-28T09:00:00Z', 'description': 'A six-month trial starts in November.'}}
VID = {'title': 'To the Moon and Back: The Journey of Artemis I', 'channel': 'NASA Johnson', 'videoId': 'abcdefghijk', 'start': 164, 'end': 186, 'duration': 347,
       'url': 'https://www.youtube.com/watch?v=abcdefghijk', 'transcript': 'And liftoff of Artemis I. We rise together, back to the Moon and beyond.'}
POD = {'title': 'So You Want to be an Astronaut?', 'show': 'Houston We Have a Podcast', 'start': 76, 'end': 98, 'duration': 664, 'url': 'https://podcasts.apple.com/us/podcast/x/id1?i=2'}
POST = {'text': 'We must pace the frontier. The strongest models should be tested before they ship, and the tests should be shared.', 'quote': 'the tests should be shared',
        'author': 'Dario Amodei', 'handle': '@DarioAmodei', 'url': 'https://x.com/DarioAmodei/status/1966000000000000000', 'posted': '2026-09-12T14:01:00Z', 'display': 'screenshot'}

A_MINE = ann('buses-deserve-a-real-trial-a1b2', ME, 'article', 'Six months is enough to see if people ride at 2am. Worth watching the numbers.', ago(minutes=6), ART, tag='Explainer', shot_path=ME['id'] + '/a1/shot.png')
A_MINE_OLD = ann('liftoff-still-gives-me-chills-c3d4', ME, 'video', 'Liftoff still gives me chills. The sound arrives a beat after the light.', ago(days=2), VID, poster_path=ME['id'] + '/v1/poster.jpg', media_path=ME['id'] + '/v1/clip.webm')
A_SAW = ann('the-tests-should-be-shared-e5f6', SAW, 'post', 'This is the part everyone skips. Shared tests are what make "safe" mean something.', ago(hours=3), POST, tag='Hot take', shot_path=SAW['id'] + '/p1/shot.png',
            poll={'question': 'Should labs publish their safety tests?', 'options': ['Yes, all of them', 'Only the results', 'No']})
A_PRI = ann('astronaut-answer-g7h8', PRI, 'audio', 'The honest answer to "how do I become an astronaut" is: be very good at something else first.', ago(hours=9), POD, media_path=PRI['id'] + '/a1/clip.mp3')
A_LEO = ann('seven-to-two-is-not-close-i9j0', LEO, 'article', 'Seven to two is not a close vote. The trial was never in doubt.', ago(days=1), ART, tag='Fact check')
A_QUOTE = ann('answering-david-k1l2', SAW, 'article', 'Agreed, and the ridership data should be public from week one.', ago(minutes=40), ART, quote_of=A_MINE['id'],
              quoted={'id': A_MINE['id'], 'kind': 'article', 'take_text': A_MINE['take_text'], 'tag': 'Explainer', 'source': ART, 'shot_path': None, 'poster_path': None, 'created_at': A_MINE['created_at'], 'author': ME})
ALL = [A_MINE, A_MINE_OLD, A_SAW, A_PRI, A_LEO, A_QUOTE]

def comments_for(aid):
  if aid == A_MINE['id']:
    return [{'id': 101, 'parent_id': None, 'body': 'Do you know which three routes?', 'gif': None, 'upload': None, 'created_at': ago(minutes=5), 'author_id': PRI['id'], 'author': PRI, 'comment_reactions': [{'emoji': '👍', 'user_id': LEO['id']}]},
            {'id': 102, 'parent_id': 101, 'body': 'The 14, the 22 and the harbor loop.', 'gif': None, 'upload': None, 'created_at': ago(minutes=4), 'author_id': ME['id'], 'author': ME, 'comment_reactions': []},
            {'id': 103, 'parent_id': None, 'body': 'Night shift workers have been asking for this for years.', 'gif': None, 'upload': None, 'created_at': ago(minutes=3), 'author_id': LEO['id'], 'author': LEO, 'comment_reactions': []}]
  if aid == A_SAW['id']:
    return [{'id': 201, 'parent_id': None, 'body': 'Results only is how you get benchmarks nobody can check.', 'gif': None, 'upload': None, 'created_at': ago(hours=2), 'author_id': LEO['id'], 'author': LEO, 'comment_reactions': []}]
  return []
REACTIONS = {A_MINE['id']: [('🔥', SAW['id']), ('🔥', LEO['id']), ('👀', PRI['id'])], A_SAW['id']: [('💯', PRI['id']), ('🤔', ME['id'])], A_PRI['id']: [('😂', LEO['id'])]}
VOTES = {A_SAW['id']: [(0, PRI['id']), (0, LEO['id']), (1, ME['id'])]}
FOLLOWS = [(ME['id'], SAW['id']), (PRI['id'], ME['id']), (LEO['id'], ME['id'])]
ACTIVITY = [
  {'kind': 'quote', 'actor_id': SAW['id'], 'handle': 'sawyer', 'display_name': 'Sawyer Merritt', 'avatar_url': '', 'annotation_id': A_QUOTE['id'], 'take': A_QUOTE['take_text'], 'snippet': A_QUOTE['take_text'], 'at': ago(minutes=40)},
  {'kind': 'comment', 'actor_id': LEO['id'], 'handle': 'leo', 'display_name': 'Leo Park', 'avatar_url': '', 'annotation_id': A_MINE['id'], 'take': A_MINE['take_text'], 'snippet': 'Night shift workers have been asking for this for years.', 'at': ago(minutes=3)},
  {'kind': 'reaction', 'actor_id': SAW['id'], 'handle': 'sawyer', 'display_name': 'Sawyer Merritt', 'avatar_url': '', 'annotation_id': A_MINE['id'], 'take': A_MINE['take_text'], 'snippet': '🔥', 'at': ago(minutes=2)},
  {'kind': 'follow', 'actor_id': PRI['id'], 'handle': 'priya', 'display_name': 'Priya Raman', 'avatar_url': '', 'annotation_id': None, 'take': None, 'snippet': None, 'at': ago(days=3)},
]

def site(route):
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / (path + '.html') if (PUB / (path + '.html')).is_file() else PUB / 'index.html'
  body = f.read_bytes(); ctype = mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
  # Byte ranges, as Netlify answers them, or a video cannot seek.
  rng = route.request.headers.get('range')
  if rng and rng.startswith('bytes='):
    a0, _, z0 = rng[6:].partition('-'); a0 = int(a0 or 0); z0 = int(z0) if z0 else len(body) - 1; z0 = min(z0, len(body) - 1)
    return route.fulfill(status=206, body=body[a0:z0 + 1], headers={'Content-Type': ctype, 'Content-Range': f'bytes {a0}-{z0}/{len(body)}', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'})
  return route.fulfill(status=200, body=body, headers={'Content-Type': ctype, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'})

def make_db(state=None, log=None):
  state = state if state is not None else {}
  state.setdefault('pin', A_MINE_OLD['id']); state.setdefault('blocks', []); state.setdefault('writes', [])
  async def db(route):
    r = route.request; u = unquote(r.url); m = r.method
    if log is not None: log.append((m, u))
    one = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
    def J(body, status=200, extra=None):
      return route.fulfill(status=status, content_type='application/json', headers={'Access-Control-Expose-Headers': 'Content-Range', **(extra or {})}, body=json.dumps(body))
    if '/storage/' in u:
      f = PUB / 'media' / ('panel-demo.mp4' if u.endswith('.webm') else 'astronaut.mp3' if u.endswith('.mp3') else 'panel-demo.jpg')
      return await route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})
    if '/auth/v1/health' in u: return await J({})
    if '/auth/v1/user' in u: return await J(SESSION['user'])
    if '/auth/v1/' in u: return await J({})
    if m != 'GET' and m != 'HEAD': state['writes'].append((m, u, r.post_data))
    if '/rpc/activity' in u: return await J(ACTIVITY)
    if '/rpc/people_to_follow' in u: return await J([{'id': p['id'], 'handle': p['handle'], 'display_name': p['display_name'], 'avatar_url': '', 'annotations': 2} for p in (PRI, LEO)])
    if '/rpc/trending_sources' in u: return await J([{'key': 'harbor', 'title': ART['meta']['title'], 'url': ART['meta']['url'], 'kind': 'article', 'n': 3, 'people': 3}])
    if '/rpc/trending_tags' in u: return await J([{'tag': 'Explainer', 'n': 2}, {'tag': 'Hot take', 'n': 1}])
    if '/rpc/' in u: return await J([])
    if '/rest/v1/profiles' in u:
      if m == 'PATCH':
        body = json.loads(r.post_data or '{}')
        if 'pinned_id' in body: state['pin'] = body['pinned_id']; return await J([{'pinned_id': state['pin']}])
        return await J([{**ME, **body}])
      if 'select=pinned_id' in u: return await J({'pinned_id': state['pin'] if ME['id'] in u else None} if one else [{'pinned_id': state['pin']}])
      p = next((p for p in PEOPLE if p['handle'] in u.split('handle=eq.')[-1][:20] or p['id'] in u), ME)
      return await J(p if one else [p])
    if '/rest/v1/blocks' in u:
      if m == 'GET': return await J([{'target_id': t, 'kind': k} for t, k in state['blocks']])
      return await J([], 201)
    if '/rest/v1/follows' in u:
      if m == 'HEAD':
        n = sum(1 for a, b in FOLLOWS if ('followee_id=eq.' + b) in u or ('follower_id=eq.' + a) in u)
        return await route.fulfill(status=200, headers={'Content-Range': f'0-0/{n}', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json'}, body='')
      if m == 'GET': return await J([{'followee_id': b} for a, b in FOLLOWS if ('follower_id=eq.' + a) in u])
      return await J([], 201)
    if '/rest/v1/comments' in u:
      if m == 'POST': return await J({'id': 900 + len(state['writes'])}, 201)
      if m == 'DELETE': return await J([{'id': 1, 'upload': None}])
      aid = u.split('annotation_id=eq.')[-1].split('&')[0] if 'annotation_id=eq.' in u else ''
      return await J(comments_for(aid))
    if '/rest/v1/reactions' in u or '/rest/v1/comment_reactions' in u:
      if m == 'GET':
        aid = u.split('annotation_id=eq.')[-1].split('&')[0]
        return await J([{'emoji': e, 'user_id': w} for e, w in REACTIONS.get(aid, [])])
      return await J([], 201)
    if '/rest/v1/poll_votes' in u:
      if m == 'GET':
        aid = u.split('annotation_id=eq.')[-1].split('&')[0]
        return await J([{'option_index': i, 'user_id': w} for i, w in VOTES.get(aid, [])])
      return await J([], 201)
    if '/rest/v1/claims' in u: return await J([], 201)
    if '/rest/v1/annotations' in u:
      if m == 'HEAD':
        n = len([a for a in ALL if ('author_id=eq.' + a['author_id']) in u]) if 'author_id=eq.' in u else len(ALL)
        return await route.fulfill(status=200, headers={'Content-Range': f'0-0/{n}', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json'}, body='')
      if m == 'POST': return await J([], 201)
      if m == 'PATCH': return await J([{'id': 'x', 'edited_at': iso(NOW)}])
      if m == 'DELETE': return await J([{'id': 'x', 'shot_path': None, 'media_path': None, 'poster_path': None, 'voice_path': None, 'upload': None}])
      def full(a):
        cs = comments_for(a['id']); rx = REACTIONS.get(a['id'], []); pv = VOTES.get(a['id'], [])
        return {**a, 'comments': [{'author_id': c['author_id']} for c in cs], 'first': [{'author_id': c['author_id'], 'body': c['body'], 'gif': None, 'created_at': c['created_at'], 'author': c['author']} for c in cs],
                'reactions': [{'emoji': e, 'user_id': w} for e, w in rx], 'poll_votes': [{'user_id': w} for _, w in pv]}
      if 'select=id' in u.replace('%2C', ',') and 'id=in.' in u:
        ids = u.split('id=in.(')[-1].split(')')[0].split(',')
        return await J([{'id': i} for i in ids if any(a['id'] == i for a in ALL)])
      import re as _re
      own = _re.search(r'[?&]id=eq\.([^&]+)', u)
      if own:
        a = next((a for a in ALL if a['id'] == own.group(1)), None)
        return await J((full(a) if a else None) if one else ([full(a)] if a else []))
      rows = [full(a) for a in ALL if ('author_id=eq.' + a['author_id']) in u] if 'author_id=eq.' in u else [full(a) for a in ALL]
      if 'tag=eq.' in u:
        t = u.split('tag=eq.')[-1].split('&')[0]; rows = [x for x in rows if x['tag'] == t]
      rows.sort(key=lambda x: x['created_at'], reverse=True)
      return await J(rows, 200, {'Content-Range': f'0-{max(0, len(rows) - 1)}/{len(rows)}'})
    return await J([])
  return db
