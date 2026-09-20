import asyncio
from playwright.async_api import async_playwright
from _env import *
BASE="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# Make only the after-capture picture check see black, so the clip fails a check.
CHECK_BLANK = BASE + ";(()=>{const o=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(src,...a){if(this.canvas.width===64)return;return o.call(this,src,...a)}})()"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(CHECK_BLANK); await pg.goto(PREVIEW); await asyncio.sleep(4)
    V='#videoMode '
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','43'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.failBox:not([hidden])',timeout=30000)
    print('fail box:', (await pg.inner_text(V+'.failBox')).replace('\n',' | '), '| card:', await pg.inner_text(V+'.ccMeta'))
    await pg.screenshot(path='r11_fail.png', clip={'x':986,'y':84,'width':380,'height':716})
    await pg.fill(V+'.takeInput','x'); await pg.click(V+'.publish'); await asyncio.sleep(.3)
    print('publish asks:', (await pg.inner_text(V+'.vDup')).replace('\n',' | '))
    await pg.click(V+'.vDup .dAny'); await pg.wait_for_selector('.annpage:not([hidden]) .ann:not(.loading)'); print('publish anyway worked')
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.4)
    print('errors:', errs)
    await b.close()
asyncio.run(main())
