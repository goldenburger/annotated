import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1366,'height':768},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.goto(PREVIEW); await asyncio.sleep(1)
      print(scheme,'welcome shown:', await pg.is_visible('.welcome'), '| video mode hidden:', not await pg.is_visible('#videoMode .capBtn'))
      await pg.screenshot(path=f'pe_{scheme}.png', clip={'x':986,'y':84,'width':380,'height':684})
      await pg.click('.welcome .wGo'); await asyncio.sleep(.2)
      print('after Try it:', await pg.is_visible('#videoMode .capBtn'), '| welcome gone:', await pg.locator('.welcome').count()==0)
      await pg.reload(); await asyncio.sleep(1); print('stays dismissed after reload:', await pg.locator('.welcome').count()==0)
      await pg.click('aside.panel .helpBtn'); await asyncio.sleep(.2); print('help reopens:', await pg.is_visible('.welcome')); await pg.click('.welcome .wGo')
      await pg.keyboard.press('Alt+Shift+K'); await asyncio.sleep(.2); c1=await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")')
      await pg.keyboard.press('Alt+Shift+K'); await asyncio.sleep(.2); c2=await pg.eval_on_selector('#stage','e=>e.classList.contains("closed")')
      print('shortcut closes then opens:', c1, c2)
      if scheme=='light':
        V='#videoMode '; ANN='.annpage:not([hidden]) '
        await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','44'); await pg.press(V+'.rEnd','Enter')
        await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
        await pg.fill(V+'.takeInput','x'); await pg.click(V+'.publish'); await pg.wait_for_selector(ANN+'.ann:not(.loading)')
        await pg.click(ANN+'.reactBtn'); await pg.click('.quickBar .qE >> nth=1'); print('pop class on new chip:', await pg.eval_on_selector(ANN+'.rChip','e=>e.classList.contains("pop")'))
        await pg.click(ANN+'.shareBtn'); await pg.click(ANN+'.copyBtn'); await asyncio.sleep(.2)
        print('copy shows check:', await pg.eval_on_selector(ANN+'.copyBtn','e=>e.classList.contains("done")'))
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
