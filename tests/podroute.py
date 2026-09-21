# Podcast apps used to go straight to the show's public feed, every one of them, even the ones whose own
# player is an ordinary audio file. Clipping what you are listening to beats searching for it again, so the
# player is tried first now. Only a service that encrypts its audio, where nothing can read it, goes straight
# to the feed, and an app whose player turns out to be unreadable still falls back to it.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# A podcast app page that plays a plain audio file, the way iHeart and Pocket Casts do.
PLAYS = ('<!doctype html><html><head><meta charset="utf-8"><title>Stuff You Should Know | iHeart</title>'
         '<meta property="og:title" content="Selects: How Gold Works"></head><body><h1>Selects: How Gold Works</h1>'
         '<audio id="a" controls src="/ep.mp3" preload="metadata"></audio></body></html>')
# One with no player at all, the way an app that hides its audio behind its own machinery looks.
SILENT = ('<!doctype html><html><head><meta charset="utf-8"><title>Stuff You Should Know | iHeart</title></head>'
          '<body><h1>Selects: How Gold Works</h1><div id="player">Play</div></body></html>')
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profPR'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    await ctx.add_init_script(INIT)
    mp3 = open('fixtures/tone.mp3','rb').read() if __import__('os').path.exists('fixtures/tone.mp3') else None
    body = {'plays': PLAYS, 'silent': SILENT}
    await ctx.route('https://www.iheart.com/**', lambda r: r.fulfill(
        status=200, body=body['silent' if 'silent' in r.request.url else 'plays'],
        headers={'Content-Type':'text/html; charset=utf-8'}))
    await ctx.route('https://www.iheart.com/ep.mp3', lambda r: r.fulfill(status=200, body=mp3 or b'\xff\xfb\x90\x00'*200, headers={'Content-Type':'audio/mpeg'}))
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]

    async def panel_for(path):
        pg=await ctx.new_page(); await pg.set_viewport_size({'width':900,'height':700})
        await pg.goto('https://www.iheart.com/podcast/' + path); await asyncio.sleep(1.2)
        tid=await sw.evaluate("(u)=>chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes(u)).id)", path)
        pan=await ctx.new_page(); await pan.set_viewport_size({'width':420,'height':900})
        pan.on('pageerror',lambda e: errs.append('PANEL '+str(e)))
        await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.2)
        return pg, pan

    # A player it can read: the panel offers to clip what is playing, not to go looking for it.
    pg1, pan1 = await panel_for('plays')
    mode=await pan1.evaluate("""() => ({ feed: !!document.querySelector('.fpPick'),
      pod: !document.getElementById('podcastMode').hidden && !document.querySelector('.fpPick'),
      empty: !document.getElementById('empty').hidden,
      byName: !!document.querySelector('.fpAny'),
      msg: (document.getElementById('emptyMsg') || {}).textContent || '' })""")
    print('an app whose player can be read:',mode)
    if mode['feed']: errs.append('a readable player was sent to the feed search anyway')
    if not (mode['pod'] or 'Press play' in mode['msg']):
        errs.append(f'the panel offered neither the clipper nor a way to start it: {mode}')
    # Whatever happens with the player, looking the episode up is still one click away.
    if mode['empty'] and not mode['byName']: errs.append('there was no way to look the episode up instead')

    # Nothing to read: it falls back to the feed, as before.
    pg2, pan2 = await panel_for('silent')
    mode2=await pan2.evaluate("() => ({ feed: !!document.querySelector('.fpPick'), "
                              "note: (document.querySelector('.fpNote') || {}).textContent || '' })")
    print('an app with no player at all:',mode2)
    if not mode2['feed']: errs.append('an app with no player to read did not fall back to the feed')
    if "app's player" in mode2['note']: errs.append('the feed panel still blames the app rather than the player')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
