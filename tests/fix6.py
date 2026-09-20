import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':768})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    V='#videoMode '; ANN='.annpage:not([hidden]) '
    # hammer the trimmer to look for negative labels
    labels=set()
    box=await pg.locator(V+'.hStart').bounding_box(); tr=await pg.locator(V+'.track').bounding_box()
    for target in [tr['x']+tr['width']-4, tr['x']+2, tr['x']+tr['width']*0.9]:
      h=await pg.locator(V+'.hStart').bounding_box()
      await pg.mouse.move(h['x']+h['width']/2, h['y']+10); await pg.mouse.down()
      for k in range(12):
        await pg.mouse.move(h['x']+(target-h['x'])*(k+1)/12, h['y']+10); await asyncio.sleep(.05)
        labels.add(await pg.inner_text(V+'.vStart'))
      await pg.mouse.up(); await asyncio.sleep(.35); labels.add(await pg.inner_text(V+'.vStart'))
    print('any negative label:', any('-' in l for l in labels), sorted(labels)[:6])
    await pg.fill(V+'.rStart','44.3'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','45.5'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn')
    # spinner check: preview hidden until playable
    await pg.wait_for_selector(V+'.vResult:not([hidden])', timeout=20000)
    states=[]
    for k in range(20):
      states.append(await pg.eval_on_selector(V+'.vPreview','v=>[v.style.visibility, v.readyState]')); await asyncio.sleep(.1)
    print('visible before playable:', any(s[0]=='' and s[1]<3 for s in states))
    await pg.wait_for_selector(V+'.vCompose:not([hidden])', timeout=20000); await asyncio.sleep(.6)
    # picker inside panel
    await pg.click(V+'.emojiBtn'); await asyncio.sleep(.3)
    pr=await pg.eval_on_selector('.emojiPop','e=>{const r=e.getBoundingClientRect();return [r.left,r.right]}')
    pn=await pg.eval_on_selector('aside.panel','e=>{const r=e.getBoundingClientRect();return [r.left,r.right]}')
    print('picker inside panel:', pr[0]>=pn[0] and pr[1]<=pn[1], pr, pn)
    await pg.fill('.emojiPop .epSearch','hand over mouth'); await asyncio.sleep(.2)
    await pg.hover('.emojiPop .epE >> nth=0'); await asyncio.sleep(.1)
    print('footer:', await pg.inner_text('.emojiPop .epPrev'))
    await pg.fill('.emojiPop .epSearch',''); await asyncio.sleep(.2)
    print('headings:', await pg.evaluate("[...document.querySelectorAll('.emojiPop .epSec h4')].slice(0,5).map(h=>h.textContent)"))
    await pg.screenshot(path='fix_picker.png', clip={'x':986,'y':84,'width':380,'height':684})
    await pg.keyboard.press('Escape')
    # poll into view with question
    await pg.fill(V+'.takeInput','Watch the left edge.')
    await pg.click(V+'.pollBtn'); await asyncio.sleep(.6)
    vis=await pg.eval_on_selector(V+'.pollEdit','e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+2 && r.top>=0}')
    print('poll editor in view:', vis)
    await pg.fill(V+'.peQ','Is the color shift real?')
    await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    order=await pg.evaluate("(()=>{const c=document.querySelector('.annpage:not([hidden]) .annCard');const kids=[...c.children].map(k=>k.className.split(' ')[0]);return kids})()")
    print('card order:', order)
    print('poll question:', await pg.inner_text(ANN+'.pollQ'))
    print('reaction row hidden while empty:', await pg.eval_on_selector(ANN+'.reactHost','e=>e.hidden'))
    await pg.click(ANN+'.reactBtn'); await pg.click('.quickBar .qE >> nth=5'); await asyncio.sleep(.2)
    print('reactions after React:', (await pg.inner_text(ANN+'.reactHost')).replace('\n',' '), '| hidden:', await pg.eval_on_selector(ANN+'.reactHost','e=>e.hidden'))
    await pg.evaluate("document.querySelector('.annpage:not([hidden]) .actions').scrollIntoView({block:'center'})"); await asyncio.sleep(.2)
    await pg.screenshot(path='fix_page.png', clip={'x':0,'y':84,'width':986,'height':684})
    print('errors:', errs)
    await b.close()
asyncio.run(main())
