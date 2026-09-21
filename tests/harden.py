# The three holes the audit on 2026-09-21 found, each with the thing that would notice them coming back.
# A reaction is the only piece of another person's text that ever reached the page as markup rather than as
# words. The clock behind the comment times used to be started again on every render and never stopped, which
# began to matter once every annotation shared one tab. And any web page may load an extension page it is
# allowed to reach, so the floating frame now carries a key the panel checks before it shows anything.
import asyncio
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
EXT = EXT
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"

# A reaction written by someone else, holding markup, drawn by both the chip row and the feed card.
REACT = r"""async (rec) => {
  const evil = '<img src=q onerror=window.__pwn=1>', short = '<svg onload=1>';
  const out = {};
  const chips = document.createElement('div'); document.body.appendChild(chips);
  EmojiKit.reactions(chips, { list: [{ emoji: evil, count: 1, mine: false }, { emoji: short, count: 2, mine: false }], onChange() {} });
  out.chips = chips.querySelectorAll('.rChip').length;
  out.builtInChips = chips.querySelectorAll('.rChip img, .rChip svg').length;
  out.chipText = (chips.querySelector('.rChip span') || {}).textContent || '';
  chips.remove();
  // And in a feed card, where the first few reactions are shown beside the count.
  const feed = document.createElement('div'); document.body.appendChild(feed);
  const r = { ...rec, reactions: [{ emoji: evil, count: 1, mine: false }] };
  AnnotationPage.renderFeed(feed, { records: [r], mode: 'home', onOpen() {}, onTag() {}, onAll() {} });
  await new Promise((res) => setTimeout(res, 300));
  out.feedCards = feed.querySelectorAll('.cardItem').length;
  out.builtInFeed = feed.querySelectorAll('.fReact img, .fReact svg').length;
  out.feedText = (feed.querySelector('.fReact') || {}).textContent || '';
  feed.remove();
  out.pwned = !!window.__pwn;
  return out;
}"""

# Drawing into the same element again has to put the old clock away.
CLOCK = r"""async (rec) => {
  const started = [], stopped = [];
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = (fn, ms) => { const id = si(fn, ms); if (ms === 30000) started.push(id); return id; };
  window.clearInterval = (id) => { if (started.includes(id)) stopped.push(id); return ci(id); };
  const d = document.createElement('div'); document.body.appendChild(d);
  const one = { item: rec.item, take: rec.take, records: [rec], showBanner: false };
  await AnnotationPage.render(d, one, {});
  await AnnotationPage.render(d, one, {});
  await AnnotationPage.render(d, one, {});
  const afterThree = { started: started.length, stopped: stopped.length };
  // Going on to the feed in the same element puts the last one away too.
  AnnotationPage.renderFeed(d, { records: [rec], mode: 'home', onOpen() {}, onTag() {}, onAll() {} });
  await new Promise((res) => setTimeout(res, 200));
  const afterFeed = { started: started.length, stopped: stopped.length };
  d.remove();
  window.setInterval = si; window.clearInterval = ci;
  started.forEach((id) => ci(id));
  return { afterThree, afterFeed };
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profHARD'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    rec = {'id': 'h1', 'created': 1700000000000,
           'item': {'kind': 'post', 'text': 'A post', 'quote': 'some words', 'author': 'Techartist', 'handle': '@techartist_', 'url': 'https://x.com/techartist_/status/1'},
           'take': {'text': 'A take', 'tag': None, 'poll': None, 'voice': None, 'gif': None},
           'comments': [], 'reactions': []}

    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 420, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)

    r = await pan.evaluate(REACT, rec)
    print('chips drawn:', r['chips'], '| elements built from the reaction:', r['builtInChips'])
    print('the chip reads:', repr(r['chipText'][:40]))
    print('feed cards:', r['feedCards'], '| elements built from the reaction:', r['builtInFeed'])
    print('the feed stat reads:', repr(r['feedText'][:40]))
    if r['builtInChips']: errs.append(f"a reaction built {r['builtInChips']} elements in the chip row, so it is markup and not words")
    if r['builtInFeed']: errs.append(f"a reaction built {r['builtInFeed']} elements in a feed card, so it is markup and not words")
    if '<img' not in r['chipText']: errs.append(f"the chip did not show the reaction as written: {r['chipText']!r}")
    if '<img' not in r['feedText']: errs.append(f"the feed card did not show the reaction as written: {r['feedText']!r}")
    if r['pwned']: errs.append('a reaction ran its own code')

    c = await pan.evaluate(CLOCK, rec)
    print('after drawing three times:', c['afterThree'])
    print('after going on to the feed:', c['afterFeed'])
    if c['afterThree']['started'] != 3: errs.append(f"the page started {c['afterThree']['started']} clocks in three renders")
    if c['afterThree']['stopped'] != 2: errs.append(f"redrawing put {c['afterThree']['stopped']} of the 2 old clocks away")
    if c['afterFeed']['stopped'] != 3: errs.append('going on to the feed left the annotation page clock running')

    # A page of someone else's may frame the panel. Without the key the extension put in the frame it makes,
    # the panel shows nothing to click on.
    news = await ctx.new_page()
    news.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await news.goto('https://harborline.example/x'); await asyncio.sleep(1)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    framed = await news.evaluate("""async (args) => {
      const f = document.createElement('iframe');
      f.src = `chrome-extension://${args.id}/sidepanel.html?tab=${args.tid}&embed=float&k=guess`;
      f.style.cssText = 'width:420px;height:700px';
      document.body.appendChild(f);
      await new Promise((r) => setTimeout(r, 2500));
      return { loaded: !!f.contentWindow };
    }""", {'id': extid, 'tid': tid})
    hostile = [fr for fr in news.frames if 'sidepanel.html' in fr.url]
    text = (await hostile[0].inner_text('body')).strip() if hostile else ''
    buttons = await hostile[0].evaluate("() => document.querySelectorAll('button').length") if hostile else -1
    print('a page framed the panel:', bool(hostile), '| it shows:', repr(text[:60]), '| buttons:', buttons)
    if hostile and buttons: errs.append(f'the panel gave a page that framed it {buttons} buttons to click')
    if hostile and 'own button' not in text: errs.append(f'the framed panel said {text[:60]!r}')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
