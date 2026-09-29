# The twelfth audit pass of 2026-09-29.
#   1. A post's link is parsed: only the post's own address on X survives.
#   2. A card names the host its link goes to when the row's site name does not belong to it.
#   3. Hidden words are left out of a quote, but words in a display: contents wrapper or a visible child of a
#      visibility: hidden parent are kept.
#   4. The new doodles and faces are cached like the paper.
import asyncio, json, os
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site

ROW = {'id': 'fake-site-ab12', 'author_id': 'u1', 'kind': 'article', 'take_text': 'Read this', 'tag': None, 'created_at': '2026-09-29T10:00:00Z', 'poll': None,
       'source': {'kind': 'article', 'text': 'Quoted words.', 'fragmentUrl': 'https://evil.example/login#:~:text=Quoted',
                  'meta': {'title': 'Big story', 'url': 'https://evil.example/login', 'site': 'The New York Times'}},
       'author': {'id': 'u1', 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''},
       'comments': [], 'first': [], 'reactions': [], 'poll_votes': []}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    async def db(route):
      u = route.request.url
      if '/rest/v1/annotations' in u: return await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range'}, body=json.dumps([ROW]))
      return await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?feed'); await asyncio.sleep(3.5)

    links = await pg.evaluate("""['https://x.com/a/status/1/../../../intent/post?text=hi', 'https://x.com/someone/status/123/photo/1', 'https://x.com.evil.example/a/status/1', 'http://x.com/a/status/1']
      .map((u) => AnnotationPage.srcUrlOf({ kind: 'post', url: u }))""")
    print('1. post links:', links)
    if links != ['', 'https://x.com/someone/status/123', '', '']: errs.append(f'a post link was not held to the post: {links}')

    card = await pg.evaluate("(document.querySelector('.cst') || {}).textContent || ''")
    print('2. card source line:', card)
    if 'evil.example' not in card: errs.append(f'the card names a site its link does not go to: {card!r}')

    q = await pg.evaluate("""(() => { const box = document.createElement('div');
      box.innerHTML = '<div id="w" style="display:contents"><p>First paragraph here.</p><p>Second <span style="display:none">SECRET </span>one.</p></div><p style="visibility:hidden">GHOST <span style="visibility:visible">Shown child.</span></p>';
      document.body.appendChild(box); const r = document.createRange(); r.selectNodeContents(box);
      const out = ArticleCore.quoteText(r); box.remove(); return out; })()""")
    print('3. quote:', repr(q))
    if 'SECRET' in q or 'GHOST' in q: errs.append(f'hidden words reached the quote: {q!r}')
    if 'First paragraph here.' not in q or 'Second one.' not in q.replace('  ', ' ') or 'Shown child.' not in q: errs.append(f'visible words were lost: {q!r}')
    await b.close()

  h = open(os.path.join(ROOT, 'website', 'public', '_headers'), encoding='utf-8').read()
  print('4. cached folders:', [k for k in ('/paper/*', '/doodles/*', '/peeps/*') if k in h])
  if '/doodles/*' not in h or '/peeps/*' not in h: errs.append('the doodles or faces are not cached')
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
