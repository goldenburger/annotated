import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotatedPanelWidth','320')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(3)
    V='#videoMode '; P='#podcastMode '; ANN='.annpage:not([hidden]) '
    print('panel width:', await pg.eval_on_selector('aside.panel','e=>Math.round(e.getBoundingClientRect().width)'), '| narrow class:', await pg.eval_on_selector('aside.panel','e=>e.classList.contains("narrowPanel")'))
    print('short labels:', await pg.eval_on_selector(V+'.tools','e=>[...e.querySelectorAll("button")].map(b=>b.innerText.trim()).join(" | ")'), '| button heights:', await pg.eval_on_selector(V+'.tools','e=>[...e.querySelectorAll("button")].map(b=>Math.round(b.getBoundingClientRect().height)).join(",")'))
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','46'); await pg.press(V+'.rEnd','Enter'); await asyncio.sleep(.5)
    print('dimmed outside:', await pg.evaluate("[document.querySelector('#videoMode .dimL').style.width, document.querySelector('#videoMode .dimR').style.left]"))
    await pg.click(V+'.playSel'); await asyncio.sleep(.6); print('while playing:', await pg.inner_text(V+'.playSel'))
    await pg.click(V+'.playSel'); await asyncio.sleep(.3); print('after Stop:', await pg.inner_text(V+'.playSel'), '| paused:', await pg.evaluate("document.getElementById('vid').paused"))
    await pg.click(V+'.playSel'); await asyncio.sleep(7.5); print('after the range ends:', await pg.inner_text(V+'.playSel'))
    h=await pg.locator(V+'.hEnd').bounding_box(); await pg.mouse.move(h['x']+8,h['y']+20); await pg.mouse.down(); await pg.mouse.move(h['x']+20,h['y']+20,steps=3)
    print('scale hidden during drag:', await pg.eval_on_selector(V+'.scale','e=>getComputedStyle(e).visibility'))
    await pg.mouse.up()
    # podcast: no empty shell
    await pg.click('.tab >> nth=3')
    states=[]
    for k in range(15):
      states.append(await pg.evaluate("(()=>{const m=document.getElementById('podcastMode');return m.hidden?'hidden':(document.querySelector('#podcastMode .vTitle').textContent?'ready':'EMPTY')})()")); await asyncio.sleep(.05)
    print('podcast panel states after switching:', sorted(set(states)))
    # publish two and check side view
    await asyncio.sleep(1.5)
    await pg.fill(P+'.rStart','50'); await pg.press(P+'.rStart','Enter'); await pg.fill(P+'.rEnd','52'); await pg.press(P+'.rEnd','Enter')
    await pg.click(P+'.capBtn'); await pg.wait_for_selector(P+'.vCompose:not([hidden])',timeout=20000)
    await pg.fill(P+'.takeInput','Podcast take'); await pg.click(P+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(.6)
    print('side view:', (await pg.inner_text('#annMode .sideNow')).replace('\n',' | '))
    print('list line:', await pg.inner_text('#annMode .sideList .note >> nth=0'), '| current marked:', await pg.inner_text('#annMode .sideList [aria-current] .nowBadge'))
    await pg.screenshot(path='r10_side.png', clip={'x':1040,'y':84,'width':326,'height':600})
    print('errors:', errs)
    await b.close()
asyncio.run(main())
