import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profHL'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    errs=[]
    n=await ctx.new_page(); n.on('pageerror',lambda e: errs.append(str(e))); await n.set_viewport_size({'width':1000,'height':800}); await n.goto('https://harborline.example/x'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    await n.bring_to_front()
    state="(()=>{const h=CSS.highlights.get('annotated-pending');const marks=[...document.querySelectorAll('mark.annotated-hl')];return {pending:h?[...h].map(r=>r.toString().slice(0,40)):[], marks:marks.length, marksDimmed:marks.filter(m=>m.classList.contains('annotated-old')).length}})()"
    async def drag_select(pi):
        # a real mouse drag across the start of paragraph pi, the way a person selects
        box=await n.evaluate(f"(()=>{{const p=document.querySelectorAll('article p, p')[{pi}];const r=document.createRange();r.selectNodeContents(p.firstChild);const rs=r.getClientRects();const a=rs[0],b=rs[rs.length-1];return [a.left+2,a.top+a.height/2,b.right-2,b.top+b.height/2]}})()")
        await n.mouse.move(box[0],box[1]); await n.mouse.down(); await n.mouse.move(box[2],box[3],steps=12); await n.mouse.up(); await asyncio.sleep(.8)
    await drag_select(1); print('after selecting sentence A:', await n.evaluate(state))
    # click into the panel, the way you would to read it, which leaves A held on the page
    await n.evaluate("getSelection().removeAllRanges()"); await asyncio.sleep(.5)
    print('A held after clicking away:', await n.evaluate(state))
    await drag_select(2); print('after selecting sentence B instead:', await n.evaluate(state))
    await n.evaluate("getSelection().removeAllRanges()"); await asyncio.sleep(.5)
    print('B held after clicking away:', await n.evaluate(state))
    await pan.bring_to_front(); await pan.click('#articleMode .grab'); await pan.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.4)
    await n.bring_to_front(); print('after capturing B:', await n.evaluate(state))
    await drag_select(3); print('after selecting C (B was captured):', await n.evaluate(state))
    await pan.bring_to_front(); print('panel still keeps the earlier capture:', await pan.inner_text('#articleMode .resLabel'))
    await pan.click('#articleMode .grab'); await pan.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.4)
    await n.bring_to_front(); print('after capturing C:', await n.evaluate(state))
    await pan.bring_to_front(); await pan.fill('#articleMode .takeInput','x')
    np=asyncio.ensure_future(ctx.wait_for_event('page')); await pan.click('#articleMode .publish'); await asyncio.wait_for(np,15); await asyncio.sleep(.8)
    print('after publishing:', await n.evaluate(state))
    print('errors:', errs)
    await n.screenshot(path='hl.png')
    await ctx.close()
asyncio.run(main())
