import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profID'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'])
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    print(sw.url.split('/')[2])
    await ctx.close()
asyncio.run(main())
