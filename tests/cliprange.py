# The recording on 2026-09-21 showed a nine minute video offering a clip from 23:44 to 24:14. A player can go
# on reporting the video you just left for a moment, so the range is read from the old one, and by the time
# the real length arrives the panel has already decided. The range has to come back inside the video.
# Also from that recording, a finished poll sat beside a Publish button that would not turn on, under a line
# about written takes. A poll with a question is a take.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
RANGE = """async () => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const api = VideoPanel.create(d, { seek() {}, preview() {}, capture: async () => ({ ok: true }), abort() {} }, { log() {} });
  const read = () => ({ start: d.querySelector('.rStart').value, end: d.querySelector('.rEnd').value });
  const long = { ok: true, videoId: 'long', title: 'A long one', channel: 'Salesforce', duration: 2428,
                 currentTime: 1424, paused: true, width: 1280, height: 720 };
  api.update(long);
  await new Promise((r) => setTimeout(r, 60));
  const onLong = read();
  // The video changes, but for a moment the player still reports where it was in the one before.
  api.update({ ...long, videoId: 'short', title: 'A short one' });
  await new Promise((r) => setTimeout(r, 60));
  const stale = read();
  // The real length arrives.
  api.update({ ok: true, videoId: 'short', title: 'A short one', channel: 'Salesforce', duration: 535,
               currentTime: 2, paused: true, width: 1280, height: 720 });
  await new Promise((r) => setTimeout(r, 60));
  const settled = read();
  d.remove();
  return { onLong, stale, settled };
}"""
POLL = """async () => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const api = Compose.create(d, { placeholder: 'What should people notice?', log() {}, onPublish: async () => ({}) });
  const state = () => ({ off: d.querySelector('.publish').disabled, hint: d.querySelector('.publishHint').textContent });
  const type = (sel, v) => { const e = d.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
  const out = { empty: state() };
  d.querySelector('.pollBtn').click();
  out.justOpened = state();
  type('.peQ', 'Does this hold up?');
  out.withQuestion = state();
  // Two options come with it, so that is a whole poll.
  out.options = [...d.querySelectorAll('.peOpt')].map((i) => i.value);
  type('.peOpts .peOpt', '');
  out.oneOption = state();
  type('.peOpts .peOpt', 'Agree');
  out.backAgain = state();
  d.querySelector('.peRemove').click();
  out.removed = state();
  d.remove();
  return out;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profCR'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':420,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.2)

    r=await pan.evaluate(RANGE)
    print('on the long video:',r['onLong'])
    print('the moment it changed:',r['stale'],'| once the length arrived:',r['settled'])
    def secs(t):
        parts=[float(x) for x in t.split(':')]
        return parts[0]*60+parts[1] if len(parts)==2 else parts[0]
    if secs(r['onLong']['start'])<1400: errs.append(f"the long video did not start where the player was: {r['onLong']}")
    if secs(r['settled']['end'])>535: errs.append(f"the clip still ends at {r['settled']['end']}, past the end of a 8:55 video")
    if secs(r['settled']['start'])>535: errs.append(f"the clip still starts at {r['settled']['start']}, past the end of the video")
    if secs(r['settled']['end'])-secs(r['settled']['start'])<1: errs.append('the clip was squashed to nothing')

    q=await pan.evaluate(POLL)
    print('nothing written:',q['empty'])
    print('poll opened:',q['justOpened'],'| question typed:',q['withQuestion'])
    print('options it starts with:',q['options'])
    print('one option left:',q['oneOption'],'| both back:',q['backAgain'],'| poll removed:',q['removed'])
    if not q['empty']['off']: errs.append('an empty annotation could be published')
    if 'poll' not in q['empty']['hint']: errs.append(f"the hint does not mention a poll: {q['empty']['hint']!r}")
    if not q['justOpened']['off']: errs.append('an empty poll could be published')
    if q['withQuestion']['off']: errs.append('a poll with a question and two options could not be published')
    if not q['oneOption']['off']: errs.append('a poll with one option could be published')
    if q['backAgain']['off']: errs.append('putting the option back did not make it publishable again')
    if not q['removed']['off']: errs.append('removing the poll left the annotation publishable with nothing in it')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
