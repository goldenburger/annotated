import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    pg=await b.new_page(viewport={'width':1366,'height':768})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    V='#videoMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
    # typed time + play selection
    await pg.fill(V+'.rStart','1:04'); await pg.press(V+'.rStart','Enter'); await asyncio.sleep(.3)
    await pg.fill(V+'.rEnd','70'); await pg.press(V+'.rEnd','Enter'); await asyncio.sleep(.3)
    print('typed:', await pg.input_value(V+'.rStart'), await pg.input_value(V+'.rEnd'), await pg.inner_text(V+'.rLen'))
    print('slider aria:', await pg.get_attribute(V+'.hStart','aria-valuetext'), await pg.get_attribute(V+'.hEnd','role'))
    await pg.click(V+'.playSel'); await asyncio.sleep(1.2)
    t=await pg.evaluate('[document.getElementById("vid").currentTime, document.getElementById("vid").paused]'); print('playing selection:', t)
    await asyncio.sleep(5.5); t=await pg.evaluate('[document.getElementById("vid").currentTime, document.getElementById("vid").paused]'); print('stopped at end:', t)
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000); await asyncio.sleep(1.2)
    print('steps:', await pg.evaluate("[...document.querySelectorAll('#videoMode .steps li')].map(l=>l.className)"))
    print('result label visible under header:', await pg.evaluate("(()=>{const h=document.querySelector('#videoMode .phead').getBoundingClientRect();const r=document.querySelector('#videoMode .clipCard').getBoundingClientRect();return r.top>=h.bottom-1})()"))
    await pg.click(V+'.recBtn'); await asyncio.sleep(1.5); await pg.screenshot(path='p2_rec.png', clip={'x':986,'y':84,'width':380,'height':684})
    await pg.click(V+'.recStop'); await asyncio.sleep(.8)
    await pg.fill(V+'.takeInput','Watch the left edge.'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.5)
    print('steps after publish:', await pg.evaluate("[...document.querySelectorAll('#videoMode .steps li')].map(l=>l.className)"))
    await pg.screenshot(path='p2_pub.png', clip={'x':986,'y':84,'width':380,'height':684})
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    print('errors:', errs)
    await b.close()
asyncio.run(main())
