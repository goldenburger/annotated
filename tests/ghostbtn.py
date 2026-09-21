# The recording on 2026-09-21 showed two Annotate buttons on one selection, one of which did nothing when
# pressed. Reloading the extension leaves the script that was already on the page running with no way to
# reach the extension, and a copy old enough not to know how to tidy up left its button behind. A copy
# claiming the page now clears anything left by any older one, and a copy that finds itself talking to
# nobody takes itself off.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head>'
      '<body style="margin:0;font:18px/1.6 Georgia,serif"><article style="width:620px;margin:30px">'
      '<h1>Harbor story</h1>'
      '<p id="a">The council met on a Tuesday to talk about the overnight buses, and every member arrived on time.</p>'
      '</article></body></html>')
PICK="""()=>{const n=document.getElementById('a').firstChild;
  const r=document.createRange(); r.setStart(n,0); r.setEnd(n,48);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);}"""
HOSTS="()=>document.querySelectorAll('.annotated-ui').length"
# A copy from before any of this, which left a button on the page and no way to ask it to go.
GHOST = """async (a) => {
  await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const ghost = document.createElement('div');
    ghost.className = 'annotated-ui';
    ghost.style.cssText = 'position:fixed;z-index:2147483647;left:40px;top:40px';
    ghost.attachShadow({ mode: 'open' }).innerHTML = '<button class="go">Annotate</button>';
    document.body.appendChild(ghost);
    delete window.__annotatedArticle;
  } });
  return true;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profGHOST'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':1000,'height':700})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.4)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")

    await pg.evaluate(PICK); await asyncio.sleep(.7)
    print('buttons to begin with:',await pg.evaluate(HOSTS))
    if await pg.evaluate(HOSTS)!=1: errs.append('the page did not start with exactly one Annotate button')

    # A leftover from an older copy, then a fresh one claims the page the way an update does.
    await sw.evaluate(GHOST,{'tid':tid})
    print('with a leftover on the page:',await pg.evaluate(HOSTS))
    await sw.evaluate("""async (a) => { await chrome.scripting.executeScript(
      { target: { tabId: a.tid }, files: ['post-core.js', 'article-core.js', 'capture-engine.js', 'article.js'] }); }""",{'tid':tid})
    await asyncio.sleep(.6)
    await pg.evaluate("()=>window.getSelection().removeAllRanges()"); await asyncio.sleep(.4)
    await pg.evaluate(PICK); await asyncio.sleep(.8)
    after=await pg.evaluate(HOSTS)
    print('after a fresh copy claimed the page:',after)
    if after!=1: errs.append(f'{after} Annotate buttons were on the page, and only one of them can work')

    # The one that is left is the live one, and pressing it reaches the extension.
    heard=await sw.evaluate("""async (a) => {
      let got = false;
      const listen = (m, s) => { if (m && m.type === 'annotate-request' && s.tab && s.tab.id === a.tid) got = true; };
      chrome.runtime.onMessage.addListener(listen);
      await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
        const h = document.querySelector('.annotated-ui');
        if (h && h.shadowRoot) h.shadowRoot.querySelector('.go').click();
      } });
      await new Promise((r) => setTimeout(r, 600));
      chrome.runtime.onMessage.removeListener(listen);
      return got;
    }""",{'tid':tid})
    print('the button that is left reaches the extension:',heard)
    if not heard: errs.append('the Annotate button left on the page does nothing when pressed')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
