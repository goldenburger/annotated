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
    P='#postMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
    await pg.click('.tab >> nth=2'); await asyncio.sleep(.5)
    print('post panel:', (await pg.inner_text(P+'.phead')).replace('\n',' | '), '|', await pg.inner_text(P+'.pText'))
    await pg.check(P+'input[value="both"]')
    await pg.click(P+'.pGrab'); await pg.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000)
    print('status:', await pg.inner_text(P+'.status'))
    await pg.click(P+'.tagbtn >> text=Receipts'); await pg.fill(P+'.takeInput','Worth checking the $2.4 million figure against the budget.')
    await pg.click(P+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('embed card:', await pg.locator(ANN+'.xembed').count(), '| screenshot:', await pg.locator(ANN+'.xshot').count())
    await pg.screenshot(path='r6_post.png')
    # edit
    await pg.click(ANN+'.moreBtn'); await pg.click(ANN+'.editBtn'); await pg.fill(ANN+'.editText','Edited take'); await pg.click(ANN+'.editBox .tagbtn >> text=Fact check'); await pg.click(ANN+'.editSave')
    print('after edit:', await pg.inner_text(ANN+'.take'), '|', await pg.inner_text(ANN+'.tagSlot'), '| tab:', await pg.inner_text('.tab >> nth=4'))
    print('side list:', (await pg.inner_text('#annMode ul')).replace('\n',' | '))
    await pg.click(ANN+'.xlink'); await asyncio.sleep(.4); print('view on X ->', await pg.inner_text('#urlbar'))
    # dup
    await pg.click(P+'.pPublished .new'); await pg.click(P+'.pGrab'); await pg.wait_for_selector(P+'.pCompose:not([hidden])',timeout=15000)
    await pg.fill(P+'.takeInput','again'); await pg.click(P+'.publish'); await asyncio.sleep(.4)
    print('dup:', (await pg.inner_text(P+'.pDup')).split('\n')[0])
    # article description on card
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    await pg.fill(A+'.takeInput','a'); await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('card description:', await pg.inner_text(ANN+'.sdesc'))
    await pg.click(ANN+'.profileLink >> nth=1'); await asyncio.sleep(.4)
    print('feed:', (await pg.inner_text(ANN+'.cards')).replace('\n',' | ')[:300])
    print('errors:', errs)
    await b.close()
asyncio.run(main())
