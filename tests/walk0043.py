# The recording of 2026-09-23 at 00:43.
#   1. Signed out, someone else's annotation said Published, because "is this yours" came out empty.
#   2. The mark that says a page was reached from Publish is set only when a page really loads, and never
#      from the duplicate warning's View it.
#   3. Deleting an annotation clears the held trending and people lists at once, in every window.
#   4. A quote opening on a name was taken for one opening a sentence. The page's own sentences decide now.
#   5. An annotation's page leaves itself out of Trending.
#   6. Delete all with nothing to delete says so.
#   7. Beside a page, an empty list of yours says so rather than showing a bare heading.
#   8. A missing annotation is shown inside the usual page frame.
#   9. A row in Most talked about has a tooltip only when its title is cut short.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
UID = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000, 'expires_at': int(time.time()) + 360000,
           'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {},
                    'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = [{'id': UID, 'handle': 'testhandle', 'display_name': 'Robo Taxi', 'avatar_url': ''}]
STORY = ('<!doctype html><html><head><meta charset="utf-8"><title>Filing | Bee</title></head><body style="font:18px Georgia;max-width:700px;margin:40px auto">'
         '<p id="p">Gwynne Shotwell just filed a Form 144 for the intent to sell about $52m of stock. Form 144 is a heads-up to the SEC.</p></body></html>')
TALK = [{'kind': 'post', 'title': 'Short', 'url': 'https://x.com/a/status/1', 'video_id': None, 'annotations': 1, 'people': 1, 'replies': 0, 'reactions': 0, 'score': 2},
        {'kind': 'post', 'title': 'A very long title that will not fit on one line of the narrow panel however wide it is drawn', 'url': 'https://x.com/a/status/2',
         'video_id': None, 'annotations': 1, 'people': 1, 'replies': 0, 'reactions': 0, 'score': 1}]

async def main():
  errs = []
  signed = {'in': False}
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0043'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://bee.example/**', lambda r: r.fulfill(status=200, body=STORY, headers={'Content-Type': 'text/html; charset=utf-8'}))
    async def db(route):
      u = route.request.url
      if '/rpc/talked_about' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(TALK))
      if '/auth/v1/' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user']))
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE))
      await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '*/0'}, body='[]')
    await ctx.route(SUPA + '/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)

    # 1. Signed out, on someone else's annotation.
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1)
    await pg.evaluate("""Store.put('theirs-1', { item: { kind: 'post', text: 'p', author: 'Tesla', handle: '@t', url: 'https://x.com/t/status/2' }, take: { text: 'test 2' },
      created: Date.now() - 7e6, cloud: true, author: { id: 'robo', name: 'Robo Taxi', handle: 'testhandle', avatar: '' } })""")
    await pg.goto(f'chrome-extension://{extid}/annotation.html#theirs-1'); await asyncio.sleep(2.5)
    banner = await pg.evaluate("!!document.querySelector('.banner.toast')")
    print('1. signed out, on someone else\'s annotation, it says Published:', banner)
    if banner: errs.append("signed out, someone else's annotation said Published")

    # 8. A missing annotation keeps the page frame.
    await pg.goto(f'chrome-extension://{extid}/annotation.html#never-was'); await asyncio.sleep(2)
    miss = await pg.evaluate("({ frame: !!document.querySelector('.sitebar'), title: (document.querySelector('.esTitle') || {}).textContent || '', btn: !!document.querySelector('.missHome') })")
    print('8. a missing annotation:', miss)
    if not miss['frame'] or miss['title'] != 'This annotation was not found' or not miss['btn']: errs.append(f'the missing page: {miss}')

    # 5. The page leaves itself out of Trending.
    rail = await pg.evaluate("""async () => { const box = document.createElement('div'); document.body.appendChild(box);
      await AnnotationPage.render(box, { id: 'me-1', item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' }, take: { text: 'a take' },
        permalink: 'https://x/y', comments: [], reactions: [], siteNav: false, showBanner: false,
        social: { followed: new Set(), people: [], trending: { tags: [], sources: [
          { kind: 'post', title: 'A on X', sample_id: 'me-1', source_key: 'https://x.com/a/status/9', annotations: 1, activity: 1 },
          { kind: 'post', title: 'B on X', sample_id: 'other-1', source_key: 'https://x.com/b/status/1', annotations: 1, activity: 1 }] } } }, {});
      const t = [...box.querySelectorAll('.trend .rlTake')].map((e) => e.textContent); box.remove(); return t; }""")
    print('5. trending on its own page lists:', rail)
    if rail != ['B on X']: errs.append(f'the page listed itself under Trending: {rail}')

    # 4. The page's own sentences decide the note.
    notes = await pg.evaluate("""() => [
      PanelKit.fragmentFrom('Shotwell just filed a Form 144.', 'Gwynne Shotwell just filed a Form 144.'),
      PanelKit.fragmentFrom('Gwynne Shotwell just filed', 'Gwynne Shotwell just filed a Form 144.'),
      PanelKit.fragmentFrom('Shotwell just filed', 'Gwynne Shotwell just filed a Form 144.'),
      PanelKit.fragmentFrom('Ferry fares rise 40 percent', 'Ferry fares rise 40 percent')]""")
    print('4. notes:', notes)
    if notes != ['This quote starts in the middle of a sentence.', 'This quote ends in the middle of a sentence.',
                 'This quote starts and ends in the middle of a sentence.', '']: errs.append(f'the notes read {notes}')

    # 4, for real: a quote that opens on a name, captured from a page.
    news = await ctx.new_page(); await news.goto('https://bee.example/filing'); await asyncio.sleep(.8)
    nid = await sw.evaluate("chrome.tabs.query({url:'https://bee.example/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={nid}',width:420,height:1000}})")
    pan = await ctx.wait_for_event('page'); await asyncio.sleep(2.5)
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    SEL = '''() => { const t = document.getElementById('p').firstChild; const i = t.nodeValue.indexOf('Shotwell'); const j = t.nodeValue.indexOf('$52m') + 4;
      const r = document.createRange(); r.setStart(t, i); r.setEnd(t, j); getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); }'''
    await news.bring_to_front()
    for _ in range(6):
      await news.evaluate(SEL); await asyncio.sleep(.8)
      if await news.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"): break
    await press_annotate(news)
    await pan.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=25000); await asyncio.sleep(1.5)
    frag = await pan.inner_text('#articleMode .aFrag')
    print('4. a quote opening on "Shotwell" gets:', repr(frag))
    if 'starts and ends' not in frag: errs.append(f'a quote opening on a name got {frag!r}')

    # 2. The mark is set only when a page loads, and never from View it.
    await pan.evaluate("chrome.storage.session.remove('annFrom')")
    await pan.evaluate("viewPublished({ id: 'theirs-1' }, { justPublished: false })"); await asyncio.sleep(1.2)
    a = await sw.evaluate("chrome.storage.session.get('annFrom').then(o => o.annFrom || '')")
    await pan.evaluate("chrome.storage.session.remove('annFrom')")
    # A tab already showing the page is only brought forward, and nothing loads.
    await pan.evaluate("viewPublished({ id: 'theirs-1' })"); await asyncio.sleep(1.2)
    b = await sw.evaluate("chrome.storage.session.get('annFrom').then(o => o.annFrom || '')")
    print('2. mark after View it:', repr(a), '| after View page on a page already open:', repr(b))
    if a: errs.append('the duplicate warning left the Publish mark')
    if b: errs.append('a page only brought forward left the Publish mark for a later load')

    # 3. Deleting clears the held lists everywhere.
    before = await sw.evaluate("chrome.storage.local.get('annotatedFollows').then(o => o.annotatedFollows || 0)")
    await pan.evaluate("""async () => { const real = Backend.client; Backend.client = {
        from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'x', shot_path: null, media_path: null, poster_path: null, voice_path: null, upload: null }], error: null }) }) }) }),
        storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) } };
      try { await Cloud.remove('x', 'u1'); } finally { Backend.client = real; } }""")
    after = await sw.evaluate("chrome.storage.local.get('annotatedFollows').then(o => o.annotatedFollows || 0)")
    print('3. the held lists were told to refresh:', after > before)
    if not after > before: errs.append('deleting did not clear the held trending lists')

    # 7. Beside a page, an empty list of yours.
    side = await pan.evaluate("""() => { const box = document.createElement('div'); document.body.appendChild(box);
      const cur = { id: 'o', created: Date.now(), cloud: true, author: { id: 'robo', name: 'Robo Taxi' }, item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/2' }, take: { text: 'test 2' }, comments: [], reactions: [] };
      AnnotationPage.renderSide(box, { current: cur, records: [cur], youId: 'me', permalinkOf: () => 'https://x/y', onOpen() {}, onFeed() {}, onDelete() {}, localAware: true });
      const t = (box.querySelector('.sideNone') || {}).textContent || ''; box.remove(); return t; }""")
    print('7. an empty list of yours says:', repr(side))
    if 'no annotations yet' not in side: errs.append(f'an empty list of yours said {side!r}')

    # 9 and 6, in a panel beside a blank tab, signed in.
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
    blank = await ctx.new_page(); await blank.goto('about:blank')
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
    bp = await ctx.new_page(); await bp.set_viewport_size({'width': 400, 'height': 900}); bp.on('pageerror', lambda e: errs.append('PANEL2 ' + str(e)))
    await bp.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(3)
    tips = await bp.evaluate("[...document.querySelectorAll('.talkRow')].map((b) => b.getAttribute('title'))")
    print('9. tooltips:', tips)
    if len(tips) != 2 or tips[0] is not None or not tips[1]: errs.append(f'the tooltips were {tips}')
    await bp.evaluate("Store.allMeta().then((r) => Promise.all(r.map((x) => Store.del(x.id))))"); await asyncio.sleep(.5)
    # Since the recording of 2026-09-25 at 03:14, Delete all is not offered with nothing to delete.
    await bp.click('.acctBtn'); await asyncio.sleep(.8)
    offered = await bp.evaluate("(() => { const b = document.querySelector('.acctDelAll'); return !!b && !b.hidden; })()")
    print('6. Delete all offered with nothing to delete:', offered)
    if offered: errs.append('Delete all was offered with nothing to delete')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
