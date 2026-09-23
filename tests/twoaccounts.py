# One browser, one local store, two accounts. The recordings of 2026-09-22 showed what that does. Follow
# appeared on your own annotation and not on anyone else's, the panel offered to delete someone else's work,
# a profile counted annotations that were not its own, and a comment was refused by the database because one
# person's id travelled with another person's token. Everything here is about telling those two apart.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
ME, THEM = 'id-me', 'id-them'

def rec(i, owner=None):
  r = {'id': f'r{i}', 'created': 1700000000000 + i * 1000,
       'item': {'kind': 'post', 'text': f'Post {i}', 'quote': f'quote {i}', 'author': 'Sawyer Merritt', 'handle': '@SawyerMerritt', 'url': f'https://x.com/SawyerMerritt/status/{i}'},
       'take': {'text': f'take {i}', 'tag': None, 'poll': None, 'voice': None}, 'comments': [], 'reactions': []}
  if owner:
    r['cloud'] = True
    r['author'] = {'id': owner, 'name': 'Robo Taxi' if owner == ME else 'David Winston',
                   'handle': 'robotaxi' if owner == ME else 'davidwinston', 'avatar': ''}
  return r

RECORDS = [rec(1, ME), rec(2, THEM), rec(3)]   # mine, theirs, and one never published

SIDE = """(a) => {
  const box = document.createElement('div'); document.body.appendChild(box);
  AnnotationPage.renderSide(box, { current: a.recs.find((r) => r.id === a.cur), records: a.recs, youId: a.you,
    permalinkOf: (id) => 'https://example.test/' + id, onOpen: () => {}, onFeed: () => {},
    onDelete: () => {}, localAware: true });
  const out = { listed: [...box.querySelectorAll('.sideList li button')].map((b) => b.dataset.id),
                delete: !!box.querySelector('.sideDelBtn') };
  box.remove(); return out;
}"""

BYLINE = """async (a) => {
  const box = document.createElement('div'); document.body.appendChild(box);
  await AnnotationPage.render(box, { id: 'r9', item: a.rec.item, take: a.rec.take, created: a.rec.created,
    author: a.mine ? null : a.rec.author, mine: a.mine, permalink: 'https://example.test/r9',
    comments: [], reactions: [], records: a.recs, siteNav: false, youId: a.you,
    social: a.social ? { youId: a.you, followed: new Set(), people: [], trending: { sources: [], tags: [] },
                         followsAuthor: false, onFollow: async () => true } : null });
  const out = { follow: !!box.querySelector('.followBtn.inline'), stats: (box.querySelector('.stats') || {}).textContent || '' };
  box.remove(); return out;
}"""

# A fake database, so the shape of an answer can be chosen rather than waited for.
FAKE = """(a) => {
  const rows = a.rows;
  window.__realClient = Backend.client;
  Backend.client = {
    rpc: (name) => Promise.resolve({ data: name === 'trending_sources' ? a.sources : [] }),
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: rows }) }),
      delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data: a.deleted, error: null }) }) }),
    }),
    storage: { from: () => ({ list: () => Promise.resolve({ data: [] }), remove: () => Promise.resolve({}) }) },
  };
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profTWO'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1200, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.2)

    # 1. The panel's list is your own work, and Delete is offered only on your own.
    mine = await pg.evaluate(SIDE, {'recs': RECORDS, 'you': ME, 'cur': 'r1'})
    theirs = await pg.evaluate(SIDE, {'recs': RECORDS, 'you': ME, 'cur': 'r2'})
    out = await pg.evaluate(SIDE, {'recs': RECORDS, 'you': None, 'cur': 'r3'})
    print('signed in as me, viewing my own:', mine)
    print('signed in as me, viewing theirs:', theirs)
    print('signed out, viewing a local one:', out)
    if mine['listed'] != ['r3', 'r1']: errs.append(f"the list held {mine['listed']}, wanted mine and the local one")
    if not mine['delete']: errs.append('my own annotation was not mine to delete')
    if theirs['delete']: errs.append("another person's annotation offered Delete")
    if out['listed'] != ['r3']: errs.append(f"signed out the list held {out['listed']}, wanted only the local one")
    if not out['delete']: errs.append('an annotation saved only here was not deletable')

    # 2. Counting your annotations, not the ones this computer happens to hold.
    counts = await pg.evaluate("(a)=>[AnnotationPage.mineCount(a.recs, a.me), AnnotationPage.mineCount(a.recs, a.them), AnnotationPage.mineCount(a.recs, null)]",
                               {'recs': RECORDS, 'me': ME, 'them': THEM})
    print('counted for me, for them, signed out:', counts)
    if counts != [2, 2, 1]: errs.append(f'the counts came out {counts}, wanted two, two and one')

    # 3. Follow belongs on someone else's annotation, never on your own and never while signed out.
    theirs_page = await pg.evaluate(BYLINE, {'rec': rec(2, THEM), 'recs': RECORDS, 'mine': False, 'you': ME, 'social': True})
    own_page = await pg.evaluate(BYLINE, {'rec': rec(1, ME), 'recs': RECORDS, 'mine': True, 'you': ME, 'social': True})
    cold_page = await pg.evaluate(BYLINE, {'rec': rec(2, THEM), 'recs': RECORDS, 'mine': False, 'you': None, 'social': True})
    print("on someone else's:", theirs_page['follow'], '| on my own:', own_page['follow'], '| signed out:', cold_page['follow'])
    if not theirs_page['follow']: errs.append("there was no way to follow the person whose annotation this is")
    if own_page['follow']: errs.append('it offered to follow me on my own annotation')
    if cold_page['follow']: errs.append('it offered Follow with nobody signed in')

    # 4. Following the last person leaves a sentence rather than an empty space.
    empties = await pg.evaluate("""(you) => {
      const box = document.createElement('div'); document.body.appendChild(box);
      const read = (followed) => { box.innerHTML = '';
        AnnotationPage.renderFeed(box, { records: [], mode: 'home', onOpen: () => {},
          social: { youId: you, followed, people: [], trending: { sources: [], tags: [] }, onFollow: async () => true,
                    tabs: { current: 'foryou', note: '', onTab: () => {} } } });
        const c = [...box.querySelectorAll('.railcard')].find((s) => /People worth following/.test(s.textContent));
        return c ? c.textContent.replace(/\\s+/g, ' ').trim() : ''; };
      const none = read(new Set()), some = read(new Set(['x']));
      box.remove(); return { none, some };
    }""", ME)
    print('nobody has published:', empties['none'][:70])
    print('you follow them all:', empties['some'][:70])
    if not empties['none'] or not empties['some']: errs.append('the card vanished instead of saying where everyone went')
    if empties['none'] == empties['some']: errs.append('it says the same thing whether or not you follow anyone')

    # 4b. Pressing Follow moves your own count and takes that person out of the list of people to follow.
    #     The same screen used to say Following on the byline and nought following in your own card.
    moved = await pg.evaluate("""(a) => new Promise((done) => {
      const box = document.createElement('div'); document.body.appendChild(box);
      AnnotationPage.renderFeed(box, { records: [], mode: 'home', onOpen: () => {},
        social: { youId: a.you, followed: new Set(), onFollow: async () => true,
                  you: { id: a.you, annotations: 2, followers: 0, following: 0 },
                  people: [{ id: a.them, name: 'David Winston', handle: 'davidwinston', avatar: '', annotations: 1 }],
                  trending: { sources: [], tags: [] }, tabs: { current: 'foryou', note: '', onTab: () => {} } } });
      const read = () => ({ following: (box.querySelector('.youFollowing') || {}).textContent || '',
                            people: box.querySelectorAll('.peopleList li').length });
      const before = read();
      box.querySelector('.peopleList .followBtn').click();
      setTimeout(() => { const after = read(); box.remove(); done({ before, after }); }, 200);
    })""", {'you': ME, 'them': THEM})
    print('before pressing Follow:', moved['before'], '| after:', moved['after'])
    if moved['before']['following'] != '0': errs.append(f"it started at {moved['before']['following']!r} following")
    if moved['after']['following'] != '1': errs.append(f"after following someone it said {moved['after']['following']!r} following")
    if moved['after']['people'] != 0: errs.append('the person you just followed stayed in the list of people to follow')

    # 5. Two posts by one person are told apart by their quotes, not left as the same row twice.
    await pg.evaluate(FAKE, {
      'sources': [{'kind': 'post', 'title': 'Sawyer Merritt on X', 'source_key': 'a', 'sample_id': 'r1', 'annotations': 2, 'activity': 3},
                  {'kind': 'post', 'title': 'Sawyer Merritt on X', 'source_key': 'b', 'sample_id': 'r2', 'annotations': 2, 'activity': 2},
                  {'kind': 'video', 'title': 'Dreamforce 2026', 'source_key': 'c', 'sample_id': 'r3', 'annotations': 1, 'activity': 1}],
        'rows': [{'id': 'r1', 'source': {'quote': 'another 9 Cybercabs'}}, {'id': 'r2', 'source': {'quote': 'started road testing its first'}}],
        'deleted': []})
    trend = await pg.evaluate("async () => (await Cloud.trending()).sources.map((s) => [s.title, s.quote || ''])")
    print('trending rows:', trend)
    if trend[0][1] == trend[1][1]: errs.append('the two rows with one name still read the same')
    if not trend[0][1] or not trend[1][1]: errs.append('a row that shares its name got nothing to tell it apart')
    if trend[2][1]: errs.append('a row with a name of its own was given a quote it did not need')

    # 6. A delete the database quietly refused is a failure, not a success. Nothing comes back, and no error
    #    comes with it, so the rows have to be asked for.
    gone = await pg.evaluate("async () => { try { await Cloud.remove('r2', 'id-me'); return 'said it worked'; } catch (e) { return e.message; } }")
    print('deleting what is not yours:', gone)
    if gone == 'said it worked': errs.append('deleting another person\'s annotation reported success')
    cmt = await pg.evaluate("async () => { try { await Cloud.deleteComment('c1'); return 'said it worked'; } catch (e) { return e.message; } }")
    print('deleting a comment that is not yours:', cmt)
    if cmt == 'said it worked': errs.append("deleting another person's comment reported success")
    await pg.evaluate("() => { Backend.client = window.__realClient; }")

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
