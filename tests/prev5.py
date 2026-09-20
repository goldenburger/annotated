import asyncio, base64
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':1366,'height':720}); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    V='#videoMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
    # edge pan: drag range far right
    box=await pg.locator(V+'.range').bounding_box(); tr=await pg.locator(V+'.track').bounding_box()
    print('view before:', (await pg.inner_text(V+'.scale')).replace('\n',' to '))
    await pg.mouse.move(box['x']+box['width']/2, box['y']+10); await pg.mouse.down()
    await pg.mouse.move(tr['x']+tr['width']-5, box['y']+10, steps=8); await asyncio.sleep(1.2)
    print('during drag at edge:', (await pg.inner_text(V+'.readout')).replace('\n',' '), '| view', (await pg.inner_text(V+'.scale')).replace('\n',' to '))
    await pg.mouse.up(); await asyncio.sleep(.5)
    rng=await pg.locator(V+'.range').bounding_box(); tr=await pg.locator(V+'.track').bounding_box()
    print('range inside track after release:', rng['x']>=tr['x']-2 and rng['x']+rng['width']<=tr['x']+tr['width']+8)
    await pg.evaluate('document.getElementById("vid").currentTime=64'); await asyncio.sleep(.8); await pg.click(V+'.setStart')
    await pg.evaluate('document.getElementById("vid").currentTime=65'); await asyncio.sleep(.8); await pg.click(V+'.setEnd')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000); await asyncio.sleep(1)
    print('summary:', await pg.inner_text(V+'.csText'), '| trimmer hidden:', not await pg.is_visible(V+'.clipper'))
    st=await pg.eval_on_selector(V+'.vPreview','v=>[v.currentTime, v.duration, v.style.visibility]')
    print('preview time/duration/visibility:', st, '| status:', await pg.inner_text(V+'.status'))
    pub=await pg.locator(V+'.publish').bounding_box(); take=await pg.locator(V+'.takeInput').bounding_box()
    print('take box visible in 720px window:', take['y']+take['height'] <= 720, '| publish y', round(pub['y']))
    await pg.screenshot(path='r5_panel.png')
    await pg.click(V+'.csChange'); await asyncio.sleep(.3); print('change shows trimmer:', await pg.is_visible(V+'.clipper'))
    await pg.click(V+'.csChange') if await pg.is_visible(V+'.csChange') else None
    await pg.fill(V+'.takeInput','v'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('anchors to source on page:', await pg.locator(ANN+'a.srccard').count(), '| buttons:', await pg.locator(ANN+'.srcJump').count())
    await pg.click(ANN+'.srccard'); await asyncio.sleep(.4); print('card ->', await pg.inner_text('#urlbar'))
    # article
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000); await asyncio.sleep(.8)
    src=await pg.get_attribute(A+'.shot','src'); open('r5_shot.jpg','wb').write(base64.b64decode(src.split(',')[1]))
    from PIL import Image; print('shot size:', Image.open('r5_shot.jpg').size)
    await pg.fill(A+'.takeInput','a'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click(ANN+'.srccard'); await asyncio.sleep(.4); print('from link ->', await pg.inner_text('#urlbar'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
