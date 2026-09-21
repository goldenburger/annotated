# The recording on 2026-09-21 showed a bar of ink hanging down the page from the end of a stroke. The pen layer
# is laid over a whole mark, and a mark holding the line break at the end of a paragraph has a piece on two
# lines, so the one box covering it reaches from the end of one line to the start of the next. X writes its
# posts as one run of text with real newlines in it, which is where this shows up. No mark may cross a line.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
TEXT = ('FED PRESIDENT NEEL KASHKARI SAID TODAY\n\n'
        '“The inflation that the American people are feeling every day is much beyond just oil prices, '
        'it’s in all aspects of the economy,”\n\n'
        '“My hope is, as some of those conflicts go to the background that the growth can take over”')
BODY = ('<!doctype html><html><head><meta charset="utf-8"><title>Post</title></head>'
        '<body style="margin:0;background:#000;color:#e7e9ea;font:17px/1.4 system-ui">'
        '<article data-testid="tweet"><div data-testid="User-Name"><span>Evan</span><span>@evan</span></div>'
        '<a href="/evan/status/1"><time datetime="2026-09-20T11:00:00Z">Sep 20</time></a>'
        '<div data-testid="tweetText" style="white-space:pre-wrap;width:420px"><span>' + TEXT + '</span></div>'
        '</article></body></html>')
# Two shapes that used to hang ink. A passage running through the blank line between two paragraphs, and a
# passage that wraps inside a narrow column.
PROBE = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const span = document.querySelector('[data-testid="tweetText"] span');
    const line = 17 * 1.4;
    const look = (from, to) => {
      ArticleCore.clearHighlights(document);
      const t = span.firstChild;
      const rg = document.createRange(); rg.setStart(t, from); rg.setEnd(t, to);
      const wanted = rg.toString();
      const marks = ArticleCore.highlightRange(rg);
      const bad = marks.map((m) => ({ txt: JSON.stringify(m.textContent), rects: m.getClientRects().length,
        h: Math.round(m.getBoundingClientRect().height) }))
        .filter((b) => b.rects !== 1 || b.h > line * 1.5);
      return { n: marks.length, bad, wanted, text: marks.map((m) => m.textContent).join('') };
    };
    const s = span.firstChild.nodeValue;
    const through = look(s.indexOf('PRESIDENT'), s.indexOf('TODAY') + 7);
    document.querySelector('[data-testid="tweetText"]').style.width = '150px';
    const wrapped = look(s.indexOf('\\u201cThe'), s.indexOf('economy'));
    return { line: Math.round(line), through, wrapped };
  } });
  return r.result;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profSL'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.route('https://x.com/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':600,'height':500})
    await pg.goto('https://x.com/evan/status/1'); await asyncio.sleep(1.4)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('x.com')).id)")
    r=await sw.evaluate(PROBE,{'tid':tid})
    norm=lambda t:' '.join(t.split())
    for name, part in (('through the blank line between paragraphs', r['through']), ('wrapped in a narrow column', r['wrapped'])):
        print(f"{name}: {part['n']} marks, {len(part['bad'])} reaching past their line")
        if part['bad']: print('  ', part['bad'][:3])
        if part['bad']:
            errs.append(f"{name}: {len(part['bad'])} marks have ink on more than one line, which hangs down the page")
        if norm(part['text']) != norm(part['wanted']):
            errs.append(f"{name}: the stroke covers {norm(part['text'])[:50]!r}, not the words picked")
        if part['n'] < 4: errs.append(f"{name}: the passage came out as {part['n']} pieces")
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
