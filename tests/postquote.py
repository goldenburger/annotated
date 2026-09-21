# The recording on 2026-09-21 showed a post annotation disagreeing with itself. The panel warned "You selected
# new words" while the quote below it was already those words, removing the quote left the whole post marked on
# the page, capturing again forgot the words that were chosen, and the published card quoted the entire post
# instead of the passage.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
POST = {'ok': True, 'text': 'A real-time coastal simulation in Three.js. Open source code in the post below.',
        'author': 'Techartist', 'handle': '@techartist_', 'posted': '2026-09-19T11:35:00Z',
        'url': 'https://x.com/techartist_/status/1', 'id': '1'}
PANEL = """async (post) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  const out = { cleared: 0 };
  let quote = 'Open source code in the post below.';
  const api = PostPanel.create(d, {
    info: async () => post,
    capture: async () => ({ ...post, quote }),
    clearCaptured: () => { out.cleared += 1; },
  }, { log() {} });
  const label = () => d.querySelector('.resLabel').textContent;
  await api.refresh();
  await new Promise((r) => setTimeout(r, 60));
  d.querySelector('.pGrab').click();
  await new Promise((r) => setTimeout(r, 250));
  out.quoted = d.querySelector('.pQuote').textContent;
  out.afterCapture = label();
  // Words that are already the quote are not news.
  api.onSelection({ state: 'ok', text: 'Open source code in the post below.' });
  out.sameWords = label();
  // Different words are.
  api.onSelection({ state: 'ok', text: 'A real-time coastal simulation' });
  out.otherWords = label();
  // A capture answers the warning, so the warning goes.
  d.querySelector('.pGrab').click();
  await new Promise((r) => setTimeout(r, 250));
  out.afterSecond = label();
  // Removing the quote clears the page and stops the panel talking about a quote.
  api.onSelection({ state: 'ok', text: 'A real-time coastal simulation' });
  d.querySelector('.pQuoteX').click();
  out.boxHidden = d.querySelector('.pQuoteBox').hidden;
  out.afterRemove = label();
  d.remove();
  return out;
}"""
# A quoted post with paragraphs in it. The blank line between them must carry no ink.
QUOTE = """async (rec) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  await AnnotationPage.render(d, { item: rec.item, take: rec.take, records: [rec], showBanner: false }, {});
  const marks = [...d.querySelectorAll('.postQuote mark')];
  const out = { marks: marks.map((m) => m.textContent), blank: marks.filter((m) => !m.textContent.trim()).length,
                text: (d.querySelector('.postQuote') || {}).textContent || '' };
  d.remove();
  return out;
}"""
# A quote that stops in the middle of a sentence. The panel says so once, quietly, and publishing still works.
FRAG = """async (post) => {
  const out = {};
  const run = async (quote) => {
    const d = document.createElement('div'); document.body.appendChild(d);
    const api = PostPanel.create(d, { info: async () => post, capture: async () => ({ ...post, quote }) },
      { log() {}, onPublish: async () => ({ permalink: 'x' }) });
    await api.refresh();
    await new Promise((r) => setTimeout(r, 60));
    d.querySelector('.pGrab').click();
    await new Promise((r) => setTimeout(r, 250));
    const note = d.querySelector('.pFrag');
    const said = note.hidden ? '' : note.textContent;
    const publish = d.querySelector('.compose button.primary');
    const state = publish ? publish.disabled : null;
    d.remove();
    return { said, state };
  };
  const a = await run('Human civilization uses only a tiny');
  const b = await run('Open source code in the post below.');
  out.note = a.said; out.whole = b.said;
  // The note must not change anything about publishing, only say something.
  out.sameChance = a.state === b.state;
  return out;
}"""
# Three takes on one post. The source is named once and the rest say they are on the same thing.
RUN = """(recs) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  AnnotationPage.renderFeed(d, { records: recs, mode: 'home', onOpen() {}, onHome() {}, onProfile() {} });
  const out = [...d.querySelectorAll('.csource')].map((e) => ({
    title: e.querySelector('.cst').textContent, quote: e.querySelector('.csn').textContent,
    again: e.classList.contains('again') }));
  d.remove();
  return out;
}"""
# The stroke has to be on the page while the picture of the post is being taken, or the picture does not point
# at the words that were quoted.
SHOT = """async (a) => {
  await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const n = document.querySelector('[data-testid="tweetText"] span').firstChild;
    const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 29);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
  } });
  const pending = chrome.tabs.sendMessage(a.tid, { type: 'capture-post' });
  await new Promise((r) => setTimeout(r, 90));
  const [mid] = await chrome.scripting.executeScript({ target: { tabId: a.tid },
    func: () => [...document.querySelectorAll('mark.annotated-hl')].map((m) => m.textContent).join('') });
  const res = await pending;
  return { whileShooting: mid.result, quote: (res && res.quote) || '' };
}"""
CARD = """(recs) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  AnnotationPage.renderFeed(d, { records: recs, mode: 'home', onOpen() {}, onHome() {}, onProfile() {} });
  const out = [...d.querySelectorAll('.csn')].map((e) => e.textContent);
  d.remove();
  return out;
}"""
def rec(i, quote):
    return {'id': f'r{i}', 'created': 1700000000000 + i * 1000,
            'item': {'kind': 'post', 'text': POST['text'], 'quote': quote, 'author': 'Techartist', 'handle': '@techartist_'},
            'take': {'text': f'take {i}', 'tag': None, 'poll': None, 'voice': None}, 'comments': [], 'reactions': []}
# Capturing a post twice with nothing selected the second time. The words chosen the first time stay chosen.
AGAIN = """async (a) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: a.tid }, func: () => {
    const el = document.querySelector('article[data-testid="tweet"]');
    const n = document.querySelector('[data-testid="tweetText"] span').firstChild;
    const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 29);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
    const page = window.__annotatedArticle.page;
    const first = page.takeWithin(el);
    page.paintTaken();
    const painted = [...document.querySelectorAll('mark.annotated-hl')].map((m) => m.textContent).join('');
    const again = page.takeWithin(el);
    page.paintTaken();
    const marks = [...document.querySelectorAll('mark.annotated-hl')].map((m) => m.textContent).join('');
    return { first, painted, again, marks };
  } });
  return r.result;
}"""
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Post</title></head><body>'
      '<article data-testid="tweet"><div data-testid="User-Name"><span>Techartist</span><span>@techartist_</span></div>'
      '<a href="/techartist_/status/1"><time datetime="2026-09-19T11:35:00Z">Sep 19</time></a>'
      '<div data-testid="tweetText"><span>A real-time coastal simulation</span> <span>in Three.js.</span>'
      ' <span>Open source code in the post below.</span></div></article></body></html>')
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profPQ'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.route('https://x.com/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':420,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.2)

    r=await pan.evaluate(PANEL, POST)
    print('quoted:',repr(r['quoted']))
    print('after a capture:',repr(r['afterCapture']),'| the same words:',repr(r['sameWords']))
    print('other words:',repr(r['otherWords']))
    print('after capturing again:',repr(r['afterSecond']))
    print('after removing the quote:',repr(r['afterRemove']),'| box hidden:',r['boxHidden'],'| page cleared:',r['cleared'])
    if 'Open source' not in r['quoted']: errs.append('the capture did not carry the quote into the panel')
    if r['afterCapture']!="You're annotating": errs.append(f"a fresh capture said {r['afterCapture']!r}")
    if r['sameWords']!="You're annotating": errs.append(f"the words already quoted were called new: {r['sameWords']!r}")
    if 'different words' not in r['otherWords']: errs.append(f"other words drew no warning: {r['otherWords']!r}")
    if r['afterSecond']!="You're annotating": errs.append(f"capturing again left the warning up: {r['afterSecond']!r}")
    if not r['boxHidden']: errs.append('removing the quote left the quote showing')
    if r['cleared']!=1: errs.append('removing the quote did not take the stroke off the page')
    if r['afterRemove']!="You're annotating": errs.append(f"removing the quote left a warning: {r['afterRemove']!r}")

    # The card quotes the passage, and falls back to the post when the whole post was taken.
    cards=await pan.evaluate(CARD,[rec(1,'Open source code in the post below.'), rec(2,'')])
    print('cards say:',cards)
    if not any('Open source code in the post below.' in c for c in cards): errs.append('no card quoted the passage')
    if not any(c.startswith('"A real-time') for c in cards): errs.append('a post with no quote lost its text')
    picked = [c for c in cards if c.startswith('"Open source')]
    if len(picked)!=1: errs.append('the card quoting the passage did not show the passage on its own')

    # A quote with paragraphs in it. The blank lines between them carry no ink.
    para = rec(3, 'First paragraph of the post.\n\nSecond paragraph of the post.\nStill the second.')
    qt = await pan.evaluate(QUOTE, para)
    print('ink runs:',qt['marks'])
    if qt['blank']: errs.append(f"{qt['blank']} runs of ink held no words, so the paragraph gaps are marked")
    if len(qt['marks'])!=3: errs.append(f"the quote came out as {len(qt['marks'])} runs of ink, wanted one to a line")
    if 'First paragraph' not in qt['text'] or 'Still the second' not in qt['text']:
        errs.append('the quote lost some of its words')

    # Three takes on the same post name it once.
    def onPost(i, quote, pid):
        r = rec(i, quote); r['item']['id'] = pid; r['item']['url'] = 'https://x.com/techartist_/status/' + pid
        return r
    run = await pan.evaluate(RUN, [onPost(1,'First words.','9'), onPost(2,'Second words.','9'),
                                   onPost(3,'Third words.','9'), onPost(4,'Elsewhere.','7')])
    print('source lines:',[(c['title'],c['again']) for c in run])
    named=[c['title'] for c in run if not c['again']]
    if len(named)!=2: errs.append(f'the post was named {len(named)} times across four cards, wanted twice')
    if any(t=='Same post' for t in named): errs.append('a card that names the source said Same post instead')
    if [c['again'] for c in run]!=[False, False, True, True]:
        errs.append(f"the run came out as {[c['again'] for c in run]}, so the grouping followed the wrong cards")
    if any(c['title']!='Same post' for c in run if c['again']): errs.append('a repeat card did not say Same post')
    if len({c['quote'] for c in run}) != 4: errs.append('the cards lost the quotes that tell them apart')

    # A quote that stops in the middle of a sentence says so, and still publishes.
    frag = await pan.evaluate(FRAG, POST)
    print('fragment note:',repr(frag['note']),'| whole sentence note:',repr(frag['whole']))
    if 'middle of a sentence' not in frag['note']: errs.append(f"a half sentence drew no note: {frag['note']!r}")
    if frag['whole']: errs.append(f"a whole sentence was called a fragment: {frag['whole']!r}")
    if not frag['sameChance']: errs.append('the note changed whether the annotation could be published')

    # Capturing the same post again keeps the words already chosen.
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':700})
    await pg.goto('https://x.com/techartist_/status/1'); await asyncio.sleep(1.4)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('x.com')).id)")
    a=await sw.evaluate(AGAIN,{'tid':tid})
    print('first capture:',repr(a['first']),'| marked:',repr(a['painted']))
    print('captured again:',repr(a['again']),'| marked:',repr(a['marks']))
    if a['first']!='A real-time coastal simulation': errs.append(f"the first capture took {a['first']!r}")
    if a['again']!=a['first']: errs.append(f"capturing again took {a['again']!r} instead of the words already chosen")
    if a['marks'].strip()!=a['first']: errs.append(f"the stroke after capturing again covered {a['marks']!r}")

    # The stroke is on the page while the picture of the post is taken.
    shot=await sw.evaluate(SHOT,{'tid':tid})
    print('marked while the picture was taken:',repr(shot['whileShooting']),'| quote:',repr(shot['quote']))
    if not shot['quote'] or shot['whileShooting'].strip()!=shot['quote'].strip():
        errs.append('the picture of the post was taken before the words were marked, so it points at nothing')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
