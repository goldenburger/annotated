import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
INIT="try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profA'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],viewport={'width':400,'height':760})
    await ctx.add_init_script(INIT)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]; print('extension id:', extid)
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '401' not in m.text else None)  # the 401 is the expected refusal of a signed-out write
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(2)
    print('account button:', await pg.inner_text('.acctBtn'), '| signed in:', await pg.eval_on_selector('.acctBtn','b=>b.classList.contains("signedIn")'))
    info=await pg.evaluate("""(async()=>{const {data,error}=await Backend.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:chrome.identity.getRedirectURL(),skipBrowserRedirect:true}});
      const u=new URL(data.url);return {host:u.host, redirect_to:u.searchParams.get('redirect_to'), pkce:!!u.searchParams.get('code_challenge'), provider:u.searchParams.get('provider'), error:error&&error.message}})()""")
    print('sign-in request:', info)
    r=await pg.evaluate("fetch(Backend.url+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(chrome.identity.getRedirectURL()),{redirect:'manual'}).then(r=>r.type+' '+r.status)")
    print('Supabase answers the sign-in request:', r)
    rows=await pg.evaluate("Backend.client.from('annotations').select('id',{count:'exact',head:true}).then(r=>({count:r.count,error:r.error&&r.error.message}))")
    print('public read of annotations:', rows)
    ins=await pg.evaluate("Backend.client.from('annotations').insert({id:'nope-test',author_id:'00000000-0000-0000-0000-000000000000',kind:'video'}).then(r=>r.error&&r.error.message)")
    print('signed-out write is refused:', ins)
    print('errors:', errs)
    await ctx.close()
asyncio.run(main())
