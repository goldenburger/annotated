import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotatedPrefs',JSON.stringify({display:'float'}))}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(1)
    sb=lambda: pg.eval_on_selector('.ffBody > .panel','e=>e.scrollHeight>e.clientHeight+1')
    print('no scrollbar when content fits:', not await sb())
    print('bar tooltip only on grip:', await pg.eval_on_selector('.ffBar','e=>!e.hasAttribute("title")'), await pg.eval_on_selector('.ffGrip','e=>!!e.title'))
    V='#videoMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
    await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','42'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000); await asyncio.sleep(.6)
    print('no scrollbar in take step:', not await sb())
    h0=await pg.eval_on_selector('.ff','e=>e.getBoundingClientRect().height')
    await pg.click(V+'.emojiBtn'); await asyncio.sleep(.5)
    h1=await pg.eval_on_selector('.ff','e=>e.getBoundingClientRect().height')
    pr=await pg.eval_on_selector('.emojiPop','e=>e.getBoundingClientRect().height')
    tabs=await pg.evaluate("(()=>{const t=[...document.querySelectorAll('.emojiPop .epTab')];const r=document.querySelector('.emojiPop .epTabs').getBoundingClientRect();return t.every(x=>x.getBoundingClientRect().right<=r.right+1)})()")
    print('frame grew for picker:', round(h0),'->',round(h1), '| picker height:', round(pr), '| all tabs fit:', tabs)
    await pg.click('.emojiPop .epE >> nth=2'); await asyncio.sleep(.3)
    print('focus back in take box:', await pg.evaluate("document.activeElement.classList.contains('takeInput')"))
    await asyncio.sleep(.4); h2=await pg.eval_on_selector('.ff','e=>e.getBoundingClientRect().height'); print('frame shrinks back after picker:', round(h2))
    await pg.press(V+'.takeInput','Control+Enter'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('clip ready at reveal (readyState):', await pg.eval_on_selector(ANN+'.clipVideo','v=>v.readyState'), '| clip not animated:', await pg.eval_on_selector(ANN+'.clip','e=>getComputedStyle(e).animationName'))
    print('toast not pinned:', await pg.eval_on_selector(ANN+'.banner','e=>getComputedStyle(e).position'))
    await pg.evaluate("document.getElementById('pane').scrollTop=300"); await asyncio.sleep(.6)
    print('toast still there after scrolling:', await pg.locator(ANN+'.banner').count()==1)
    # comments: jumbo + undo
    await pg.fill(ANN+'.cText','🎃'); await pg.click(ANN+'.cPost'); await pg.fill(ANN+'.cText','nice one'); await pg.click(ANN+'.cPost'); await asyncio.sleep(.2)
    print('jumbo classes:', await pg.evaluate("[...document.querySelectorAll('.annpage:not([hidden]) .cmt p')].map(p=>p.className||'-')"))
    await pg.click(ANN+'.cDel >> nth=0'); await asyncio.sleep(.2); print('after delete:', await pg.inner_text(ANN+'.cTitle'), '|', await pg.inner_text(ANN+'.cUndo'))
    await pg.click(ANN+'.cUndoBtn'); await asyncio.sleep(.2); print('after undo:', await pg.inner_text(ANN+'.cTitle'))
    # Change after publish starts fresh
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.4)
    await pg.click(V+'.csChange'); await asyncio.sleep(.3)
    print('Change after publish clears old cards:', not await pg.is_visible(V+'.vPublished'), not await pg.is_visible(V+'.vResult'), '| step:', await pg.evaluate("[...document.querySelectorAll('#videoMode .steps li')].map(l=>l.className)"))
    # long passage clamp
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const ps=document.querySelectorAll(".story p");const r=document.createRange();r.setStart(ps[1].firstChild,0);r.setEnd(ps[2].firstChild,60);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    print('long passage clamped with Show all:', await pg.is_visible(A+'.qMore'), await pg.eval_on_selector(A+'.selQuote','e=>Math.round(e.clientHeight)'))
    await pg.click(A+'.qMore'); await asyncio.sleep(.1); print('expanded:', await pg.eval_on_selector(A+'.selQuote','e=>Math.round(e.clientHeight)'), await pg.inner_text(A+'.qMore'))
    # open from rail at top
    await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    await pg.fill(A+'.takeInput','second'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    await pg.click(ANN+'.railOpen >> nth=0'); await asyncio.sleep(.3)
    print('opened from rail at top:', await pg.evaluate("document.getElementById('pane').scrollTop"))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
