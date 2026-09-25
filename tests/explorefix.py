# What a walk through the whole extension on 2026-09-22 turned up, from a fresh install through every panel
# and page. Each part here is one thing that was wrong, checked the way someone using it would meet it.
import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"

UNITS = r"""async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  // A whole post captured with nothing quoted. "You're annotating" used to stand over nothing at all.
  for (const quote of ['', 'about the market']) {
    const d = document.createElement('div'); document.body.appendChild(d);
    const post = { ok: true, text: 'A post about the market today.', author: 'Mike', handle: '@mike', posted: '2026-09-16T09:00:00Z',
                   url: 'https://x.com/mike/status/1', id: '1', quote: '', vw: 900 };
    const api = PostPanel.create(d, { info: async () => post, capture: async () => ({ ...post, quote }), clearCaptured() {} },
      { log() {}, onPublish: async () => ({}), onView() {}, findDuplicate: () => null });
    await api.refresh(); await wait(200);
    d.querySelector('.pGrab').click(); await wait(500);
    out[quote ? 'quoted' : 'whole'] = { shown: !d.querySelector('.pWhole').hidden, text: d.querySelector('.pWhole').textContent };
    d.remove();
  }
  // Setting the end before the start moves the start, and now says so.
  { const d = document.createElement('div'); document.body.appendChild(d);
    const api = VideoPanel.create(d, { seek() {}, preview() {}, capture: async () => ({ ok: true }), abort() {} }, { log() {} });
    const base = { ok: true, videoId: 'v1', title: 'A talk', channel: 'C', duration: 150, paused: true, width: 1280, height: 720 };
    api.update({ ...base, currentTime: 30 }); await wait(80); d.querySelector('.setStart').click();
    api.update({ ...base, currentTime: 34 }); await wait(80); d.querySelector('.setEnd').click();
    const quiet = { moved: !d.querySelector('.rMoved').hidden, time: d.querySelector('.capTime').textContent };
    api.update({ ...base, currentTime: 10 }); await wait(80); d.querySelector('.setEnd').click();
    out.video = { quiet, moved: !d.querySelector('.rMoved').hidden, said: d.querySelector('.rMoved').textContent,
                  start: d.querySelector('.rStart').value };
    d.remove(); }
  // Ctrl and Enter from anywhere in the take box, and the line under Publish when signed out.
  { const d = document.createElement('div'); document.body.appendChild(d);
    let sent = 0;
    Compose.create(d, { onPublish: () => { sent += 1; }, log() {} });
    const t = d.querySelector('.takeInput'); t.value = 'a take'; t.dispatchEvent(new Event('input', { bubbles: true }));
    const tag = d.querySelector('.tagbtn'); tag.focus();
    tag.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    document.body.classList.add('signedOut'); await wait(50);
    const outHint = d.querySelector('.publishHint').textContent;
    document.body.classList.remove('signedOut'); await wait(50);
    out.compose = { sentFromTag: sent, outHint, inHint: d.querySelector('.publishHint').textContent };
    d.remove(); }
  // The duplicate warning says saved or published, whichever it was.
  { const d = document.createElement('div'); document.body.appendChild(d);
    PanelKit.dupWarn(d, { what: 'clip', published: false, onView() {}, onAnyway() {} });
    const saved = d.textContent.replace(/\s+/g, ' ').trim();
    PanelKit.dupWarn(d, { what: 'clip', onView() {}, onAnyway() {} });
    out.dup = { saved, published: d.textContent.replace(/\s+/g, ' ').trim() }; d.remove(); }
  // Signed out, Following says to sign in, because following is not possible yet.
  { const t = Cloud.homeTabs([], { followed: new Set() }, null, []);
    const s = Cloud.homeTabs([], { followed: new Set() }, { id: 'me' }, []);
    out.following = { signedOut: t.following.note, signedIn: s.following.note }; }
  // Your card counts your annotations, not the ones the tab is showing.
  { const d = document.createElement('div'); document.body.appendChild(d);
    const mine = [1, 2, 3].map((i) => ({ id: 'm' + i, created: i, item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/' + i },
                                        take: { text: 'take ' + i, tag: 'Receipts' }, comments: [], reactions: [] }));
    AnnotationPage.renderFeed(d, { records: [], yours: mine, mode: 'home', onOpen() {},
      social: { followed: new Set(), people: [], trending: { sources: [], tags: [] }, tabs: { current: 'following', note: '', empty: 'Sign in first.', onTab() {} } } });
    out.card = { stats: (d.querySelector('.rail .stats') || {}).textContent || '', tags: /Your tags/.test(d.textContent), empty: (d.querySelector('.emptyState') || {}).textContent || '' };
    d.remove(); }
  // A signed-out page says it is saved here once, with no handle nobody owns, and after publishing the
  // source is reached through Back rather than through a second control beside it.
  { const d = document.createElement('div'); document.body.appendChild(d);
    AnnotationPage.setMe(null);
    const item = { kind: 'post', text: 'A post', quote: 'post', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' };
    await AnnotationPage.render(d, { id: 'x', item, take: { text: 'take' }, created: Date.now(), mine: true, showBanner: true, localOnly: true,
      comments: [], reactions: [], records: [], siteNav: false, backIsSource: true, backLabel: 'Back to the post' }, { onBack() {} });
    out.page = { again: /again/.test(d.textContent), notices: d.querySelectorAll('.toastSub').length, handle: (d.querySelector('.uname') || {}).textContent || '',
                 back: !!d.querySelector('.back'), source: !!d.querySelector('.toSource'),
                 claim: (document.querySelector('#annotated-claim .note') || {}).textContent || '' };
    d.remove(); }
  // Rows missing their name are left out, rather than drawing "undefined".
  { const real = Backend.client;
    Backend.client = { rpc: (n) => Promise.resolve({ data: n === 'trending_sources' ? [{ title: null, sample_id: null, annotations: undefined }, { kind: 'post', title: 'Claude on X', sample_id: 'z', annotations: 1, activity: 1 }]
                                                      : n === 'trending_tags' ? [{ tag: undefined }] : [{ id: 'p', handle: null }] }),
                       from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) };
    const t = await Cloud.trending(); const people = await Cloud.people('me');
    out.rows = { sources: t.sources.map((s) => s.title), tags: t.tags.length, people: people.length };
    Backend.client = real; }
  // Help closes on Escape, as every other menu does.
  { PanelKit.welcome(document.body, { force: true }); await wait(100);
    const open = !!document.querySelector('.welcome');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    out.help = { open, afterEscape: !!document.querySelector('.welcome') }; }
  return out;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profEXF'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    u = await pg.evaluate(UNITS)
    for k, v in u.items(): print(k, v)
    if not u['whole']['shown'] or 'market today' not in u['whole']['text']: errs.append('a whole post captured showed nothing under You are annotating')
    if u['quoted']['shown']: errs.append('with words quoted, the whole post showed as well as the quote')
    if u['video']['quiet']['moved']: errs.append('a note about moving appeared when nothing moved')
    if 'about 4 seconds' not in u['video']['quiet']['time']: errs.append(f"the capture time read {u['video']['quiet']['time']!r}")
    if not u['video']['moved'] or 'before the start' not in u['video']['said']: errs.append(f"setting the end before the start said {u['video']['said']!r}")
    if u['compose']['sentFromTag'] != 1: errs.append('Ctrl and Enter did nothing with the focus on a tag')
    if 'stays on this computer' not in u['compose']['outHint']: errs.append(f"signed out, the line under Publish read {u['compose']['outHint']!r}")
    if 'link to share' not in u['compose']['inHint']: errs.append('signed in again, the line did not come back')
    if 'saved this clip on this computer' not in u['dup']['saved'] or 'Save another' not in u['dup']['saved']: errs.append(f"a saved duplicate read {u['dup']['saved']!r}")
    if 'already published' not in u['dup']['published']: errs.append('a published duplicate lost its wording')
    if 'Sign in' not in u['following']['signedOut']: errs.append(f"signed out, Following read {u['following']['signedOut']!r}")
    if 'Sign in' in u['following']['signedIn']: errs.append('signed in, Following still asked to sign in')
    if '3 annotations' not in u['card']['stats']: errs.append(f"your card on Following read {u['card']['stats']!r}")
    if not u['card']['tags']: errs.append('your tags disappeared on the Following tab')
    if 'Sign in first' not in u['card']['empty']: errs.append(f"the Following tab's empty line read {u['card']['empty']!r}")
    if u['page']['again'] or u['page']['notices']: errs.append('the signed-out page still repeated itself, or asked to publish again')
    if u['page']['handle'].strip(): errs.append(f"signed out, the author carried the handle {u['page']['handle']!r}")
    if not u['page']['back'] or u['page']['source']: errs.append('after publishing it offered two ways to the source, or none')
    if 'clip' in u['page']['claim']: errs.append(f"the claim form still speaks of a clip: {u['page']['claim']!r}")
    if u['rows'] != {'sources': ['Claude on X'], 'tags': 0, 'people': 0}: errs.append(f"incomplete rows came through: {u['rows']}")
    if not u['help']['open'] or u['help']['afterEscape']: errs.append('Escape did not close the help screen')

    # Display settings: two sections, matching groups, and a colour name that fits.
    await pg.click('.gearBtn'); await asyncio.sleep(.4)
    menu = await pg.evaluate("""() => ({ subs: [...document.querySelectorAll('.dmPop .dmSub')].map((h) => h.textContent),
      bare: [...document.querySelectorAll('.dmPop fieldset')].filter((f) => !f.classList.contains('dmGroup')).map((f) => f.querySelector('legend').textContent),
      first: document.querySelector('.tintBtn .tintName').textContent,
      clipped: [...document.querySelectorAll('.tintBtn .tintName')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent) })""")
    print('menu:', menu)
    if len(menu['subs']) != 2: errs.append(f"Display settings has {len(menu['subs'])} headings, wanted two")
    if menu['bare']: errs.append(f"these groups are still drawn as bare boxes: {menu['bare']}")
    if menu['first'] != 'Yellow': errs.append(f"the first colour is called {menu['first']!r}")
    if menu['clipped']: errs.append(f"these colour names are cut off: {menu['clipped']}")
    await pg.keyboard.press('Escape')

    # The floating panel keeps Home, your profile and signing in, and leaves out what its own bar carries.
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.storage.local.set({{floatKey{tid}: 'k1'}})")
    fl = await ctx.new_page(); await fl.set_viewport_size({'width': 380, 'height': 700})
    await fl.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}&embed=float&k=k1'); await asyncio.sleep(1.8)
    bar = await fl.evaluate("""() => { const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
      return { home: vis('.homeBtn'), you: vis('.youBtn'), account: vis('.acctBtn'), gear: vis('.brand .gearBtn'), help: vis('.brand .helpBtn') }; }""")
    print('floating top bar:', bar)
    if not (bar['home'] and bar['you'] and bar['account']): errs.append(f'the floating panel is missing Home, You or Sign in: {bar}')
    if bar['gear'] or bar['help']: errs.append('the floating panel shows the gear or help twice')

    # A narrow panel keeps Open inside it.
    await pg.set_viewport_size({'width': 300, 'height': 800}); await asyncio.sleep(.3)
    over = await pg.evaluate("(()=>{const b=document.querySelector('.pasteForm button');return b?Math.round(b.getBoundingClientRect().right-innerWidth):null})()")
    print('Open past the edge by:', over)
    if over is not None and over > 0: errs.append(f'the Open button runs {over} pixels past a narrow panel')

    # Publishing an article takes away the offer to grow the quote, which would capture a second time.
    # The panel page used above would be a second panel beside the article, and both would answer its Annotate.
    await pg.close(); await fl.close()
    news = await ctx.new_page(); await news.goto('https://harborline.example/2026/09/17/overnight-buses-trial')
    nid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={nid}',width:420,height:1000}})")
    ap = await ctx.wait_for_event('page'); await asyncio.sleep(2); await news.bring_to_front()
    await news.evaluate('''()=>{const p=document.querySelectorAll("p")[1].firstChild;const r=document.createRange();r.setStart(p,p.nodeValue.indexOf("paid")+2);r.setEnd(p,p.nodeValue.indexOf("Alvarez")+4);getSelection().removeAllRanges();getSelection().addRange(r)}''')
    await asyncio.sleep(.8)
    await press_annotate(news)
    await ap.wait_for_selector('.aCompose:not([hidden])', timeout=25000); await asyncio.sleep(1)
    offered = await ap.is_visible('#articleMode .aFragFix')
    await ap.fill('#articleMode .takeInput', 'A take.'); await publish_now(ap, '#articleMode .publish'); await asyncio.sleep(1.5)
    still = await ap.is_visible('#articleMode .aFragFix')
    print('widen offered before publishing:', offered, '| after:', still)
    if not offered: errs.append('the offer to grow the quote never appeared, so this proves nothing')
    if still: errs.append('the offer to grow the quote stayed under a finished annotation')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
