import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1366,'height':800},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(4)
      V='#videoMode '; A='#articleMode '; P='#podcastMode '; ANN='.annpage:not([hidden]) '
      film=await pg.eval_on_selector(V+'.film','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return [c.width,c.height,n]}')
      print(scheme,'filmstrip (w,h,painted):', film)
      await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','46'); await pg.press(V+'.rEnd','Enter'); await asyncio.sleep(.6)
      await pg.click(V+'.nudge.fwd >> nth=0'); await pg.click(V+'.nudge.fwd >> nth=0'); await pg.click(V+'.nudge >> nth=3'); await asyncio.sleep(.2)
      print('after nudges:', await pg.input_value(V+'.rStart'), await pg.input_value(V+'.rEnd'))
      h=await pg.locator(V+'.hEnd').bounding_box(); await pg.mouse.move(h['x']+8,h['y']+20); await pg.mouse.down(); await pg.mouse.move(h['x']+30,h['y']+20,steps=4)
      print('bubble while dragging:', await pg.eval_on_selector(V+'.hEnd .hBubble','e=>[getComputedStyle(e).opacity,e.textContent]'))
      await pg.screenshot(path=f'r9_{scheme}_trim.png', clip={'x':986,'y':84,'width':380,'height':420})
      await pg.mouse.up(); await asyncio.sleep(.4)
      await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
      await pg.click(V+'.pollBtn'); await pg.fill(V+'.takeInput','The bars shift color right at 0:43. Watch the left edge.'); await pg.click(V+'.tagbtn >> text=Fact check'); await pg.click(V+'.publish')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(2.2)
      print('source line:', (await pg.inner_text(ANN+'.srcbar')).replace('\n',' | '), '| inside media unit:', await pg.evaluate("!!document.querySelector('.annpage:not([hidden]) .mediaUnit.av .srcbar') && !!document.querySelector('.annpage:not([hidden]) .mediaUnit.av .pollBox')"))
      print('About shown first visit:', await pg.locator(ANN+'.railcard.about').count())
      await pg.evaluate("document.getElementById('pane').scrollTop=330"); await asyncio.sleep(.3)
      await pg.screenshot(path=f'r9_{scheme}_page.png', clip={'x':0,'y':84,'width':986,'height':716})
      # podcast mode switch
      await pg.click('.tab >> nth=3'); await asyncio.sleep(1.5)
      # article wording
      await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
      await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()'''); await asyncio.sleep(.6)
      print('selection wording:', await pg.inner_text(A+'.selCount'), '|', await pg.inner_text(A+'.selNote'), '|', await pg.inner_text(A+'.exactBtn'))
      await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
      await pg.fill(A+'.takeInput','Survey caveat'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(.5)
      print('About on second page:', await pg.locator(ANN+'.railcard.about').count())
      # comment on the video one to test sort
      await pg.click('.tab >> nth=4'); await pg.fill(ANN+'.cText','nice'); await pg.click(ANN+'.cPost')
      await pg.click(ANN+'.navHome'); await asyncio.sleep(.4)
      print('newest first:', await pg.inner_text(ANN+'.card .ctake >> nth=0'))
      await pg.click(ANN+'.feedSort label >> nth=1'); await asyncio.sleep(.2)
      print('most discussed first:', await pg.inner_text(ANN+'.card .ctake >> nth=0'))
      print('source line on card:', await pg.inner_text(ANN+'.card .csn >> nth=0'))
      await pg.click(ANN+'.cplayBtn >> nth=0'); await asyncio.sleep(.8)
      print('inline player:', await pg.eval_on_selector(ANN+'.cardPlayer video','v=>[v.readyState, !v.paused]'), '| still on feed:', await pg.is_visible(ANN+'.feedFilter'))
      await pg.screenshot(path=f'r9_{scheme}_feed.png', clip={'x':0,'y':84,'width':986,'height':716})
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
