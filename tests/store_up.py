import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profSU'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'])
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    old=await ctx.new_page(); await old.goto(f'chrome-extension://{extid}/mic.html')
    # an annotation saved by the previous version: one store, with a clip and a screenshot inside
    print(await old.evaluate("""(async()=>{
      const c=document.createElement('canvas');c.width=900;c.height=500;const g=c.getContext('2d');g.fillStyle='#e33';g.fillRect(0,0,900,500);g.fillStyle='#ff0';g.fillRect(100,100,600,120);
      const shot=c.toDataURL('image/png');
      const db=await new Promise((res,rej)=>{const r=indexedDB.open('annotated',1);r.onupgradeneeded=()=>r.result.createObjectStore('annotations');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
      await new Promise((res)=>{const t=db.transaction('annotations','readwrite');t.objectStore('annotations').put({item:{kind:'article',text:'Old passage',meta:{title:'Old story',site:'Old News',url:'https://old.example/s'},shot},take:{text:'Saved before the upgrade',tag:null},reactions:[],created:Date.now()-60000},'old-one-abcd');
        t.objectStore('annotations').put({item:{kind:'video',videoId:'x',start:1,end:3,title:'Old clip',blob:new Blob([new Uint8Array(5000)],{type:'video/webm'}),poster:shot},take:{text:'Old clip take'},reactions:[],created:Date.now()},'old-clip-efgh');t.oncomplete=res});
      db.close(); return 'old database written, shot '+Math.round(shot.length/1024)+' KB'})()"""))
    await old.close()
    feed=await ctx.new_page(); errs=[]; feed.on('pageerror',lambda e: errs.append(str(e)))
    await feed.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(3.5)
    print(await feed.evaluate("""(async()=>{const m=await Store.allMeta();const a=await Store.all();
      return {metaRows:m.length, fullRows:a.length, metaHasNoFiles:m.every(r=>!r.item.blob&&!r.item.shot), flags:m.map(r=>[r.id,r.item.hasMedia,r.item.hasShot,!!r.item.shotThumb&&Math.round(r.item.shotThumb.length/1024)+' KB thumb']),
        fullKept:a.map(r=>[r.id,!!r.item.blob,!!r.item.shot])}})()"""))
    print('feed cards:', await feed.locator('.card').count(), '(this computer plus whatever is published)', '| article card thumbnail uses the small copy:', await feed.eval_on_selector('.card .cthumb img','i=>i.src.startsWith("data:image/jpeg")'))
    # Name the clip this test made. The feed also holds whatever is published, so the first play button on the
    # page is not necessarily ours, and an audio one has no video element.
    await feed.click('.cplayBtn[data-id="old-clip-efgh"]'); await asyncio.sleep(.8)
    print('clip loads on play:', await feed.eval_on_selector('.cardPlayer video','v=>v.src.startsWith("blob:")'))
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
