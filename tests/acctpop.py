# The account popup laid its handle row out with the general rule that every child of a row takes an equal
# share. The at sign, the field and Save each took a third, the single column of the popup grew to hold them,
# and everything in it hung over the right edge, Sign out included. Nothing may reach past the card.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
OPEN = """async () => {
  // The panel already mounted one of these against the real backend. Stubbing both the profile and the
  // change notice keeps the second one from being signed out again a moment later.
  Backend.profile = async () => ({ id: 'me', name: 'Robo Taxi', handle: 'averylonghandleindeed_2026', avatar: '' });
  Backend.onChange = () => {};
  const fake = document.createElement('div');
  fake.innerHTML = '<div class="brand"></div>';
  document.body.appendChild(fake);
  Account.mount(fake);
  await new Promise((r) => setTimeout(r, 400));
  fake.querySelector('.acctBtn').click();
  await new Promise((r) => setTimeout(r, 100));
  const pop = document.querySelector('.acctPop');
  if (!pop) return { why: { me: !!(Account && Account.me), btn: !!fake.querySelector('.acctBtn'),
    stub: typeof Backend.profile, backend: typeof Backend } };
  const p = pop.getBoundingClientRect();
  const over = [...pop.querySelectorAll('*')].map((e) => {
    const b = e.getBoundingClientRect();
    return { tag: e.tagName.toLowerCase() + '.' + (e.className || ''), past: Math.round(b.right - p.right) };
  }).filter((e) => e.past > 0);
  const box = (s) => { const e = pop.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return { w: Math.round(b.width), right: Math.round(b.right) }; };
  return { width: Math.round(p.width), client: pop.clientWidth, scroll: pop.scrollWidth, over,
           input: box('.acctHandle input'), save: box('.acctHandle .strong'), out: box('.acctOut'),
           inner: pop.clientWidth - 28 };
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profACCT'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':700})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)
    r=await pan.evaluate(OPEN)
    if not r or r.get('why'):
      errs.append(f"the account popup did not open. {r and r.get('why')}")
    else:
      print('popup:',r['width'],'wide | content fits in',r['client'],'against',r['scroll'])
      print('field:',r['input'],'| Save:',r['save'],'| Sign out:',r['out'])
      if r['over']: print('reaching past the card:',r['over'][:4])
      if r['scroll'] > r['client']: errs.append(f"the popup holds {r['scroll']} of content in {r['client']} of room")
      if r['over']: errs.append(f"{len(r['over'])} things reached past the edge of the card, the worst by {max(e['past'] for e in r['over'])}px")
      if r['input']['w'] < 110: errs.append(f"the handle field is {r['input']['w']} wide, too narrow to read a handle in")
      if abs(r['out']['w'] - r['inner']) > 2: errs.append(f"Sign out is {r['out']['w']} wide against {r['inner']} of room")
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
