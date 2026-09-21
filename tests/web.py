import asyncio, threading, http.server, os, functools
from playwright.async_api import async_playwright
from _env import *
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p=self.path.split('?')[0]
        if p.startswith('/@'): self.path='/index.html'
        elif p in ('/privacy','/terms','/install'): self.path=p+'.html'
        return super().do_GET()
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(H,directory=SITE_PUBLIC))
threading.Thread(target=srv.serve_forever,daemon=True).start()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME)
    pg=await b.new_page(viewport={'width':1280,'height':900}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto('http://127.0.0.1:8765/'); await asyncio.sleep(3)
    cards = await pg.locator('.card').count()
    print('home:', await pg.title(), '| cards:', cards, '| intro:', await pg.is_visible('.webIntro'), '| sign-in button:', await pg.is_visible('.webSignIn'))
    print('tabs:', await pg.eval_on_selector_all('.feedTabs label','ls=>ls.map(l=>l.innerText)'), '| checked:', await pg.eval_on_selector('.feedTabs input:checked','i=>i.value'))
    print('note:', await pg.inner_text('.feedHead .stats'))
    print('rail cards:', await pg.eval_on_selector_all('.rail .railcard h2','hs=>hs.map(h=>h.innerText)'))
    # Trending, people, a profile and an annotation page all need something published. With an empty
    # database the site is still expected to draw, so those parts are skipped rather than failed.
    if not cards:
      print('nothing is published, so trending, following, an annotation and a profile are skipped')
      await pg.screenshot(path='web_home.png')
    else:
      print('trending:', (await pg.inner_text('.raillist.trend')).replace('\n',' | ')[:120])
      print('people:', (await pg.inner_text('.peopleList')).replace('\n',' | ')[:120])
      await pg.click('.feedTabs label >> nth=1'); await asyncio.sleep(2)
      print('following tab:', await pg.inner_text('.feedHead .stats'), '| cards:', await pg.locator('.card').count())
      await pg.click('.feedTabs label >> nth=2'); await asyncio.sleep(2)
      print('everyone tab:', await pg.inner_text('.feedHead .stats'), '| sort shown:', await pg.is_visible('.feedSort'))
      await pg.click('.feedTabs label >> nth=0'); await asyncio.sleep(2)
      pg.once('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
      await pg.click('.followBtn >> nth=0'); await asyncio.sleep(.5)
      print('follow while signed out stays off:', await pg.get_attribute('.followBtn >> nth=0','aria-pressed'))
      await pg.screenshot(path='web_home.png')
      await pg.click('.card >> nth=0'); await pg.wait_for_selector('.ann:not(.loading)', timeout=15000); await asyncio.sleep(1.5)
      print('annotation url:', pg.url.replace('http://127.0.0.1:8765',''), '| take:', await pg.inner_text('.annCard .take'), '| author:', (await pg.inner_text('.annCard .who')).split('\n')[0])
      await pg.screenshot(path='web_ann.png')
      await pg.click('.annCard .profileLink >> nth=1'); await asyncio.sleep(2.5)
      print('profile:', pg.url.replace('http://127.0.0.1:8765',''), '|', (await pg.inner_text('.feedHead')).replace('\n',' | ')[:120])
    for path in ['/privacy','/terms','/install']:
      await pg.goto('http://127.0.0.1:8765'+path); print(path, '->', await pg.inner_text('h1'))
    await pg.goto('http://127.0.0.1:8765/@nobody/does-not-exist'); await asyncio.sleep(2); print('missing:', await pg.inner_text('.esTitle'))
    print('errors:', errs)
    await b.close()
asyncio.run(main())
