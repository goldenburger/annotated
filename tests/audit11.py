# The eleventh audit pass of 2026-09-29.
#   1. A page's canonical address is kept only on its own site.
#   2. Words a page hides inside a passage are left out of the quote.
#   3. A shared poll is only a question and options: counts or a vote in the row are dropped.
#   4. The list asks for the words of the first few replies only.
#   5. A post links only to a post on X.
#   6. A reaction the database refuses goes back alone, even after another reaction was pressed meanwhile.
import asyncio, json
from urllib.parse import unquote
from playwright.async_api import async_playwright
from _env import *
from uxpass0929 import SUPA, site

ROW = {'id': 'poll-row-ab12', 'author_id': 'u1', 'kind': 'article', 'take_text': 'A take', 'tag': None, 'created_at': '2026-09-29T10:00:00Z',
       'poll': {'question': 'Which?', 'options': ['One', 'Two'], 'counts': [999, 5], 'vote': 1},
       'source': {'kind': 'article', 'text': 'Quoted words.', 'meta': {'title': 'A story', 'url': 'https://news.example/story', 'site': 'News'}},
       'author': {'id': 'u1', 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''},
       'comments': [], 'first': [], 'reactions': [], 'poll_votes': []}

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1300, 'height': 900})
    lists = []
    async def db(route):
      u = unquote(route.request.url)
      if '/rest/v1/annotations' in u and 'select=' in u: lists.append(u)
      if '/rest/v1/annotations' in u: return await route.fulfill(status=200, content_type='application/json', headers={'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range'}, body=json.dumps([ROW]))
      return await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route('https://annotated-app.netlify.app/**', site); await c.route(SUPA + '/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?feed'); await asyncio.sleep(3)

    # 1.
    urls = await pg.evaluate("""(() => {
      const make = (canon) => { const d = document.implementation.createHTMLDocument('x'); d.head.innerHTML = `<link rel="canonical" href="${canon}">`; return d; };
      const loc = new URL('https://blog.example.org/posts/1?ref=a');
      return ['https://news.bigpaper.com/real-story', 'https://blog.example.org/posts/1', 'https://www.example.org/posts/1', 'javascript:alert(1)']
        .map((u) => ArticleCore.extractMeta(make(u), loc).url); })()""")
    print('1. canonical kept as:', urls)
    if urls[0] != 'https://blog.example.org/posts/1?ref=a': errs.append(f'another site was kept as the canonical address: {urls[0]}')
    if urls[1] != 'https://blog.example.org/posts/1' or urls[2] != 'https://www.example.org/posts/1': errs.append(f"the page's own canonical address was dropped: {urls}")
    if urls[3].startswith('javascript'): errs.append('a javascript canonical address was kept')

    # 2.
    q = await pg.evaluate("""(() => { const box = document.createElement('div');
      box.innerHTML = '<p id="hq">The board voted <span style="display:none">SECRETLY </span>on Tuesday to <span style="opacity:0">NOT </span>approve the plan.</p><p id="hq2">Plain words here.</p>';
      document.body.appendChild(box); const p = document.getElementById('hq'), r = document.createRange(); r.selectNodeContents(p);
      const r2 = document.createRange(); r2.selectNodeContents(document.getElementById('hq2'));
      const out = [ArticleCore.quoteText(r), ArticleCore.quoteText(r2)]; box.remove(); return out; })()""")
    print('2. quotes:', q)
    if 'SECRETLY' in q[0] or 'NOT' in q[0]: errs.append(f'hidden words reached the quote: {q[0]!r}')
    if 'The board voted' not in q[0] or 'approve the plan.' not in q[0] or q[1] != 'Plain words here.': errs.append(f'visible words were lost: {q}')

    # 3 and 4.
    lists.clear()
    got = await pg.evaluate("Cloud.list({ limit: 5 }).then((rs) => rs[0].take.poll)")
    print('3. poll as read:', got)
    if not got or 'counts' in got or got.get('vote') is not None or got.get('options') != ['One', 'Two']: errs.append(f'the poll carried more than its options: {got}')
    q4 = lists[-1] if lists else ''
    print('4. list query:', q4[q4.find('select='):][:220])
    if 'first:comments' not in q4 or 'first.limit=6' not in q4 or 'comments(author_id)' not in q4: errs.append(f"the list still asks for every reply's words: {q4}")

    # 5.
    links = await pg.evaluate("""[AnnotationPage.srcUrlOf({ kind: 'post', url: 'https://evil.example/login' }),
      AnnotationPage.srcUrlOf({ kind: 'post', url: 'https://x.com/someone/status/123' }),
      AnnotationPage.srcUrlOf({ kind: 'post', url: 'https://mobile.twitter.com/someone/status/9?s=20' })]""")
    print('5. post links:', links)
    if links[0] or links[1] != 'https://x.com/someone/status/123' or not links[2]: errs.append(f'a post links somewhere other than X: {links}')

    # 6.
    rx = await pg.evaluate("""async () => { const box = document.createElement('div'); document.body.appendChild(box);
      EmojiKit.reactions(box, { list: [{ emoji: '👍', count: 2, mine: false }, { emoji: '🔥', count: 1, mine: false }],
        onChange: (all, ch) => ch.emoji === '👍' ? new Promise((r) => setTimeout(() => r(false), 300)) : Promise.resolve(true) });
      box.querySelectorAll('.rChip')[0].click(); await new Promise((r) => setTimeout(r, 50));
      box.querySelectorAll('.rChip')[1].click(); await new Promise((r) => setTimeout(r, 600));
      const out = [...box.querySelectorAll('.rChip')].map((c) => c.textContent + (c.getAttribute('aria-pressed') === 'true' ? ' mine' : '')); box.remove(); return out; }""")
    print('6. chips after one refused and one saved:', rx)
    if rx != ['👍2', '🔥2 mine']: errs.append(f'the refused reaction did not go back alone: {rx}')
    await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
