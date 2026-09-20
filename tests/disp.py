import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':1366,'height':800}); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(PREVIEW); await asyncio.sleep(.8)
    # welcome offers the choice
    print('welcome has display choice:', await pg.is_visible('.wDisplay'))
    await pg.check('.wDisplay input[value="float"]'); await pg.click('.welcome .wGo'); await asyncio.sleep(.4)
    print('floating after welcome:', await pg.is_visible('.ff'), '| page wider:', await pg.eval_on_selector('#pane','e=>Math.round(e.getBoundingClientRect().width)'))
    await pg.screenshot(path='disp_float.png')
    ff=await pg.eval_on_selector('.ff','e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}'); print('frame rect:', [round(v) for v in ff])
    # drag toward the left edge (should snap)
    bar=await pg.locator('.ffBar').bounding_box()
    await pg.mouse.move(bar['x']+120, bar['y']+14); await pg.mouse.down(); await pg.mouse.move(40, 300, steps=10); await pg.mouse.up(); await asyncio.sleep(.35)
    ff2=await pg.eval_on_selector('.ff','e=>{const r=e.getBoundingClientRect();return [r.x,r.y]}'); print('after drag near left edge:', [round(v) for v in ff2])
    # resize from bottom-right corner
    h=await pg.locator('.ffResize.r').bounding_box()
    await pg.mouse.move(h['x']+9,h['y']+9); await pg.mouse.down(); await pg.mouse.move(h['x']+109,h['y']-91, steps=6); await pg.mouse.up(); await asyncio.sleep(.2)
    ff3=await pg.eval_on_selector('.ff','e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}'); print('resized:', [round(v) for v in ff3])
    # collapse/expand via shortcut and toolbar
    await pg.keyboard.press('Alt+Shift+K'); await asyncio.sleep(.2); print('shortcut shrinks to pill:', await pg.is_visible('.ffPill'), not await pg.is_visible('.ff'))
    await pg.click('#toggle'); await asyncio.sleep(.2); print('toolbar restores:', await pg.is_visible('.ff'))
    # remembered position after reload
    await pg.reload(); await asyncio.sleep(.8); ff4=await pg.eval_on_selector('.ff','e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}')
    print('restored after reload:', [round(v) for v in ff4])
    # capture works in floating mode
    V='#videoMode '; ANN='.annpage:not([hidden]) '
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','42'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
    # preferences
    await pg.click('.ff .ffX >> nth=0'); await asyncio.sleep(.2)
    await pg.screenshot(path='disp_menu.png')
    await pg.check('.dmPop input[name="dm-afterPublish"][value="close"]')
    await pg.check('.dmPop input[name="dm-theme"][value="dark"]'); await asyncio.sleep(.1)
    print('dark theme applied:', await pg.evaluate("document.documentElement.getAttribute('data-theme')"), '| frame dark:', await pg.eval_on_selector('.ff','e=>e.classList.contains("dark")'))
    await pg.check('.dmPop input[name="dm-density"][value="compact"]'); print('compact:', await pg.evaluate("document.body.classList.contains('compact')"))
    await pg.click('.dmPop .dmSwitch'); await pg.click('.dmPop .dmDone')
    await pg.fill(V+'.takeInput','Floating mode works'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(.3)
    print('after publish, shrank to pill:', await pg.is_visible('.ffPill'))
    await pg.click('.ffPill'); await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); print('page Annotate button hidden when off:', not await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"))
    await pg.screenshot(path='disp_dark_compact.png')
    # back to side panel
    await pg.click('.ff .ffX >> nth=0'); await asyncio.sleep(.3); await pg.screenshot(path='disp_dbg.png')
    print('pop open:', await pg.locator('.dmPop').count())
    await pg.click('.dmPop input[name="dm-display"][value="side"]', force=True); await asyncio.sleep(.3)
    print('back to side panel:', not await pg.is_visible('.ff'), await pg.is_visible('aside.panel'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
