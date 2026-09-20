import asyncio
from playwright.async_api import async_playwright
from _env import *
BASE="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# Simulate the browser bug: painting a <video> onto a canvas gives nothing.
BLANK_VIDEO = BASE + ";(()=>{const o=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(src,...a){if(src instanceof HTMLVideoElement)return;return o.call(this,src,...a)}})()"
BLANK_ALL = BASE + ";(()=>{const o=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(src,...a){if(src instanceof HTMLVideoElement||(typeof VideoFrame!=='undefined'&&src instanceof VideoFrame))return;return o.call(this,src,...a)}})()"
async def run(b, label, init):
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(init); await pg.goto(PREVIEW); await asyncio.sleep(6)
    V='#videoMode '
    print(f'[{label}] filmstrip showing frames:', await pg.eval_on_selector(V+'.track','e=>e.classList.contains("filmReady")'))
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','43'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn')
    # When no method gives a picture, the capture stops with a message instead of recording black.
    await pg.wait_for_selector(V+'.vCompose:not([hidden]), '+V+'.capErr:not([hidden])',timeout=20000)
    if await pg.is_visible(V+'.capErr'):
      print(f'[{label}] capture stopped:', (await pg.inner_text(V+'.capErr'))[:110]); print(f'[{label}] errors:', errs); await pg.close(); return
    for k in range(20):
      await asyncio.sleep(.5)
      if 'Checking' not in await pg.inner_text(V+'.ccMeta'): break
    st=await pg.eval_on_selector(V+'.vStatus','e=>e.textContent.replace(/\\s+/g," ")')
    import re
    fm=re.search(r'Frame method(.*?)(?:$|Clip)', st)
    print(f'[{label}] picture check:', 'Frames contain picture' in st and ('black' not in st), '| frame method:', fm.group(1).strip() if fm else None)
    print(f'[{label}] fail box shown:', await pg.is_visible(V+'.failBox'), '| card meta:', await pg.inner_text(V+'.ccMeta'))
    if await pg.is_visible(V+'.failBox'):
      await pg.fill(V+'.takeInput','x'); await pg.click(V+'.publish'); await asyncio.sleep(.3)
      print(f'[{label}] publishing asks first:', (await pg.inner_text(V+'.vDup')).replace('\n',' | '))
      await pg.click(V+'.vDup .dRetry'); await asyncio.sleep(.5)
      print(f'[{label}] Capture again restarts capture:', await pg.is_visible(V+'.progress') or await pg.eval_on_selector(V+'.capBtn','b=>b.disabled'))
    print(f'[{label}] errors:', errs)
    await pg.close()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    await run(b,'normal',BASE)
    await run(b,'video painting broken',BLANK_VIDEO)
    await run(b,'all painting broken',BLANK_ALL)
    await b.close()
asyncio.run(main())
