# The recording on 2026-09-21 showed a passage highlighted as several pieces with unhighlighted gaps, and two
# Annotate buttons on one page. The gaps came from skipping the whitespace between words, and the pieces
# multiplied because every capture split the page's text a little more and it was never put back together.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
FILES=['post-core.js','article-core.js','capture-engine.js','article.js']
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SENT='The council met on a Tuesday to talk about the overnight buses.'
# The sentence arrives in pieces with the spaces between them in their own nodes, which is how X writes a post
# and how any page looks once a capture has split it.
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article><h1>Harbor story</h1>'
      '<p id="a"><span>The council met</span> <span>on a Tuesday</span> <span>to talk about the overnight buses.</span>'
      ' Every member arrived on time for once.</p>'
      '</article></body></html>')
# Mark the sentence, read it back, then take it off again, four times over. This runs where the page scripts
# live, which is the extension's own world rather than the page's.
ROUNDS = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, args: [a.sent, a.times], func: (sent, times) => {
    const p = document.getElementById('a'), out = [];
    const rangeOver = (from, to) => {
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const ns = []; while (w.nextNode()) ns.push(w.currentNode);
      let pos = 0, s = null, e = null;
      for (const n of ns) { const len = n.nodeValue.length;
        if (!s && from >= pos && from <= pos + len) s = [n, from - pos];
        if (!e && to >= pos && to <= pos + len) e = [n, to - pos];
        pos += len; if (s && e) break; }
      const r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1]); return r; };
    for (let i = 0; i < times; i++) {
      const marks = ArticleCore.highlightRange(rangeOver(0, sent.length));
      out.push({ n: marks.length, text: marks.map((m) => m.textContent).join(''),
        a: marks.map((m) => m.classList.contains('hl-a')), z: marks.map((m) => m.classList.contains('hl-z')) });
      ArticleCore.clearHighlights(document);
      out[out.length - 1].nodesAfter = p.querySelectorAll('span').length + [...p.childNodes].length;
    }
    out.push({ paragraph: p.textContent, shape: p.querySelectorAll('span').length + [...p.childNodes].length });
    return out;
  } });
  return r.result;
}"""

async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profSTK'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.2)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")

    shape0=await pg.evaluate("()=>{const p=document.getElementById('a');return p.querySelectorAll('span').length+[...p.childNodes].length;}")
    rounds=await sw.evaluate(ROUNDS, {'tid': tid, 'sent': SENT, 'times': 4})
    para=rounds.pop()
    print('paragraph starts as',shape0,'pieces')
    for i,m in enumerate(rounds,1):
      print(f'round {i}: {m["n"]} piece(s), text {m["text"][:44]!r}, paragraph left in {m["nodesAfter"]} node(s)')
      if m['text']!=SENT: errs.append(f'round {i} marked {m["text"]!r}, so the stroke has a gap in it')
      if m['a']!=[True]+[False]*(m['n']-1): errs.append(f'round {i} capped the start of {m["a"].count(True)} pieces, wanted one')
      if m['z']!=[False]*(m['n']-1)+[True]: errs.append(f'round {i} capped the end of {m["z"].count(True)} pieces, wanted one')
      if m['nodesAfter']!=shape0: errs.append(f'round {i} left the paragraph in {m["nodesAfter"]} pieces rather than {shape0}, so it is fragmenting')
    if not para['paragraph'].startswith(SENT): errs.append('the paragraph text changed')

    # Another copy of the page scripts takes over rather than piling up.
    before=await pg.evaluate("()=>document.querySelectorAll('.annotated-ui').length")
    for _ in range(2):
      await sw.evaluate("""async (a)=>{ await chrome.scripting.executeScript({target:{tabId:a.tid}, files:a.files}); }""",
                        {'tid': tid, 'files': FILES})
      await asyncio.sleep(.7)
    after=await pg.evaluate("()=>document.querySelectorAll('.annotated-ui').length")
    print('buttons on the page: started with',before,', after two more copies',after)
    if after!=1: errs.append(f'{after} buttons on the page, wanted one')

    # And the copy that survived still reads the page.
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)
    await pg.bring_to_front()
    await pg.evaluate("""()=>{const ss=document.querySelectorAll('#a span');
      const r=document.createRange();r.setStart(ss[0].firstChild,0);r.setEnd(ss[2].firstChild,ss[2].firstChild.length);
      getSelection().removeAllRanges();getSelection().addRange(r);}""")
    await asyncio.sleep(1.2); await pan.bring_to_front(); await asyncio.sleep(.4)
    quote=(await pan.inner_text('#articleMode .selQuote')).strip()
    print('the surviving copy still reads the page:',repr(quote[:44]))
    if quote!=SENT: errs.append(f'after re-injection the page reported {quote!r}')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
