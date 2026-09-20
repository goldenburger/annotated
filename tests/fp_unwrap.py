# A tracking address in front of an episode can be down while the audio itself is fine. FeedPod should then try the
# address hidden inside it. Real example: rss.podscribe.ai/p/traffic.megaphone.fm/x.mp3 answered 500 for every
# This Week in Startups episode while traffic.megaphone.fm answered 206.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
# A plain constant bitrate MP3, 128 kbps at 44100 Hz, so every frame is 417 bytes and 500 frames last about 13 s.
FRAME=bytes([0xFF,0xFB,0x90,0xC0])+b'\x00'*413
EP=FRAME*500
DUR=len(EP)/16000
def mp3(route):
    rng=route.request.headers.get('range')
    h={'Content-Type':'audio/mpeg','Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'}
    if rng and rng.startswith('bytes='):
        a,b=rng[6:].split('-'); a=int(a); b=min(int(b) if b else len(EP)-1,len(EP)-1)
        h.update({'Content-Range':f'bytes {a}-{b}/{len(EP)}','Content-Length':str(b-a+1)})
        return route.fulfill(status=206,body=EP[a:b+1],headers=h)
    h['Content-Length']=str(len(EP))
    return route.fulfill(status=200,body=EP,headers=h)
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFPU'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'])
    await ctx.route('https://audio.example/**',mp3)
    await ctx.route('https://works.example/**',mp3)
    await ctx.route('https://down.example/**',lambda r: r.fulfill(status=500,body='no'))
    await ctx.route('https://alsodown.example/**',lambda r: r.fulfill(status=503,body='no'))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.goto(f'chrome-extension://{extid}/sidepanel.html')
    async def probe(u):
      return await pg.evaluate("""async (u)=>{try{const p=await FeedPod.probe(u);
        return {url:p.url,duration:p.duration,total:p.total};}catch(e){return {error:e.message};}}""",u)

    # The tracker is down, so the address inside it is used instead.
    r=await probe('https://down.example/p/audio.example/ep.mp3')
    print('tracker down ->',r)
    if r.get('url')!='https://audio.example/ep.mp3': errs.append('did not fall back to the address inside')
    if not (DUR-0.6 < (r.get('duration') or 0) < DUR+0.6): errs.append(f'duration {r.get("duration")} is not about {DUR:.2f}')

    # Two trackers wrapped around each other, the way podtrac and chartable stack up.
    r=await probe('https://down.example/redirect.mp3/alsodown.example/track/audio.example/ep.mp3')
    print('two trackers down ->',r)
    if r.get('url')!='https://audio.example/ep.mp3': errs.append('did not reach the innermost address')

    # A working tracker is left alone, because trackers are how shows count listeners.
    r=await probe('https://works.example/p/audio.example/ep.mp3')
    print('tracker works ->',r)
    if r.get('url')!='https://works.example/p/audio.example/ep.mp3': errs.append('unwrapped an address that worked')

    # Nothing inside answers either, so the person sees the last failure.
    r=await probe('https://down.example/p/alsodown.example/ep.mp3')
    print('nothing answers ->',r)
    if 'error' not in r: errs.append('a dead address did not fail')
    elif '503' not in r['error'] and '500' not in r['error']: errs.append('the failure did not say what the server answered')

    # An episode whose file name looks like a host must not be mistaken for one.
    r=await probe('https://audio.example/LTANT7082404862.mp3')
    print('host-like file name ->',r)
    if r.get('url')!='https://audio.example/LTANT7082404862.mp3': errs.append('mangled a plain address')

    # The clip still comes from the address that answered.
    c=await pg.evaluate("""async (u)=>{try{const p=await FeedPod.probe(u);const c=await FeedPod.slice(p,2,7);
      return {seconds:c.seconds,bytes:c.bytes};}catch(e){return {error:e.message};}}""",'https://down.example/p/audio.example/ep.mp3')
    print('clip after falling back ->',c)
    if not (4.5 < (c.get('seconds') or 0) < 5.6): errs.append(f'clip length {c.get("seconds")} is not about 5 s')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
