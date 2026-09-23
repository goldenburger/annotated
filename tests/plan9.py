# Four fixes from the walk-through of 2026-09-22. A quote over several blocks keeps a line between them, where
# it used to read "in a decade The board says". A page with no words says so rather than asking for a passage.
# A panel that reloads comes back to the capture and the take, where it used to go back to the start. And a
# connection that fails while the browser thinks it is online saves on this computer at once, where Publish
# used to sit on Publishing for about seven seconds.
import asyncio, json, time
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
UID = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000,
           'expires_at': int(time.time()) + 360000,
           'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'r@example.test', 'app_metadata': {},
                    'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = [{'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}]
STORY = ('<!doctype html><html><head><meta charset="utf-8"><title>Ferry fares rise | Harbor Bee</title></head>'
         '<body style="font:18px/1.6 Georgia;max-width:700px;margin:40px auto">'
         '<h1 id="h">Ferry fares rise 40 percent, the first increase in a decade</h1>'
         '<p id="dek">The board says fuel costs left it no choice.</p>'
         '<p id="p1">The ferry board voted 5 to 2 on Monday to raise the adult fare from $5 to $7.</p></body></html>')
PHOTO = '<!doctype html><title>Photo</title><body style="margin:0"><div style="width:100vw;height:100vh;background:#345"></div></body>'
SPAN = '''() => { const r = document.createRange(); r.setStart(document.getElementById('h').firstChild, 0);
  const t = document.getElementById('dek').firstChild; r.setEnd(t, t.nodeValue.length);
  getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange')); }'''
BTN = "[...document.querySelectorAll('.annotated-ui')].find(h=>h.style.display==='block')"

async def main():
  errs = []
  net = {'down': False}
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profP9'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://bee.example/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'},
      body=PHOTO if 'photo' in r.request.url else STORY))
    async def db(route):
      u = route.request.url
      if '/auth/v1/health' in u: net.setdefault('health', []).append(route.request.headers.get('apikey', ''))
      if net['down']: return await route.abort('internetdisconnected')
      if '/auth/v1/' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user']))
      if '/rest/v1/profiles' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE))
      await route.fulfill(status=200, content_type='application/json', body='[]')
    await ctx.route(SUPA + '/**', db)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)

    async def beside(url):
      pg = await ctx.new_page(); await pg.goto(url); await asyncio.sleep(.8)
      tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
      await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={tid}',width:420,height:1000}})")
      pan = await ctx.wait_for_event('page'); await asyncio.sleep(2.5)
      pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
      return pg, pan, tid

    # 1. A headline and the paragraph under it.
    pg, pan, tid = await beside('https://bee.example/2026/09/22/ferry')
    await pg.bring_to_front()
    for _ in range(6):
      await pg.evaluate(SPAN); await asyncio.sleep(.8)
      if await pg.evaluate(f"!!({BTN})"): break
    await pg.evaluate(f"{BTN}.shadowRoot.querySelector('button').click()")
    await pan.wait_for_selector('#articleMode .aCompose:not([hidden])', timeout=25000); await asyncio.sleep(1.2)
    quote = await pan.evaluate("document.querySelector('#articleMode .capQuote').textContent")
    print('captured:', repr(quote))
    if quote != 'Ferry fares rise 40 percent, the first increase in a decade\n\nThe board says fuel costs left it no choice.':
      errs.append(f'the blocks ran together: {quote!r}')

    # 2. The panel reloads with a take half written.
    await pan.fill('#articleMode .takeInput', 'Third rise on this route.')
    await asyncio.sleep(.6)
    await pan.reload(); await asyncio.sleep(3)
    back = await pan.evaluate("""() => ({ quote: (document.querySelector('#articleMode .capQuote') || {}).textContent || '',
      compose: !document.querySelector('#articleMode .aCompose').hidden, take: (document.querySelector('#articleMode .takeInput') || {}).value || '' })""")
    print('after the panel reloaded:', back)
    if not back['compose'] or 'Ferry fares rise' not in back['quote']: errs.append(f'the capture did not come back after a reload: {back}')
    if back['take'] != 'Third rise on this route.': errs.append(f"the take did not come back: {back['take']!r}")

    # 3. Publishing while nothing gets through, though the browser thinks it is online.
    await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION); await asyncio.sleep(1)
    net['down'] = True
    t0 = time.time()
    await pan.click('#articleMode .publish')
    await pan.wait_for_selector('#articleMode .aPublished:not([hidden])', timeout=15000)
    took = time.time() - t0
    said = await pan.inner_text('#articleMode .aPublished')
    print(f'offline, it answered in {took:.1f} seconds:', said[:120].replace('\n', ' | '))
    if took > 4.5: errs.append(f'publishing with no connection took {took:.1f} seconds')
    if 'offline' not in said: errs.append(f'it did not say it was offline: {said!r}')
    net['down'] = False
    # The quick check carries the public key, so it is answered rather than refused with a 401 that the
    # browser logs as an error.
    print('the check carried a key:', [bool(k) for k in net.get('health', [])])
    if not net.get('health') or not all(net['health']): errs.append(f"the reachability check went without a key: {net.get('health')}")
    # Once published, the kept capture is gone, so a reload starts clean.
    await pan.reload(); await asyncio.sleep(3)
    clean = await pan.evaluate("document.querySelector('#articleMode .aCompose').hidden")
    print('after publishing and reloading, the panel starts clean:', clean)
    if not clean: errs.append('a published capture came back after a reload')

    # 4. A page with no words.
    pg2, pan2, _ = await beside('https://bee.example/photo')
    await asyncio.sleep(1)
    txt = await pan2.evaluate("(document.querySelector('#articleMode .selHint') || {}).innerText || ''")
    print('beside a photo:', txt.replace('\n', ' | ')[:200])
    if 'No words on this page' not in txt: errs.append(f'a page with no words asked for a passage: {txt[:120]!r}')
    await pan2.screenshot(path='plan9_nowords.png')

    # 5. The annotation page shows a quote over several blocks as paragraphs.
    paras = await pan2.evaluate("""async (text) => { const box = document.createElement('div'); document.body.appendChild(box);
      await AnnotationPage.render(box, { id: 'q', item: { kind: 'article', text, meta: { site: 'Bee', title: 'T', url: 'https://bee.example/a' } },
        take: { text: 'a take' }, permalink: 'https://x/y', comments: [], reactions: [], siteNav: false, showBanner: false });
      const ps = [...box.querySelectorAll('.pq blockquote p')].map((p) => p.textContent); box.remove(); return ps; }""", 'Headline here\n\nThe paragraph under it.')
    print('the page shows the quote as:', paras)
    if paras != ['Headline here', 'The paragraph under it.']: errs.append(f'the page ran the blocks together: {paras}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
