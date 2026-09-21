// X post mode of the side panel. Shared by the extension and the preview.
// PostPanel.create(root, adapter, opts)
//   adapter: { info() -> { ok, error, text, author, handle, posted, url }, capture() -> { ok, error, ..., image, clip, bounds, shotError } }
//   opts: { log, onPublish(item, take) -> Promise<ref>, onView(ref), findDuplicate(item) -> ref|null, onMicBlocked }
const PostPanel = (() => {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const fmtDate = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; };
  let n = 0;

  function create(root, ad, opts = {}) {
    const log = opts.log || (() => {});
    const group = 'showas-' + (++n);
    root.innerHTML = `
      ${PanelKit.phead('post', 'pTitle', 'pMeta')}
      <div class="emptyState pEmpty" hidden>
        ${PanelKit.illo('post')}
        <p class="esTitle">Waiting for the post</p>
        <p class="pEmptyMsg">Scroll to the post so it loads, then open this panel again.</p>
      </div>
      <section class="passage pBody">
        <blockquote class="quote pText"></blockquote>
        <fieldset class="showAs"><legend>Show it on your annotation as ${PanelKit.tipButton('showas')}</legend>
          <div class="seg">
            <label><input type="radio" name="${group}" value="screenshot" checked><span>Screenshot</span></label>
            <label><input type="radio" name="${group}" value="embed"><span>Embed</span></label>
            <label><input type="radio" name="${group}" value="both"><span>Both</span></label>
          </div>
        </fieldset>
        <p class="hint tip" data-tip="showas">A screenshot keeps the post even if it is deleted. The embed shows its text and links to the live post.</p>
        <p class="hint quoteHint">To quote part of the post or a reply, select those words first.</p>
        <p class="error pErr" hidden></p>
        <button type="button" class="primary pGrab">Capture post</button>
      </section>
      <section class="pResult result" hidden>
        <p class="resLabel">You're annotating</p>
        <div class="pQuoteBox" hidden><p class="k">Quoting</p><blockquote class="quote pQuote"></blockquote>
          <button type="button" class="link pQuoteX">Remove the quote</button></div>
        <button type="button" class="quiet ctxthumb" aria-label="See the screenshot of the post">${Brand.icon('image')} See screenshot<img class="shot" alt="" hidden></button>
        <div class="pStatus"></div>
      </section>
      <section class="compose pCompose" hidden></section>
      <div class="pDup" hidden></div>
      <section class="pPublished" hidden></section>
      <div class="pNewSel" hidden role="status"><span>You selected new words on the page.</span><button type="button" class="primary sm pNewSelGo">Quote them in a new annotation</button></div>`;
    const q = (s) => root.querySelector(s);
    // Removing the quote takes the stroke off the page as well. Leaving it there said the whole post was
    // marked while the panel said nothing was quoted.
    q('.pQuoteX').addEventListener('click', () => {
      if (result) result.quote = '';
      q('.pQuoteBox').hidden = true;
      q('.resLabel').textContent = "You're annotating";
      if (ad.clearCaptured) ad.clearCaptured();
    });
    const status = PanelKit.status(q('.pStatus'), log);
    const compose = Compose.create(q('.pCompose'), {
      placeholder: 'What should people notice in this post?',
      log, onMicBlocked: opts.onMicBlocked, onPublish: opts.onPublish ? publish : null,
    });
    let result = null, busy = false, published = false, pubRef = null;
    PanelKit.setStep(root, 1);
    PanelKit.initTips(root);
    const display = () => (root.querySelector(`input[name="${group}"]:checked`) || {}).value || 'screenshot';

    q('.ctxthumb').addEventListener('click', () => {
      let dlg = document.getElementById('annotated-shot');
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.id = 'annotated-shot'; dlg.className = 'shotdlg';
        dlg.innerHTML = '<img alt="Screenshot"><button type="button" class="strong">Close</button>';
        dlg.querySelector('button').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
        document.body.appendChild(dlg);
      }
      dlg.querySelector('img').src = q('.shot').src;
      dlg.showModal();
    });

    function startFresh() {
      result = null; published = false;
      q('.pBody').classList.remove('folded'); q('.pNewSel').hidden = true; q('.pQuoteX').hidden = false;
      q('.pBody').insertBefore(q('.showAs'), q('.hint.tip'));
      q('.pResult').hidden = true; q('.pCompose').hidden = true; q('.pDup').hidden = true; q('.pPublished').hidden = true;
      compose.reset(); status.reset();
      q('.pGrab').hidden = false;
      PanelKit.setStep(root, 1);
    }

    // X loads posts a moment after the page. Until the post appears, keep checking every second for up to a minute.
    let retry = null, tries = 0;
    async function refresh() {
      clearTimeout(retry);
      const r = await ad.info();
      if (!r || !r.ok) {
        q('.pTitle').textContent = 'Post on X';
        q('.pMeta').textContent = '';
        q('.pEmpty').hidden = false; q('.pBody').hidden = true;
        q('.pEmptyMsg').textContent = tries < 60 ? 'Waiting for the post to load.' : 'The post did not load. Reload the page to try again.';
        if (tries++ < 60 && root.isConnected) retry = setTimeout(refresh, 1000);
        return;
      }
      tries = 0;
      q('.pEmpty').hidden = true; q('.pBody').hidden = false;
      q('.pErr').hidden = true;
      q('.pTitle').textContent = r.author;
      q('.pMeta').textContent = [r.handle, fmtDate(r.posted)].filter(Boolean).join('. ');
      q('.pText').hidden = !r.text;
      q('.pText').textContent = r.text;
    }

    async function grab() {
      if (busy) return;
      if (published) startFresh();
      busy = true;
      q('.pGrab').disabled = true; q('.pGrab').textContent = 'Capturing';
      q('.pErr').hidden = true;
      let r;
      try { r = await ad.capture(); } catch (e) { r = { ok: false, error: e.message }; }
      busy = false;
      q('.pGrab').disabled = false; q('.pGrab').textContent = 'Capture post';
      if (!r || !r.ok) { q('.pErr').textContent = (r && r.error) || 'The post could not be captured.'; q('.pErr').hidden = false; return; }
      let shot = null;
      try { if (r.image) shot = PanelKit.crop(r.image, r.clip, r.bounds, 1200); } catch (e) { log('Screenshot crop failed. ' + e.message); }
      result = { kind: 'post', text: r.text, author: r.author, handle: r.handle, posted: r.posted, url: r.url, id: r.id, shot: shot && shot.dataUrl, quote: r.quote || '', captured: Date.now() };
      q('.pQuoteBox').hidden = !result.quote;
      q('.pQuote').textContent = result.quote || '';
      // This capture is the newest thing that happened, so any warning about other words is out of date.
      q('.resLabel').textContent = "You're annotating";
      q('.pResult').hidden = false;
      q('.ctxthumb').hidden = !shot;
      if (shot) q('.shot').src = shot.dataUrl;
      status.reset();
      status.add(r.text ? 'pass' : 'info', 'Post text', r.text ? `${r.text.length} characters` : 'No text. The screenshot carries the post.');
      status.add(r.author ? 'pass' : 'fail', 'Author', `${r.author} ${r.handle}`.trim());
      status.add(r.posted ? 'pass' : 'info', 'Posted', fmtDate(r.posted) || 'Not found');
      status.add('pass', 'Link to the post', r.url);
      status.add(shot ? 'pass' : 'fail', 'Screenshot of the post', shot ? `${shot.w}x${shot.h}${shot.clipped ? '. Taller than the window, so only the visible part is shown.' : ''}` : (r.shotError || 'Could not take a screenshot.'));
      status.done(`Post ready. By ${r.author}${r.handle ? ' (' + r.handle + ')' : ''}.`, { quiet: true });
      q('.pGrab').hidden = true;
      // The post and the hints fold away. Only the choice of how to show it stays above your take.
      q('.pBody').classList.add('folded');
      // The take is the point of the page, so the display choice sits after the quote and the screenshot.
      q('.pResult').insertBefore(q('.showAs'), q('.pStatus'));
      q('.pTitle').textContent = r.author || q('.pTitle').textContent;
      q('.pMeta').textContent = [r.handle, fmtDate(r.posted)].filter(Boolean).join('. ');
      compose.reset();
      q('.pCompose').hidden = false;
      PanelKit.setStep(root, 2);
      q('.pResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    q('.pGrab').addEventListener('click', grab);

    async function publish(take, force = false) {
      if (!result) return;
      const item = { ...result, display: display() };
      if (item.display !== 'embed' && !item.shot) item.display = 'embed';
      if (!force && opts.findDuplicate) {
        const ref = await opts.findDuplicate(item);
        if (ref) {
          PanelKit.dupWarn(q('.pDup'), { what: 'post', onView: () => opts.onView && opts.onView(ref), onAnyway: () => { q('.pDup').hidden = true; publish(take, true); } });
          return;
        }
      }
      q('.pDup').hidden = true;
      compose.setBusy(true);
      try {
        pubRef = await opts.onPublish(item, take);
        published = true;
        q('.pCompose').hidden = true;
        q('.pQuoteX').hidden = true;
        PanelKit.setStep(root, 4);
        PanelKit.published(q('.pPublished'), { note: pubRef && pubRef.note, local: !!(pubRef && pubRef.local),
          permalink: pubRef && pubRef.permalink,
          xHref: pubRef && pubRef.permalink ? AnnotationPage.xUrl(item, take, pubRef.permalink) : null,
          onView: () => opts.onView && opts.onView(pubRef),
          onNew: () => startFresh(),
        });
      } catch (e) {
        q('.pErr').textContent = 'Publishing failed. ' + e.message; q('.pErr').hidden = false;
      } finally { compose.setBusy(false); }
    }

    // The page's Annotate button, or new words selected after publishing, start a capture with those words.
    q('.pNewSelGo').addEventListener('click', () => { startFresh(); grab(); });
    return {
      refresh, reset: startFresh,
      captureNow() { if (busy) return; if (published || result) startFresh(); grab(); },
      onSelection(sel) {
        const fresh = !!(sel && sel.state && sel.state !== 'empty');
        q('.pNewSel').hidden = !(published && fresh);
        // Before publishing, the capture below is about to be replaced, so say so rather than leave a stale quote
        // sitting next to a fresh selection with no explanation. Words that are already the quote are not new,
        // and neither is the stroke left on the page by the capture itself.
        const same = !fresh || norm(sel.text) === norm(result && result.quote);
        if (result && !published) q('.resLabel').textContent = fresh && !same
          ? 'You selected different words. Capture the post again to quote those instead.'
          : "You're annotating";
      },
    };
  }
  return { create, fmtDate };
})();
