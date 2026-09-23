# The second and third walk-throughs of 2026-09-22. Bad typed times, the capture time said with the clip's
# own length, tip buttons that say what they do, an edit that may leave words out when something else stays,
# a vote taken back and saying so, a deleted annotation named as deleted, a description nudge, a comment's
# photo leaving with it, a half-written take surviving a reload, and Publish that never waits forever offline.
import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFUlEQVR4nGP8z8DAwMDAxMDAwMAAAB0FAgFLX0RjAAAAAElFTkSuQmCC'

UNITS = r"""async (png64) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const png = await (await fetch('data:image/png;base64,' + png64)).blob();
  const out = {};
  // Typed times that cannot be times leave the clip alone and say why.
  { const d = document.createElement('div'); document.body.appendChild(d);
    const api = VideoPanel.create(d, { seek() {}, preview() {}, capture: async () => ({ ok: true }), abort() {} }, { log() {} });
    api.update({ ok: true, videoId: 'v', title: 'T', channel: 'C', duration: 150, currentTime: 30, paused: true, width: 1280, height: 720 });
    await wait(80);
    const type = async (sel, v) => { const i = d.querySelector(sel); i.value = v; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); await wait(60);
      return { start: d.querySelector('.rStart').value, end: d.querySelector('.rEnd').value, said: d.querySelector('.rMoved').hidden ? '' : d.querySelector('.rMoved').textContent }; };
    const before = { start: d.querySelector('.rStart').value, end: d.querySelector('.rEnd').value };
    out.typed = { before, abc: await type('.rStart', 'abc'), neg: await type('.rStart', '-5'), past: await type('.rEnd', '3:30'),
                  realTime: d.querySelector('.realTime').textContent,
                  tipLabel: (d.querySelector('.tipBtn') || {}).getAttribute ? d.querySelector('.tipBtn').getAttribute('aria-label') : '' };
    d.querySelector('.tipBtn') && d.querySelector('.tipBtn').click(); await wait(30);
    out.typed.tipAfter = d.querySelector('.tipBtn') ? d.querySelector('.tipBtn').getAttribute('aria-label') : '';
    d.remove(); }
  // Editing words away is fine when a photo stays, and refused with a true sentence when nothing does.
  const page = async (take, hooks = {}) => { const box = document.createElement('div'); document.body.appendChild(box);
    await AnnotationPage.render(box, { id: 'x', item: { kind: 'post', text: 'p', quote: '', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' },
      take, created: Date.now(), mine: true, comments: [], reactions: [], records: [], siteNav: false }, { onEdit: async () => {}, ...hooks });
    return box; };
  for (const [name, take] of [['withPhoto', { text: 'words', upload: { blob: png, kind: 'image', alt: 'a' } }], ['alone', { text: 'words' }]]) {
    const box = await page(take);
    box.querySelector('.moreBtn').click(); box.querySelector('.editBtn').click(); await wait(30);
    box.querySelector('.editText').value = ''; box.querySelector('.editSave').click(); await wait(80);
    const err = box.querySelector('.editErr');
    out[name] = err && !err.hidden ? err.textContent : '';
    box.remove();
  }
  // A vote taken back says so.
  { const box = await page({ text: 't', poll: { question: 'Q', options: ['Yes', 'No'], vote: null } }, { onPollVote() {} });
    box.querySelector('.pollOpt').click(); await wait(30);
    const voted = box.querySelector('.pollNote').textContent;
    box.querySelector('.pollOpt').click(); await wait(30);
    out.poll = { voted, back: box.querySelector('.pollNote').textContent };
    box.remove(); }
  // The description nudge shows while the description is empty and goes once it is written.
  { const d = document.createElement('div'); document.body.appendChild(d);
    Compose.create(d, { onPublish() {}, log() {} });
    await d._takeFile(new File([png], 'r.png', { type: 'image/png' })); await wait(50);
    const hint = d.querySelector('.upHint'), shown = () => hint && getComputedStyle(hint).display !== 'none';
    const empty = shown();
    d.querySelector('.upAlt').value = 'A red square'; d.querySelector('.upAlt').dispatchEvent(new Event('input', { bubbles: true })); await wait(30);
    out.nudge = { empty, written: shown() };
    d.remove(); }
  // Deleting a comment takes its photo out of the bucket too.
  { const real = Backend.client, removed = [];
    Backend.client = { from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'c1', upload: { path: 'u1/comments/a-1.png' } }], error: null }) }) }) }),
                       storage: { from: () => ({ remove: async (paths) => { removed.push(...paths); return {}; } }) } };
    try { await Cloud.deleteComment('c1'); } catch (e) { out.delErr = e.message; }
    Backend.client = real;
    out.commentFile = removed; }
  // A deleted annotation is remembered as deleted.
  await Store.put('gone-1', { item: { kind: 'post', text: 'p', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' }, take: { text: 't' }, created: Date.now() });
  await Store.del('gone-1');
  out.remembered = Store.wasDeleted('gone-1') && !Store.wasDeleted('never-was');
  return out;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profB14'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    u = await pg.evaluate(UNITS, PNG)
    for k, v in u.items(): print(k, v)
    t = u['typed']
    for name in ('abc', 'neg'):
      if (t[name]['start'], t[name]['end']) != (t['before']['start'], t['before']['end']): errs.append(f'typing {name} changed the clip: {t[name]}')
    if 'not a time' not in t['abc']['said']: errs.append(f"typing abc said {t['abc']['said']!r}")
    if 'before the start' not in t['neg']['said']: errs.append(f"typing -5 said {t['neg']['said']!r}")
    if 'is 2:30 long' not in t['past']['said'] or t['past']['end'] != t['before']['end']: errs.append(f"typing past the end gave {t['past']}")
    if 'about 30 seconds' not in t['realTime']: errs.append(f"the real time line read {t['realTime']!r}")
    if t['tipLabel'] not in ('Hide the tip', 'Show the tip') or t['tipLabel'] == t['tipAfter']: errs.append(f"the tip button said {t['tipLabel']!r} then {t['tipAfter']!r}")
    if u['withPhoto']: errs.append(f"taking the words off a take with a photo was refused: {u['withPhoto']!r}")
    if 'nothing of yours' not in u['alone']: errs.append(f"taking every word off a plain take said {u['alone']!r}")
    if 'take it back' not in u['poll']['voted'] or 'taken back' not in u['poll']['back']: errs.append(f"the poll said {u['poll']}")
    if not u['nudge']['empty'] or u['nudge']['written']: errs.append(f"the description nudge was {u['nudge']}")
    if u.get('delErr') or u['commentFile'] != ['u1/comments/a-1.png']: errs.append(f"deleting a comment left its photo: {u['commentFile']} {u.get('delErr')}")
    if not u['remembered']: errs.append('a deleted annotation was not remembered as deleted')
    ann = await ctx.new_page(); await ann.goto(f'chrome-extension://{extid}/annotation.html#gone-1'); await asyncio.sleep(1.5)
    said = await ann.inner_text('.esTitle')
    print('opening the deleted one:', said)
    if said != 'This annotation was deleted': errs.append(f'the deleted annotation read {said!r}')
    await ann.close()

    # A half-written take survives the panel reloading, and offline Publish answers at once.
    # The panel page used for the checks above is closed first. Left open, it is a second panel beside the
    # page, both answer the Annotate click, and the one being watched sometimes never hears it.
    await pg.close()
    news = await ctx.new_page(); await news.goto('https://harborline.example/2026/09/17/overnight-buses-trial')
    nid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={nid}',width:420,height:1000}})")
    ap = await ctx.wait_for_event('page'); await asyncio.sleep(2)
    ap.on('pageerror', lambda e: errs.append('ARTICLE PANEL ' + str(e)))
    SEL = '''()=>{const p=document.querySelectorAll("p")[2];const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}'''
    n = [0]
    async def capture():
      n[0] += 1
      # A capture leaves the passage marked, which splits its text into many pieces, so the whole paragraph is
      # selected rather than its first piece.
      await news.bring_to_front()
      # A click in the page's margin wipes the stroke the last capture left, the way a person clears it.
      # Clearing the marks rewrites the paragraph's text, so the new selection waits until that is done.
      await news.mouse.click(20, 700); await asyncio.sleep(.3); await news.keyboard.press('Escape'); await asyncio.sleep(1.5)
      for _ in range(6):
        await news.evaluate(SEL); await asyncio.sleep(.8)
        if await news.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"): break
      await news.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()")
      try: await ap.wait_for_selector('.aCompose:not([hidden])', timeout=25000)
      except Exception:
        print('CAPTURE NUMBER', n[0], 'FAILED')
        print('PANEL LOG:', (await ap.evaluate("(document.getElementById('log')||{}).textContent||''"))[-1500:].replace(chr(10), ' || '))
        print('PAGE STATE:', await sw.evaluate(f"chrome.tabs.sendMessage({nid}, {{type:'a-info'}}).then(r=>JSON.stringify(r.sel).slice(0,300)).catch(e=>'no answer: '+e.message)"))
        print('ERRORS SO FAR:', errs)
        print('PANEL ENTRY:', await ap.evaluate(f"(()=>{{const p=panels.get({nid});if(!p)return 'none';return {{kind:p.kind, cb:String(p.selCb).slice(0,80), count:panels.size, els:document.querySelectorAll('#articleMode > div').length}}}})()"))
        await ap.evaluate(f"panels.get({nid}).selCb({{state:'ok', text:'A test passage of some length for the panel.', len:44}})"); await asyncio.sleep(.5)
        print('AFTER CALLING IT BY HAND:', not await ap.evaluate("document.querySelector('#articleMode .selBox').hidden"))
        print('SELCB WIRED:', await ap.evaluate("(()=>{try{return typeof ArticlePanel}catch(e){return 'x'}})()"))
        print('PANEL SEES:', await ap.evaluate("({hidden:[...document.querySelectorAll('#articleMode > div')].map(d=>d.hidden), sel:!document.querySelector('#articleMode .selBox').hidden})"))
        print('THE PANEL SAID:', (await ap.inner_text('body'))[:700].replace('\n', ' | '))
        print('THE PAGE HAS A BUTTON:', await news.evaluate("[...document.querySelectorAll('.annotated-ui')].map(h=>h.style.display)"))
        raise
      await asyncio.sleep(.8)
    await capture()
    await ap.fill('#articleMode .takeInput', 'Words worth keeping.')
    await ap.click('#articleMode .tagbtn >> text=Receipts'); await asyncio.sleep(.3)
    await ap.reload(); await asyncio.sleep(2.5)
    await capture()
    kept = await ap.input_value('#articleMode .takeInput')
    tag = await ap.eval_on_selector_all('#articleMode .tagbtn', "bs=>bs.filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.textContent)")
    note = await ap.evaluate("(document.querySelector('#articleMode .draftNote')||{}).textContent||''")
    print('after reloading the panel:', repr(kept), tag, '|', note)
    if kept != 'Words worth keeping.' or tag != ['Receipts']: errs.append(f'the half-written take did not come back: {kept!r} {tag}')
    if 'kept' not in note: errs.append('nothing said the words were kept')
    await ctx.set_offline(True)
    t0 = asyncio.get_event_loop().time()
    await ap.click('#articleMode .publish')
    try:
      await ap.wait_for_selector('#articleMode .aPublished:not([hidden])', timeout=15000)
      took = asyncio.get_event_loop().time() - t0
      said = await ap.inner_text('#articleMode .aPublished')
    except Exception:
      took, said = None, await ap.inner_text('#articleMode')
    await ctx.set_offline(False)
    print('offline publish answered after', took, 'seconds:', said[:160].replace('\n', ' | '))
    if took is None or took > 6: errs.append(f'offline, Publish did not answer quickly: {took}')
    elif 'offline' not in said.lower() and 'saved on this computer' not in said.lower(): errs.append(f'offline, the card said {said!r}')
    await ap.click('#articleMode button:has-text("Start a new annotation")'); await asyncio.sleep(.8)
    await capture()
    print('after publishing, the take box holds:', repr(await ap.input_value('#articleMode .takeInput')))
    if await ap.input_value('#articleMode .takeInput'): errs.append('the draft came back after the take was published')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
