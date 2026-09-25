# A photo or video of your own in a take. It is chosen, dropped or pasted into the take box, it counts as a
# take by itself, wrong or oversized files are refused with the reason, it publishes to the media bucket with
# its size and description, and it shows on the annotation page. Anything read back is checked before use.
import asyncio, base64, os, tempfile
from playwright.async_api import async_playwright
from _env import *
exec(open('ext_all.py').read().split('async def open_panel')[0])
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
# A 4 by 3 red PNG, small enough to write out here.
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFUlEQVR4nGP8z8DAwMDAxMDAwMAAAB0FAgFLX0RjAAAAAElFTkSuQmCC')

UNITS = r"""async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const png = await (await fetch('data:image/png;base64,' + arguments[0])).blob();
  const out = {};
  const d = document.createElement('div'); document.body.appendChild(d);
  const c = Compose.create(d, { onPublish() {}, log() {} });
  const hint = () => d.querySelector('.publishHint').textContent;
  out.empty = { disabled: d.querySelector('.publish').disabled, hint: hint(), button: !!d.querySelector('.upBtn'),
                gifLooksLikeGif: (d.querySelector('.gifBtn') || {}).textContent || '' };
  await d._takeFile(new File([png], 'red.png', { type: 'image/png' })); await wait(100);
  d.querySelector('.upAlt').value = 'A red square';
  const v = c.value();
  out.image = { shown: !d.querySelector('.upChosen').hidden, preview: !!d.querySelector('.upMedia img'), disabled: d.querySelector('.publish').disabled,
                kind: v.upload && v.upload.kind, w: v.upload && v.upload.w, h: v.upload && v.upload.h, alt: v.upload && v.upload.alt,
                remove: d.querySelector('.upRemove').textContent.trim() };
  d.querySelector('.upRemove').click(); await wait(50);
  out.removed = { shown: !d.querySelector('.upChosen').hidden, value: c.value().upload, disabled: d.querySelector('.publish').disabled };
  await d._takeFile(new File(['hello'], 'notes.txt', { type: 'text/plain' })); await wait(50);
  out.wrongType = d.querySelector('.upErr').hidden ? '' : d.querySelector('.upErr').textContent;
  await d._takeFile(new File([new Uint8Array(26 * 1024 * 1024)], 'big.png', { type: 'image/png' })); await wait(50);
  out.tooBig = d.querySelector('.upErr').hidden ? '' : d.querySelector('.upErr').textContent;
  await d._takeFile(new File([png], 'red.png', { type: 'image/png' })); await wait(100);
  out.errGone = d.querySelector('.upErr').hidden;
  c.reset(); await wait(50);
  out.afterReset = !d.querySelector('.upChosen').hidden;
  d.remove();

  // Publishing: the file goes to the bucket and the row carries where it is. Without one, no column is sent.
  const real = Backend.client, sent = [];
  const fake = { storage: { from: () => ({ upload: async (path, blob, o) => { sent.push({ path, type: o.contentType }); return { error: null }; } }) },
                 from: () => ({ insert: async (row) => { sent.push({ row }); return { error: null }; } }),
                 auth: real.auth };
  Backend.client = fake;
  const realProfile = Backend.profile; Backend.profile = async () => ({ id: 'u1', handle: 'me', name: 'Me' });
  try {
    await Cloud.publish('with-photo', { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/1' },
      { text: '', upload: { blob: png, kind: 'image', type: 'image/png', w: 4, h: 3, alt: 'A red square' } });
    await Cloud.publish('without', { kind: 'post', text: 't', author: 'A', handle: '@a', url: 'https://x.com/a/status/2' }, { text: 'words' });
  } catch (e) { out.publishError = e.message; }
  Backend.client = real; Backend.profile = realProfile;
  const rows = sent.filter((s) => s.row).map((s) => s.row);
  out.publish = { files: sent.filter((s) => s.path).map((s) => s.path + ' ' + s.type),
                  withUpload: rows[0] && rows[0].upload, withoutHasKey: rows[1] ? 'upload' in rows[1] : null };

  // Showing it, from this computer and from the bucket, and refusing an address that is not a picture.
  const show = async (upload) => { const box = document.createElement('div'); document.body.appendChild(box);
    await AnnotationPage.render(box, { id: 'x', item: { kind: 'post', text: 'p', quote: '', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' },
      take: { text: '', upload }, created: Date.now(), mine: true, comments: [], reactions: [], records: [], siteNav: false }, {});
    const img = box.querySelector('.takeUp img'), vid = box.querySelector('.takeUp video');
    const r = { img: !!img, video: !!vid, alt: img ? img.alt : '', src: (img || vid || {}).getAttribute ? (img || vid).getAttribute('src').slice(0, 12) : '' };
    box.remove(); return r; };
  out.show = { local: await show({ blob: png, kind: 'image', alt: 'A red square' }),
               video: await show({ url: 'https://efuotxdeifqzdfsavekb.supabase.co/storage/v1/object/public/media/u/x/upload.mp4', kind: 'video' }),
               hostile: await show({ url: 'javascript:alert(1)', kind: 'image' }) };
  // The picture is there the moment the box opens, not two seconds after the buttons around it.
  { const d2 = document.createElement('div'); document.body.appendChild(d2);
    Compose.create(d2, { onPublish() {}, log() {} });
    await d2._takeFile(new File([png], 'red.png', { type: 'image/png' }));
    const im = d2.querySelector('.upMedia img');
    out.previewAtOnce = { shown: !d2.querySelector('.upChosen').hidden, hasSrc: !!(im && im.getAttribute('src')), size: im ? [im.width, im.height] : null };
    d2.remove(); }

  // A comment can carry a photo too, alone or with words.
  { const box = document.createElement('div'); document.body.appendChild(box);
    const got = [];
    await AnnotationPage.render(box, { id: 'x', item: { kind: 'post', text: 'p', quote: '', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' },
      take: { text: 'take' }, created: Date.now(), mine: false, comments: [], reactions: [], records: [], siteNav: false },
      { onComments: (list, change) => got.push(change) });
    out.commentBox = { button: !!box.querySelector('.cUpBtn'), gifMark: (box.querySelector('.cGifBtn') || {}).textContent || '' };
    await box._takeCommentFile(new File([png], 'red.png', { type: 'image/png' })); await wait(50);
    box.querySelector('.cUpChosen .upAlt').value = 'A red square';
    const chosen = !box.querySelector('.cUpChosen').hidden;
    box.querySelector('.cPost').click(); await wait(100);
    const added = got[0] && got[0].added;
    out.comment = { chosen, sent: !!added, kind: added && added.upload && added.upload.kind, alt: added && added.upload && added.upload.alt,
                    text: added && added.text, shown: !!box.querySelector('.cList .cmtUp img'), cleared: box.querySelector('.cUpChosen').hidden };
    await box._takeCommentFile(new File(['x'], 'a.txt', { type: 'text/plain' })); await wait(50);
    out.commentRefused = box.querySelector('.cUpErr').hidden ? '' : box.querySelector('.cUpErr').textContent;
    box.remove(); }

  // Saving a comment with a photo, and reading one back.
  { const real = Backend.client, sent = [];
    Backend.client = { storage: { from: () => ({ upload: async (path, blob, o) => { sent.push({ path }); return { error: null }; } }) },
      from: () => ({ insert: (row) => { sent.push({ row }); return { select: () => ({ single: async () => ({ data: { id: 'c9' }, error: null }) }) }; } }) };
    let dbId = null;
    try { dbId = await Cloud.addComment('ann1', 'u1', '', null, { blob: png, kind: 'image', type: 'image/png', w: 4, h: 3, alt: 'A red square' }); } catch (e) { out.addError = e.message; }
    Backend.client = real;
    const row = (sent.find((s) => s.row) || {}).row;
    out.commentSave = { dbId, path: (sent.find((s) => s.path) || {}).path || '', upload: row && row.upload };
    const box = document.createElement('div'); document.body.appendChild(box);
    await AnnotationPage.render(box, { id: 'x', item: { kind: 'post', text: 'p', quote: '', author: 'A', handle: '@a', url: 'https://x.com/a/status/9' },
      take: { text: 'take' }, created: Date.now(), mine: false, records: [], reactions: [], siteNav: false,
      comments: [{ text: '', t: 1, upload: { url: 'https://efuotxdeifqzdfsavekb.supabase.co/storage/v1/object/public/media/u1/comments/a.png', kind: 'image', alt: 'From the bucket' } },
                 { text: 'bad', t: 2, upload: { url: 'javascript:alert(1)', kind: 'image' } }] }, {});
    out.commentRead = { shown: box.querySelectorAll('.cList .cmtUp img').length, alt: (box.querySelector('.cList .cmtUp img') || {}).alt || '' };
    box.remove(); }
  return out;
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profUP'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=NEWS, headers={'Content-Type': 'text/html'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    await one_panel(sw)
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pg.goto(f'chrome-extension://{extid}/sidepanel.html'); await asyncio.sleep(1.5)
    u = await pg.evaluate(UNITS.replace('arguments[0]', repr(base64.b64encode(PNG).decode())))
    for k, v in u.items(): print(k, v)
    if not u['empty']['button']: errs.append('there is no way to add a photo or video')
    if u['empty']['gifLooksLikeGif'].strip() != 'GIF': errs.append('the GIF button still looks like a photo button')
    if 'photo or video' not in u['empty']['hint']: errs.append(f"the empty take's hint does not mention photos: {u['empty']['hint']!r}")
    im = u['image']
    if not (im['shown'] and im['preview']): errs.append('a chosen photo was not shown in the take box')
    if im['disabled']: errs.append('a photo on its own did not count as a take')
    if (im['kind'], im['w'], im['h'], im['alt']) != ('image', 4, 3, 'A red square'): errs.append(f'the photo came out as {im}')
    if im['remove'] != 'Remove the photo': errs.append(f"the remove button read {im['remove']!r}")
    if u['removed']['shown'] or u['removed']['value'] or not u['removed']['disabled']: errs.append(f"removing the photo left something behind: {u['removed']}")
    if 'cannot go on an annotation' not in u['wrongType']: errs.append(f"a text file was not refused clearly: {u['wrongType']!r}")
    if '25 MB' not in u['tooBig'] or '26.0 MB' not in u['tooBig']: errs.append(f"a 26 MB file was not refused with its size: {u['tooBig']!r}")
    if not u['errGone']: errs.append('the refusal stayed after a good file was chosen')
    if u['afterReset']: errs.append('starting a new take kept the old photo')
    pb = u['publish']
    if u.get('publishError'): errs.append('publishing threw: ' + u['publishError'])
    if not any('u1/with-photo/upload.png image/png' in f for f in pb['files']): errs.append(f"the photo did not go to the bucket: {pb['files']}")
    if not pb['withUpload'] or pb['withUpload'].get('path') != 'u1/with-photo/upload.png' or pb['withUpload'].get('alt') != 'A red square':
      errs.append(f"the row did not say where the photo is: {pb['withUpload']}")
    if pb['withoutHasKey']: errs.append('an annotation with no photo still sent the upload column')
    sh = u['show']
    if not sh['local']['img'] or sh['local']['alt'] != 'A red square': errs.append(f"a photo saved here did not show: {sh['local']}")
    if not sh['video']['video']: errs.append(f"a video from the bucket did not show: {sh['video']}")
    if sh['hostile']['img'] or sh['hostile']['video']: errs.append('an address that is not a picture reached the page')
    pa = u['previewAtOnce']
    if not (pa['shown'] and pa['hasSrc'] and pa['size'] == [4, 3]): errs.append(f'the preview was not there when the box opened: {pa}')
    if not u['commentBox']['button']: errs.append('comments have no way to add a photo or video')
    if u['commentBox']['gifMark'].strip() != 'GIF': errs.append('the comment GIF button still looks like a photo button')
    cm = u['comment']
    if not (cm['chosen'] and cm['sent'] and cm['kind'] == 'image' and cm['alt'] == 'A red square' and cm['text'] == ''):
      errs.append(f'a comment with only a photo did not go out whole: {cm}')
    if not cm['shown']: errs.append('the photo did not show in the comment that was posted')
    if not cm['cleared']: errs.append('the comment box kept the photo after posting')
    if 'cannot go on an annotation' not in u['commentRefused']: errs.append(f"a text file in a comment was not refused: {u['commentRefused']!r}")
    cs = u['commentSave']
    if u.get('addError'): errs.append('saving the comment threw: ' + u['addError'])
    if not cs['path'].startswith('u1/comments/ann1-') or not cs['upload'] or cs['upload'].get('alt') != 'A red square':
      errs.append(f'the comment photo was not saved in the commenter folder: {cs}')
    if u['commentRead'] != {'shown': 1, 'alt': 'From the bucket'}: errs.append(f"reading comments back showed {u['commentRead']}")

    # End to end in the panel: choose the file with the real file chooser, publish, open the page.
    tmp = os.path.join(tempfile.gettempdir(), 'annotated-upload-test.png'); open(tmp, 'wb').write(PNG)
    # The panel page used for the checks above is closed first. Left open, it is a second panel beside the
    # page, both answer the Annotate click, and the one being watched sometimes never hears it.
    await pg.close()
    news = await ctx.new_page(); await news.goto('https://harborline.example/2026/09/17/overnight-buses-trial')
    nid = await sw.evaluate("chrome.tabs.query({url:'https://harborline.example/*'}).then(t=>t[0].id)")
    await sw.evaluate(f"chrome.windows.create({{url:'chrome-extension://{extid}/sidepanel.html?tab={nid}',width:420,height:1000}})")
    ap = await ctx.wait_for_event('page'); await asyncio.sleep(2); await news.bring_to_front()
    # The selection event is fired by hand as well, because a page in a background window does not always
    # send one, and without it no Annotate button appears.
    for _ in range(6):
      await news.evaluate('''()=>{const p=document.querySelectorAll("p")[2];const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}''')
      await asyncio.sleep(.8)
      if await news.evaluate("[...document.querySelectorAll('.annotated-ui')].some(h=>h.style.display==='block')"): break
    await press_annotate(news)
    try: await ap.wait_for_selector('.aCompose:not([hidden])', timeout=25000)
    except Exception:
      print('THE PANEL SAID:', (await ap.inner_text('body'))[:900].replace(chr(10), ' | '))
      print('THE PAGE BUTTONS:', await news.evaluate("[...document.querySelectorAll('.annotated-ui')].map(h=>h.style.display)"))
      raise
    await asyncio.sleep(1)
    async with ap.expect_file_chooser() as fc: await ap.click('#articleMode .upBtn')
    await (await fc.value).set_files(tmp); await asyncio.sleep(.8)
    await ap.fill('#articleMode .upAlt', 'A red square')
    print('publish ready with only a photo:', not await ap.is_disabled('#articleMode .publish'))
    await publish_now(ap, '#articleMode .publish'); await asyncio.sleep(1.5)
    rid = await ap.evaluate("Store.allMeta().then(r=>r[0].id)")
    ann = await ctx.new_page(); await ann.goto(f'chrome-extension://{extid}/annotation.html#{rid}'); await asyncio.sleep(2)
    page = await ann.evaluate("(()=>{const i=document.querySelector('.takeUp img');return i?{alt:i.alt,loaded:i.complete&&i.naturalWidth}:null})()")
    print('the published page shows:', page)
    if not page or page['alt'] != 'A red square' or not page['loaded']: errs.append(f'the photo did not reach the annotation page: {page}')
    feed = await ann.goto(f'chrome-extension://{extid}/feed.html#profile'); await asyncio.sleep(2)
    card = await ann.evaluate("(document.querySelector('.cards .fStats')||{}).textContent||''")
    print('the card says:', card)
    if 'Photo' not in card: errs.append(f'the card does not mark the photo: {card!r}')
    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
