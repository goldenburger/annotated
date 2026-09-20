import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotatedPrefs',JSON.stringify({display:'float'}))}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':1366,'height':800}); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(1)
    fr=lambda: pg.eval_on_selector('.ff','e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}')
    print('frame starts below site headers and fits content:', await fr())
    print('inner wordmark row hidden:', not await pg.is_visible('.ffBody .brand'))
    V='#videoMode '; ANN='.annpage:not([hidden]) '
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','42'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000); await asyncio.sleep(.6)
    print('frame grew with the take step:', await fr())
    # frame bar gear and help
    await pg.click('.ff .ffX >> nth=0'); await asyncio.sleep(.2); print('gear in frame bar opens Display:', await pg.is_visible('.dmPop'))
    box=await pg.eval_on_selector('.dmPop','e=>{const r=e.getBoundingClientRect();return [r.x,r.right]}'); print('menu inside window:', box[1] <= 1366)
    await pg.keyboard.press('Escape')
    await pg.hover('.ff .ffX >> nth=1'); await asyncio.sleep(.1)
    tip=await pg.evaluate("(()=>{const b=document.querySelector('.ff .ffX:nth-of-type(2)')||document.querySelectorAll('.ff .ffX')[1];const r=b.getBoundingClientRect();const f=document.querySelector('.ff').getBoundingClientRect();return [Math.round(r.right), Math.round(f.right)]})()")
    print('help tooltip anchored inside frame (button right, frame right):', tip)
    await pg.click('.ff .ffX >> nth=1'); await asyncio.sleep(.2); print('help in frame bar opens welcome:', await pg.is_visible('.welcome')); await pg.click('.welcome .wGo')
    # publish -> annotation tab: frame shrinks automatically, returns on source tab
    await pg.fill(V+'.takeInput','Frame round two'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await asyncio.sleep(.3); print('auto-shrunk on annotation page:', await pg.is_visible('.ffPill'), not await pg.is_visible('.ff'))
    pill=await pg.eval_on_selector('.ffPill','e=>{const r=e.getBoundingClientRect();return [Math.round(r.right),Math.round(r.bottom)]}'); print('pill bottom-right:', pill)
    print('fresh class present then removed:', await pg.eval_on_selector(ANN+'.annCard','e=>e.classList.contains("fresh")'), end=' ')
    await asyncio.sleep(2.4); print(await pg.eval_on_selector(ANN+'.annCard','e=>e.classList.contains("fresh")'))
    await pg.evaluate("document.getElementById('pane').scrollTop=400"); await asyncio.sleep(.6)
    print('toast faded after scrolling:', await pg.locator(ANN+'.banner').count()==0)
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.3); print('frame back on source tab:', await pg.is_visible('.ff'))
    await pg.click('.tab >> nth=4'); await asyncio.sleep(.3); print('no replay on revisit:', not await pg.eval_on_selector(ANN+'.annCard','e=>e.classList.contains("fresh")'))
    # drag pill to top-left
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.3); await pg.click('.ff .ffMin'); await asyncio.sleep(.2)
    pb=await pg.locator('.ffPill').bounding_box()
    await pg.mouse.move(pb['x']+20,pb['y']+10); await pg.mouse.down(); await pg.mouse.move(120,160,steps=8); await pg.mouse.up(); await asyncio.sleep(.2)
    print('pill snapped to top-left:', await pg.eval_on_selector('.ffPill','e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)]}'), '| still shrunk:', await pg.is_visible('.ffPill'))
    await pg.click('.ffPill'); await asyncio.sleep(.2); print('click expands:', await pg.is_visible('.ff'))
    # resize by hand stops auto-fit
    h=await pg.locator('.ffResize.r').bounding_box()
    await pg.mouse.move(h['x']+9,h['y']+9); await pg.mouse.down(); await pg.mouse.move(h['x']+9,h['y']+60,steps=4); await pg.mouse.up(); await asyncio.sleep(.2)
    h1=(await fr())[3]; await pg.click(V+'.csChange'); await asyncio.sleep(.4); h2=(await fr())[3]
    print('manual height kept when content changes:', h1, h2, h1==h2)
    # dark theme selected option
    await pg.click('.ff .ffX >> nth=0'); await pg.check('.dmPop input[name="dm-theme"][value="dark"]'); await asyncio.sleep(.1)
    print('dark selected style:', await pg.eval_on_selector('.dmPop input[name="dm-theme"]:checked + span','e=>getComputedStyle(e).backgroundColor'))
    await pg.screenshot(path='disp2_dark.png')
    print('errors:', errs)
    await b.close()
asyncio.run(main())
