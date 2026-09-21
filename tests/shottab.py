# The picture that goes with an annotation has to be of the page being annotated. Chrome only ever gives a
# picture of whichever tab is in front of a window, and setting a capture up takes about a second, so a tab
# change in that second used to put a picture of somewhere else on the annotation and publish it to a bucket
# that is public by link. The decoy page here is solid red, so the answer is in the pixels.
import asyncio, base64, io
from playwright.async_api import async_playwright
from PIL import Image
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
RED = '<!doctype html><title>decoy</title><body style="margin:0;background:#ff0000;height:100vh"><h1 style="color:#fff">DECOY</h1>'
PICK = """() => { const p = document.querySelectorAll('article p, p')[1];
  const r = document.createRange(); r.selectNodeContents(p.firstChild);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); }"""

def redness(data_url):
    raw = base64.b64decode(data_url.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    px = list(im.resize((32, 32)).getdata())
    return round(sum(1 for r, g, b in px if r > 200 and g < 60 and b < 60) / len(px), 3), im.size

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profSHOTTAB'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    await ctx.route('https://decoy.example/**', lambda r: r.fulfill(status=200, body=RED, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]

    news = await ctx.new_page(); await news.set_viewport_size({'width': 900, 'height': 800})
    await news.goto('https://harborline.example/x'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    decoy = await ctx.new_page(); await decoy.set_viewport_size({'width': 900, 'height': 800})
    await decoy.goto('https://decoy.example/d'); await asyncio.sleep(.8)

    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.6)

    # Select a passage, then let another tab come to the front before the picture is taken.
    await news.bring_to_front(); await news.evaluate(PICK); await asyncio.sleep(.8)
    await decoy.bring_to_front(); await asyncio.sleep(.4)
    await pan.evaluate("() => document.querySelector('#articleMode .grab').click()")
    await pan.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=25000); await asyncio.sleep(1)
    got = await pan.evaluate("""() => { const i = document.querySelector('#articleMode .shot');
      return { src: i && i.src && i.src.startsWith('data:') ? i.src : '',
               checks: [...document.querySelectorAll('#articleMode .checks li')].map((x) => x.textContent).join(' | ') }; }""")
    print('with another tab in front, a picture was taken:', bool(got['src']))
    if got['src']:
        share, size = redness(got['src'])
        print('  and it is', share, 'the decoy, at', size)
        if share > 0.3: errs.append('the picture was of the tab in front, not of the page being annotated')
        else: errs.append('a picture was taken while another tab was in front, which cannot be the right page')
    said = got['checks']
    print('the checks say:', repr(said[-160:]))
    if 'tab' not in said.lower(): errs.append(f'nothing said why there was no picture: {said[-160:]!r}')

    # Back on the page itself, the picture is taken and it is the page. A fresh panel, because the one above
    # has moved on to the take and no longer offers Annotate.
    await sw.evaluate(f"chrome.tabs.sendMessage({tid}, {{type:'clear-captured'}})")
    await pan.reload(); await asyncio.sleep(2)
    await news.bring_to_front(); await news.evaluate(PICK); await asyncio.sleep(1.2)
    ready = await pan.evaluate("() => { const b = document.querySelector('#articleMode .grab'); return { there: !!b, off: b && b.disabled, hidden: b && b.hidden }; }")
    print('the Annotate button before the second capture:', ready)
    await pan.evaluate("() => document.querySelector('#articleMode .grab').click()")
    await asyncio.sleep(4)
    ok = await pan.evaluate("""() => { const i = document.querySelector('#articleMode .shot');
      return i && i.src && i.src.startsWith('data:') ? i.src : ''; }""")
    print('on the page itself, a picture was taken:', bool(ok))
    if not ok: errs.append('capturing with the page in front took no picture at all')
    else:
        share, size = redness(ok)
        print('  and it is', share, 'the decoy, at', size)
        if share > 0.3: errs.append('the picture was still of the decoy')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
