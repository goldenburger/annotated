# Reloading the extension leaves the old page scripts behind. The panel then injects a fresh copy, which used to
# throw "Identifier 'PostCore' has already been declared" and left the tab dead until it was reloaded by hand.
# This puts three copies on one page and checks the newest one answers and the older ones stay quiet.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
FILES=['post-core.js','article-core.js','capture-engine.js','article.js']
PAGE=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor test story</title></head><body><article><h1>Harbor story</h1>'
      '<p>'+('The council met on a Tuesday to talk about the buses. '*12)+'</p></article></body></html>')
async def main():
  errs=[]; syntax=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profRI'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=PAGE,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    def onerr(e):
      errs.append(str(e))
      if 'already been declared' in str(e): syntax.append(str(e))
    pg.on('pageerror', onerr)
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")

    # Two more copies on top of whatever is already there, the way a reload leaves things.
    for round_ in (1, 2):
      await sw.evaluate("""async (a)=>{ await chrome.scripting.executeScript({target:{tabId:a.tid}, files:a.files}); }""",
                        {'tid': tid, 'files': FILES})
      await asyncio.sleep(.6)
      print(f'round {round_} injected')

    if syntax: errs.append('a second copy could not load: '+syntax[0][:80])

    # The newest copy answers, and only once.
    replies=await sw.evaluate("""async (tid)=>{ const out=[];
      for (let i=0;i<3;i++){ try{ out.push(await chrome.tabs.sendMessage(tid,{type:'aping'})); }catch(e){ out.push('threw '+e.message); } }
      return out; }""", tid)
    print('aping replies:', replies)
    if not all(r and r.get('ok') for r in replies if isinstance(r, dict)): errs.append('the page stopped answering after re-injection')
    if any(isinstance(r, str) for r in replies): errs.append('a ping threw after re-injection')

    # And the page still does real work.
    info=await sw.evaluate("chrome.tabs.sendMessage(%d,{type:'a-info'}).catch(e=>'threw '+e.message)" % tid)
    ok=isinstance(info, dict) and bool((info.get('meta') or {}).get('title'))
    print('a-info still works:', ok, '| title:', (info.get('meta') or {}).get('title') if isinstance(info, dict) else info)
    if not ok: errs.append('the page could not describe itself after re-injection')

    print('page errors seen:', [e[:70] for e in errs if 'already been declared' in e] or 'none about redeclaring')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
