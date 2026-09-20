import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('prof7'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'],viewport={'width':1440,'height':900})
    await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(f'chrome-extension://{extid}/feed.html')
    await pg.evaluate("""(async()=>{
      const meta={title:'Overnight buses will run on three routes in a six-month trial',site:'Harborline News',author:'Dana Reyes',published:'2026-09-17T08:30:00-07:00',image:'',url:'https://harborline.example/a',description:'The city will test late-night service on three routes after a survey found most night-shift workers commute more than 40 minutes.'};
      await Store.put('a-1',{item:{kind:'article',text:'A city survey of 1,800 night-shift workers found that 61 percent commute more than 40 minutes each way.',meta,fragmentUrl:'https://harborline.example/a#:~:text=A',shot:null},take:{tag:'Receipts',text:'The 61 percent figure comes from an employer survey.',voice:null},sourceTabId:0,created:Date.now()-3600e3,comments:[{text:'Good catch.',t:Date.now()-1800e3}]});
      await Store.put('a-2',{item:{kind:'article',text:'The trial will cost $2.4 million over six months.',meta,fragmentUrl:'https://harborline.example/a#:~:text=The',shot:null},take:{tag:'Fact check',text:'Where does the $2.4 million come from?',voice:null},sourceTabId:0,created:Date.now()-600e3});
      await Store.put('p-1',{item:{kind:'post',text:'The city council voted 7 to 2 to fund overnight buses.',author:'Harborline News',handle:'@harborlinenews',posted:'2026-09-17T16:05:00Z',url:'https://x.com/harborlinenews/status/1',id:'1',shot:null,display:'embed'},take:{tag:null,text:'Worth checking against the budget.',voice:null},sourceTabId:0,created:Date.now()-60e3,seen:true});
    })()""")
    await pg.goto(f'chrome-extension://{extid}/annotation.html#a-1'); await pg.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(.5)
    await pg.screenshot(path='e3_ann.png')
    # Signed out, these annotations are only on this computer, so Share is hidden and the page says so.
    print('local-only: share hidden', not await pg.is_visible('.shareBtn'), '| note:', await pg.inner_text('.localNote'))
    await pg.keyboard.press('Escape'); await pg.click('body', position={'x':5,'y':500})
    await pg.click('.moreBtn'); await pg.click('.delBtn'); await asyncio.sleep(.2)
    print('delete confirm:', await pg.inner_text('.delWrap'))
    print('rail:', (await pg.inner_text('.rail')).replace('\n',' | '))
    await pg.click('.navHome'); await pg.wait_for_selector('.feedHead'); await asyncio.sleep(.4)
    print('home head:', (await pg.inner_text('.feedHead')).replace('\n',' | '))
    await pg.screenshot(path='e3_home.png')
    await pg.click('.feedFilter label >> nth=2'); await asyncio.sleep(.2); print('passages only:', await pg.locator('.card').count())
    await pg.click('.railTag >> nth=0'); await asyncio.sleep(.3); print('tag page:', (await pg.inner_text('.feedHead')).replace('\n',' | '), await pg.locator('.card').count())
    await pg.set_viewport_size({'width':390,'height':844}); await pg.goto(f'chrome-extension://{extid}/annotation.html#a-1'); await pg.wait_for_selector('.ann:not(.loading)'); await asyncio.sleep(.4)
    await pg.screenshot(path='e3_phone.png', full_page=True)
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
