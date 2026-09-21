# The GIPHY key, against the real service. Everything else about the picker is tested with a stand-in, so
# this is the only thing that would notice a key that had been revoked, mistyped or run out of allowance.
# It belongs in the online group because it reaches the network and spends two of the hundred calls an hour.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
ASK = """async () => {
  const out = { ready: Giphy.ready() };
  try { const t = await Giphy.list(''); out.trending = t.length; out.first = t[0] || null; }
  catch (e) { out.error = e.message; }
  try { const s = await Giphy.list('harbour'); out.search = s.length; }
  catch (e) { out.searchError = e.message; }
  // The second ask for the same thing must not go out again, because the allowance is small.
  const before = performance.now();
  await Giphy.list('harbour');
  out.again = Math.round(performance.now() - before);
  return out;
}"""
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profGLIVE'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page()
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.4)
    r=await pg.evaluate(ASK)
    print('a key is set:',r['ready'])
    print('trending:',r.get('trending'),r.get('error') or '')
    print('a search:',r.get('search'),r.get('searchError') or '| asking twice took',r['again'],'ms')
    f=r.get('first')
    if f: print('  first one:',f['alt'][:50],'|',f['w'],'x',f['h'])
    if not r['ready']: errs.append('there is no GIPHY key in giphy.js, so the GIF button stays hidden')
    if r.get('error'): errs.append(f"trending came back with nothing: {r['error']}")
    elif not r.get('trending'): errs.append('trending came back empty')
    if r.get('searchError'): errs.append(f"a search came back with nothing: {r['searchError']}")
    elif not r.get('search'): errs.append('a search came back empty')
    if f and (not f['url'].startswith('https://') or not f['preview'].startswith('https://')):
        errs.append(f'a GIF came back with an address we would not show: {f}')
    if r['again'] > 150: errs.append(f"asking for the same search again took {r['again']} ms, so it went out twice")
    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
