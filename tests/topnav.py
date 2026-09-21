# Home and your own profile used to appear only once you had published something, so while you were capturing
# there was no way back to what you had already made. They belong in the panel's top bar, in every mode.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BAR = """() => {
  const b = document.querySelector('.brand');
  const one = (s) => { const e = b.querySelector(s); return e ? { label: e.getAttribute('aria-label'),
    tip: e.dataset.tooltip, x: Math.round(e.getBoundingClientRect().left) } : null; };
  return { home: one('.homeBtn'), you: one('.youBtn'), acct: one('.acctBtn') || one('.gearBtn'),
           fits: b.scrollWidth <= b.clientWidth };
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profNAV'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':700})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.6)

    r=await pan.evaluate(BAR)
    print('home:',r['home'],'| you:',r['you'])
    if not r['home']: errs.append('there is no way home from the panel')
    if not r['you']: errs.append('there is no way to your profile from the panel')
    if r['home'] and r['you']:
      if r['home']['label'] != 'Home': errs.append(f"the home button is called {r['home']['label']!r}")
      if 'profile' not in (r['you']['label'] or ''): errs.append(f"the profile button is called {r['you']['label']!r}")
      if r['acct'] and r['home']['x'] > r['acct']['x']: errs.append('the two sit among the account controls rather than beside the wordmark')
    if not r['fits']: errs.append('the top bar holds more than it has room for')

    # Narrow, which is how the panel starts on a small screen.
    await pan.set_viewport_size({'width':320,'height':700}); await asyncio.sleep(.5)
    if not (await pan.evaluate(BAR))['fits']: errs.append('the top bar overflows once the panel is narrow')
    await pan.set_viewport_size({'width':400,'height':700}); await asyncio.sleep(.3)

    # Home and your profile read inside the panel. Neither opens a tab.
    def ours():
        return [t.url for t in ctx.pages if '/feed.html' in t.url or '/annotation.html' in t.url]
    state = "() => { const b = document.getElementById('browseMode'); return { shown: !b.hidden, "             "title: (b.querySelector('h2') || {}).textContent || '', tabs: b.querySelectorAll('.browseTabs input').length, "             "full: (b.querySelector('.browseFull') || {}).textContent || '', "             "del: !!b.querySelector('.delAllOpen'), "             "items: b.querySelectorAll('.sideList li button').length }; }"
    # A few of your own, so there is something to list and something to delete.
    await pan.evaluate("""async () => {
      for (let i = 1; i <= 3; i++) await Store.put('nav' + i, { id: 'nav' + i, created: Date.now() - i * 60000,
        item: { kind: 'post', text: 'A post', author: 'Sawyer Merritt', handle: '@SawyerMerritt', quote: 'some words' },
        take: { text: 'take ' + i, tag: null, poll: null, voice: null }, comments: [], reactions: [] });
    }"""); await asyncio.sleep(.5)
    await pan.click('.homeBtn'); await pan.wait_for_selector('#browseMode h2',timeout=15000); await asyncio.sleep(.8)
    home=await pan.evaluate(state)
    print('Home in the panel:',home,'| tabs opened:',ours())
    if not home['shown']: errs.append('Home did not open inside the panel')
    if home['title']!='Home': errs.append(f"the panel called it {home['title']!r}")
    if home['tabs']!=3: errs.append(f"Home showed {home['tabs']} tabs, wanted For you, Following and Everyone")
    if home['full'] != 'See all annotations': errs.append(f"the way on is called {home['full']!r}")
    if home['del']: errs.append('Home offered to delete all your annotations, which is not what Home is')
    if ours(): errs.append(f'Home opened {len(ours())} tabs when it should have opened none')

    await pan.click('.youBtn'); await pan.wait_for_selector('#browseMode h2',timeout=15000); await asyncio.sleep(.8)
    you=await pan.evaluate(state)
    print('Your profile in the panel:',you,'| tabs opened:',ours())
    if you['title']!='You': errs.append(f"your profile was called {you['title']!r}")
    if you['tabs']: errs.append('your own profile offered feed tabs, which are not yours to pick')
    if you['items'] < 3: errs.append(f"your profile listed {you['items']} of the three saved here")
    if not you['del']: errs.append('there was no way to delete them all from the panel')
    if ours(): errs.append(f'Your profile opened {len(ours())} tabs when it should have opened none')

    # Back puts the page you were on back.
    await pan.click('.browseBack'); await asyncio.sleep(1.2)
    back=await pan.evaluate(state)
    print('after Back:',back)
    if back['shown']: errs.append('Back left the list up')

    # The full page, and an annotation, share the one annotated tab.
    await pan.click('.homeBtn'); await pan.wait_for_selector('#browseMode h2',timeout=15000); await asyncio.sleep(.5)
    await pan.click('.browseFull'); await asyncio.sleep(1.2)
    await pan.bring_to_front()
    await pan.evaluate("() => openExtPage('annotation.html#nothing')"); await asyncio.sleep(1.2)
    end = ours()
    print('after the full page and an annotation:',end)
    if len(end)!=1: errs.append(f'annotated pages spread over {len(end)} tabs')
    if end and not end[0].endswith('annotation.html#nothing'): errs.append(f'the tab ended on {end[0]}')

    # The extension's own pages leave Home and your profile to the panel, and still go home by the wordmark.
    page=await ctx.new_page(); await page.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.8)
    inext=await page.evaluate("() => ({ nav: !!document.querySelector('.sitenav'), wm: !!document.querySelector('.wmBtn') })")
    print('on the extension page:',inext)
    if inext['nav']: errs.append('the page repeats Home and You beside the panel that already has them')
    if not inext['wm']: errs.append('the page has no way home at all')

    # The website has no panel, so it keeps them.
    onweb=await page.evaluate("""() => {
      const d = document.createElement('div'); document.body.appendChild(d);
      AnnotationPage.renderFeed(d, { records: [], mode: 'home', onOpen() {}, onHome() {}, onProfile() {} });
      const out = { nav: !!d.querySelector('.sitenav'), you: !!d.querySelector('.navProfile') };
      d.remove(); return out;
    }""")
    print('with nothing said either way, which is the website:',onweb)
    if not onweb['nav'] or not onweb['you']: errs.append('the website lost its navigation, where there is no panel to carry it')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
