# Every card in a list carries a picture when there is one to carry. Posts used to be the one kind with none
# at all, so a column of annotations from X had nothing for the eye to catch, even though every post keeps a
# screenshot. A screenshot is read from its top left, where the author and the first line are, while a preview
# image made for sharing is composed to be seen whole and stays centred.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
SHOT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
CHECK = r"""async (records) => {
  const d = document.createElement('div'); document.body.appendChild(d);
  AnnotationPage.renderFeed(d, { records, mode: 'home', onOpen() {}, onTag() {}, onAll() {} });
  await new Promise((r) => setTimeout(r, 400));
  const out = [...d.querySelectorAll('.cardItem')].map((li) => {
    const img = li.querySelector('.cthumb img');
    return { id: (li.querySelector('.card') || {}).dataset ? li.querySelector('.card').dataset.id : '',
             pic: img ? img.getAttribute('src') : '', top: img ? img.className : '', lazy: img ? img.getAttribute('loading') : '' };
  });
  d.remove();
  return out;
}"""
def rec(rid, item):
    return {'id': rid, 'created': 1700000000000, 'item': item, 'comments': [], 'reactions': [],
            'take': {'text': 'A take', 'tag': None, 'poll': None, 'voice': None, 'gif': None}}
RECORDS = [
    rec('post1', {'kind': 'post', 'text': 'A post', 'quote': 'some words', 'author': 'Techartist',
                  'handle': '@techartist_', 'url': 'https://x.com/techartist_/status/1', 'shot': SHOT}),
    rec('art1', {'kind': 'article', 'text': 'A passage', 'fragmentUrl': 'https://news.example/a',
                 'meta': {'title': 'A headline', 'site': 'News', 'image': 'https://news.example/card.jpg'}}),
    rec('art2', {'kind': 'article', 'text': 'Another passage', 'fragmentUrl': 'https://news.example/b',
                 'meta': {'title': 'No preview image', 'site': 'News'}, 'shotThumb': SHOT}),
    rec('aud1', {'kind': 'audio', 'title': 'An episode', 'show': 'A show', 'url': 'https://pod.example/e',
                 'artwork': 'https://pod.example/art.jpg', 'start': 10, 'end': 20, 'duration': 600}),
]
WANT = {
    'post1': (SHOT, 'top', 'a post shows its screenshot'),
    'art1':  ('https://news.example/card.jpg', '', "an article shows the page's preview image"),
    'art2':  (SHOT, 'top', 'an article with no preview image shows its screenshot'),
    'aud1':  ('https://pod.example/art.jpg', '', "a podcast shows the show's artwork"),
}
async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profCARDPIC'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 1100, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)

    cards = await pg.evaluate(CHECK, RECORDS)
    for c in cards:
        short = (c['pic'] or '')[:46] + ('…' if len(c['pic'] or '') > 46 else '')
        print(f"{c['id']}: {short or 'no picture'} | anchored {c['top'] or 'centre'} | loading {c['lazy'] or 'eager'}")
    got = {c['id']: c for c in cards}
    if len(cards) != len(RECORDS): errs.append(f'{len(cards)} cards for {len(RECORDS)} annotations')
    for rid, (src, cls, what) in WANT.items():
        c = got.get(rid)
        if not c: errs.append(f'no card for {rid}'); continue
        if c['pic'] != src: errs.append(f"{what}: it shows {c['pic'][:60]!r}")
        if c['top'] != cls: errs.append(f"{rid} is anchored {c['top'] or 'centre'!r} rather than {cls or 'centre'!r}")
        if c['lazy'] != 'lazy': errs.append(f'{rid} loads its picture before it is on screen')
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
