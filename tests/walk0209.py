# The recording of 2026-09-23 at 02:09, on Spotify.
#   1. "Listen to the episode" went to the show page the tab had moved to. It goes to the episode now: the
#      app's own episode page when the tab showed one for that episode, otherwise Apple's page for it.
#   2. The search suggestion stayed on the first episode page while another episode played. It follows the
#      tab now, until you type.
#   3. A title in quotes kept a quote in the box.
#   4. The profile page's Trending repeated your own annotations.
#   5. A feed card said "Poll" under a poll with votes.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
SPOT = lambda title: f'<!doctype html><html><head><title>{title}</title></head><body><p>Spotify stand-in</p></body></html>'
searches = []

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profW0209'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://open.spotify.com/episode/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'},
      body=SPOT('“This Is The Culmination Of Everything I Know” - Dr Andrew Huberman #1150 | Podcast on Spotify')))
    await ctx.route('https://open.spotify.com/show/**', lambda r: r.fulfill(status=200, headers={'Content-Type': 'text/html; charset=utf-8'},
      body=SPOT('Modern Wisdom | Podcast on Spotify')))
    def apple(r):
      from urllib.parse import urlparse, parse_qs
      searches.append(parse_qs(urlparse(r.request.url).query).get('term', [''])[0])
      return r.fulfill(status=200, content_type='application/json', body=json.dumps({'results': []}))
    await ctx.route('https://itunes.apple.com/**', apple)
    await ctx.route('https://efuotxdeifqzdfsavekb.supabase.co/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    tab = await ctx.new_page(); await tab.goto('https://open.spotify.com/episode/6TzkN2qJKXS0tm9QC8fxi4'); await asyncio.sleep(.5)
    tid = await sw.evaluate("chrome.tabs.query({url:'https://open.spotify.com/*'}).then(t=>t[0].id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900}); pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)
    box = await pan.input_value('.fpQ')
    print('3. the box on the episode page:', repr(box))
    if '“' in box or '”' in box or '"' in box: errs.append(f'the box kept quotes: {box!r}')

    # 2. The tab moves to the show page and plays another episode, which is what the title then says.
    await tab.goto('https://open.spotify.com/show/0XrOqvxlqQl6bmdYHuIVnr'); await asyncio.sleep(.4)
    await tab.evaluate("document.title = 'The New Way For Ordinary People To Build Wealth - Tony Robbins - #1153 · Modern Wisdom'"); await asyncio.sleep(2)
    box2 = await pan.input_value('.fpQ')
    print('2. the box once another episode plays:', repr(box2), '| searched:', searches[-1:] )
    if 'Tony Robbins' not in box2: errs.append(f'the suggestion did not follow the playing episode: {box2!r}')
    if not searches or 'Tony Robbins' not in searches[-1]: errs.append('the new suggestion was not searched')
    # Typing stops it.
    await pan.fill('.fpQ', 'my own words'); await asyncio.sleep(.3)
    await tab.evaluate("document.title = 'Something else entirely · Modern Wisdom'"); await asyncio.sleep(1.5)
    box3 = await pan.input_value('.fpQ')
    print('   after typing, a new title leaves the box as:', repr(box3))
    if box3 != 'my own words': errs.append(f'the suggestion replaced what was typed: {box3!r}')

    # 1. Where the source link goes.
    links = await pan.evaluate(f"""() => {{ const p = panels.get({tid});
      return [p._linkFor({{ title: '“This Is The Culmination Of Everything I Know” - Dr Andrew Huberman #1150', link: 'https://podcasts.apple.com/us/podcast/x/id1?i=1150' }}),
              p._linkFor({{ title: 'The New Way For Ordinary People To Build Wealth - Tony Robbins - #1153', link: 'https://podcasts.apple.com/us/podcast/x/id1?i=1153' }})]; }}""")
    print('1. links:', links)
    if links[0] != 'https://open.spotify.com/episode/6TzkN2qJKXS0tm9QC8fxi4': errs.append(f'the episode seen on Spotify was not linked: {links[0]}')
    if links[1] != 'https://podcasts.apple.com/us/podcast/x/id1?i=1153': errs.append(f'an episode never seen on Spotify was not linked to Apple: {links[1]}')

    # 4 and 5 on the profile page's renderer.
    out = await pan.evaluate("""() => { const box = document.createElement('div'); document.body.appendChild(box);
      const mine = { id: 'm1', created: Date.now(), item: { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/5' },
        take: { text: 'test 1', poll: { question: 'q', options: ['Agree', 'Disagree'], vote: null } }, comments: [], reactions: [], pollVotes: 2 };
      AnnotationPage.renderFeed(box, { records: [mine], mode: 'profile', onOpen() {},
        social: { followed: new Set(), people: [], trending: { tags: [], sources: [
          { kind: 'post', title: 'A on X', sample_id: 'm1', source_key: 'https://x.com/a/status/5', annotations: 1, activity: 1 },
          { kind: 'post', title: 'C on X', sample_id: 'c1', source_key: 'https://x.com/c/status/1', annotations: 1, activity: 1 }] } } });
      const o = { trend: [...box.querySelectorAll('.trend .rlTake')].map((e) => e.textContent),
        stat: [...box.querySelectorAll('.card .fStat')].map((e) => e.textContent.trim()) }; box.remove(); return o; }""")
    print('4, 5. profile rail and card:', out)
    if out['trend'] != ['C on X']: errs.append(f"the profile's Trending repeated your own: {out['trend']}")
    if '2 votes' not in out['stat']: errs.append(f"the card said {out['stat']}")
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
