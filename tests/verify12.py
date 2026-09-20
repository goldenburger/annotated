import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(1)
    A='#articleMode '; P='#podcastMode '; ANN='.annpage:not([hidden]) '
    print('== 1. Article screenshot')
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    await pg.fill(A+'.takeInput','Article check'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(.5)
    order=await pg.evaluate("[...document.querySelectorAll('.annpage:not([hidden]) .annCard > *')].map(e=>e.className.split(' ')[0]).filter(Boolean)")
    print('card order:', order)
    print('media order:', await pg.evaluate("[...document.querySelector('.annpage:not([hidden]) .media').children].map(e=>e.className)"))
    print('screenshot visible without clicking:', await pg.is_visible(ANN+'.pageShot img'), '| image loaded:', await pg.eval_on_selector(ANN+'.pageShot img','i=>i.naturalWidth>0'))
    print('== 2. Podcast clipping')
    await pg.click('.tab >> nth=3'); await asyncio.sleep(1.5)
    print('mode:', (await pg.inner_text(P+'.pkind')).strip() or await pg.eval_on_selector(P+'.pkind','e=>e.textContent'), '| waveform pixels:', await pg.eval_on_selector(P+'.wave','c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}'))
    # 90 second cap by typing
    await pg.fill(P+'.rStart','0:05'); await pg.press(P+'.rStart','Enter'); await pg.fill(P+'.rEnd','1:50'); await pg.press(P+'.rEnd','Enter'); await asyncio.sleep(.2)
    print('typed 0:05 to 1:50, got:', await pg.input_value(P+'.rStart'), 'to', await pg.input_value(P+'.rEnd'), '| length', await pg.inner_text(P+'.rLen'))
    # drag the end handle far right: still capped
    h=await pg.locator(P+'.hEnd').bounding_box(); tr=await pg.locator(P+'.track').bounding_box()
    await pg.mouse.move(h['x']+h['width']/2,h['y']+10); await pg.mouse.down(); await pg.mouse.move(tr['x']+tr['width']+40,h['y']+10,steps=10); await asyncio.sleep(1.2); await pg.mouse.up(); await asyncio.sleep(.4)
    print('after dragging the end handle past the edge, length:', await pg.inner_text(P+'.rLen'))
    # drag the whole range
    await pg.fill(P+'.rStart','0:40'); await pg.press(P+'.rStart','Enter'); await pg.fill(P+'.rEnd','0:48'); await pg.press(P+'.rEnd','Enter'); await asyncio.sleep(.3)
    r=await pg.locator(P+'.range').bounding_box()
    await pg.mouse.move(r['x']+r['width']/2,r['y']+10); await pg.mouse.down(); await pg.mouse.move(r['x']+r['width']/2+60,r['y']+10,steps=6); await pg.mouse.up(); await asyncio.sleep(.4)
    print('drag moved the clip to:', await pg.input_value(P+'.rStart'), 'to', await pg.input_value(P+'.rEnd'))
    # play selection plays the episode's range
    s0=float((await pg.input_value(P+'.rStart')).split(':')[0])*60+float((await pg.input_value(P+'.rStart')).split(':')[1])
    await pg.click(P+'.playSel'); await asyncio.sleep(1)
    print('play selection:', await pg.evaluate("[Math.round(document.getElementById('podAudio').currentTime*10)/10, document.getElementById('podAudio').paused]"), 'start', s0)
    await pg.evaluate("document.getElementById('podAudio').pause()")
    await pg.click(P+'.capBtn'); await pg.wait_for_selector(P+'.vCompose:not([hidden])',timeout=30000); await asyncio.sleep(.6)
    print('checks:', (await pg.eval_on_selector(P+'.vStatus','e=>e.textContent.replace(/\\s+/g," ")'))[:200])
    await pg.fill(P+'.takeInput','Podcast check'); await pg.click(P+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(.5)
    print('page:', await pg.inner_text(ANN+'.srcbar .sbTime'), '| clip length', await pg.eval_on_selector(ANN+'.clipAudio','a=>Math.round(a.duration*10)/10'))
    # protected audio is refused
    await pg.evaluate("Object.defineProperty(document.getElementById('podAudio'),'mediaKeys',{value:{}, configurable:true})")
    await pg.click('.tab >> nth=3'); await asyncio.sleep(.5)
    await pg.click(P+'.pubcard .new'); await asyncio.sleep(.3)
    await pg.click(P+'.capBtn'); await asyncio.sleep(.6)
    print('protected audio:', await pg.inner_text(P+'.capErr'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
