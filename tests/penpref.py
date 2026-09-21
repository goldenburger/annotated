# The highlighter is a choice now. Display settings offers five pens, the page you are reading follows the one you
# pick, and annotation pages follow it through the root element.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article><h1>Harbor story</h1>'
      '<p>The council met on a Tuesday to talk about the overnight buses. <mark class="annotated-hl">Every member arrived on time for once.</mark></p>'
      '</article></body></html>')
INK="()=>{const m=document.querySelector('mark.annotated-hl');const c=getComputedStyle(m);return {bg:c.backgroundImage.slice(0,42), radius:c.borderTopLeftRadius+' '+c.borderTopRightRadius};}"
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profPEN'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':700})
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.2)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.8)

    # The picker is in Display settings, with the default already chosen.
    await pan.click('.gearBtn'); await asyncio.sleep(.5)
    pens=await pan.eval_on_selector_all('.penBtn','bs=>bs.map(b=>[b.dataset.pen,b.getAttribute("aria-pressed")])')
    print('pens offered:',pens)
    if len(pens)!=5: errs.append(f'{len(pens)} pens were offered, wanted five')
    if dict(pens).get('chisel')!='true': errs.append('the chisel was not the one already chosen')

    # Watch a fresh mark actually widen. Checking that an animation is named proves nothing, because an
    # !important declaration on the animated property leaves the keyframes inert and the stroke arrives finished.
    await pg.bring_to_front()
    await pg.evaluate("""()=>{
      const m=document.createElement('mark'); m.className='annotated-hl'; m.textContent='drawn across these words';
      document.querySelector('p').appendChild(m);
      window.__w=[]; const t0=performance.now();
      // A timer rather than a frame callback, because a page nobody is looking at gets no frames.
      const id=setInterval(()=>{ window.__w.push(parseFloat(getComputedStyle(m).backgroundSize)||0);
        if (performance.now()-t0 > 800) clearInterval(id); }, 30);
    }""")
    await asyncio.sleep(1.2)
    w=await pg.evaluate('window.__w')
    wide=max(w) if w else 0
    print('stroke width over time: first %.0f, widest %.0f, steps %d' % (w[0] if w else 0, wide, len(set(w))))
    if wide<=0: errs.append('the stroke never had any width')
    elif len(set(w))<4: errs.append(f'the stroke jumped to full width in {len(set(w))} steps, so nothing was drawn')
    elif w[0] > wide*0.25: errs.append(f'the stroke began at {w[0]:.0f} of {wide:.0f}, so most of it was already there')

    start=await pg.evaluate(INK)
    print('page starts with:',start)
    if 'linear-gradient' not in start['bg']: errs.append('the page did not start with a drawn stroke')

    # Pick another and the page you are reading changes with it.
    await pan.click('.penBtn[data-pen="flat"]'); await asyncio.sleep(1.2)
    flat=await pg.evaluate(INK)
    print('after flat:',flat)
    if flat==start: errs.append('the page did not follow the pen')
    if await pan.evaluate("document.documentElement.getAttribute('data-pen')")!='flat': errs.append('the panel did not record the pen')

    # And back again.
    await pan.click('.penBtn[data-pen="wet"]'); await asyncio.sleep(1.2)
    wet=await pg.evaluate(INK)
    print('after wet:',wet)
    if wet==flat or 'radial-gradient' not in wet['bg']: errs.append('the wet edge did not reach the page')

    # An annotation page reads the same choice off the root element.
    ann=await ctx.new_page(); await ann.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(2)
    onpage=await ann.evaluate("document.documentElement.getAttribute('data-pen')")
    print('annotation pages see:',onpage)
    if onpage!='wet': errs.append(f'an annotation page saw {onpage!r}')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
