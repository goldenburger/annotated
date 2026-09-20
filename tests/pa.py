import asyncio, sys
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1366,'height':768},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
      await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
      V='#videoMode '; A='#articleMode '; P='#postMode '
      top=await pg.evaluate("(()=>{const a=document.querySelector('aside.panel').getBoundingClientRect();const h=document.querySelector('#videoMode .phead').getBoundingClientRect();return [Math.round(h.bottom-a.top), Math.round(h.height)]})()")
      print(scheme,'header bottom from panel top, header height:', top)
      await pg.screenshot(path=f'pa_{scheme}_1.png', clip={'x':986,'y':84,'width':380,'height':684})
      await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','46'); await pg.press(V+'.rEnd','Enter')
      await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000); await asyncio.sleep(1)
      await pg.screenshot(path=f'pa_{scheme}_2.png', clip={'x':986,'y':84,'width':380,'height':684})
      pub=await pg.eval_on_selector(V+'.publish','e=>Math.round(e.getBoundingClientRect().bottom)')
      print(scheme,'publish bottom (window 768):', pub, '| status visible:', await pg.is_visible(V+'.status'), '| compact:', await pg.eval_on_selector(V+'.phead','e=>e.classList.contains("scrolled")'))
      await pg.click(V+'.ccThumb'); await asyncio.sleep(.3); print('player opens:', await pg.is_visible(V+'.vPreview'))
      await pg.click(V+'.ccThumb')
      await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
      await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
      await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.8)
      await pg.screenshot(path=f'pa_{scheme}_3.png', clip={'x':986,'y':84,'width':380,'height':684})
      await pg.click('.tab >> nth=2'); await asyncio.sleep(.4)
      await pg.screenshot(path=f'pa_{scheme}_4.png', clip={'x':986,'y':84,'width':380,'height':684})
      await pg.click('.tab >> nth=0'); await asyncio.sleep(.3)
      await pg.click(V+'.csChange'); await asyncio.sleep(.3)
      print('trim tip hidden on second view:', not await pg.is_visible(V+'.tip[data-tip="trim"]'))
      await pg.click(V+'.tipBtn'); print('tip shows on ?:', await pg.is_visible(V+'.tip[data-tip="trim"]'))
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
