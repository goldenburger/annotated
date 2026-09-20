import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.goto(PREVIEW); await asyncio.sleep(1)
    V='#videoMode '; A='#articleMode '; P='#podcastMode '; ANN='.annpage:not([hidden]) '
    # take step appears immediately with "Checking the clip"
    await pg.fill(V+'.rStart','35'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','37'); await pg.press(V+'.rEnd','Enter')
    await pg.click(V+'.capBtn')
    await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
    print('video: take step shown with trimmer folded:', not await pg.is_visible(V+'.clipper'), '| meta at that moment:', await pg.inner_text(V+'.ccMeta'))
    await asyncio.sleep(1.5); print('video meta after checks:', await pg.inner_text(V+'.ccMeta'))
    await pg.fill(V+'.takeInput','v'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
    print('page video controls at reveal:', await pg.eval_on_selector(ANN+'.clipVideo','v=>v.controls'), end=' '); await asyncio.sleep(1.3)
    print('-> after first frame:', await pg.eval_on_selector(ANN+'.clipVideo','v=>v.controls'))
    # podcast
    await pg.click('.tab >> nth=3'); await asyncio.sleep(1.5)
    await pg.fill(P+'.rStart','50'); await pg.press(P+'.rStart','Enter'); await pg.fill(P+'.rEnd','52'); await pg.press(P+'.rEnd','Enter')
    await pg.click(P+'.capBtn'); await pg.wait_for_selector(P+'.vCompose:not([hidden])',timeout=20000)
    print('podcast: trimmer folded at take step:', not await pg.is_visible(P+'.clipper'), '| capture-again hidden:', not await pg.is_visible(P+'.capBtn'), '|', await pg.inner_text(P+'.ccMeta'))
    await pg.fill(P+'.takeInput','typed during checks')
    for k in range(10):
      await asyncio.sleep(1)
      if 'Checking' not in await pg.inner_text(P+'.ccMeta'): break
    print('podcast checks took about', k+1, 's')
    print('text kept after checks:', await pg.input_value(P+'.takeInput'), '| meta:', await pg.inner_text(P+'.ccMeta'))
    # welcome: ? toggles, shows current display, label; switching display closes it
    await pg.click('aside.panel .helpBtn'); await asyncio.sleep(.2)
    print('welcome button:', await pg.inner_text('.welcome .wGo'), '| choice shows:', await pg.eval_on_selector('.welcome input[name="w-display"]:checked','e=>e.value'))
    await pg.click('aside.panel .helpBtn'); await asyncio.sleep(.2); print('? closes it:', await pg.locator('.welcome').count()==0)
    await pg.click('aside.panel .helpBtn'); await asyncio.sleep(.2)
    await pg.click('.gearBtn'); await pg.click('.dmPop input[name="dm-display"][value="float"]', force=True); await asyncio.sleep(.4)
    print('switching display closes welcome:', await pg.locator('.welcome').count()==0, '| welcoming class gone:', not await pg.evaluate("document.body.classList.contains('welcoming')"))
    await pg.click('.ff .ffX >> nth=1'); await asyncio.sleep(.2)
    print('reopened while floating, choice shows:', await pg.eval_on_selector('.welcome input[name="w-display"]:checked','e=>e.value'))
    await pg.click('.welcome .wGo'); await pg.click('.ff .ffX >> nth=0'); await pg.click('.dmPop input[name="dm-display"][value="side"]', force=True); await asyncio.sleep(.3)
    # Annotate with panel closed opens it
    await pg.click('#close'); await asyncio.sleep(.2); print('panel closed:', await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")'))
    await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[0].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block').shadowRoot.querySelector('button').click()"); await asyncio.sleep(1.5)
    print('Annotate opened the panel:', not await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")'), '| captured:', await pg.is_visible(A+'.aCompose'))
    # stale notice + dimmed old highlight
    await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,40);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
    await asyncio.sleep(.6)
    print('notice:', await pg.inner_text(A+'.resLabel'), '| color:', await pg.eval_on_selector(A+'.resLabel','e=>getComputedStyle(e).color'), '| old highlight removed:', await pg.evaluate("document.querySelectorAll('.story mark.annotated-hl').length===0"))
    # feed empty states
    await pg.click('.tab >> nth=4'); await pg.click(ANN+'.navHome'); await asyncio.sleep(.3)
    await pg.click(ANN+'.feedFilter label >> nth=4'); await asyncio.sleep(.2)
    print('posts empty state:', await pg.inner_text(ANN+'.cards .emptyState p >> nth=1'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
