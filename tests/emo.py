import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.goto(PREVIEW)
    await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
    A='#articleMode '; ANN='.annpage:not([hidden]) '
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
    ta=A+'.takeInput'
    # shortcode autocomplete
    await pg.click(ta); await pg.keyboard.type('Big claim :fi', delay=20); await asyncio.sleep(.3)
    print('autocomplete:', (await pg.inner_text('.emojiAc:not([hidden])')).replace('\n',' | '))
    await pg.keyboard.press('Enter'); await asyncio.sleep(.2)
    await pg.keyboard.type(' and :100: done', delay=20); await asyncio.sleep(.2)
    print('take text:', await pg.input_value(ta))
    # picker
    await pg.click(A+'.emojiBtn'); await asyncio.sleep(.3)
    await pg.screenshot(path='emo_picker.png', clip={'x':986,'y':84,'width':380,'height':716})
    await pg.fill('.emojiPop .epSearch','thinking'); await asyncio.sleep(.2)
    print('search first:', await pg.get_attribute('.emojiPop .epE >> nth=0','aria-label'))
    await pg.press('.emojiPop .epSearch','Enter'); await asyncio.sleep(.2)
    print('after pick:', await pg.input_value(ta))
    # poll
    await pg.click(A+'.pollBtn'); await asyncio.sleep(.2)
    await pg.click(A+'.peAdd'); await pg.fill(A+'.peOpt >> nth=2','Need more data')
    await pg.screenshot(path='emo_compose.png', clip={'x':986,'y':84,'width':380,'height':716})
    await pg.click(A+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(2)
    print('poll options:', await pg.locator(ANN+'.pollOpt').count())
    await pg.click(ANN+'.pollOpt >> nth=1'); await asyncio.sleep(.6)
    print('poll after vote:', (await pg.inner_text(ANN+'.pollBox')).replace('\n',' | '))
    # reactions
    await pg.click(ANN+'.reactBtn'); await asyncio.sleep(.2)
    await pg.click('.quickBar .qE >> nth=5'); await asyncio.sleep(.2)
    await pg.click(ANN+'.reactBtn'); await pg.click('.quickBar .qMore'); await asyncio.sleep(.2)
    await pg.fill('.emojiPop .epSearch','clap'); await pg.press('.emojiPop .epSearch','Enter'); await asyncio.sleep(.2)
    print('reactions:', (await pg.inner_text(ANN+'.reactHost')).replace('\n',' '))
    # comment with emoji + comment reaction
    await pg.click(ANN+'.cText'); await pg.keyboard.type('Agreed :thumbsup:', delay=15); await pg.click(ANN+'.cPost'); await asyncio.sleep(.3)
    print('comment:', await pg.inner_text(ANN+'.cList p'))
    await pg.click(ANN+'.cReact .rAdd'); await pg.click('.quickBar .qE >> nth=1'); await asyncio.sleep(.2)
    await pg.evaluate("document.querySelector('.annpage:not([hidden]) .actions').scrollIntoView({block:'center'})"); await asyncio.sleep(.3)
    await pg.screenshot(path='emo_page.png', clip={'x':0,'y':84,'width':986,'height':716})
    # persistence across tab switch + remove reaction
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.2); await pg.click('.tab >> nth=4'); await asyncio.sleep(.2)
    await pg.click(ANN+'.reactHost .rChip >> nth=0'); await asyncio.sleep(.1)
    print('after removing one:', (await pg.inner_text(ANN+'.reactHost')).replace('\n',' '))
    await pg.click(ANN+'.profileLink >> nth=1'); await asyncio.sleep(.4)
    print('feed card meta:', (await pg.inner_text(ANN+'.card .fStats')))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
