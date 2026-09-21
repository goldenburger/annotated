# On a podcast app the episode box is filled from the page title and searched straight away. Spotify puts its own
# name at the front, so "Spotify - Search" was searched word for word and came back with six unrelated shows on
# 2026-09-21. A title that is only the app's furniture now leaves the box empty, and a pasted link says why it
# cannot work rather than finding nothing.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1');localStorage.setItem('annotated-about-seen','1')}catch(e){}"
def page(title):
    return ('<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title></head>'
            '<body style="background:#121212;color:#fff;font:15px system-ui"><h1>'+title+'</h1></body></html>')
CASES=[
  ('Spotify \u2013 Search', ''),
  ('Spotify \u2022 Web Player: Music for everyone', ''),
  ('Your Library | Spotify', ''),
  ('Podcasts', ''),
  ('AI Kills Everybody or Doomer Psyop? - All-In | Podcast on Spotify', 'AI Kills Everybody or Doomer Psyop? - All-In'),
  ('Amazon Music - The Daily', 'The Daily'),
  ('(3) The Daily | Apple Podcasts', 'The Daily'),
  ('Bill Gurley: Searching for Feynman', 'Bill Gurley: Searching for Feynman'),
]
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profPG'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://open.spotify.com/**',lambda r: r.fulfill(status=200,body=page('Spotify \u2013 Search'),headers={'Content-Type':'text/html; charset=utf-8'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pan=await ctx.new_page(); await pan.set_viewport_size({'width':400,'height':900})
    pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1)

    for title, want in CASES:
      got=await pan.evaluate("(t)=>episodeGuess(t)", title)
      print(f'{title!r} -> {got!r}')
      if got!=want: errs.append(f'{title!r} guessed {got!r}, wanted {want!r}')

    # On a real podcast app page the box stays empty and nothing is searched.
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':700})
    await pg.goto('https://open.spotify.com/show/2IqXAVFR4r0'); await asyncio.sleep(1)
    tid=await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('open.spotify.com')).id)")
    pod=await ctx.new_page(); await pod.set_viewport_size({'width':400,'height':900})
    pod.on('pageerror',lambda e: errs.append('POD '+str(e)))
    await pod.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2)
    box=await pod.input_value('#podcastMode .fpQ')
    status=(await pod.inner_text('#podcastMode .fpStatus')).strip()
    hits=await pod.locator('#podcastMode .fpList li').count()
    print('box:',repr(box),'| status:',repr(status),'| results:',hits)
    if box: errs.append(f'the box was filled with {box!r} from the app\'s own title')
    if hits: errs.append('a search ran on the app\'s own title')
    if 'Type the show' not in status: errs.append('nothing told the person what to type')

    # A pasted link says why it cannot work.
    await pod.fill('#podcastMode .fpQ','https://open.spotify.com/show/2IqXAVFR4r0')
    await pod.click('#podcastMode .fpSearch button'); await asyncio.sleep(1)
    msg=(await pod.inner_text('#podcastMode .fpStatus')).strip()
    print('link message:',repr(msg))
    if 'link' not in msg.lower(): errs.append('a pasted link did not say it was a link')
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
