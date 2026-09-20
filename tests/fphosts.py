import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
TERMS=['Invested by Aleph Gavin Baker','Upside Jensen Drops a Trillion','The Daily New York Times','Hard Fork','Lex Fridman Podcast','This Week in Startups']
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFP3'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}','--headless=new'])
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.goto(f'chrome-extension://{extid}/sidepanel.html')
    for t in TERMS:
      r=await pg.evaluate("""async (t)=>{try{const res=await FeedPod.search(t,3);if(!res.length)return 'no results';const e=res[0];const host=new URL(e.audioUrl).hostname;
        const p=await FeedPod.probe(e.audioUrl);const s=Math.min(300,p.duration/2);const c=await FeedPod.slice(p,s,s+15);
        const w=await Waveform.fromBlob(c.blob,10);
        return `${e.show.slice(0,28)} | ${host} | ${p.kbps}kbps${p.vbr?' VBR':''} | ${Math.round(p.duration)}s (directory says ${Math.round(e.duration)}s) | clip ${c.seconds.toFixed(2)}s, ${(c.downloaded/1024).toFixed(0)}KB, decodes ${w.duration.toFixed(2)}s`}catch(err){return 'FAILED: '+err.message}}""", t)
      print(t,'->',r)
    await ctx.close()
asyncio.run(main())
