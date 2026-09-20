import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME)
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1440,'height':900},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(.8)
      A='#articleMode '; ANN='.annpage:not([hidden]) '
      await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
      await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
      await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
      await pg.fill(A+'.takeInput','The 61 percent figure comes from an employer survey.'); await pg.click(A+'.publish')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(2.2)
      order=await pg.evaluate("[...document.querySelector('.annpage:not([hidden]) .media').children].map(e=>e.className)")
      print(scheme, 'order in media:', order, '| caption:', await pg.inner_text(ANN+'.pageShot figcaption'))
      await pg.screenshot(path=f'shot1_{scheme}.png', clip={'x':0,'y':84,'width':1060,'height':816})
      await pg.click(ANN+'.shotZoom'); await asyncio.sleep(.2); print('opens full size:', await pg.is_visible('#annotated-shot'))
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
