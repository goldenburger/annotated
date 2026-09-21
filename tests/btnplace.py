# The recording on 2026-09-21 showed the Annotate button sitting on X's left navigation, beside the post but
# inside another column, so it read as part of X rather than as part of the passage. The margin is only used
# when the margin is empty.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
CROWDED=('<!doctype html><html><head><meta charset="utf-8"><title>Post</title></head><body style="margin:0">'
         '<nav id="nav" style="position:fixed;left:0;top:0;width:300px;height:100%;background:#eef">'
         '<p style="padding:20px">Home</p><p style="padding:20px">Explore</p><p style="padding:20px">Messages</p></nav>'
         '<aside id="side" style="position:fixed;left:900px;top:0;width:300px;height:100%;background:#efe">'
         '<p style="padding:20px">What is happening</p></aside>'
         '<article style="margin-left:320px;width:560px"><h1>Harbor story</h1>'
         '<p id="a">The council met on a Tuesday to talk about the overnight buses, and every member arrived on time.</p>'
         '</article></body></html>')
ROOMY=('<!doctype html><html><head><meta charset="utf-8"><title>Story</title></head><body style="margin:0">'
       '<article style="margin:0 auto;width:520px"><h1>Harbor story</h1>'
       '<p id="a">The council met on a Tuesday to talk about the overnight buses, and every member arrived on time.</p>'
       '</article></body></html>')
PICK="""()=>{const n=document.getElementById('a').firstChild;
  const r=document.createRange(); r.setStart(n,4); r.setEnd(n,40);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);}"""
WHERE="""()=>{const h=document.querySelector('.annotated-ui');
  if(!h||h.style.display==='none') return null;
  const b=h.getBoundingClientRect(); const p=document.getElementById('a').getBoundingClientRect();
  const hits=(el)=>{ if(!el) return false; const n=el.getBoundingClientRect();
    return !(b.right<=n.left||b.left>=n.right||b.bottom<=n.top||b.top>=n.bottom); };
  const over=hits(document.getElementById('nav'))||hits(document.getElementById('side'));
  return {x:Math.round(b.left), y:Math.round(b.top), w:Math.round(b.width), h:Math.round(b.height),
          pLeft:Math.round(p.left), pTop:Math.round(p.top), overNav:over};}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profBTN'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.route('https://crowded.example/**',lambda r: r.fulfill(status=200,body=CROWDED,headers={'Content-Type':'text/html; charset=utf-8'}))
    await ctx.route('https://roomy.example/**',lambda r: r.fulfill(status=200,body=ROOMY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    if not sw: errs.append('the extension never started')

    # A column beside the passage. The button goes above the line instead.
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':1200,'height':700})
    await pg.goto('https://crowded.example/post'); await asyncio.sleep(1.3)
    await pg.evaluate(PICK); await asyncio.sleep(.6)
    a=await pg.evaluate(WHERE)
    print('beside a navigation column:',a)
    if not a: errs.append('no Annotate button appeared beside the passage')
    else:
      if a['overNav']: errs.append(f"the button sat on another column at x {a['x']}")
      if a['y'] + a['h'] > a['pTop']: errs.append('the button did not move above the first line')

    # Nothing but empty page beside the passage. The margin is used, as before.
    pg2=await ctx.new_page(); await pg2.set_viewport_size({'width':1200,'height':700})
    await pg2.goto('https://roomy.example/story'); await asyncio.sleep(1.3)
    await pg2.evaluate(PICK); await asyncio.sleep(.6)
    b=await pg2.evaluate(WHERE)
    print('with an empty margin:',b)
    if not b: errs.append('no Annotate button appeared on the roomy page')
    elif b['x'] + b['w'] > b['pLeft']: errs.append(f"the button covered the passage at x {b['x']}")

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
