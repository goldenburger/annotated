# Publishing used to throw you onto the annotation page, which meant losing your place in whatever you were
# reading, every time. It stays where it is now. The panel holds the link, the page and a fresh start, and
# the page is one click away for anyone who wants it.
import asyncio
from playwright.async_api import async_playwright
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profSTAY'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=NEWS,headers={'Content-Type':'text/html'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    n=await ctx.new_page(); await n.set_viewport_size({'width':1000,'height':800})
    await n.goto('https://harborline.example/x'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':420,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.6)

    # Select a passage and capture it.
    await n.bring_to_front()
    await n.evaluate("""() => { const p = document.querySelectorAll('article p, p')[1];
      const r = document.createRange(); r.selectNodeContents(p.firstChild);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    await asyncio.sleep(.9)
    await pan.bring_to_front()
    await pan.click('#articleMode .grab')
    await pan.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=20000); await asyncio.sleep(.5)

    def ours():
        return [t.url for t in ctx.pages if '/annotation.html' in t.url or '/feed.html' in t.url]
    await pan.fill('#articleMode .takeInput','staying put')
    await pan.click('#articleMode .publish')
    await pan.wait_for_selector('#articleMode .pubcard',timeout=20000); await asyncio.sleep(1.2)
    opened=ours()
    said=await pan.inner_text('#articleMode .pubhead')
    print('after publishing, pages opened:',opened)
    print('the panel says:',repr(' '.join(said.split())))
    if opened: errs.append(f'publishing opened {len(opened)} pages when it should have stayed put')
    if 'new tab' in said: errs.append(f'the panel still talks about a new tab: {said!r}')
    if not await pan.is_visible('#articleMode .pubcard .view'): errs.append('there was no way on to the page')

    # And the page is one click away, in the one annotated tab.
    await pan.click('#articleMode .pubcard .view'); await asyncio.sleep(1.5)
    after=ours()
    print('after asking for the page:',after)
    if len(after)!=1: errs.append(f'View page left {len(after)} annotated tabs')
    elif '/annotation.html#' not in after[0]: errs.append(f'View page opened {after[0]}')

    # Anyone who wants the old way can have it.
    await pan.evaluate("() => Prefs.set('afterPublish','page')")
    print('the choice is offered as:',await pan.evaluate("() => Prefs.get().afterPublish"))
    if await pan.evaluate("() => Prefs.get().afterPublish") != 'page': errs.append('the setting did not take')

    # Annotating while the panel is showing Home puts it back on what you are annotating.
    await pan.evaluate("() => Prefs.set('afterPublish','stay')")
    await pan.click('.homeBtn'); await pan.wait_for_selector('#browseMode h2',timeout=15000); await asyncio.sleep(.6)
    print('the panel is on:',await pan.inner_text('#browseMode h2'))
    await n.bring_to_front()
    await n.evaluate("""() => { const p = document.querySelectorAll('article p, p')[2];
      const r = document.createRange(); r.selectNodeContents(p.firstChild);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    await asyncio.sleep(.9)
    clicked=await n.evaluate("""() => { const h = document.querySelector('.annotated-ui');
      if (!h || h.style.display === 'none') return false;
      h.shadowRoot.querySelector('.go').click(); return true; }""")
    print('the page Annotate button was there:',clicked)
    if not clicked: errs.append('the Annotate button never appeared on the page')
    await pan.bring_to_front()
    try:
      await pan.wait_for_selector('#articleMode .aCompose:not([hidden])',timeout=25000)
    except Exception:
      errs.append('annotating from the page did not bring the panel back to it')
    back=await pan.evaluate("() => ({ browse: !document.getElementById('browseMode').hidden, "
                            "article: !document.getElementById('articleMode').hidden })")
    print('after annotating from the page:',back)
    if back['browse']: errs.append('the panel stayed on Home after you annotated something')
    if not back['article']: errs.append('the panel did not go back to the page you were annotating')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
