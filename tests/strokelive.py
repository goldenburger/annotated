# Who draws the stroke. Three recordings showed it arriving finished, because widening a background is work for
# the page's own thread and the page is busy capturing at that moment. The pen is now a transform on a layer,
# and this asks the browser itself which thread it put that on. Nothing inside the page can answer that, and a
# screen recording through the developer tools cannot either, because a compositor frame never reaches it.
# The layers are borrowed for the drawing and handed back once the stroke is down.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head>'
      '<body style="background:#fff;color:#16181d;font:19px/1.7 Georgia,serif;margin:0">'
      '<article style="max-width:620px;margin:30px auto"><p id="a">The council met on a Tuesday to talk about '
      'the overnight buses, and every member arrived on time for once.</p></article></body></html>')
RUN = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const p = document.getElementById('a'), n = p.firstChild;
    const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 62);
    const marks = ArticleCore.highlightRange(rg);
    ArticleCore.sweep(marks);
    return marks.length;
  } });
  return r.result;
}"""
STILL = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const m = [...document.querySelectorAll('mark.annotated-hl')];
    return { going: m.filter((x) => x.classList.contains('hl-go')).length,
             width: m.length ? getComputedStyle(m[0], '::before').transform : 'gone' };
  } });
  return r.result;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profLIVE'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':700,'height':220})
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.3)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")

    layers=[]
    cdp=await ctx.new_cdp_session(pg)
    cdp.on('LayerTree.layerTreeDidChange', lambda ev: layers.append(ev.get('layers') or []))
    await cdp.send('LayerTree.enable')

    async def accelerated():
        snap = layers[-1] if layers else []
        n = 0
        for L in snap:
            try: r = await cdp.send('LayerTree.compositingReasons', {'layerId': L['layerId']})
            except Exception: continue
            if 'ActiveTransformAnimation' in (r.get('compositingReasonIds') or []): n += 1
        return n, len(snap)

    words=await sw.evaluate(RUN,{'tid':tid})
    await asyncio.sleep(.3)
    mid, total = await accelerated()
    print('words marked:',words,'| layers on screen:',total,'| drawn by the compositor:',mid)
    if words < 8: errs.append(f'the passage came out as {words} pieces, so it is not one word to a mark')
    if mid < 3: errs.append(f'{mid} of the words were being drawn by the compositor, so the page draws the stroke itself')

    # Once the stroke is down the layers go back, and the stroke stays.
    await asyncio.sleep(1.4)
    after, _ = await accelerated()
    rest=await sw.evaluate(STILL,{'tid':tid})
    print('still being drawn:',after,'| marks left mid-draw:',rest['going'],'| the first word sits at:',rest['width'])
    if after: errs.append(f'{after} layers were still held after the stroke was down')
    if rest['going']: errs.append('the drawing was never taken off the marks')
    if rest['width'] not in ('none', 'matrix(1, 0, 0, 1, 0, 0)'):
        errs.append(f"the finished stroke sits at {rest['width']} rather than its full width")

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
