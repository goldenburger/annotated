import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1400,'height':900})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    V='#videoMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
    await pg.evaluate('document.getElementById("vid").currentTime=66'); await asyncio.sleep(.8); await pg.click(V+'.setStart')
    await pg.evaluate('document.getElementById("vid").currentTime=68'); await asyncio.sleep(.8); await pg.click(V+'.setEnd')
    await asyncio.sleep(.6)
    print('zoom window:', (await pg.inner_text(V+'.scale')).replace('\n',' to '))
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
    await pg.fill(V+'.takeInput','first video'); await pg.click(V+'.publish')
    await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('pane paper bg:', await pg.evaluate("document.getElementById('pane').classList.contains('paperbg')"))
    first_tab=await pg.inner_text('#urlbar')
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.5)
    await pg.click(V+'.csChange')
    print('button after publish:', await pg.inner_text(V+'.capBtn'), '|', await pg.get_attribute(V+'.capBtn','class'))
    await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
    await pg.fill(V+'.takeInput','dup video'); await pg.click(V+'.publish'); await asyncio.sleep(.4)
    print('dup warning:', await pg.inner_text(V+'.vDup'))
    await pg.click(V+'.vDup .dView'); await asyncio.sleep(.3)
    print('view it ->', await pg.inner_text('#urlbar') == first_tab)
    print('banner hidden on revisit? (left once before):', await pg.locator(ANN+'.banner').count())
    await pg.click('.tab >> nth=0'); await asyncio.sleep(.4)
    if await pg.is_visible(V+'.csChange'): await pg.click(V+'.csChange')
    # change range after publish -> fresh
    await pg.evaluate('document.getElementById("vid").currentTime=20'); await asyncio.sleep(.6); await pg.click(V+'.setStart')
    await asyncio.sleep(.5); print('result cleared after range change:', not await pg.is_visible(V+'.vResult'))
    # article
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.5)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[0].firstChild;const r=document.createRange();r.setStart(p,20);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5)
    print('count box:', await pg.inner_text(A+'.selFoot'), '| mode:', await pg.inner_text(A+'.selMode'))
    await pg.screenshot(path='r4_sel.png', clip={'x':1000,'y':80,'width':400,'height':320})
    await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    await pg.fill(A+'.takeInput','article one'); await pg.click(A+'.publish')
    await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    # comments
    for i in range(7):
        await pg.fill(ANN+'.cText',f'c{i}'); await pg.press(ANN+'.cText','Control+Enter')
    print('comments shown:', await pg.locator(ANN+'.cmt').count(), '|', await pg.inner_text(ANN+'.cMore'), '| first:', await pg.inner_text(ANN+'.cmt >> nth=0'))
    await pg.click(ANN+'.cDel >> nth=0'); print('after delete title:', await pg.inner_text(ANN+'.cTitle'))
    # source jump
    await pg.click(ANN+'.srccard'); await asyncio.sleep(.5)
    print('source jump ->', await pg.inner_text('#urlbar'), '| flash set:', await pg.evaluate("CSS.highlights.has('annotated-flash')"))
    await pg.screenshot(path='r4_jump.png')
    # new selection after publish -> fresh
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,0);r.setEnd(p,30);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5)
    print('fresh after publish: result hidden', not await pg.is_visible(A+'.aResult'), '| button:', await pg.inner_text(A+'.grab'))
    # side panel list and delete
    await pg.click('.tab >> nth=4'); await asyncio.sleep(.4)
    print('side list:', (await pg.inner_text('#annMode ul')).replace('\n',' | '))
    await pg.click('#annMode .sideDelBtn'); await pg.click('#annMode .sdYes'); await asyncio.sleep(.4)
    print('tabs after side delete:', await pg.evaluate("[...document.querySelectorAll('.tab')].map(t=>t.textContent)"))
    # delete from page
    await pg.click('.tab >> nth=4'); await asyncio.sleep(.3)
    await pg.click(ANN+'.moreBtn'); await pg.click(ANN+'.delBtn'); await pg.click(ANN+'.delYes'); await asyncio.sleep(.4)
    print('tabs after page delete:', await pg.evaluate("[...document.querySelectorAll('.tab')].map(t=>t.textContent)"), '| url:', await pg.inner_text('#urlbar'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
