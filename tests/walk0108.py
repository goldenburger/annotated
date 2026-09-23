# The recording of 2026-09-23 at 01:08.
#   1. A page that starts blank and fills in (YouTube's home page) said "No words on this page" for good.
#   2. The panel's card beside a shared annotation showed only "Poll" under a vote, a reaction and a comment.
#   3. YouTube away from a video was headed like an article. It says to open a video now.
#   4. Choosing a GIF put a photo away without a word, and the other way round.
#   5. The page rail named your own recent annotation again under Trending.
#   6. The emoji tip in the take box ran off the panel's left edge.
#   7. The picture button kept focus after its file picker, and its tip stayed on screen.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
LATE = ('<!doctype html><html><head><title>Loading</title></head><body><div id="app"></div>'
        '<script>setTimeout(() => { document.getElementById("app").innerHTML = "<p>Ferry fares rise forty percent, the first increase in a decade.</p>"; }, 2500)</script></body></html>')
YTHOME = '<!doctype html><html><head><title>YouTube</title></head><body><h3>A video title</h3><p>Another video title and some words.</p></body></html>'
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0108'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://late.example/**', lambda r: r.fulfill(status=200, body=LATE, headers={'Content-Type': 'text/html'}))
    await ctx.route('https://www.youtube.com/**', lambda r: r.fulfill(status=200, body=YTHOME, headers={'Content-Type': 'text/html'}))
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    async def beside(url, wait=2.5):
      pg = await ctx.new_page(); await pg.goto(url); await asyncio.sleep(.3)
      tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
      pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900})
      pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
      await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(wait)
      await pg.bring_to_front()
      return pg, pan

    # 1. Blank first, words a moment later.
    pg, pan = await beside('https://late.example/story', wait=1.2)
    first = await pan.evaluate("(document.querySelector('#articleMode .selHint .esTitle') || {}).textContent || ''")
    await asyncio.sleep(5)
    later = await pan.evaluate("(document.querySelector('#articleMode .selHint .esTitle') || {}).textContent || ''")
    print('1. while blank:', repr(first), '| once filled in:', repr(later))
    if later != 'Highlight any words': errs.append(f'a page that filled in still said {later!r}')

    # 3. YouTube away from a video.
    yt, ypan = await beside('https://www.youtube.com/')
    head = await ypan.evaluate("""() => ({ title: (document.querySelector('#articleMode .aTitle') || {}).textContent || '',
      es: (document.querySelector('#articleMode .selHint .esTitle') || {}).textContent || '' })""")
    print('3. YouTube home:', head)
    if head['es'] != 'Open a video to clip it' or head['title'] != 'YouTube': errs.append(f'YouTube home read {head}')

    # 2. The card reads live counts.
    card = await pan.evaluate("""async () => { const box = document.createElement('div'); document.body.appendChild(box);
      const cur = { id: 'x1', created: Date.now(), cloud: true, author: { id: 'me' }, item: { kind: 'video', title: 'T', videoId: 'abc', start: 1, end: 4 },
        take: { text: 'a take', poll: { question: 'q', options: ['Agree', 'Disagree'], counts: [1, 0] } },
        comments: [{}], reactions: [{ emoji: '👍', count: 1 }] };
      AnnotationPage.renderSide(box, { current: cur, records: [cur], youId: 'me', permalinkOf: () => 'https://x/y', onOpen() {}, onFeed() {}, onDelete() {}, localAware: true });
      const t = (box.querySelector('.sideNow .fStats') || {}).textContent || ''; box.remove(); return t; }""")
    print('2. the card shows:', repr(card))
    if '1 vote' not in card or '👍' not in card: errs.append(f'the card showed {card!r}')
    src = open('../extension/sidepanel.js', encoding='utf-8').read()
    if 'Cloud.social(current.id' not in src: errs.append('the panel does not ask for live counts')

    # 4, 6, 7 in a take box.
    t = await pan.evaluate("""async () => {
      const root = document.createElement('div'); root.id = 'tb'; document.body.appendChild(root);
      Compose.create(root, { log() {}, onPublish() {} });
      const emo = root.querySelector('.tfTools .emojiBtn');
      const tip = emo ? getComputedStyle(emo, '::after') : null;
      return { left: tip ? tip.left : '', right: tip ? tip.right : '', hasSwap: !!root.querySelector('.swapNote') }; }""")
    print('6. emoji tip anchors:', t)
    if t['left'] != '0px' or not t['hasSwap']: errs.append(f'take box: {t}')
    # 4. A GIF after a photo says so. The file goes in through the file input.
    await pan.evaluate("""() => { const root = document.querySelectorAll('body > div'); }""")
    root = pan.locator('body > div').last
    await pan.set_input_files('#tb .upFile', files=[{'name': 'p.png', 'mimeType': 'image/png', 'buffer': PNG}])
    await asyncio.sleep(1)
    photo = await pan.evaluate("!document.querySelector('#tb .upChosen').hidden")
    said = await pan.evaluate("""() => { const r = document.getElementById('tb');
      const g = r.querySelector('.gifPick'); if (!window.Giphy || !r._gifValue) return 'no gif';
      return 'ok'; }""")
    swap = await pan.evaluate("""async () => { const r = document.getElementById('tb');
      // The picker is stood in for: pressing a result calls the same code the picker does.
      const b = r.querySelector('.gifBtn'); if (b) b.hidden = false;
      const fake = { id: 'g1', url: 'https://media.giphy.com/media/g1/giphy.gif', preview: 'https://media.giphy.com/media/g1/200w.gif', w: 10, h: 10, alt: 'A GIF' };
      if (r.__pickGif) r.__pickGif(fake);
      return (r.querySelector('.swapNote') || {}).textContent || ''; }""")
    print('4. photo shown:', photo, '| after a GIF:', repr(swap))
    if photo and 'The GIF replaced your photo' not in swap: errs.append(f'the swap said {swap!r}')

    # 7. Pressing the picture button with the mouse leaves no focus on it.
    await pan.evaluate("HTMLInputElement.prototype.click = function () {}")
    btn = pan.locator('#tb .upBtn')
    await btn.click()
    focused = await pan.evaluate("document.activeElement && document.activeElement.classList.contains('upBtn')")
    print('7. the picture button keeps focus after a click:', focused)
    if focused: errs.append('the picture button kept focus, so its tip stays up')

    # 5. The rail leaves your recent annotation out of Trending.
    rail = await pan.evaluate("""async () => { const box = document.createElement('div'); document.body.appendChild(box);
      const mine = { id: 'mine-1', created: Date.now() - 6e5, item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/5' }, take: { text: 'test 1' }, comments: [], reactions: [] };
      await AnnotationPage.render(box, { id: 'x2', item: { kind: 'post', text: 't', author: 'B', handle: '@b', url: 'https://x.com/b/status/9' }, take: { text: 'a take' },
        permalink: 'https://x/y', comments: [], reactions: [], siteNav: false, showBanner: false, records: [mine],
        social: { followed: new Set(), people: [], trending: { tags: [], sources: [
          { kind: 'post', title: 'A on X', sample_id: 'mine-1', source_key: 'https://x.com/a/status/5', annotations: 1, activity: 1 },
          { kind: 'post', title: 'C on X', sample_id: 'c-1', source_key: 'https://x.com/c/status/1', annotations: 1, activity: 1 }] } } }, {});
      const t = [...box.querySelectorAll('.trend .rlTake')].map((e) => e.textContent); box.remove(); return t; }""")
    print('5. trending beside your recent annotation lists:', rail)
    if rail != ['C on X']: errs.append(f'trending repeated your recent annotation: {rail}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
