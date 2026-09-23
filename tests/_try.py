import asyncio
from playwright.async_api import async_playwright
from _env import *
OUT = r'C:\Users\dswin\AppData\Local\Temp\claude\E--claude-code-annotated\5e7f320e-36dd-4cca-9ebc-dfaa38b01ba8\scratchpad'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    pg = await b.new_page(viewport={'width': 1440, 'height': 900}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('http://127.0.0.1:8812/'); await asyncio.sleep(3)
    await pg.screenshot(path=OUT + r'\try_a.png')
    await asyncio.sleep(3.5); await pg.screenshot(path=OUT + r'\try_b_demo.png')
    await asyncio.sleep(4.5)
    # select "quickly clip media, text, audio, or video" by dragging
    box = await pg.evaluate("""(() => { const p = document.querySelector('.tiText p'); const n = p.firstChild; const t = n.nodeValue;
      const a = t.indexOf('quickly'), z = t.indexOf('video') + 5; const r = document.createRange(); r.setStart(n, a); r.setEnd(n, z);
      getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()""")
    await asyncio.sleep(.5); await pg.screenshot(path=OUT + r'\try_c_selected.png')
    await pg.click('.tiBtn'); await asyncio.sleep(1.6); await pg.screenshot(path=OUT + r'\try_d_inked.png')
    await pg.fill('#tiInput', 'Clip is the verb that matters here. Most tools only save text.'); await pg.keyboard.press('Enter'); await asyncio.sleep(1.8)
    await pg.screenshot(path=OUT + r'\try_e_card.png')
    print('stored:', await pg.evaluate("localStorage.getItem('annotated-tryit')"))
    m = await b.new_page(viewport={'width': 390, 'height': 844}); await m.goto('http://127.0.0.1:8812/'); await asyncio.sleep(3)
    await m.screenshot(path=OUT + r'\try_phone.png', full_page=True)
    print('errors', errs)
    await b.close()
asyncio.run(main())
