# X signed out (2026-09-26). Signed out, x.com serves different markup: no data-testid, the words in a div[dir=auto],
# no <time>, the date as the text of the status link. The panel sat on "Waiting for the post". This is a copy of that
# markup's shape, taken from x.com on the day; the post panel must read the author, handle, date and words, and words
# selected in the post must become its quote.
import asyncio
from playwright.async_api import async_playwright
from _env import *
POST = '''<!doctype html><html><head><title>Dario Amodei on X: "We Must Pace the Frontier" / X</title></head><body style="font:15px system-ui;max-width:600px;margin:20px">
<article><div><div><a href="/DarioAmodei"><img alt="@DarioAmodei" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
<div><a href="/DarioAmodei"><div>Dario Amodei</div></a><a href="/DarioAmodei"><span>@DarioAmodei</span></a></div></div>
<div dir="auto"><span>We Must Pace the Frontier: I've written a new essay on why the AI industry should slow down, with a three-part plan for doing so.

Anthropic is unilaterally committing to the first of these steps.</span></div>
<a href="/DarioAmodei/status/2098773920774074715">7:01 AM · Sep 12, 2026</a><span aria-hidden="true">·</span></div></article>
<article><div><a href="/stutxo"><span>@stutxo</span></a><div dir="auto"><span>A reply under it.</span></div><a href="/stutxo/status/2098800000000000000">Sep 12</a></div></article>
</body></html>'''

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('xsignedout'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await ctx.route('https://x.com/**', lambda r: r.fulfill(status=200, body=POST, headers={'Content-Type': 'text/html; charset=utf-8'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    await one_panel(sw)
    x = await ctx.new_page(); await x.set_viewport_size({'width': 1000, 'height': 800}); x.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await x.goto('https://x.com/DarioAmodei/status/2098773920774074715'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(v=>v.url.includes('x.com')).id)")
    fut = asyncio.ensure_future(ctx.wait_for_event('page'))
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{sw.url.split('/')[2]}/sidepanel.html?tab={tid}',width:400,height:900}})")
    pv = await fut; await pv.set_viewport_size({'width': 400, 'height': 900}); pv.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await asyncio.sleep(4)
    head = await pv.evaluate("({ who: (document.querySelector('#postMode .pTitle, #postMode .phead b, #postMode h2') || {}).textContent, text: document.querySelector('#postMode').innerText })")
    print('the post panel:', ' '.join(head['text'].split())[:220])
    t = head['text']
    if 'Waiting for the post' in t: errs.append('the panel is still waiting for the post')
    if 'Dario Amodei' not in t or '@DarioAmodei' not in t or 'September 12, 2026' not in t: errs.append('the author, handle or date was not read')
    if 'We Must Pace the Frontier' not in t or 'A reply under it' in t: errs.append('the main post was not the one read')
    await x.bring_to_front()
    r = await x.evaluate("""(() => { const d = document.querySelector('article div[dir="auto"]'); const n = d.querySelector('span').firstChild; const i = n.nodeValue.indexOf('Anthropic');
      const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 'Anthropic is unilaterally committing'.length); const rs = [...rg.getClientRects()];
      return [rs[0].left + 1, rs[0].top + rs[0].height / 2, rs[rs.length - 1].right - 1, rs[rs.length - 1].top + rs[rs.length - 1].height / 2]; })()""")
    await x.mouse.move(r[0], r[1]); await x.mouse.down(); await x.mouse.move(r[2], r[3], steps=12); await x.mouse.up(); await asyncio.sleep(1)
    await press_annotate(x); await asyncio.sleep(4)
    q = await pv.evaluate("document.querySelector('#postMode').innerText")
    print('after Annotate:', ' '.join(q.split())[:200])
    if 'Anthropic is unilaterally committing' not in q or "You're annotating" not in q: errs.append('the selected words did not become the quote')
    await ctx.close()
  print('errors:', errs)

asyncio.run(main())
