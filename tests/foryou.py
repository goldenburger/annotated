# For you, ranked from a set of annotations chosen to test each rule. It never offers your own annotations
# or ones saved only on this computer, puts someone you follow first and says so, lifts a post someone you
# follow joined in on, says why for every card, never runs two cards by one person back to back, moves down
# what you have opened or already joined in on, and counts different people rather than raw activity.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
ME, SAM, ANA, BO, CY = 'me', 'sam', 'ana', 'bo', 'cy'
H = 3600 * 1000
RANK = """(a) => {
  const now = Date.now();
  const person = (id) => ({ id, name: { me: 'Robo Taxi', sam: 'Sawyer Merritt', ana: 'Ana Ruiz', bo: 'Bo Chen', cy: 'Cy Park' }[id], handle: id, avatar: '' });
  const rec = (id, author, hoursAgo, extra = {}) => ({ id, cloud: true, author: person(author), created: now - hoursAgo * 3600e3,
    item: { kind: 'post', text: 'Post ' + id, author: 'X', handle: '@x', url: 'https://x.com/x/status/' + (extra.src || id) },
    take: { text: 'take ' + id, tag: extra.tag || null }, comments: new Array(extra.replies || 0).fill({}), reactions: [], voices: extra.voices || [] });
  const records = [
    rec('mine', 'me', 1),
    { id: 'local', created: now - 1000, item: { kind: 'post', text: 'p', url: 'https://x.com/x/status/local' }, take: { text: 'only here' }, comments: [], reactions: [] },
    rec('sam1', 'sam', 30),
    rec('sam2', 'sam', 31),
    rec('sam3', 'sam', 32),
    rec('busy', 'ana', 20, { replies: 9, voices: ['bo'] }),
    rec('wide', 'bo', 20, { replies: 3, voices: ['ana', 'cy', 'sam'] }),
    rec('friendin', 'cy', 40, { voices: ['sam'] }),
    rec('opened', 'ana', 2),
    rec('joined', 'bo', 2, { voices: ['me'] }),
    rec('mysrc', 'cy', 60, { src: 'shared-source' }),
  ];
  const out = Cloud.forYou(records, { followed: new Set(['sam']), myId: 'me', mySources: new Set(['https://x.com/x/status/shared-source']),
    opened: new Set(['opened']), names: new Map(records.filter((r) => r.author).map((r) => [r.author.id, r.author.name])) });
  return out.map((r) => ({ id: r.id, author: r.author.id, why: r.why }));
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profFY'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.5)
    out = await pg.evaluate(RANK)
    for i, r in enumerate(out): print(f'{i + 1:2}. {r["id"]:9} {r["author"]:4} {r["why"]}')
    ids = [r['id'] for r in out]
    if 'mine' in ids or 'local' in ids: errs.append('For you offered your own annotations back to you')
    # Someone you follow comes before anything else that nobody you follow has touched.
    first_sam = min(ids.index(x) for x in ('sam1', 'sam2', 'sam3'))
    if first_sam > ids.index('busy'): errs.append(f'a busy post by a stranger came before someone you follow: {ids[:4]}')
    if out[first_sam]['why'] != 'You follow Sawyer Merritt': errs.append(f"their card says {out[first_sam]['why']!r}")
    # A card with nothing about you in it has no reason line: "New today" was dropped, the time being beside the
    # author already (UX audit of 2026-09-25). The ones picked for you still say why.
    if any(not r['why'] for r in out[:3]): errs.append('a card picked for you has no reason on it')
    if any(r['why'] == 'New today' for r in out): errs.append('a card still says New today')
    for a, b in zip(out, out[1:]):
      if a['author'] == b['author'] and len(set(r['author'] for r in out)) > 1:
        errs.append(f'two by {a["author"]} in a row: {a["id"]}, {b["id"]}'); break
    # A third by one person waits until nobody else is left.
    if ids.index('sam3') != len(ids) - 1: errs.append(f'a third card by one person came before others: {ids}')
    fi = next((r for r in out if r['id'] == 'friendin'), None)
    if not fi or 'who you follow, joined in' not in fi['why']: errs.append(f'a post someone you follow joined in on did not say so: {fi}')
    ms = next((r for r in out if r['id'] == 'mysrc'), None)
    if not ms or ms['why'] != 'On a post you annotated': errs.append(f'a post on a source you annotated did not say so: {ms}')
    if ids.index('wide') > ids.index('busy'): errs.append('nine replies from one person outranked three different people joining in')
    if ids.index('opened') < ids.index('wide'): errs.append('something you had opened was not moved down')
    jw = next((r['why'] for r in out if r['id'] == 'joined'), '')
    if 'replied to or reacted to Bo Chen' not in jw: errs.append(f'a post by someone you have joined in with says {jw!r}')
    if ids.index('joined') < ids.index('wide'): errs.append('a post you already joined in on was not moved down')

    # The notes say what the tab is, signed in and signed out, and the empty state says where yours went.
    notes = await pg.evaluate("""() => { const soc = { followed: new Set() };
      // One annotation by someone else, so For you has something to explain. Empty, it gives one line only.
      const one = [{ id: 'o1', created: Date.now(), cloud: true, author: { id: 'other', name: 'Other' }, voices: [],
        item: { kind: 'post', text: 't', url: 'https://x.com/o/status/1' }, take: { text: 'a take' }, comments: [], reactions: [] }];
      const a = Cloud.homeTabs(one, soc, { id: 'me' }), b = Cloud.homeTabs(one, soc, null), z = Cloud.homeTabs([], soc, { id: 'me' });
      return { signedIn: a.foryou.note, signedOut: b.foryou.note, empty: z.foryou.empty, emptyNote: z.foryou.note, everyone: z.everyone.note }; }""")
    print('notes:', notes)
    if 'Each one says why' not in notes['signedIn']: errs.append(f"the signed-in note reads {notes['signedIn']!r}")
    if 'Sign in' not in notes['signedOut']: errs.append(f"the signed-out note reads {notes['signedOut']!r}")
    if notes['emptyNote']: errs.append(f"an empty For you explains itself twice: {notes['emptyNote']!r}")
    if 'under You' not in notes['empty']: errs.append(f"the empty line reads {notes['empty']!r}")
    if notes['everyone']: errs.append(f"Everyone with nothing in it still says {notes['everyone']!r}")

    # The reason shows on the card.
    shown = await pg.evaluate("""() => { const box = document.createElement('div'); document.body.appendChild(box);
      AnnotationPage.renderFeed(box, { records: [{ id: 'z', cloud: true, created: Date.now(), author: { id: 'sam', name: 'Sawyer Merritt', handle: 'sam', avatar: '' },
        item: { kind: 'post', text: 't', author: 'X', handle: '@x', url: 'https://x.com/x/status/9' }, take: { text: 'a take' }, comments: [], reactions: [], why: 'You follow Sawyer Merritt' }],
        mode: 'home', social: { followed: new Set(), people: [], trending: { sources: [], tags: [] }, tabs: { current: 'foryou', note: '', onTab() {} } }, onOpen() {} });
      const t = (box.querySelector('.card .cwhy') || {}).textContent || ''; box.remove(); return t; }""")
    print('the card shows:', repr(shown))
    if shown != 'You follow Sawyer Merritt': errs.append(f'the card did not show why: {shown!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
