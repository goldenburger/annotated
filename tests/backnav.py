# Back has to mean back. It used to go to the source on X and call itself "Back to the post", so leaving a
# list to read an annotation and pressing it sent you somewhere you had never been. The source still has a
# way of its own, said in its own words, because both jobs matter and neither is the other one.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
REC = """async () => {
  await Store.put('back-test-1', {
    item: { kind: 'post', text: 'A post about the market', quote: 'about the market', author: 'Dirty Tesla',
            handle: '@DirtyTesLa', url: 'https://x.com/DirtyTesLa/status/1', posted: '2026-09-21T09:00:00Z' },
    take: { text: 'a take', tag: null, poll: null, voice: null, gif: null },
    reactions: [], comments: [], created: Date.now(), seen: true,
  });
  return (await Store.allMeta()).length;
}"""
READ = """() => {
  const back = document.querySelector('.back'), src = document.querySelector('.toSource');
  return { back: !!back, backSays: back ? back.textContent.trim() : '',
           source: !!src, sourceSays: src ? src.textContent.trim() : '',
           sourceHref: src ? (src.getAttribute('href') || '') : '' };
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profBACK'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    ANN = f'chrome-extension://{extid}/annotation.html#back-test-1'

    seed = await ctx.new_page()
    await seed.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)
    seed.on('pageerror', lambda e: errs.append('SEED ' + str(e)))
    print('annotations saved here:', await seed.evaluate(REC))
    await seed.close()

    # 1. Arriving cold on a shared link. There is nothing behind you, so nothing pretends there is.
    cold = await ctx.new_page(); cold.on('pageerror', lambda e: errs.append('COLD ' + str(e)))
    await cold.goto(ANN); await cold.wait_for_selector('.ann:not(.loading)', timeout=20000); await asyncio.sleep(.5)
    c = await cold.evaluate(READ)
    print('cold from a shared link:', c)
    if c['back']: errs.append(f"a fresh tab offered {c['backSays']!r} with nothing behind it")
    if not c['source']: errs.append('there was no way to the post it was taken from')
    if c['sourceSays'] != 'See the post on X': errs.append(f"the source control says {c['sourceSays']!r}")
    if 'x.com' not in c['sourceHref']: errs.append(f"the source control points at {c['sourceHref']!r}")

    # 2. Arriving from one of our own lists. Back goes back to the list, not to X.
    await cold.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.6)
    await cold.goto(ANN); await cold.wait_for_selector('.ann:not(.loading)', timeout=20000); await asyncio.sleep(.5)
    l = await cold.evaluate(READ)
    print('arriving from a list:', l)
    if not l['back']: errs.append('there was no way back to the list you came from')
    if l['backSays'] != 'Back': errs.append(f"it says {l['backSays']!r} rather than Back")
    if not l['source']: errs.append('the post it was taken from was no longer offered')
    await cold.click('.back'); await asyncio.sleep(1.6)
    print('after pressing it, the tab is on:', cold.url.split('/')[-1])
    if 'feed.html' not in cold.url: errs.append(f'Back went to {cold.url}, not to the list')

    # 3. Straight after publishing, the page behind you really is the one you were annotating.
    await sw.evaluate("chrome.storage.session.set({annFrom:'publish'})")
    await asyncio.sleep(.3)
    await cold.goto(ANN); await cold.wait_for_selector('.ann:not(.loading)', timeout=20000); await asyncio.sleep(.5)
    pub = await cold.evaluate(READ)
    print('straight after publishing:', pub)
    if pub['backSays'] != 'Back to the post': errs.append(f"after publishing it says {pub['backSays']!r}")
    # And the panel does not keep saying that for every annotation opened afterwards.
    await cold.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(1.4)
    await cold.goto(ANN); await cold.wait_for_selector('.ann:not(.loading)', timeout=20000); await asyncio.sleep(.5)
    after = await cold.evaluate(READ)
    print('and the next one opened from a list:', after['backSays'])
    if after['backSays'] != 'Back': errs.append(f'it kept saying {after["backSays"]!r} after the publish it belonged to')

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
