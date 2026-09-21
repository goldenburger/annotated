# A stroke a capture left used to stay on the page until the next capture, so the page filled up with old
# marks. Clicking somewhere else wipes anything annotated has drawn, the same way a selection goes when you
# click away, and Escape does the same. A click while the picture is still being taken changes nothing.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head>'
      '<body style="margin:0;font:18px/1.6 Georgia,serif"><article style="width:620px;margin:30px">'
      '<h1>Harbor story</h1>'
      '<p id="a">The council met on a Tuesday to talk about the overnight buses, and every member arrived on time.</p>'
      '<p id="b">The clerk wrote it all down in the minutes, which nobody questioned at the time.</p>'
      '</article></body></html>')
MARK = """(sel) => {
  const p = document.querySelector(sel), n = p.firstChild;
  const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 40);
  const marks = ArticleCore.highlightRange(rg);
  ArticleCore.sweep(marks);
  return marks.length;
}"""
COUNT = "() => document.querySelectorAll('mark.annotated-hl').length"
RUN = """async (a) => {
  const one = async (fn, arg) => (await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: fn, args: arg ? [arg] : [] }))[0].result;
  return one;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profWIPE'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':600})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.4)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    async def run(js, arg=None):
        return await sw.evaluate("""async (a) => (await chrome.scripting.executeScript(
          { target: { tabId: a.tid }, func: eval('(' + a.fn + ')'), args: a.arg === null ? [] : [a.arg] }))[0].result""",
          {'tid':tid,'fn':js,'arg':arg})

    n=await run(MARK,'#a'); await asyncio.sleep(1.2)
    print('marks after a capture:',n,'| on the page:',await run(COUNT))
    if not n: errs.append('nothing was marked to begin with')

    # A click somewhere else in the page wipes it.
    await pg.mouse.click(700, 520); await asyncio.sleep(.5)
    left=await run(COUNT)
    print('after clicking elsewhere:',left)
    if left: errs.append(f'{left} marks were still on the page after a click somewhere else')

    # Escape does the same.
    await run(MARK,'#b'); await asyncio.sleep(1.2)
    await pg.keyboard.press('Escape'); await asyncio.sleep(.5)
    afterEsc=await run(COUNT)
    print('after Escape:',afterEsc)
    if afterEsc: errs.append(f'{afterEsc} marks were still on the page after Escape')

    # While the picture is being taken, a click must not wipe the stroke out from under it.
    shot=await sw.evaluate("""async (a) => {
      await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
        const n = document.getElementById('a').firstChild;
        const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 40);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
      } });
      const pending = chrome.tabs.sendMessage(a.tid, { type: 'capture-passage' });
      await new Promise((r) => setTimeout(r, 120));
      await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
        document.getElementById('b').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } });
      const r = await pending;
      const [m] = await chrome.scripting.executeScript({ target: { tabId: a.tid },
        func: () => document.querySelectorAll('mark.annotated-hl').length });
      return { ok: !!(r && r.ok), marks: m.result };
    }""", {'tid':tid})
    print('a click mid capture:',shot)
    if not shot['ok']: errs.append('the capture itself failed')
    if not shot['marks']: errs.append('a click while the picture was being taken wiped the stroke out from under it')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
