# The seventh pass of the audit of 2026-09-29, in the extension.
#   1. Play selection stopped before its seek lands leaves no listener behind that later plays or pauses the video
#      (run in Node against capture-engine.js with a stand-in video).
#   2. A podcast whose MP3 header claims billions of frames is timed by its bytes, not the header (feedpod.js in Node).
#   3. The extension's annotation page says "This did not load" with Try again when the database cannot be read,
#      where it said the annotation was not found.
#   4. A feed page in a hidden tab does not read its list on every stamp, and reads it once when looked at again.
#   5. Most talked about is asked for once however many boxes draw it at the same moment.
import asyncio, json, os, subprocess, tempfile
from playwright.async_api import async_playwright
from _env import *

NODE = r"""
const vm = require('vm'), fs = require('fs');
const out = {};
globalThis.document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };
// 1. Play selection.
vm.runInThisContext(fs.readFileSync(ENGINE, 'utf8') + '\n;globalThis.ClipEngine = ClipEngine;');
class FakeVideo extends EventTarget {
  constructor() { super(); this.t = 0; this.paused = true; this.plays = 0; this.pauses = 0; this.duration = 600; }
  get currentTime() { return this.t; } set currentTime(x) { this.t = x; }
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { this.pauses++; this.paused = true; }
}
const v = new FakeVideo();
const eng = ClipEngine.create({ getVideo: () => v, meta: () => ({}), send: () => {} });
eng.preview(10, 20);
eng.pause();                                  // Stop pressed before the seek lands
v.dispatchEvent(new Event('seeked'));         // the seek lands
const playsAfterStop = v.plays;
v.t = 25; v.paused = false; v.dispatchEvent(new Event('timeupdate'));   // later, the person plays past the end
out.preview = { playsAfterStop, pausedLater: v.pauses > 1 };
// A normal preview still plays and stops at its end.
const w = new FakeVideo(), eng2 = ClipEngine.create({ getVideo: () => w, meta: () => ({}), send: () => {} });
eng2.preview(10, 20); w.dispatchEvent(new Event('seeked'));
w.t = 20.1; w.dispatchEvent(new Event('timeupdate')); const stoppedAtEnd = w.paused;
w.paused = false; w.t = 30; w.dispatchEvent(new Event('timeupdate'));
out.normal = { played: w.plays, stoppedAtEnd, leftAlone: !w.paused };
// 2. A header claiming 2^28 frames.
const len = 417, n = 200, b = new Uint8Array(len * n);
for (let i = 0; i < n; i++) { b.set([0xff, 0xfb, 0x90, 0x44], i * len); }
const x = 4 + 32; b.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1, 0x10, 0, 0, 0], x);   // "Xing", frames flag, 2^28 frames
globalThis.fetch = async () => new Response(b, { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': `bytes 0-${b.length - 1}/${b.length}` } });
vm.runInThisContext(fs.readFileSync(FEEDPOD, 'utf8') + '\n;globalThis.FeedPod = FeedPod;');
FeedPod.probe('https://podcasts.example.com/ep.mp3').then((p) => { out.probe = { duration: p.duration }; console.log(JSON.stringify(out)); },
  (e) => { out.probe = { error: String(e && e.message || e) }; console.log(JSON.stringify(out)); });
"""

async def main():
  errs = []
  # 1 and 2, in Node.
  d = tempfile.mkdtemp(); h = os.path.join(d, 'h.js')
  open(h, 'w', encoding='utf-8').write(NODE.replace('ENGINE', json.dumps(os.path.join(EXT, 'capture-engine.js'))).replace('FEEDPOD', json.dumps(os.path.join(EXT, 'feedpod.js'))))
  r = subprocess.run(['node', h], capture_output=True, text=True, encoding='utf-8')
  if r.returncode: print(r.stderr[-1500:]); errs.append('the Node part did not run')
  else:
    out = json.loads(r.stdout.strip().splitlines()[-1])
    print('1. play selection stopped early:', out['preview'], '| a normal one:', out['normal'])
    if out['preview']['playsAfterStop'] or out['preview']['pausedLater']: errs.append('a stopped preview went on playing or pausing the video')
    if out['normal'] != {'played': 1, 'stoppedAtEnd': True, 'leftAlone': True}: errs.append(f"a normal preview changed: {out['normal']}")
    print('2. a header claiming 2^28 frames:', out['probe'])
    dur = out['probe'].get('duration')
    if not dur or dur > 60: errs.append('the frame count in the header decided the length')
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profAUD7'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    # 3.
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/annotation.html#no-such-one-ab12'); await asyncio.sleep(2.5)
    await pg.evaluate("Cloud.get = () => Promise.reject(new Error('offline')); window.dispatchEvent(new HashChangeEvent('hashchange'))"); await asyncio.sleep(2)
    said = ' '.join((await pg.inner_text('#page')).split())
    print('3. offline, the page says:', said[:140])
    if 'did not load' not in said or 'not found' in said: errs.append('a failed read said the annotation was not found')
    await pg.evaluate("Cloud.get = () => Promise.resolve(null)")
    await pg.click('button:has-text("Try again")'); await asyncio.sleep(4)
    said = ' '.join((await pg.inner_text('#page')).split())
    print('   Try again, and now:', said[:100])
    if 'not found' not in said: errs.append('Try again did not load again')
    # 4.
    await pg.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(3)
    await pg.evaluate("""() => { window.__lists = 0; const real = Cloud.list; Cloud.list = (...a) => { window.__lists++; return real(...a); };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); }""")
    for i in range(3):
      await pg.evaluate(f"chrome.storage.local.set({{ annotatedStamp: Date.now() + {i} }})"); await asyncio.sleep(0.7)
    hidden = await pg.evaluate("window.__lists")
    await pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }""")
    await asyncio.sleep(2)
    shown = await pg.evaluate("window.__lists")
    print('4. list reads while hidden:', hidden, '| after being looked at:', shown)
    if hidden: errs.append('a hidden feed read its list on every stamp')
    if shown < 1: errs.append('a feed looked at again after a change did not read its list')
    # 5.
    panel = await ctx.new_page(); panel.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await panel.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(2)
    asks = await panel.evaluate("""async () => {
      let n = 0; Cloud.talkedAbout = () => { n++; return new Promise((r) => setTimeout(() => r([]), 300)); };
      talkRows = null; talkAt = 0;
      const box = () => { const d = document.createElement('div'); d.innerHTML = '<div class="talked"><div class="talkList"></div></div>'; return d; };
      await Promise.all([drawTalked(box()), drawTalked(box()), drawTalked(box())]);
      return n; }""")
    print('5. requests for three boxes at once:', asks)
    if asks != 1: errs.append(f'Most talked about was asked for {asks} times')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
