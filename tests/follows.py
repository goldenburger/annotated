# Follow has only ever been used signed out, where the button prompts a sign-in and nothing else happens. This
# drives the parts that run once there are two accounts: the button's own behaviour, the follower count beside it,
# what happens when saving fails, and what the Following tab is given to show.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
ME={'id':'me','name':'Robo Taxi','handle':'robotaxi','avatar':''}
THEM={'id':'them','name':'David Winston','handle':'davidwinston','avatar':''}
def rec(i, author):
    return {'id': f'r{i}', 'created': 1700000000000+i*1000, 'cloud': True, 'author': author, 'mine': author['id']=='me',
            'item': {'kind':'post','text':f'Post {i}','author':'Someone','handle':'@someone'},
            'take': {'text':f'take {i}','tag':None,'poll':None,'voice':None}, 'comments': [], 'reactions': []}
RECORDS=[rec(1, ME), rec(2, THEM), rec(3, THEM)]
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFOL'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':1200,'height':900})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1)

    # The Following tab is given exactly the records by people you follow.
    tabs=await pg.evaluate("""(recs)=>{
      const out={};
      for (const [label, ids] of [['nobody', []], ['them', ['them']], ['both', ['me','them']]]) {
        const soc={followed:new Set(ids),people:[],trending:{sources:[],tags:[]}};
        out[label]=Cloud.homeTabs(recs, soc, {id:'me'}, []).following.records.map(r=>r.id);
      }
      return out;}""", RECORDS)
    print('following tab holds:',tabs)
    if tabs['nobody']: errs.append('Following held something while nobody was followed')
    if tabs['them']!=['r2','r3']: errs.append(f"following one person gave {tabs['them']}")
    if sorted(tabs['both'])!=['r1','r2','r3']: errs.append(f"following two people gave {tabs['both']}")

    # The button on a profile, with the follower count beside it.
    async def draw(follows_them, save_result):
      await pg.evaluate("""([recs, person, follows, ok])=>{
        window.__calls=[];
        const d=document.getElementById('probe') || Object.assign(document.createElement('div'),{id:'probe'});
        if (!d.isConnected) document.body.appendChild(d);
        const soc={followed:new Set(follows?['them']:[]),people:[],trending:{sources:[],tags:[]},
          personStats:{followers:7,following:2}, followsPerson:follows,
          onFollow:(id,on)=>{ window.__calls.push([id,on]); return Promise.resolve(ok); }};
        AnnotationPage.renderFeed(d,{records:recs,mode:'profile',person,social:soc,onOpen(){},onHome(){},onProfile(){}});
      }""", [RECORDS, THEM, follows_them, save_result])
      await asyncio.sleep(.3)

    await draw(False, True)
    before=await pg.inner_text('#probe .followCount')
    await pg.click('#probe .followBtn'); await asyncio.sleep(.4)
    state=await pg.evaluate("""()=>{const b=document.querySelector('#probe .followBtn');
      return {pressed:b.getAttribute('aria-pressed'), text:b.textContent.trim(), count:document.querySelector('#probe .followCount').textContent, calls:window.__calls};}""")
    print('after following:',state,'| count was',before)
    if state['pressed']!='true' or state['text']!='Following': errs.append(f"the button read {state['text']!r} after following")
    if state['calls']!=[['them',True]]: errs.append(f"it saved {state['calls']}")
    if state['count']!=str(int(before)+1): errs.append(f"the follower count went {before} to {state['count']}")

    # Clicking again unfollows, and the count comes back down.
    await pg.click('#probe .followBtn'); await asyncio.sleep(.4)
    state2=await pg.evaluate("""()=>({pressed:document.querySelector('#probe .followBtn').getAttribute('aria-pressed'),
      count:document.querySelector('#probe .followCount').textContent, calls:window.__calls})""")
    print('after unfollowing:',state2)
    if state2['pressed']!='false': errs.append('the button stayed pressed after unfollowing')
    if state2['count']!=before: errs.append(f"the count did not come back, it reads {state2['count']}")
    if state2['calls'][-1]!=['them',False]: errs.append(f"it saved {state2['calls'][-1]} when unfollowing")

    # Someone already followed opens as Following.
    await draw(True, True)
    print('already following shows:',await pg.eval_on_selector('#probe .followBtn','b=>[b.getAttribute("aria-pressed"),b.textContent.trim()]'))
    if await pg.eval_on_selector('#probe .followBtn','b=>b.getAttribute("aria-pressed")')!='true': errs.append('someone already followed opened as Follow')

    # When saving fails the button goes back, rather than lying about it.
    await draw(False, False)
    await pg.click('#probe .followBtn'); await asyncio.sleep(.5)
    failed=await pg.eval_on_selector('#probe .followBtn','b=>[b.getAttribute("aria-pressed"),b.textContent.trim(),b.disabled]')
    print('after a failed save:',failed)
    if failed[0]!='false' or failed[1]!='Follow': errs.append(f'a failed save left the button reading {failed}')
    if failed[2]: errs.append('a failed save left the button disabled')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
