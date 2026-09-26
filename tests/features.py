# The front page's "What else it does" (website/public/features.js, David, 2026-09-25).
#   1. Tags, polls and reactions: a tag, a poll and a reaction show on the card as they are chosen, and a vote counts.
#   2. Every annotation gets its own page: a reply is added, and File a claim says plainly that nothing was sent.
#   3. Clip podcasts from Spotify: the three steps switch, and the waveform is drawn from the episode's loudness.
#   4. The line of the rest: every chip has a tip, shown on focus.
#   5. Nothing is sent anywhere: no request leaves for the database while the examples are used.
#   6. Marked words keep dark ink in dark mode.
import asyncio, pathlib, mimetypes
from playwright.async_api import async_playwright
from _env import *
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
def site(route):
  from urllib.parse import urlparse
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    await c.route('https://annotated-app.netlify.app/**', site)
    sent = []
    async def db(route):
      if route.request.method != 'GET': sent.append(route.request.method + ' ' + route.request.url)
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route('https://efuotxdeifqzdfsavekb.supabase.co/**', db)
    pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    await pg.goto('https://annotated-app.netlify.app/?noplanes'); await pg.wait_for_selector('.landFeatures'); await asyncio.sleep(.8)
    # 1.
    await pg.fill('.ftTake', 'The link is the point.')
    await pg.click('.ftTag:nth-child(2)'); await pg.click('.ftPollBtn'); await pg.click('.ftChoice'); await pg.click('.ftCard .ftR')
    one = await pg.evaluate("""({ take: document.querySelector('.ftCard .ftTakeOut').textContent, tag: document.querySelector('.ftCard .ftTagOut').textContent,
      poll: !document.querySelector('.ftCard .ftPoll').hidden, pct: document.querySelector('.ftChoice b').textContent, react: document.querySelector('.ftCard .ftR b').textContent })""")
    print('1.', one)
    if one != {'take': 'The link is the point.', 'tag': 'Fact check', 'poll': True, 'pct': '100%', 'react': '1'}: errs.append(f'the take card did not follow: {one}')
    # 2.
    await pg.fill('.ftCIn', 'Agreed.'); await pg.click('.ftComment button')
    await pg.click('.ftClaim'); await pg.click('.ftClaimForm button')
    two = await pg.evaluate("({ reply: [...document.querySelectorAll('.ftComments .ftCt')].map((x) => x.textContent), said: document.querySelector('.ftSaid').hidden ? null : document.querySelector('.ftSaid').textContent })")
    print('2.', two)
    if two['reply'] != ['Agreed.'] or not two['said'] or 'nothing was sent' not in two['said']: errs.append(f'the page example did not work: {two}')
    # 3.
    await pg.click('.ftSteps li:nth-child(3) .ftStep'); await asyncio.sleep(.5)
    three = await pg.evaluate("({ shown: [...document.querySelectorAll('.ftFrame')].map((f) => !f.hidden), bars: document.querySelectorAll('.ftWave i').length, inClip: document.querySelectorAll('.ftWave i.in').length })")
    print('3.', three)
    if three['shown'] != [False, False, True] or three['bars'] < 40 or not (10 < three['inClip'] < three['bars']): errs.append(f'the podcast steps did not work: {three}')
    # 4.
    await pg.focus('.ftChip')
    four = await pg.evaluate("({ chips: document.querySelectorAll('.ftChip').length, tips: [...document.querySelectorAll('.ftTip')].filter((t) => t.textContent.trim()).length, shown: getComputedStyle(document.querySelector('.ftTip')).visibility })")
    print('4.', four)
    if four['chips'] < 8 or four['tips'] != four['chips'] or four['shown'] != 'visible': errs.append(f'the chips have no tips: {four}')
    # 7. For you, and why (it replaced "If the post gets deleted" on 2026-09-25): every card says why it is there,
    # Following holds only who you follow, and Follow changes both. The examples quote real posts, linked. The X card.
    rec = await pg.evaluate("""({ whys: [...document.querySelectorAll('.ftFY .ftWhy')].map((w) => w.textContent.trim()),
      links: [...document.querySelectorAll('.ftDemo a[href*="x.com/"]')].map((a) => a.getAttribute('href')),
      brief: document.querySelector('.landFeatures').textContent.includes('must link back to its original source URL'),
      deleted: !!document.querySelector('.ftRDel'), card: !!document.querySelector('.ftXCard .ftXTake'),
      chips: [...document.querySelectorAll('.ftChip')].map((c) => c.textContent) })""")
    await pg.click('.ftTabs [role="tab"]:nth-child(2)'); await asyncio.sleep(.2)
    shown1 = await pg.evaluate("[...document.querySelectorAll('.ftFY')].filter((c) => !c.hidden).length")
    await pg.click('.ftTabs [role="tab"]:nth-child(1)'); await pg.click('.ftFY:nth-child(2) .ftFollow')
    await pg.click('.ftTabs [role="tab"]:nth-child(2)'); await asyncio.sleep(.2)
    shown2 = await pg.evaluate("({ n: [...document.querySelectorAll('.ftFY')].filter((c) => !c.hidden).length, why: document.querySelector('.ftFY:nth-child(2) .ftWhy').textContent.trim() })")
    print('7.', rec['whys'], len(set(rec['links'])), 'posts linked | Following holds', shown1, 'then', shown2)
    if len(rec['whys']) != 3 or not all(rec['whys']): errs.append(f'the For you cards do not say why: {rec["whys"]}')
    if len(set(rec['links'])) < 3 or rec['brief'] or rec['deleted'] or not rec['card']: errs.append(f'the examples do not quote the real posts: {rec}')
    if shown1 != 1 or shown2['n'] != 2 or shown2['why'] != 'You follow Priya': errs.append(f'Following and Follow did not work: {shown1} {shown2}')
    if not {'Invite by email', 'Works offline', 'Drafts are kept', 'Trending and people to follow'} <= set(rec['chips']): errs.append(f"chips missing: {rec['chips']}")
    # 8. The Post on X tab shows the post as a screenshot, an embed or both.
    await pg.evaluate("scrollTo(0, 0)"); await pg.click('#tab-post'); await asyncio.sleep(.6)
    await pg.click('.tp-post .stForMe'); await asyncio.sleep(2)
    await pg.click('.tp-post .stShowB[data-v="both"]')
    await pg.fill('.tp-post .stTake textarea', 'Hardware really is hard.'); await pg.click('.tp-post .stMake'); await asyncio.sleep(.6)
    both = await pg.evaluate("({ shot: !!document.querySelector('.tp-post .stShot mark'), embed: !!document.querySelector('.tp-post .stEmbed .stEmbedText') })")
    print('8. screenshot and embed:', both)
    if both != {'shot': True, 'embed': True}: errs.append(f'the post was not shown both ways: {both}')
    # 9. The Article tab offers the whole sentence for part of one.
    await pg.click('#tab-article'); await asyncio.sleep(.5)
    await pg.evaluate("(() => { const t = document.querySelector('.tp-article [data-annotated-self]'); const r = ArticleCore.findText(t, 'sidebar Chrome extension'); getSelection().removeAllRanges(); getSelection().addRange(r); })()")
    await asyncio.sleep(.3); await pg.click('.tiBtn'); await asyncio.sleep(2)
    offered = await pg.evaluate("!document.querySelector('.tiWhole').hidden")
    await pg.click('.tiWhole'); await asyncio.sleep(2)
    marked = await pg.evaluate("[...document.querySelectorAll('.tp-article mark.annotated-hl')].map((m) => m.textContent).join('').trim()")
    print('9. whole sentence offered', offered, '| marked:', marked[:60])
    if not offered or not marked.startswith('Annotated is a sidebar'): errs.append(f'the whole sentence was not offered or taken: {offered}, {marked[:60]}')
    # 6.
    ink = await pg.evaluate("getComputedStyle(document.querySelector('.ftDemo mark')).color")
    print('6. marked words in dark mode:', ink)
    if ink != 'rgb(22, 24, 29)': errs.append(f'marked words are {ink} in dark mode')
    # 5.
    print('5. requests sent:', sent)
    if sent: errs.append(f'the examples sent something: {sent}')
    await b.close()
  print('errors:', errs)

asyncio.run(main())
