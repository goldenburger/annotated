# Any words may be annotated. A headline used to be refused with "Pick a passage from the story, not the
# headline", which is what the recording of 2026-09-22 at 20:59 ran into, and publishing then asked "Publish a
# part sentence?" every time. This takes the top headline, a headline on a section page with its summary
# under it, and a single word, and checks each captures, says nothing about part sentences when there is
# nothing to grow, and publishes on the first press. It also checks the red line about a selection goes away
# with the selection, which it did not, sitting under the empty panel after the words were let go.
import asyncio
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
LONG = ' '.join(['The committee heard from residents who wanted the late service kept, and from drivers who wanted longer breaks.'] * 14)
STORY = ('<!doctype html><html><head><title>Sushi place opens on Folsom | Harbor Bee</title>'
         '<meta property="og:site_name" content="Harbor Bee"></head><body style="font:18px Georgia;margin:40px auto;max-width:700px">'
         '<p class="kicker">Restaurant news</p>'
         '<h1 itemprop="headline">All-you-can-eat sushi restaurant opens on Folsom Boulevard</h1>'
         '<p>By Emma Hall</p>'
         '<p>Along Folsom Boulevard, a new sushi restaurant has settled into a longtime storefront. It serves rolls, tacos and bowls.</p>'
         f'<p id="long">{LONG}</p></body></html>')
SECTION = ('<!doctype html><html><head><title>Sports | Harbor Bee</title></head><body style="font:18px Georgia;margin:40px auto;max-width:700px">'
           '<h2>High school sports</h2>'
           '<article><h3><a href="/sports/top-25">The Top 25: Folsom, Oak Ridge and Del Oro are a combined 23-1</a></h3>'
           '<p>The list includes No. 1 Folsom, No. 2 Oak Ridge and No. 3 Del Oro, with seven more from the region.</p></article>'
           '</body></html>')
PICK = '''(sel) => { const el = document.querySelector(sel); const r = document.createRange(); r.selectNodeContents(el);
  getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); }'''
WORD = '''() => { const t = document.querySelectorAll('p')[2].firstChild; const i = t.nodeValue.indexOf('sushi');
  const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 5);
  getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); }'''

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profHEAD'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harbor.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html'},
      body=SECTION if '/sports' in r.request.url else STORY))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)

    async def open_beside(url):
      pg = await ctx.new_page(); await pg.goto(url); await asyncio.sleep(.8)
      tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
      await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tid}',width:420,height:1000}})")
      pan = await ctx.wait_for_event('page'); await asyncio.sleep(2.5)
      pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
      return pg, pan

    async def take(pg, pan, pick, arg=None, label=''):
      await pg.bring_to_front()
      for _ in range(6):
        await (pg.evaluate(pick, arg) if arg else pg.evaluate(pick)); await asyncio.sleep(.8)
        if await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"): break
      err = (await pan.inner_text('#articleMode .selErr')).strip() if await pan.is_visible('#articleMode .selErr') else ''
      if err: errs.append(f'{label}: the selection was refused with {err!r}'); return None
      shown = await pg.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')")
      if not shown: errs.append(f'{label}: no Annotate button beside the words'); return None
      await press_annotate(pg)
      await pan.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=25000); await asyncio.sleep(1.2)
      quote = (await pan.inner_text('#articleMode .capQuote')).strip()
      frag = (await pan.inner_text('#articleMode .aFrag')).strip() if await pan.is_visible('#articleMode .aFrag') else ''
      print(f'{label}: captured {quote!r} | note {frag!r}')
      return quote, frag

    # 1. The top headline, whole. A headline has no full stop, and it is still not part of a sentence.
    pg, pan = await open_beside('https://harbor.example/2026/09/21/sushi')
    got = await take(pg, pan, PICK, 'h1', 'the headline')
    if got:
      if got[0] != 'All-you-can-eat sushi restaurant opens on Folsom Boulevard': errs.append(f'the headline captured as {got[0]!r}')
      if got[1]: errs.append(f'a whole headline was called part of a sentence: {got[1]!r}')
      await pan.fill('#articleMode .takeInput', 'Third one on this street.')
      await pan.click('#articleMode .publish')
      try:
        await pan.wait_for_selector('#articleMode .aPublished:not([hidden])', timeout=8000)
        print('published on the first press:', (await pan.inner_text('#articleMode .aPublished'))[:80].replace('\n', ' | '))
      except Exception:
        ask = await pan.evaluate("(document.querySelector('#articleMode .dupcard')||{}).textContent||''")
        errs.append(f'Publish did not publish on the first press. On screen: {ask[:80]!r}')

    # 2. The red line about a selection leaves with the selection.
    await pg.bring_to_front(); await pg.evaluate(PICK, '#long'); await asyncio.sleep(1.2)
    said = (await pan.inner_text('#articleMode .selErr')).strip() if await pan.is_visible('#articleMode .selErr') else ''
    print('a passage too long says:', repr(said[:70]))
    if 'characters' not in said: errs.append(f'a passage over the limit was not refused: {said!r}')
    await pg.evaluate("getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange'))"); await asyncio.sleep(1.2)
    left = await pan.is_visible('#articleMode .selErr')
    print('after letting go of the words, the red line shows:', left)
    if left: errs.append('the red line stayed after the selection was let go')
    await pan.close()

    # 3. One word.
    pg2, pan2 = await open_beside('https://harbor.example/2026/09/21/sushi-again')
    got = await take(pg2, pan2, WORD, None, 'one word')
    if got and got[0] != 'sushi': errs.append(f'one word captured as {got[0]!r}')
    await pan2.close()

    # 4. A headline on a section page, with a summary right under it in the same card.
    pg3, pan3 = await open_beside('https://harbor.example/sports')
    got = await take(pg3, pan3, PICK, 'h3', 'a section headline')
    if got:
      if not got[0].startswith('The Top 25'): errs.append(f'the section headline captured as {got[0]!r}')
      if got[1]: errs.append(f'a whole section headline was called part of a sentence: {got[1]!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
