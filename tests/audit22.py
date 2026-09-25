# The audit of 2026-09-22.
#   The floating panel's key is no longer in its frame's address, where any page could read it through the
#   open shadow root, and the panel still opens and works with the key handed over by message.
#   Unpublished captures kept for a reload are held to the five newest, so the session store never fills.
#   Deleting an annotation removes the files its row names, even when listing its folder finds nothing,
#   which is how screenshots of deleted annotations stayed up.
#   A claim the database refuses for coming too fast says so, rather than blaming the connection.
import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
REMOVE = """async () => {
  const removed = [];
  const real = Backend.client;
  Backend.client = {
    from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'gone-1', shot_path: 'u1/gone-1/shot.jpg', media_path: null,
      poster_path: null, voice_path: null, upload: { path: 'u1/gone-1/upload.png' } }], error: null }) }) }) }),
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async (paths) => { removed.push(...paths); return { data: [] }; } }) },
  };
  try { await Cloud.remove('gone-1', 'u1'); } finally { Backend.client = real; }
  return removed;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profAUDIT'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new', '--window-size=1280,900', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    # 1. The floating panel.
    await sw.evaluate("chrome.storage.local.set({annotatedPrefs:{display:'float',afterPublish:'stay',density:'comfortable',theme:'system',pageButton:true}})")
    await asyncio.sleep(.5)
    news = await ctx.new_page(); news.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await news.goto('https://harborline.example/x'); await asyncio.sleep(1)
    # A hostile page posts wrong keys at the frame as fast as it can, hoping one lands before the real one.
    await news.evaluate("""setInterval(() => { const h = document.getElementById('annotated-float-host'); const f = h && h.shadowRoot && h.shadowRoot.querySelector('iframe');
      if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'annotated-key', k: 'wrong' }, '*'); }, 5)""")
    await news.evaluate('''(()=>{const p=document.querySelectorAll("p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    await press_annotate(news)
    await asyncio.sleep(3.5)
    src = await news.evaluate("(() => { const h = document.getElementById('annotated-float-host'); const f = h && h.shadowRoot.querySelector('iframe'); return f ? f.src : ''; })()")
    print('what the page can read of the frame:', src.split('/')[-1])
    if not src: errs.append('the floating panel did not open')
    if 'k=' in src: errs.append('the key is still in the frame address, where the page can read it')
    fr = [f for f in news.frames if 'sidepanel.html' in f.url]
    if fr:
      try:
        await fr[0].wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=15000)
        print('the floating panel captured:', (await fr[0].inner_text('#articleMode .capQuote'))[:50])
      except Exception:
        body = (await fr[0].evaluate('document.body.innerText'))[:120]
        errs.append(f'the floating panel did not work with the key handed over: {body!r}')
    # A page that builds its own frame with a guess gets nothing to click.
    await news.evaluate(f"""(() => {{ const f = document.createElement('iframe'); f.id = 'fake'; f.src = 'chrome-extension://{extid}/sidepanel.html?tab=1&embed=float'; document.body.appendChild(f);
      setTimeout(() => f.contentWindow.postMessage({{ type: 'annotated-key', k: 'guess' }}, '*'), 600); }})()""")
    await asyncio.sleep(5)
    fake = [f for f in news.frames if 'sidepanel.html?tab=1&' in f.url]
    said = (await fake[0].evaluate('document.body.innerText')).strip() if fake else ''
    buttons = await fake[0].evaluate("document.querySelectorAll('button').length") if fake else -1
    print('a frame the page made itself says:', repr(said[:60]), '| buttons:', buttons)
    if 'own button' not in said or buttons: errs.append(f'a frame made by the page was not turned away: {said!r}, {buttons} buttons')
    await sw.evaluate("chrome.storage.local.set({annotatedPrefs:{display:'side',afterPublish:'stay',density:'comfortable',theme:'system',pageButton:true}})")
    await asyncio.sleep(1)

    # 2. The five newest captures, and no more.
    pan = await ctx.new_page(); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(2)
    kept = await pan.evaluate("""async () => {
      for (let i = 0; i < 8; i++) { await keepFor('a:https://site.example/' + i).save({ r: { text: 'quote ' + i, meta: {} }, shot: null }); await new Promise((r) => setTimeout(r, 5)); }
      const all = await chrome.storage.session.get(null);
      return Object.keys(all).filter((k) => k.startsWith('annotated-cap:')).sort(); }""")
    print('captures kept:', kept)
    if len(kept) != 5 or 'annotated-cap:a:https://site.example/7' not in kept or 'annotated-cap:a:https://site.example/0' in kept:
      errs.append(f'the kept captures were not the five newest: {kept}')

    # Podcast audio is only fetched from the public internet.
    addr = await pan.evaluate("""() => ['https://traffic.megaphone.fm/e.mp3', 'http://192.168.1.1/x.mp3', 'http://10.0.0.5/a.mp3', 'http://127.0.0.1:8080/a.mp3',
      'http://[::1]/a.mp3', 'http://printer.local/a.mp3', 'http://router/a.mp3', 'http://3232235777/a.mp3', 'file:///c:/a.mp3'].map((u) => [u, FeedPod.publicAddress(u)])""")
    print('podcast addresses:', addr)
    if not addr[0][1] or any(ok for _, ok in addr[1:]): errs.append(f'the podcast address check is wrong: {addr}')

    # A dropped panel gives back its recordings.
    freed = await pan.evaluate("""async () => {
      const el = document.createElement('div'); const v = document.createElement('video');
      const url = URL.createObjectURL(new Blob([new Uint8Array(1000)], { type: 'video/webm' })); v.src = url; el.appendChild(v); document.body.appendChild(el);
      panels.set(987654, { kind: 'video', el }); drop(987654);
      return fetch(url).then(() => false, () => true); }""")
    print('a dropped panel released its recording:', freed)
    if not freed: errs.append('a dropped panel kept its recording in memory')

    # A video id from someone else's annotation is encoded into the source link, not trusted.
    link = await pan.evaluate("AnnotationPage.srcUrlOf({ kind: 'video', videoId: 'abc&list=x#y', start: 'NaN' })")
    print('a strange video id makes:', link)
    if link != 'https://www.youtube.com/watch?v=abc%26list%3Dx%23y&t=0s': errs.append(f'the video link was built from the raw id: {link}')

    # A voice note being recorded stops when its panel goes away, and the microphone with it.
    mic = await pan.evaluate("""async () => {
      let got = null; const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => { got = await real(c); return got; };
      const el = document.createElement('div'); const root = document.createElement('div'); el.appendChild(root); document.body.appendChild(el);
      Compose.create(root, { log() {}, onPublish() {} });
      root.querySelector('.recBtn').click();
      for (let i = 0; i < 40 && !got; i++) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 400));
      const before = got ? got.getTracks().map((t) => t.readyState) : [];
      panels.set(987655, { kind: 'article', el }); drop(987655);
      await new Promise((r) => setTimeout(r, 300));
      return { before, after: got ? got.getTracks().map((t) => t.readyState) : [] }; }""")
    print('the microphone while recording and after the panel went away:', mic)
    if not mic['before'] or mic['before'][0] != 'live': errs.append(f'the test could not start a recording: {mic}')
    elif any(t != 'ended' for t in mic['after']): errs.append(f'the microphone stayed on after its panel went away: {mic}')

    # 3. Files go by the paths the row names, even when the folder lists as empty.
    removed = await pan.evaluate(REMOVE)
    print('files removed:', removed)
    if 'u1/gone-1/shot.jpg' not in removed or 'u1/gone-1/upload.png' not in removed: errs.append(f'the files the row names were not removed: {removed}')

    # 4. A claim refused for coming too fast says why.
    said = await pan.evaluate("""async () => {
      let msg = ''; const realAlert = window.alert; window.alert = (m) => { msg = m; };
      const box = document.createElement('div'); document.body.appendChild(box);
      await AnnotationPage.render(box, { id: 'c1', item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' }, take: { text: 'a take' },
        permalink: 'https://x/y', comments: [], reactions: [], siteNav: false, showBanner: false },
        { onClaim: async () => { throw new Error('This annotation has had a lot of claims in the last hour. Try again later.'); } });
      box.querySelector('.claim').click(); await new Promise((r) => setTimeout(r, 200));
      const d = document.getElementById('annotated-claim') || document.querySelector('dialog.claimdlg') || document.querySelector('dialog');
      d.querySelector('#cName').value = 'N'; d.querySelector('#cEmail').value = 'n@example.test';
      const cb = d.querySelector('input[type=checkbox]'); if (cb) cb.checked = true;
      const r = d.querySelector('input[type=radio]'); if (r) r.checked = true;
      d.querySelector('form').requestSubmit(); await new Promise((r) => setTimeout(r, 400));
      window.alert = realAlert; box.remove(); return msg; }""")
    print('a refused claim says:', repr(said))
    if 'lot of claims' not in said: errs.append(f'a claim refused for coming too fast said {said!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
