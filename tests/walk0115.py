# The recording of 2026-09-25 at 01:15.
#   1. Under the panel's Home and Your profile lists, and under Your annotations beside an annotation, a full-width
#      button opens the full page, named for what it opens ("See all annotations" was hard to find).
#   3. Help closes when Home is pressed, and when the tab changes, once it has been seen.
#   4. The clip follows the player until the range is touched: once, when the player has moved. A live stream's
#      clip ends where you are, and its bar says "Stream so far". Touching the range stops the following.
#   5. Letting go of a handle does not rescale the trimmer at once, only after a second and a half.
#   6. The YouTube heading beside YouTube's home page has its icon.
#   7. With the planes on, "Publishing…" stands where the take was until the card arrives.
import asyncio
from playwright.async_api import async_playwright
from _env import *

UNIT = """async () => {
  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 1.
  const rec = (id) => ({ id, created: Date.now(), take: { text: 'A take ' + id }, item: { kind: 'article', meta: { title: 'A page' } } });
  const d1 = document.createElement('div'); document.body.appendChild(d1);
  AnnotationPage.renderBrowse(d1, { title: 'Home', records: [rec('a')], onOpen() {}, onFull() { out.homeFull = true; } });
  out.home = (d1.querySelector('.browseFullBtn') || {}).textContent;
  d1.querySelector('.browseFullBtn').click();
  AnnotationPage.renderBrowse(d1, { title: 'Your profile', records: [rec('b')], onOpen() {}, onFull() {} });
  out.profile = (d1.querySelector('.browseFullBtn') || {}).textContent;
  AnnotationPage.renderSide(d1, { current: null, records: [rec('c')], permalinkOf: () => '', onOpen() {}, onFeed() { out.sideFull = true; }, onDelete() {} });
  out.side = (d1.querySelector('.sideFeedBtn') || {}).textContent;
  d1.querySelector('.sideFeedBtn').click();
  d1.remove();
  // 4.
  const d = document.createElement('div'); document.body.appendChild(d);
  const api = VideoPanel.create(d, { seek() {}, preview() {}, capture: async () => ({ ok: true }), abort() {} }, { log() {} });
  const range = () => [d.querySelector('.rStart').value, d.querySelector('.rEnd').value];
  const v = { ok: true, videoId: 'live1', title: 'A stream', channel: 'Someone', duration: 6547, currentTime: 0, paused: false, width: 1280, height: 720, live: true };
  api.update(v); await wait(50);
  out.liveAtLoad = range();
  api.update({ ...v, currentTime: 6540 }); await wait(50);
  out.liveFollowed = range();
  out.liveLabel = d.querySelector('.ovLabel').textContent;
  const n = { ...v, videoId: 'vod1', live: false, duration: 600, currentTime: 0 };
  api.update(n); await wait(50);
  api.update({ ...n, currentTime: 100 }); await wait(50);
  out.vodFollowed = range();
  api.update({ ...n, currentTime: 200 }); await wait(50);
  out.vodOnce = range();
  out.vodLabel = d.querySelector('.ovLabel').textContent;
  const t = { ...n, videoId: 'vod2' };
  api.update(t); await wait(50);
  d.querySelector('.track').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  api.update({ ...t, currentTime: 300 }); await wait(50);
  out.touched = range();
  // 5.
  const scale = () => [d.querySelector('.vStart').textContent, d.querySelector('.vEnd').textContent];
  const h = d.querySelector('.hEnd'), r = h.getBoundingClientRect();
  const opts = (x) => ({ bubbles: true, clientX: x, clientY: r.top + 5, pointerId: 1 });
  h.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 2)));
  h.dispatchEvent(new PointerEvent('pointermove', opts(r.left - 60)));
  h.dispatchEvent(new PointerEvent('pointerup', opts(r.left - 60)));
  await wait(50); out.scaleAtRelease = scale();
  await wait(700); out.scaleSoon = scale();
  await wait(1400); out.scaleLater = scale();
  d.remove();
  // 6.
  const a = document.createElement('div'); document.body.appendChild(a);
  ArticlePanel.create(a, { info: async () => ({}), capture: async () => ({}), clear() {}, clearCaptured() {}, onSelection() {}, setExact() {}, widen: async () => null }, { ytHost: true, log() {} });
  out.ytIcon = !!a.querySelector('.phead .pkind svg');
  a.remove();
  return out;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('prof0115'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    blank = await ctx.new_page()
    bid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.filter(x=>x.url==='about:blank').map(x=>x.id)))")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.add_init_script("try { localStorage.setItem('annotated-welcome-seen', '1'); } catch (e) {}")
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={bid}'); await asyncio.sleep(2)
    u = await pan.evaluate(UNIT)
    print('1.', {k: u[k] for k in ('home', 'profile', 'side', 'homeFull', 'sideFull')})
    if (u['home'] or '').strip() != 'Open Home as a full page' or (u['profile'] or '').strip() != 'Open your profile as a full page' or (u['side'] or '').strip() != 'Open your profile as a full page' or not u.get('homeFull') or not u.get('sideFull'):
      errs.append(f'the full-page buttons are missing or wrong: {u}')
    print('4. live at load', u['liveAtLoad'], 'then', u['liveFollowed'], u['liveLabel'], '| video', u['vodFollowed'], u['vodOnce'], u['vodLabel'], '| touched', u['touched'])
    if u['liveFollowed'] != ['1:48:30.0', '1:49:00.0']: errs.append(f"a live stream's clip did not move to where it is watched: {u['liveFollowed']}")
    if u['liveLabel'] != 'Stream so far' or u['vodLabel'] != 'Whole video': errs.append(f"the bar is named {u['liveLabel']!r} and {u['vodLabel']!r}")
    if u['vodFollowed'] != ['1:40.0', '2:10.0'] or u['vodOnce'] != u['vodFollowed']: errs.append(f"the clip did not follow the player once: {u['vodFollowed']} then {u['vodOnce']}")
    if u['touched'][0] == '5:00.0': errs.append('the clip followed the player after the range was touched')
    print('5. scale at release', u['scaleAtRelease'], 'soon', u['scaleSoon'], 'later', u['scaleLater'])
    if u['scaleAtRelease'] != u['scaleSoon']: errs.append(f"the trimmer rescaled as soon as the handle was let go: {u['scaleAtRelease']} -> {u['scaleSoon']}")
    print('6. the YouTube heading has its icon:', u['ytIcon'])
    if not u['ytIcon']: errs.append('the YouTube heading has no icon')
    # 3.
    await pan.click('.helpBtn'); await asyncio.sleep(.4)
    before = await pan.evaluate("document.body.classList.contains('welcoming')")
    await pan.click('.homeBtn'); await asyncio.sleep(.8)
    after_home = await pan.evaluate("document.body.classList.contains('welcoming')")
    await pan.click('.helpBtn'); await asyncio.sleep(.4)
    other = await ctx.new_page(); await asyncio.sleep(.2)
    await sw.evaluate("chrome.tabs.query({}).then((t) => chrome.tabs.update(t.find((x) => x.url === 'about:blank').id, { active: true }))"); await asyncio.sleep(.8)
    after_tab = await pan.evaluate("document.body.classList.contains('welcoming')")
    print('3. help open', before, '| after Home', after_home, '| after another tab', after_tab)
    if not before or after_home or after_tab: errs.append(f'help did not close: {before}, {after_home}, {after_tab}')
    # Recording of 2026-09-25 at 03:14: one way to the full page, and Delete all only with something to delete.
    dup = await pan.evaluate("""() => { const d = document.createElement('div'); document.body.appendChild(d);
      AnnotationPage.renderBrowse(d, { title: 'Home', records: [], onOpen() {}, onFull() {} });
      const r = { small: d.querySelectorAll('.browseFull, .sideFeed').length, button: !!d.querySelector('.browseFullBtn') }; d.remove(); return r; }""")
    print('   links to the full page:', dup)
    if dup != {'small': 0, 'button': True}: errs.append(f'the full page is offered twice, or not at all: {dup}')
    # Recording of 2026-09-25 at 04:27: our site's long title reads as the home page in the way back.
    name = await pan.evaluate("cleanTitle('annotated: say what you think about anything on the web')")
    print('   the way back to our site is called:', repr(name))
    if name != "annotated's home page": errs.append(f'our site is called {name!r} in the way back')
    # 7.
    note = await pan.evaluate("""async () => {
      localStorage.setItem('annotated-planes', 'on');
      const src = document.createElement('div'); src.style.cssText = 'width:300px;height:120px;'; document.body.appendChild(src);
      PanelKit.sendOff(src, { take: 'A take', quote: 'Words', source: 'A page' });
      await new Promise((r) => setTimeout(r, 200));
      const during = (document.querySelector('.flyNote') || {}).textContent || null;
      const box = document.createElement('div'); document.body.appendChild(box);
      PanelKit.published(box, { permalink: 'https://x.test/a', onView() {}, onNew() {} });
      const still = !!document.querySelector('.flyNote');
      await new Promise((r) => setTimeout(r, 3500));
      return { during, still, after: !!document.querySelector('.flyNote') };
    }""")
    print('7. Publishing line:', note)
    if note['during'] != 'Publishing…' or note['after']: errs.append(f'the Publishing line is wrong: {note}')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
