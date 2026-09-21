# A GIF can go in a take, the way one goes in a message. The picker searches GIPHY, and because the free key
# allows a hundred calls an hour shared by everyone running the extension, it is thrifty: trending is asked
# for once, a search waits until you stop typing, and running out says so rather than showing an empty grid.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# The picker, driven against a stand-in for GIPHY so no allowance is spent and the test does not need the net.
PICK = """async () => {
  const calls = [];
  const fake = [
    { id: '1', preview: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', url: 'https://media.giphy.com/one.gif', w: 200, h: 120, alt: 'A cat' },
    { id: '2', preview: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', url: 'https://media.giphy.com/two.gif', w: 200, h: 120, alt: 'A dog' },
  ];
  Giphy.ready = () => true;
  Giphy.list = async (q) => { calls.push(q || 'trending'); if (q === 'boom') throw new Error('busy'); return q === 'nothing' ? [] : fake; };
  const d = document.createElement('div'); document.body.appendChild(d);
  const api = Compose.create(d, { placeholder: 'What should people notice?', log() {}, onPublish: async () => ({}) });
  const out = { shown: !d.querySelector('.gifBtn').hidden, publishOff: d.querySelector('.publish').disabled,
                hint: d.querySelector('.publishHint').textContent };
  d.querySelector('.gifBtn').click();
  await new Promise((r) => setTimeout(r, 200));
  out.opened = !d.querySelector('.gifPick').hidden;
  out.tiles = d.querySelectorAll('.gpItem').length;
  out.mark = (d.querySelector('.gpMark') || {}).textContent || '';
  // Typing waits, rather than searching on every letter.
  const qq = d.querySelector('.gpQ');
  for (const t of ['c', 'ca', 'cat']) { qq.value = t; qq.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 80)); }
  await new Promise((r) => setTimeout(r, 700));
  out.searched = calls.slice();
  // Choosing one closes the picker, shows it, and makes the annotation publishable with nothing written.
  d.querySelectorAll('.gpItem')[1].click();
  await new Promise((r) => setTimeout(r, 120));
  out.closed = d.querySelector('.gifPick').hidden;
  out.chosen = !d.querySelector('.gifChosen').hidden;
  out.value = api.value().gif;
  out.publishOn = !d.querySelector('.publish').disabled;
  // Taking it off again puts everything back.
  d.querySelector('.gcRemove').click();
  await new Promise((r) => setTimeout(r, 80));
  out.afterRemove = { gif: api.value().gif, publishOff: d.querySelector('.publish').disabled };
  // Out of allowance says so.
  d.querySelector('.gifBtn').click();
  qq.value = 'boom'; qq.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  out.busy = d.querySelector('.gpStatus').textContent;
  d.remove();
  return out;
}"""
# A comment can carry one too, through the same picker, and a GIF on its own is a reply.
COMMENT = """async (rec) => {
  const fake = [{ id: '9', preview: 'https://media.giphy.com/nine-small.gif', url: 'https://media.giphy.com/nine.gif', w: 200, h: 120, alt: 'A shrug' }];
  Giphy.ready = () => true;
  Giphy.list = async () => fake;
  const d = document.createElement('div'); document.body.appendChild(d);
  const posted = [];
  await AnnotationPage.render(d, { item: rec.item, take: rec.take, records: [rec], showBanner: false, comments: [] },
    { onComments: (list, change) => posted.push(change) });
  const out = { button: !d.querySelector('.cGifBtn').hidden };
  d.querySelector('.cGifBtn').click();
  await new Promise((r) => setTimeout(r, 250));
  out.tiles = d.querySelectorAll('.cGifPick .gpItem').length;
  d.querySelector('.cGifPick .gpItem').click();
  await new Promise((r) => setTimeout(r, 80));
  out.chosen = !d.querySelector('.cGifChosen').hidden;
  // Nothing typed, so this is a GIF on its own.
  d.querySelector('.cPost').click();
  await new Promise((r) => setTimeout(r, 120));
  out.added = posted.length ? posted[posted.length - 1].added : null;
  out.inList = !!d.querySelector('.cmtGif img');
  out.src = d.querySelector('.cmtGif img') ? d.querySelector('.cmtGif img').getAttribute('src') : '';
  out.cleared = d.querySelector('.cGifChosen').hidden;
  d.remove();
  return out;
}"""
# A GIF with no words is still an annotation, and the page shows it.
PAGE = """async (rec) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  await AnnotationPage.render(d, { item: rec.item, take: rec.take, records: [rec], showBanner: false }, {});
  const img = d.querySelector('.takeGif img');
  const out = { shown: !!img, src: img ? img.getAttribute('src') : '', alt: img ? img.getAttribute('alt') : '',
                mark: (d.querySelector('.takeGif figcaption') || {}).textContent || '' };
  d.remove();
  return out;
}"""
REC = {'id': 'g1', 'created': 1700000000000,
       'item': {'kind': 'post', 'text': 'A post', 'quote': 'some words', 'author': 'Techartist', 'handle': '@techartist_'},
       'take': {'text': '', 'tag': None, 'poll': None, 'voice': None,
                'gif': {'id': '2', 'url': 'https://media.giphy.com/two.gif', 'preview': 'https://media.giphy.com/two-small.gif', 'w': 200, 'h': 120, 'alt': 'A dog'}},
       'comments': [], 'reactions': []}
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profGP'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':420,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.3)

    r=await pan.evaluate(PICK)
    print('picker opened:',r['opened'],'| tiles:',r['tiles'],'|',repr(r['mark']))
    print('searches sent:',r['searched'])
    print('chosen:',r['value'],'| picker closed:',r['closed'],'| publish on:',r['publishOn'])
    print('after removing it:',r['afterRemove'])
    print('out of allowance:',repr(r['busy']))
    if not r['shown']: errs.append('the GIF button was hidden even with a key to search with')
    if not r['opened'] or r['tiles']!=2: errs.append(f"the picker showed {r['tiles']} GIFs")
    if 'GIPHY' not in r['mark']: errs.append('GIPHY is not credited beside the picker')
    if r['searched'][0]!='trending': errs.append(f"it opened with {r['searched'][0]!r} rather than trending")
    if r['searched'].count('cat')!=1 or len(r['searched'])!=2:
        errs.append(f'typing three letters sent {r["searched"]}, so it searches before you have stopped')
    if not r['closed'] or not r['chosen']: errs.append('choosing a GIF did not close the picker and show it')
    if not r['value'] or r['value']['id']!='2': errs.append(f"the take carries {r['value']}")
    if not r['publishOn']: errs.append('a GIF on its own could not be published')
    if r['afterRemove']['gif'] or not r['afterRemove']['publishOff']: errs.append('removing the GIF left it behind')
    if 'hour' not in r['busy']: errs.append(f'running out of allowance said {r["busy"]!r}')

    a=await pan.evaluate(PAGE, REC)
    print('on the annotation page:',a)
    if not a['shown']: errs.append('the annotation page did not show the GIF')
    if a['src']!=REC['take']['gif']['url']: errs.append(f"it showed {a['src']}")
    if a['alt']!='A dog': errs.append('the GIF has no words describing it')
    if 'GIPHY' not in a['mark']: errs.append('GIPHY is not credited on the annotation')

    c=await pan.evaluate(COMMENT, REC)
    print('comment box offers a GIF:',c['button'],'| tiles:',c['tiles'],'| chosen:',c['chosen'])
    print('posted:',c['added'],'| shown in the list:',c['inList'],'| box cleared:',c['cleared'])
    if not c['button']: errs.append('the comment box did not offer a GIF')
    if c['tiles']!=1: errs.append(f"the comment picker showed {c['tiles']} GIFs")
    if not c['chosen']: errs.append('choosing a GIF for a comment did not show it')
    if not c['added'] or not c['added'].get('gif'): errs.append(f"the comment went without its GIF: {c['added']}")
    if c['added'] and c['added'].get('text'): errs.append('the comment invented words that were not typed')
    if not c['inList'] or c['src']!='https://media.giphy.com/nine.gif': errs.append(f"the comment in the list shows {c['src']!r}")
    if not c['cleared']: errs.append('the GIF stayed in the box after the comment was posted')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
