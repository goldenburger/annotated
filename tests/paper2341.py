# Paper in the panel and a corner on every sheet (2.34.1): the quote is a torn strip, the take box a ruled notecard,
# the published card carries a trail, the margin note by the try-it is gone, and /paper.html shows every drawing and
# plays every opening and every fold and flight without errors.
import asyncio, json, sys
from playwright.async_api import async_playwright
from _env import *
sys.path.insert(0, '.')
from features234 import site, SUPA, ROW
async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profLOOK'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route(SUPA + '/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    await pg.evaluate("""() => { const m = document.createElement('div'); m.style.cssText='position:fixed;inset:0;z-index:99;background:var(--paper);padding:16px;overflow:auto';
      m.innerHTML = `<p class="resLabel">You're annotating</p><p class="k">Quoting</p><blockquote class="quote pQuote">Tesla is officially rescheduling the Roadster unveiling event to October 15th due to weather.</blockquote>
      <h3 style="font:600 16px var(--sans);margin:18px 0 8px">Add your take</h3><div class="takefield"><textarea class="takeInput" rows="4">A date, but no reason beyond weather.\nWorth watching whether it slips again.</textarea></div>
      <div id="pub" style="margin-top:20px"></div>`; document.body.appendChild(m);
      PanelKit.published(m.querySelector('#pub'), { permalink: 'https://annotated-app.netlify.app/@robotaxi/abc', xHref: 'https://x.com', onView(){}, onNew(){} }); }""")
    await asyncio.sleep(1)
    look = await pg.evaluate("""() => { const q = getComputedStyle(document.querySelector('.pQuote')), t = getComputedStyle(document.querySelector('.takefield textarea')), c = getComputedStyle(document.querySelector('.takefield'), '::after');
      return { torn: (q.maskImage || q.webkitMaskImage || '').includes('conic'), ruled: t.backgroundImage.includes('repeating-linear-gradient'), corner: c.content !== 'none' && c.content !== 'normal', sent: !!document.querySelector('.pubcard .pd-sent svg') }; }""")
    print('panel paper:', look)
    for k, v in look.items():
      if not v: errs.append(f'panel paper missing: {k}')
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    w = await b.new_page(viewport={'width': 1280, 'height': 900}); w.on('pageerror', lambda e: errs.append('W ' + str(e)))
    await w.route('https://annotated-app.netlify.app/**', site)
    async def rest(r):
      u = r.request.url
      if '/rest/v1/annotations' in u and 'select=id' in u.replace('%2C', ','): return await r.fulfill(status=200, content_type='application/json', body=exists_reply(u) or '[]')
      if '/rest/v1/annotations' in u: return await r.fulfill(status=200, content_type='application/json', body=json.dumps([ROW, dict(ROW, id='pod2', comments=[])]))
      return await r.fulfill(status=200, content_type='application/json', body='[]')
    await w.route(SUPA + '/**', rest)
    await w.goto('https://annotated-app.netlify.app/?feed&noplanes'); await asyncio.sleep(3)
    await w.screenshot(path='look_feed.png')
    await w.goto('https://annotated-app.netlify.app/paper.html?planes'); await asyncio.sleep(2)
    await w.screenshot(path='look_paper.png', full_page=True)
    await w.click('.ppOpen[data-k="peel"]'); await asyncio.sleep(3)
    await w.click('.ppSend'); await asyncio.sleep(3)
    await w.click(".ppTrash"); await asyncio.sleep(2.6)
    left = await w.evaluate("!!document.querySelector('.pl-trash')")
    if left: errs.append("the crumple into the bin did not finish")
    n = await w.evaluate("document.querySelectorAll('.ppArt svg').length")
    print('drawings on the page:', n)
    if n < 17: errs.append(f'the paper page drew only {n} drawings')
    await w.goto('https://annotated-app.netlify.app/?noplanes'); await asyncio.sleep(2)
    left = await w.evaluate("!!document.querySelector('.mnTry')")
    print('try note left:', left)
    if not left: errs.append("the margin note by the try-it is missing (David kept it)")
    await b.close(); await ctx.close()
  print('errors:', errs)
asyncio.run(main())
