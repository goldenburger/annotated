import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':1440,'height':900}); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    V='#videoMode '; A='#articleMode '; P='#postMode '; ANN='.annpage:not([hidden]) '
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','46'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
    await pg.click(V+'.tagbtn >> text=Fact check'); await pg.fill(V+'.takeInput','The bars shift color right at 0:43.'); await pg.click(V+'.pollBtn'); await pg.click(V+'.publish')
    await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click(ANN+'.pollOpt >> nth=0'); await pg.click(ANN+'.reactBtn'); await pg.click('.quickBar .qE >> nth=5'); await pg.click(ANN+'.reactBtn'); await pg.click('.quickBar .qE >> nth=0')
    await pg.fill(ANN+'.cText','Good eye'); await pg.click(ANN+'.cPost')
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    await pg.fill(A+'.takeInput','The 61 percent figure comes from an employer survey.'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click('.tab >> nth=2'); await asyncio.sleep(.4); await pg.click(P+'.pGrab'); await pg.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000)
    await pg.fill(P+'.takeInput','Worth checking against the budget.'); await pg.click(P+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click(ANN+'.navHome'); await asyncio.sleep(.5)
    print('cards:', await pg.locator(ANN+'.card').count(), '| thumbs:', await pg.locator(ANN+'.cthumb').count(), '| zero counts shown:', 'comments' in (await pg.inner_text(ANN+'.cards')) and '0 comment' in (await pg.inner_text(ANN+'.cards')))
    for i in range(3):
      print(' card', i, (await pg.inner_text(ANN+f'.card >> nth={i}')).replace('\n',' | ')[:200])
    await pg.screenshot(path='pd_light.png', clip={'x':0,'y':84,'width':1060,'height':816})
    await pg.emulate_media(color_scheme='dark'); await asyncio.sleep(.2)
    await pg.screenshot(path='pd_dark.png', clip={'x':0,'y':84,'width':1060,'height':816})
    print('errors:', errs)
    await b.close()
asyncio.run(main())
