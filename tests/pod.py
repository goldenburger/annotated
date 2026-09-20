import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1366,'height':800},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
      await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(.8)
      P='#podcastMode '; ANN='.annpage:not([hidden]) '
      await pg.click('.tab >> nth=3'); await asyncio.sleep(1.5)
      print(scheme, 'header:', (await pg.inner_text(P+'.phead')).replace('\n',' | ')[:120])
      wave=await pg.eval_on_selector(P+'.wave','c=>{const g=c.getContext("2d");const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return [c.width,c.height,n]}')
      print('waveform in trimmer (w, h, painted pixels):', wave)
      await pg.screenshot(path=f'pod_{scheme}_1.png', clip={'x':0,'y':84,'width':1366,'height':716})
      await pg.fill(P+'.rStart','1:02'); await pg.press(P+'.rStart','Enter'); await pg.fill(P+'.rEnd','1:14'); await pg.press(P+'.rEnd','Enter')
      await pg.click(P+'.capBtn'); await pg.wait_for_selector(P+'.vCompose:not([hidden])',timeout=30000); await asyncio.sleep(.8)
      print('clip card:', (await pg.inner_text(P+'.clipCard')).replace('\n',' | '))
      await pg.keyboard.press('Shift+D'); await asyncio.sleep(.2)
      print('checks:', (await pg.inner_text(P+'.vStatus')).replace('\n',' | ')[:300]); await pg.keyboard.press('Shift+D')
      src=await pg.get_attribute(P+'.ccPoster','src'); print('waveform picture:', src[:22], len(src))
      await pg.screenshot(path=f'pod_{scheme}_2.png', clip={'x':986,'y':84,'width':380,'height':716})
      await pg.fill(P+'.takeInput','The twelve passengers bar is too low to prove much.'); await pg.click(P+'.tagbtn >> text=Hot take'); await pg.click(P+'.publish')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(2.3)
      print('page audio ready:', await pg.eval_on_selector(ANN+'.clipAudio','a=>[a.readyState, Math.round(a.duration*10)/10]'), '| source card:', (await pg.inner_text(ANN+'.srccard')).replace('\n',' | '))
      await pg.screenshot(path=f'pod_{scheme}_3.png', clip={'x':0,'y':84,'width':986,'height':716})
      await pg.click(ANN+'.srcJump >> nth=0'); await asyncio.sleep(.3)
      print('listen link goes back to the episode at the clip start:', await pg.inner_text('#urlbar'), round(await pg.evaluate("document.getElementById('podAudio').currentTime"),1))
      await pg.click('.tab >> nth=4'); await pg.click(ANN+'.navHome'); await asyncio.sleep(.4)
      print('feed filter:', (await pg.inner_text(ANN+'.feedFilter')).replace('\n',' '), '| card:', (await pg.inner_text(ANN+'.card')).replace('\n',' | ')[:160])
      await pg.screenshot(path=f'pod_{scheme}_4.png', clip={'x':0,'y':84,'width':986,'height':716})
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
