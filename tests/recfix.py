# What the recording of 2026-09-22 showed. The panel sat on Home for a whole minute while the tab moved on,
# two clips in a row came out one second long, a three word quote went out mid sentence, and the chooser for
# how a post is shown stayed live above the Published card where it could no longer reach anything.
import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"

# A clip cannot be dragged or typed down to a second any more, and the panel says where the floor is.
FLOOR = r"""async () => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const api = VideoPanel.create(d, { seek() {}, preview() {}, capture: async () => ({ ok: true }), abort() {} }, { log() {} });
  api.update({ ok: true, videoId: 'v1', title: 'A talk', channel: 'Salesforce', duration: 2428,
               currentTime: 1378, paused: true, width: 1280, height: 720 });
  await new Promise((r) => setTimeout(r, 80));
  const read = () => ({ start: d.querySelector('.rStart').value, end: d.querySelector('.rEnd').value,
                        len: d.querySelector('.rLen').textContent, floorShown: !d.querySelector('.rFloor').hidden,
                        atFloor: d.querySelector('.rLen').classList.contains('floor') });
  const opened = read();
  // Push the start towards the end the way the drag in the recording did, a second at a time, until it
  // will not go any further. The keyboard and the drag clamp at the same place.
  const push = (n) => { const h = d.querySelector('.hStart');
    for (let i = 0; i < n; i++) h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })); };
  push(60);
  await new Promise((r) => setTimeout(r, 80));
  const asked = read();
  // And back to something worth watching.
  const pull = (n) => { const h = d.querySelector('.hStart');
    for (let i = 0; i < n; i++) h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })); };
  pull(12);
  await new Promise((r) => setTimeout(r, 80));
  const back = read();
  d.remove();
  return { opened, asked, back };
}"""

# Publishing a post leaves a card that reads as finished, not a chooser that can no longer change anything.
# The button beside a mid sentence quote also says which it gives you, and using it does not set off the
# warning about selecting different words, because the panel is the one that changed them.
POST = r"""async (whole) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const post = { ok: true, text: 'A post about the market', author: 'Mike Investing', handle: '@MrMikeInvesting',
                 posted: '2026-09-16T09:00:00Z', url: 'https://x.com/MrMikeInvesting/status/1', id: '1', quote: '', vw: 900 };
  let quote = 'about the';
  const api = PostPanel.create(d, {
    info: async () => post,
    capture: async () => ({ ...post, quote }),
    widen: async (peek) => { const text = whole ? post.text : 'A post about the market today.';
      if (!peek) { quote = text; api.onSelection({ state: 'ok', text }); }
      return { ok: true, text }; },
    clearCaptured() {},
  }, { log() {}, onPublish: async () => ({ permalink: 'https://annotated-app.netlify.app/@you/x-1' }), onView() {}, findDuplicate: () => null });
  await api.refresh();
  await new Promise((r) => setTimeout(r, 200));
  d.querySelector('.pGrab').click();
  await new Promise((r) => setTimeout(r, 500));
  const before = { chooser: !d.querySelector('.showAs').hidden, said: (d.querySelector('.showAsWas') || {}).textContent || '',
                   fixLabel: d.querySelector('.pFragFix').textContent,
                   fixShown: !d.querySelector('.pFragFix').hidden,
                   onOwnLine: !!d.querySelector('.quoteActs .pFragFix'),
                   frag: d.querySelector('.pFrag').className };
  // Using it must not set off the warning that tells you to capture the post again.
  d.querySelector('.pFragFix').click();
  await new Promise((r) => setTimeout(r, 700));
  const widened = { quote: d.querySelector('.pQuote').textContent.trim(),
                    label: d.querySelector('.resLabel').textContent,
                    stillOffered: !d.querySelector('.pFragFix').hidden };
  d.querySelector('.takeInput').value = 'a take';
  d.querySelector('.takeInput').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  d.querySelector('.publish').click();
  await new Promise((r) => setTimeout(r, 600));
  const after = { chooser: !d.querySelector('.showAs').hidden, said: (d.querySelector('.showAsWas') || {}).textContent || '',
                  published: !d.querySelector('.pPublished').hidden };
  d.remove();
  return { before, widened, after };
}"""

# On X the panel says what works there. The timeline is not a story and it is not one post.
XCOPY = r"""() => {
  const out = {};
  for (const onX of [false, true]) {
    const d = document.createElement('div'); document.body.appendChild(d);
    ArticlePanel.create(d, { onSelection() {}, info: async () => null, setExact() {}, clear() {}, clearCaptured() {}, capture: async () => ({}) },
      { log() {}, xHost: onX });
    out[onX ? 'onX' : 'plain'] = { title: d.querySelector('.esTitle').textContent,
                                   body: d.querySelector('.selHint p:not(.esTitle)').textContent };
    d.remove();
  }
  return out;
}"""

PICK_FRAGMENT = """() => { const p = document.querySelectorAll('article p, p')[1], n = p.firstChild;
  const r = document.createRange(); r.setStart(n, 6); r.setEnd(n, 34);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); }"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profRECFIX'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    news = await ctx.new_page(); await news.set_viewport_size({'width': 1000, 'height': 800})
    await news.goto('https://harborline.example/a'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.8)

    # The clip floor.
    f = await pan.evaluate(FLOOR)
    print('a clip opens at:', f['opened']['len'], '| asked for one second, got:', f['asked']['len'],
          '| floor line shown:', f['asked']['floorShown'])
    print('and back to a longer one:', f['back']['len'], '| floor line shown:', f['back']['floorShown'])
    if f['opened']['floorShown']: errs.append('the floor line showed on a thirty second clip')
    if f['asked']['len'] != '3.0s': errs.append(f"the start could be pushed to {f['asked']['len']}, so a clip can still be shorter than three seconds")
    if not f['asked']['floorShown'] or not f['asked']['atFloor']: errs.append('nothing said the clip was as short as it goes')
    if f['back']['floorShown']: errs.append('the floor line stayed after the clip grew again')

    # The Published card.
    for whole, want in ((True, 'Use the whole post'), (False, 'Use the whole sentence')):
        w = await pan.evaluate(POST, whole)
        print('growing to', 'the whole post' if whole else 'a sentence', 'is offered as:', repr(w['before']['fixLabel']),
              '| on its own line:', w['before']['onOwnLine'])
        print('  after using it, the quote is:', repr(w['widened']['quote'][:50]), '| the panel says:', repr(w['widened']['label']))
        if not w['before']['fixShown']: errs.append('a mid sentence quote was not offered a way to grow')
        if w['before']['fixLabel'] != want: errs.append(f"it promised {w['before']['fixLabel']!r} rather than {want!r}")
        if not w['before']['onOwnLine']: errs.append('the button runs on from the one beside it instead of taking its own line')
        if 'hint' in w['before']['frag']: errs.append('the line about a mid sentence quote is still the faintest thing on the screen')
        if 'different words' in w['widened']['label']:
            errs.append('using the button set off the warning telling you to capture again')
        if w['widened']['stillOffered']: errs.append('it still offers to grow a quote that is already whole')
    c = w
    print('before publishing, the chooser is live:', c['before']['chooser'])
    print('after publishing:', c['after'])
    if not c['before']['chooser']: errs.append('the chooser was not offered before publishing')
    if not c['after']['published']: errs.append('the post did not publish')
    if c['after']['chooser']: errs.append('the chooser is still live above the Published card')
    if not c['after']['said'].startswith('Shown as'): errs.append(f"nothing said how it was shown: {c['after']['said']!r}")

    x = await pan.evaluate(XCOPY)
    print('on an ordinary page:', repr(x['plain']['title']), '|', repr(x['plain']['body'][:60]))
    print('on X:', repr(x['onX']['title']), '|', repr(x['onX']['body'][:60]))
    if 'story' in x['onX']['body']: errs.append('the X timeline is still described as a story')
    if 'post' not in x['onX']['body'].lower(): errs.append('the X timeline does not say that selecting words in a post annotates that post')
    # Any words may be annotated since 2026-09-22, so an ordinary page asks for anything on the page.
    if 'on the page' not in x['plain']['body']: errs.append('an ordinary page stopped saying what to select on it')

    # A mid sentence quote can be grown to its sentence in one click.
    await news.bring_to_front(); await news.evaluate(PICK_FRAGMENT); await asyncio.sleep(.9)
    await pan.evaluate("() => document.querySelector('#articleMode .grab').click()")
    await pan.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=25000); await asyncio.sleep(.8)
    frag = await pan.evaluate("""() => ({ quote: document.querySelector('#articleMode .capQuote').textContent.trim(),
      note: document.querySelector('#articleMode .aFrag').textContent,
      offered: !document.querySelector('#articleMode .aFragFix').hidden })""")
    print('the quote as taken:', repr(frag['quote'][:60]))
    print('the note says:', repr(frag['note']), '| a way to fix it:', frag['offered'])
    if 'middle of a sentence' not in frag['note']: errs.append(f'the fragment was not noticed: {frag["note"]!r}')
    if not frag['offered']: errs.append('the note said what was wrong and offered nothing to do about it')
    await news.bring_to_front()
    await pan.evaluate("() => document.querySelector('#articleMode .aFragFix').click()")
    await asyncio.sleep(3.5)
    fixed = await pan.evaluate("""() => ({ quote: document.querySelector('#articleMode .capQuote').textContent.trim(),
      note: document.querySelector('#articleMode .aFrag').textContent,
      offered: !document.querySelector('#articleMode .aFragFix').hidden })""")
    print('after using the whole sentence:', repr(fixed['quote'][:80]))
    print('the note now says:', repr(fixed['note']))
    if len(fixed['quote']) <= len(frag['quote']): errs.append('the quote did not grow to its sentence')
    if fixed['note'] or fixed['offered']: errs.append(f'it still reads as a fragment: {fixed["note"]!r}')

    # Home gets out of the way when the page moves on, rather than waiting to be sent back.
    await pan.bring_to_front()
    await pan.evaluate("() => document.querySelector('.homeBtn').click()")
    await pan.wait_for_selector('#browseMode h2', timeout=15000); await asyncio.sleep(.6)
    print('the panel is on:', await pan.inner_text('#browseMode h2'))
    await news.goto('https://harborline.example/b'); await asyncio.sleep(2.2)
    moved = await pan.evaluate("() => ({ browse: !document.getElementById('browseMode').hidden, "
                               "article: !document.getElementById('articleMode').hidden })")
    print('after the page moved on:', moved)
    if moved['browse']: errs.append('the panel stayed on Home after the page went somewhere else')
    if not moved['article']: errs.append('the panel did not come back to the page')
    # And the same when the tab in front changes, which is the other half of the one test.
    await pan.evaluate("() => document.querySelector('.homeBtn').click()")
    await pan.wait_for_selector('#browseMode h2', timeout=15000); await asyncio.sleep(.6)
    await pan.evaluate("() => { browseFrom = { id: -1, url: 'somewhere else' }; }")
    await asyncio.sleep(1.2)
    swapped = await pan.evaluate("() => ({ browse: !document.getElementById('browseMode').hidden })")
    print('after the tab in front changed:', swapped)
    if swapped['browse']: errs.append('the panel stayed on Home after the tab in front changed')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
