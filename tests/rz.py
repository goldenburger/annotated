import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME)
    pg=await b.new_page(viewport={'width':1366,'height':800}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
    await pg.goto(PREVIEW); await asyncio.sleep(1.5)
    W=lambda: pg.eval_on_selector('aside.panel','e=>Math.round(e.getBoundingClientRect().width)')
    print('startup: side panel open:', not await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")'), '| floating:', await pg.locator('.ff').count()>0, '| width', await W())
    r=await pg.locator('#pResizer').bounding_box(); x=r['x']+5; y=r['y']+300
    await pg.mouse.move(x,y); await pg.mouse.down(); await pg.mouse.move(x-160,y,steps=8); await pg.mouse.up(); await asyncio.sleep(.2)
    print('dragged left 160px, width:', await W())
    r=await pg.locator('#pResizer').bounding_box(); x=r['x']+5
    await pg.mouse.move(x,y); await pg.mouse.down(); await pg.mouse.move(x+150,y,steps=6)
    print('dragged right 150px while holding, width:', await W(), '| hide cue:', await pg.is_visible('.hideHint'))
    await pg.mouse.move(1366-60,y,steps=10); await asyncio.sleep(.1)
    print('near the right edge, hide cue:', await pg.is_visible('.hideHint'), '| width holds at minimum:', await W())
    await pg.screenshot(path='rz_hide.png'); await pg.mouse.up(); await asyncio.sleep(.2)
    print('released: panel hidden:', await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")'))
    await pg.click('#toggle'); await asyncio.sleep(.2); print('toolbar reopens at width:', await W())
    await pg.reload(); await asyncio.sleep(1.2); print('after reload width:', await W())
    await pg.focus('#pResizer'); await pg.keyboard.press('ArrowLeft'); print('ArrowLeft ->', await W())
    await pg.dblclick('#pResizer'); await asyncio.sleep(.1); print('double-click reset ->', await W())
    await pg.evaluate("(()=>{document.getElementById('videoMode').hidden=true;const e=document.getElementById('empty');e.hidden=false;document.getElementById('emptyMsg').textContent='Waiting for the video to load.'})()")
    box=await pg.eval_on_selector('#empty','e=>[...e.children].map(c=>{const r=c.firstChild&&c.firstChild.nodeType===3?(()=>{const g=document.createRange();g.selectNodeContents(c);return g.getBoundingClientRect()})():c.getBoundingClientRect();return Math.round(r.left+r.width/2)})')
    print('empty-state centers:', box)
    print('errors:', errs)
    await b.close()
asyncio.run(main())
