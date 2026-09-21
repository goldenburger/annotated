# What you select is what you get. The sentence around it is offered, not assumed. This checks the default, the
# one-off offer, and the preference for people who would rather have whole sentences every time.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY=('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article><h1>Harbor story</h1>'
      '<p id="a">The council met on a Tuesday to talk about the overnight buses. Every member arrived on time for once.</p>'
      '<p id="b">The drivers wanted a longer break between the late runs. Nobody at the table disagreed with them.</p>'
      '</article></body></html>')
PICK="""(([id,from,to])=>{const n=document.getElementById(id).firstChild;const r=document.createRange();
  r.setStart(n,from);r.setEnd(n,to);getSelection().removeAllRanges();getSelection().addRange(r)})"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profSP'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**',lambda r: r.fulfill(status=200,body=BODY,headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':800})
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.5)

    async def sel(where):
      await pg.bring_to_front(); await pg.evaluate(PICK, where); await asyncio.sleep(1.1)
      await pan.bring_to_front(); await asyncio.sleep(.4)
      note = (await pan.inner_text('#articleMode .selNote')).strip()
      btn = (await pan.inner_text('#articleMode .exactBtn')).strip() if await pan.is_visible('#articleMode .exactBtn') else ''
      err = (await pan.inner_text('#articleMode .selErr')).strip() if await pan.is_visible('#articleMode .selErr') else ''
      return (await pan.inner_text('#articleMode .selQuote')).strip(), note, btn, err

    # The default takes the words you picked and offers the sentence.
    quote, note, btn, _ = await sel(['a', 12, 40])
    print('default ->', repr(quote), '|', note, '|', btn)
    if quote!='met on a Tuesday to talk about': errs.append(f'the default gave {quote!r} instead of the words selected')
    if 'exactly' not in note.lower(): errs.append(f'the note did not say it used the selection, it said {note!r}')
    if 'rest of the sentence' not in btn.lower(): errs.append(f'the offer read {btn!r}')

    # Taking the offer grows this one to the sentence, and the next selection is exact again.
    await pan.click('#articleMode .exactBtn'); await asyncio.sleep(.6)
    grown=(await pan.inner_text('#articleMode .selQuote')).strip()
    print('offer taken ->', repr(grown[:52]))
    if not (grown.startswith('The council met') and grown.endswith('buses.')): errs.append(f'the offer gave {grown!r}')
    quote2, _, _, _ = await sel(['b', 4, 30])
    print('next    ->', repr(quote2))
    if quote2!='drivers wanted a longer break': errs.append(f'a one-off offer stuck, giving {quote2!r}')

    # A few words is fine on purpose, but a stray click is not.
    short, _, _, err = await sel(['b', 0, 3])
    print('too short ->', repr(short), 'error', repr(err))
    if 'few more words' not in err: errs.append(f'a stray selection was not refused, error was {err!r}')

    # Whole sentences for anyone who wants them, and it holds.
    await pan.evaluate("Prefs.set('snap','sentences')"); await asyncio.sleep(1.2)
    q1, n1, b1, _ = await sel(['a', 12, 40])
    q2, _, _, _ = await sel(['b', 4, 30])
    print('sentences ->', repr(q1[:40]), '|', n1, '|', b1)
    if not q1.startswith('The council met'): errs.append('the preference did not snap to the sentence')
    if 'Snapped' not in n1: errs.append('the preference did not say it snapped')
    if not q2.startswith('The drivers wanted'): errs.append('the preference lasted only one selection')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
