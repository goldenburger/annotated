# Deleting everything used to mean opening each annotation and pressing Delete in it. Your own profile now has
# one control that deletes them all, behind a second step that says how many there are and how many of them
# other people can already see. It is not offered on anyone else's profile, or when there is nothing to delete.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT=EXT
def rec(i, cloud=False):
    r = {'id': f'r{i}', 'created': 1700000000000 + i * 1000, 'item': {'kind': 'post', 'text': f'Post {i}', 'author': 'Someone', 'handle': '@someone'},
         'take': {'text': f'take {i}', 'tag': None, 'poll': None, 'voice': None}, 'comments': [], 'reactions': []}
    if cloud:
        r['cloud'] = True; r['mine'] = True
        r['author'] = {'id': 'me', 'name': 'Robo Taxi', 'handle': 'robotaxi', 'avatar': ''}
    return r
RECORDS=[rec(1, cloud=True), rec(2, cloud=True), rec(3), rec(4)]
async def main():
  errs=[]
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(prof('profDA'),headless=True,executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}',f'--load-extension={EXT}',LOADEXT,'--headless=new'],no_viewport=True)
    sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid=sw.url.split('/')[2]
    pg=await ctx.new_page(); await pg.set_viewport_size({'width':1200,'height':900})
    pg.on('pageerror',lambda e: errs.append('PAGE '+str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1)

    # Where it is offered, and where it is not.
    where=await pg.evaluate("""(recs)=>{
      const out={};
      const draw=(opts)=>{const d=document.createElement('div');document.body.appendChild(d);
        AnnotationPage.renderFeed(d,{records:recs,mode:'profile',onOpen(){},onHome(){},onProfile(){},...opts});return d;};
      out.mine=!!draw({onDeleteAll:async()=>[]}).querySelector('.delAllOpen');
      out.noHook=!!draw({}).querySelector('.delAllOpen');
      out.someoneElse=!!draw({onDeleteAll:async()=>[],person:{id:'x',name:'Someone',handle:'someone',avatar:''}}).querySelector('.delAllOpen');
      const e=document.createElement('div');document.body.appendChild(e);
      AnnotationPage.renderFeed(e,{records:[],mode:'profile',onDeleteAll:async()=>[],onOpen(){},onHome(){},onProfile(){}});
      out.empty=!!e.querySelector('.delAllOpen');
      const h=document.createElement('div');document.body.appendChild(h);
      AnnotationPage.renderFeed(h,{records:recs,mode:'home',onDeleteAll:async()=>[],onOpen(){},onHome(){},onProfile(){}});
      out.home=!!h.querySelector('.delAllOpen');
      return out;}""", RECORDS)
    print('offered on your profile:',where['mine'],'| without the hook:',where['noHook'],
          '| on someone else:',where['someoneElse'],'| with nothing saved:',where['empty'],'| on Home:',where['home'])
    if not where['mine']: errs.append('your own profile did not offer to delete everything')
    for k,label in [('noHook','a page that supplies no way to delete'),('someoneElse',"someone else's profile"),
                    ('empty','a profile with nothing on it'),('home','Home')]:
        if where[k]: errs.append(f'{label} offered to delete everything')

    # The second step says what it will do, and Keep them backs out without deleting.
    step=await pg.evaluate("""(recs)=>new Promise((done)=>{
      const d=document.createElement('div');document.body.appendChild(d);
      let calls=0;
      AnnotationPage.renderFeed(d,{records:recs,mode:'profile',onOpen(){},onHome(){},onProfile(){},
        onDeleteAll:async()=>{calls++;return [];}});
      const open=d.querySelector('.delAllOpen'), ask=d.querySelector('.delAllAsk');
      const hiddenFirst=ask.hidden;
      open.click();
      const said=ask.querySelector('p').textContent, shown=!ask.hidden, openGone=open.hidden;
      d.querySelector('.delAllNo').click();
      done({hiddenFirst,shown,openGone,said,backOut:ask.hidden&&!open.hidden,calls});});""", RECORDS)
    print('asks first:',step['hiddenFirst'],'-> opened:',step['shown'],'| it says:',repr(step['said']))
    print('Keep them backs out:',step['backOut'],'| deletions run:',step['calls'])
    if not (step['hiddenFirst'] and step['shown'] and step['openGone']): errs.append('the second step did not open the way it should')
    if '4 annotations' not in step['said']: errs.append(f"the warning did not count the four annotations: {step['said']}")
    if 'including 2 published' not in step['said']: errs.append(f"the warning did not say two are published: {step['said']}")
    if 'cannot be undone' not in step['said']: errs.append('the warning did not say it cannot be undone')
    if not step['backOut']: errs.append('Keep them left the warning open')
    if step['calls']: errs.append('Keep them deleted something')

    # Confirming deletes every one of them, and counts up as it goes.
    run=await pg.evaluate("""(recs)=>new Promise((done)=>{
      const d=document.createElement('div');document.body.appendChild(d);
      const seen=[], notes=[];
      AnnotationPage.renderFeed(d,{records:recs,mode:'profile',onOpen(){},onHome(){},onProfile(){},
        onDeleteAll:async(progress)=>{for(const r of recs){seen.push(r.id);progress(seen.length,recs.length);
          notes.push(d.querySelector('.delAllMsg').textContent);}return [];}});
      d.querySelector('.delAllOpen').click();
      d.querySelector('.delAllYes').click();
      setTimeout(()=>done({seen,notes,label:d.querySelector('.delAllYes').textContent}),300);});""", RECORDS)
    print('deleted:',run['seen'],'| last count shown:',repr(run['notes'][-1] if run['notes'] else ''))
    if run['seen']!=['r1','r2','r3','r4']: errs.append(f"confirming deleted {run['seen']}, wanted all four")
    if not run['notes'] or run['notes'][-1]!='Deleted 4 of 4.': errs.append('it did not count up while deleting')

    # One that will not delete is said out loud, rather than passing for done.
    bad=await pg.evaluate("""(recs)=>new Promise((done)=>{
      const d=document.createElement('div');document.body.appendChild(d);
      AnnotationPage.renderFeed(d,{records:recs,mode:'profile',onOpen(){},onHome(){},onProfile(){},
        onDeleteAll:async()=>['It is still online.']});
      d.querySelector('.delAllOpen').click(); d.querySelector('.delAllYes').click();
      setTimeout(()=>done(d.querySelector('.delAllMsg').textContent),300);});""", RECORDS)
    print('when one fails:',repr(bad))
    if 'could not be deleted' not in bad or 'still online' not in bad: errs.append(f'a failed deletion was not reported: {bad}')

    print('errors:',errs)
    await ctx.close()
asyncio.run(main())
