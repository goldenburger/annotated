# The recording on 2026-09-21 showed the Everyone tab saying "7 annotations from everyone" when the database held
# two. The other five were saved only on this computer, so nobody else's feed had them. Everyone now means what
# everyone published, those cards say so where they still appear, and Following has its own empty state.
import asyncio, json
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
def rec(i, mine=False, cloud=False):
    r = {'id': f'r{i}', 'created': 1700000000000 + i * 1000, 'item': {'kind': 'post', 'text': f'Post {i}', 'author': 'Someone', 'handle': '@someone'},
         'take': {'text': f'take {i}', 'tag': None, 'poll': None, 'voice': None}, 'comments': [], 'reactions': []}
    if cloud:
        r['cloud'] = True
        r['author'] = {'id': 'me' if mine else 'other', 'name': 'Robo Taxi' if mine else 'Someone', 'handle': 'robotaxi' if mine else 'someone', 'avatar': ''}
        r['mine'] = mine
    return r
RECORDS=[rec(1, mine=True, cloud=True), rec(2, mine=False, cloud=True), rec(3), rec(4), rec(5)]
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profFT'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':1200,'height':900})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1)

    tabs=await pg.evaluate("""(recs)=>{
      const soc={followed:new Set(),people:[],trending:{sources:[],tags:[]}};
      const t=Cloud.homeTabs(recs, soc, {id:'me'}, recs.filter(r=>r.mine));
      return {everyone:t.everyone.records.map(r=>r.id), everyoneNote:t.everyone.note,
              following:t.following.records.map(r=>r.id), followingNote:t.following.note,
              foryou:t.foryou.records.length};}""", RECORDS)
    print('everyone:',tabs['everyone'],'|',tabs['everyoneNote'])
    print('following:',tabs['following'],'|',tabs['followingNote'])
    print('for you holds:',tabs['foryou'])
    if sorted(tabs['everyone'])!=['r1','r2']: errs.append(f"Everyone held {tabs['everyone']}, wanted only the published two")
    if '2 annotations from everyone' not in tabs['everyoneNote']: errs.append('the Everyone note counted the wrong thing')
    if tabs['following']: errs.append('Following showed something while nobody is followed')
    if tabs['foryou']!=5: errs.append('For you dropped your own annotations, which belong there')

    # The cards that are only on this computer say so, and Following says how to fill itself.
    marks=await pg.evaluate("""(recs)=>{
      const d=document.createElement('div'); document.body.appendChild(d);
      const soc={followed:new Set(),people:[],trending:{sources:[],tags:[]},tabs:{current:'foryou',note:'',onTab(){}}};
      AnnotationPage.renderFeed(d,{records:recs,mode:'home',social:soc,onOpen(){},onHome(){},onProfile(){}});
      const cards=[...d.querySelectorAll('.cardItem')].length, tags=[...d.querySelectorAll('.localTag')].length;
      const e=document.createElement('div'); document.body.appendChild(e);
      const soc2={...soc, tabs:{current:'following',note:'',onTab(){}}};
      AnnotationPage.renderFeed(e,{records:[],mode:'home',social:soc2,onOpen(){},onHome(){},onProfile(){}});
      const empty=(e.querySelector('.emptyState')||{}).innerText||'';
      return {cards, tags, empty};}""", RECORDS)
    print('cards:',marks['cards'],'| marked on this computer:',marks['tags'])
    print('following empty state:',repr(marks['empty'].replace('\n',' ')))
    if marks['tags']!=3: errs.append(f"{marks['tags']} cards were marked, wanted the three that are only here")
    if 'Follow someone' not in marks['empty']: errs.append('the Following empty state still talks about publishing')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
