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
    # A GIF chosen for the take has to survive being published. It used to be dropped, because publishing
    # rebuilds the take from a fixed list of fields and the GIF was not on it, so it posted and then vanished.
    await pan.evaluate("""async () => {
      Giphy.ready = () => true;
      Giphy.list = async () => [{ id: '7', preview: 'https://media.giphy.com/seven-small.gif',
        url: 'https://media.giphy.com/seven.gif', w: 200, h: 120, alt: 'A wave' }];
      const b = document.querySelector('#articleMode .gifBtn');
      b.hidden = false; b.click();
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('#articleMode .gpItem').click();
    }"""); await asyncio.sleep(.6)
    print('a GIF is on the take:',await pan.evaluate("() => !document.querySelector('#articleMode .gifChosen').hidden"))
    # The picker is tall, so choosing a GIF used to leave Publish below the fold with nothing saying so.
    seen=await pan.evaluate("""() => { const b = document.querySelector('#articleMode .publish');
      const r = b.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), fold: window.innerHeight }; }""")
    print('where Publish sits after choosing a GIF:',seen)
    if seen['bottom']>seen['fold'] or seen['top']<0:
        errs.append(f'choosing a GIF left Publish out of sight: {seen}')
    await pan.fill('#articleMode .takeInput','staying put')
    # The line under Publish says what publishing will actually do, which is not one fixed sentence: it used
    # to promise a new tab to everyone, including the people it was about to leave exactly where they were.
    hint=await pan.inner_text('#articleMode .publishHint')
    await pan.evaluate("() => Prefs.set('afterPublish','page')")
    await pan.fill('#articleMode .takeInput','staying put.'); await asyncio.sleep(.2)
    other=await pan.inner_text('#articleMode .publishHint')
    await pan.evaluate("() => Prefs.set('afterPublish','stay')")
    await pan.fill('#articleMode .takeInput','staying put'); await asyncio.sleep(.2)
    print('the line under Publish reads:',repr(hint))
    print('and on the other setting:',repr(other))
    if 'new tab' in hint or 'stay' not in hint.lower():
        errs.append(f'the line under Publish does not say what publishing will do: {hint!r}')
    if 'page' not in other.lower() or hint==other:
        errs.append(f'the line did not follow the setting: {other!r}')
    await pan.click('#articleMode .publish')
    await pan.wait_for_selector('#articleMode .pubcard',timeout=20000); await asyncio.sleep(1.2)
    opened=ours()
    said=await pan.inner_text('#articleMode .pubhead')
    print('after publishing, pages opened:',opened)
    print('the panel says:',repr(' '.join(said.split())))
    if opened: errs.append(f'publishing opened {len(opened)} pages when it should have stayed put')
    if 'new tab' in said: errs.append(f'the panel still talks about a new tab: {said!r}')
    if not await pan.is_visible('#articleMode .pubcard .view'): errs.append('there was no way on to the page')
    kept=await pan.evaluate("""async () => {
      const all = await Store.allMeta();
      const mine = all.sort((a, b) => b.created - a.created)[0];
      return mine && mine.take ? mine.take.gif : null;
    }""")
    print('the GIF that was saved with it:',kept)
    if not kept or kept.get('url')!='https://media.giphy.com/seven.gif':
        errs.append(f'publishing dropped the GIF, so it posts and then cannot be seen: {kept}')

    # And the page is one click away, in the one annotated tab.
    await pan.click('#articleMode .pubcard .view'); await asyncio.sleep(1.5)
    after=ours()
    print('after asking for the page:',after)
    if len(after)!=1: errs.append(f'View page left {len(after)} annotated tabs')
    elif '/annotation.html#' not in after[0]: errs.append(f'View page opened {after[0]}')

    # Anyone who wants the old way can have it.
    await pan.evaluate("() => Prefs.set('afterPublish','page')"); await asyncio.sleep(.3)
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

    # Two choices, and a panel that was set to the third one back when there were three reads as staying
    # here. Without that, everyone who had ever touched the setting kept being thrown onto a new tab.
    await pan.click('.gearBtn'); await asyncio.sleep(.4)
    offered=await pan.eval_on_selector_all('.dmPop input[name="dm-afterPublish"]','e=>e.map(i=>i.value)')
    print('choices offered after publishing:',offered)
    if offered!=['stay','page']: errs.append(f'the setting still offers {offered}')
    await pan.click('.dmPop .dmDone'); await asyncio.sleep(.3)
    await sw.evaluate("chrome.storage.local.set({annotatedPrefs:{display:'side',afterPublish:'close',density:'comfortable',theme:'system',pageButton:true,snap:'exact',pen:'chisel'}})")
    await asyncio.sleep(.4)
    await pan.reload(); await asyncio.sleep(1.4)
    moved=await pan.evaluate("() => Prefs.get().afterPublish")
    print('a panel set to the old third choice now reads as:',moved)
    if moved!='stay': errs.append(f'the old setting was left as {moved!r}, so publishing still leaves the panel')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
