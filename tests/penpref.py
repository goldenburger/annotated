# The highlighter is a choice now. Display settings offers five pens, the page you are reading follows the one you
# pick, and annotation pages follow it through the root element. The stroke itself is drawn by a layer behind each
# word, swept on with a transform, because a stroke drawn by widening a background is done on the page's own
# thread and the page is busy capturing at exactly that moment, so nobody ever saw it.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article><h1>Harbor story</h1>'
      '<p>The council met on a Tuesday to talk about the overnight buses. '
      '<mark class="annotated-hl hl-a hl-z">Every member arrived on time for once.</mark></p>'
      '</article></body></html>')
INK=("()=>{const m=document.querySelector('mark.annotated-hl');const c=getComputedStyle(m,'::before');"
     "return {bg:c.backgroundImage.slice(0,42), radius:c.borderTopLeftRadius+' '+c.borderTopRightRadius};}")
# Mark a real passage through the page scripts, then watch the pen cross it. This runs in the extension's own
# world, where ArticleCore lives.
SWEEP = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => new Promise((done) => {
    const p = document.querySelector('article p');
    const n = p.firstChild;
    const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 62);
    const marks = ArticleCore.highlightRange(rg);
    const widthOf = (m) => { const t = getComputedStyle(m, '::before').transform;
      const g = t.match(/matrix\\(([-\\d.]+)/); return g ? Math.round(+g[1] * 100) : (t === 'none' ? 100 : -1); };
    const seen = marks.map(() => []);
    ArticleCore.sweep(marks);
    // Read while the pen is still moving. The drawing is taken off the marks once the stroke is down, so
    // reading this at the end would say nothing is being drawn, which is the point of taking it off.
    const names = marks.map((m) => getComputedStyle(m, '::before').animationName);
    const delays = marks.map((m) => m.style.getPropertyValue('--d'));
    const t0 = performance.now();
    // A timer rather than a frame callback, because a page nobody is looking at gets no frames.
    const id = setInterval(() => {
      marks.forEach((m, i) => seen[i].push(widthOf(m)));
      if (performance.now() - t0 > 1200) {
        clearInterval(id);
        done({ words: marks.map((m) => m.textContent), names,
               delays, held: marks.filter((m) => m.classList.contains('hl-go')).length,
               steps: seen.map((s) => [...new Set(s)].length), first: seen.map((s) => s[0]), last: seen.map((s) => s[s.length - 1]),
               ends: marks.map((m) => [m.classList.contains('hl-a'), m.classList.contains('hl-z')]) });
      }
    }, 25);
  }) });
  return r.result;
}"""
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

    # The pen crosses the passage one word at a time.
    await pg.bring_to_front()
    r=await sw.evaluate(SWEEP,{'tid':tid})
    print('words marked:',len(r['words']),r['words'][:4],'...')
    print('delays:',r['delays'][:5],'...')
    print('widths seen per word:',r['steps'][:6],'... first widths:',r['first'][:6])
    if len(r['words'])<8: errs.append(f"the passage came out as {len(r['words'])} pieces, so it is not one word to a mark")
    if any(w.strip()=='' for w in r['words']): errs.append('a piece of the stroke held no word')
    if set(r['names'])!={'annotated-sweep'}: errs.append(f"the pen is drawn by {set(r['names'])}, not a transform that the compositor can run")
    if len(set(r['delays']))<4: errs.append(f"the words share {len(set(r['delays']))} start times, so the pen does not travel")
    if max(r['steps'])<4: errs.append(f"the widest word took {max(r['steps'])} steps, so the stroke arrived finished")
    if min(r['first'])>25: errs.append(f'every word already stood at {min(r["first"])} percent on the first look')
    if min(r['last'])<100: errs.append('a word was left unfinished')
    if r['ends'][0]!=[True,False] or r['ends'][-1]!=[False,True]: errs.append('the caps are not on the ends of the run')
    # The layer each word borrows from the compositor goes back once the stroke is down.
    print('words still being drawn when it was over:',r['held'])
    if r['held']: errs.append(f"{r['held']} words were still holding a compositor layer after the stroke was down")

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
