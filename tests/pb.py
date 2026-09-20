import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1366,'height':700},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
      await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
      A='#articleMode '; ANN='.annpage:not([hidden]) '
      await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
      await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
      await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.8)
      pb=await pg.eval_on_selector(A+'.publish','e=>{const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom), innerHeight]}')
      print(scheme,'publish in view at 700 tall:', pb, pb[1]<=pb[2])
      print('hint:', await pg.inner_text(A+'.publishHint'), '| counter visible:', await pg.eval_on_selector(A+'.count','e=>getComputedStyle(e).visibility'))
      h0=await pg.eval_on_selector(A+'.takeInput','e=>e.offsetHeight')
      await pg.fill(A+'.takeInput', 'The 61 percent figure comes from a survey that employers handed out, so the sample may lean toward workers who already want the service. '*3)
      h1=await pg.eval_on_selector(A+'.takeInput','e=>e.offsetHeight')
      print('box grows:', h0,'->',h1, '| counter:', await pg.eval_on_selector(A+'.count','e=>[getComputedStyle(e).visibility, e.textContent]'))
      print('hint now:', await pg.inner_text(A+'.publishHint'))
      await pg.screenshot(path=f'pb_{scheme}_1.png', clip={'x':986,'y':84,'width':380,'height':616})
      await pg.focus(A+'.pollBtn'); await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab'); await asyncio.sleep(.2)
      await pg.screenshot(path=f'pb_{scheme}_2.png', clip={'x':986,'y':84,'width':380,'height':616})
      tip=await pg.eval_on_selector(A+'.pollBtn','e=>getComputedStyle(e,"::after").opacity')
      print('tooltip on keyboard focus opacity:', tip)
      await pg.fill(A+'.takeInput','Short take'); await pg.press(A+'.takeInput','Control+Enter')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)',timeout=8000); print('ctrl+enter published:', await pg.inner_text(ANN+'.take'))
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
