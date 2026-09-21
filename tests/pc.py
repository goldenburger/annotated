import asyncio
from playwright.async_api import async_playwright
from _env import *
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light','dark']:
      ctx=await b.new_context(viewport={'width':1440,'height':860},color_scheme=scheme); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"); await pg.add_init_script(NO_MAILTO); await pg.goto(PREVIEW)
      await pg.wait_for_selector('#videoMode:not([hidden]) .vTitle')
      V='#videoMode '; A='#articleMode '; ANN='.annpage:not([hidden]) '
      await pg.fill(V+'.rStart','40'); await pg.press(V+'.rStart','Enter'); await pg.fill(V+'.rEnd','46'); await pg.press(V+'.rEnd','Enter')
      await pg.click(V+'.capBtn'); await pg.wait_for_selector(V+'.vCompose:not([hidden])',timeout=20000)
      await pg.click(V+'.tagbtn >> text=Fact check'); await pg.fill(V+'.takeInput','The bars shift color right at 0:43.'); await pg.click(V+'.publish')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)')
      print(scheme,'page video readyState at reveal:', await pg.eval_on_selector(ANN+'.clipVideo','v=>v.readyState'))
      await pg.click('.tab >> nth=1'); await asyncio.sleep(.4)
      await pg.evaluate('''(()=>{const p=document.querySelectorAll(".story p")[2].firstChild;const r=document.createRange();r.setStart(p,5);r.setEnd(p,50);getSelection().removeAllRanges();getSelection().addRange(r)})()''')
      await asyncio.sleep(.5); await pg.click(A+'.grab'); await pg.wait_for_selector(A+'.aCompose:not([hidden])',timeout=15000)
      await pg.click(A+'.tagbtn >> text=Receipts'); await pg.fill(A+'.takeInput','The 61 percent figure comes from an employer survey.'); await pg.click(A+'.publish')
      await pg.wait_for_selector(ANN+'.ann:not(.loading)'); await asyncio.sleep(1.4)
      await pg.screenshot(path=f'pc_{scheme}_page.png', clip={'x':0,'y':84,'width':1440-380,'height':776})
      print('toast:', (await pg.inner_text(ANN+'.toastRow')).replace('\n',' '), '| invite hidden:', not await pg.is_visible(ANN+'.invite'))
      await pg.click(ANN+'.inviteOpen'); await pg.click(ANN+'.inviteBtn'); print('invite error:', await pg.inner_text(ANN+'.inviteMsg'))
      await pg.fill(ANN+'.inviteEmail','sam@example.com'); await pg.press(ANN+'.inviteEmail','Enter'); print('invite ok:', await pg.inner_text(ANN+'.inviteMsg'))
      mt = await pg.evaluate('window.__mailto || ""')
      print('invite mail address:', mt.split('?')[0], '| has subject and body:', 'subject=' in mt and 'body=' in mt)
      if 'sam%40example.com' not in mt: errs.append('the invite did not open a mail to the address typed')
      print('rail:', (await pg.inner_text(ANN+'.rail')).replace('\n',' | ')[:260])
      print('who-to-follow hidden in demo:', not await pg.is_visible(ANN+'.rail .railcard.dbg'))
      await pg.evaluate("document.getElementById('pane').scrollTop=500"); await asyncio.sleep(.3)
      print('toast still visible after scroll:', await pg.eval_on_selector(ANN+'.banner','e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight}'))
      await pg.screenshot(path=f'pc_{scheme}_scrolled.png', clip={'x':0,'y':84,'width':1440-380,'height':776})
      await pg.click(ANN+'.railOpen >> nth=0'); await asyncio.sleep(.3); print('rail item opens:', await pg.inner_text('#urlbar'))
      print('errors:', errs)
      await ctx.close()
    await b.close()
asyncio.run(main())
