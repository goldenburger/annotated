// Article mode of the side panel. Shared by the extension and the preview.
// ArticlePanel.create(root, adapter, opts)
//   adapter: { onSelection(cb), info() -> { meta, sel, autoCapture }, capture() -> result, setExact(bool), clear() }
//     capture() resolves to { ok, error, text, meta, fragmentUrl, image, clip, bounds, shotError }
//     where clip and bounds are boxes in the image's own pixels.
//   opts: { log, onPublish(item, take) -> Promise<ref>, onView(ref), findDuplicate(item) -> ref|null, onMicBlocked }
const ArticlePanel = (() => {
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function metaLine(m) { return [m.site, m.author ? 'By ' + m.author : '', fmtDate(m.published)].filter(Boolean).join('. '); }
  const words = (t) => t.split(/\s+/).filter(Boolean).length;

  function create(root, ad, opts = {}) {
    const log = opts.log || (() => {});
    root.innerHTML = `
      ${PanelKit.phead('article', 'aTitle', 'ameta')}
      <section class="passage">
        <div class="emptyState selHint">
          ${PanelKit.illo('article')}
          <p class="esTitle">Highlight a passage</p>
          <p>Select a sentence or a few paragraphs in the story, then click Annotate beside it. Right-clicking the selection works too.</p>
          ${opts.onFindPodcast ? `<p class="fpLinkRow">${Brand.icon('podcast')} <button type="button" class="link fpFind">Clip a podcast episode instead</button></p>` : ''}
          ${opts.pasteForm ? opts.pasteForm() : ''}
        </div>
        <div class="selBox" hidden>
          <div class="selHead"><span class="selLabel">Selected</span><button type="button" class="link selClear">Clear</button></div>
          <blockquote class="quote selQuote"></blockquote>
          <div class="selFoot"><span class="selCount"></span></div>
          <div class="selMode"><span class="selNote"></span> <button type="button" class="link exactBtn" hidden></button></div>
        </div>
        <p class="error selErr" hidden></p>
        <button type="button" class="primary grab" hidden>Capture passage</button>
      </section>
      <section class="aResult result" hidden>
        <p class="resLabel">You're annotating</p>
        <blockquote class="quote capQuote"></blockquote>
        <button type="button" class="quiet ctxthumb" aria-label="See the screenshot of the passage">${Brand.icon('image')} See screenshot<img class="shot" alt="" hidden></button>
        <div class="aStatus"></div>
      </section>
      <section class="compose aCompose" hidden></section>
      <div class="aDup" hidden></div>
      <section class="aPublished" hidden></section>`;
    const q = (s) => root.querySelector(s);
    const status = PanelKit.status(q('.aStatus'), log);
    const compose = Compose.create(q('.aCompose'), {
      placeholder: 'What should people notice in this passage?',
      log, onMicBlocked: opts.onMicBlocked,
      onPublish: opts.onPublish ? publish : null,
    });
    let busy = false, result = null, lastSel = { state: 'empty' }, published = false;
    PanelKit.setStep(root, 1);
    if (opts.switchTo) PanelKit.modeSwitch(root, 'text', opts.switchTo.onClick);
    if (opts.onFindPodcast) q('.fpFind').addEventListener('click', opts.onFindPodcast);
    if (opts.wirePaste) opts.wirePaste(root);

    q('.grab').addEventListener('click', grab);
    q('.selClear').addEventListener('click', () => ad.clear());
    q('.exactBtn').addEventListener('click', () => ad.setExact(q('.exactBtn').dataset.exact === '1'));
    q('.ctxthumb').addEventListener('click', () => {
      let dlg = document.getElementById('annotated-shot');
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.id = 'annotated-shot'; dlg.className = 'shotdlg';
        dlg.innerHTML = '<img alt="The passage as it appears on the page"><button type="button" class="strong">Close</button>';
        dlg.querySelector('button').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
        document.body.appendChild(dlg);
      }
      dlg.querySelector('img').src = q('.shot').src;
      dlg.showModal();
    });
    let pubRef = null;
    ad.onSelection(update);

    function startFresh() {
      result = null; published = false;
      q('.aResult').hidden = true; q('.aPublished').hidden = true; q('.aCompose').hidden = true; q('.aDup').hidden = true;
      compose.reset(); status.reset();
      PanelKit.setStep(root, 1);
    }
    function update(s) {
      if (busy || !s) return;
      lastSel = s;
      // After publishing, a new selection starts a fresh annotation.
      if (published && s.state !== 'empty') startFresh();
      q('.selErr').hidden = true;
      if (s.state === 'empty') {
        q('.selBox').hidden = true; q('.selHint').hidden = !!result;
        q('.grab').disabled = true; q('.grab').hidden = true;
        q('.grab').textContent = 'Capture passage';
        markStale(false);
        return;
      }
      q('.selHint').hidden = true;
      q('.selBox').hidden = false; q('.grab').hidden = false;
      q('.selLabel').textContent = s.pinned ? 'Selected. Held while you click away.' : 'Selected';
      q('.selQuote').classList.toggle('bad', s.state !== 'ok');
      q('.selQuote').textContent = s.text.length > 600 ? s.text.slice(0, 600) + '…' : s.text;
      PanelKit.clampQuote(q('.selQuote'));
      q('.selCount').textContent = `${s.len.toLocaleString()} characters selected`;
      const eb = q('.exactBtn');
      if (s.expanded) { q('.selNote').textContent = 'Snapped to full sentences.'; eb.textContent = 'Use exactly what I selected'; eb.dataset.exact = '1'; eb.hidden = false; }
      else if (s.exact && s.canExpand) { q('.selNote').textContent = 'Using exactly what you selected.'; eb.textContent = 'Include the rest of the sentence'; eb.dataset.exact = '0'; eb.hidden = false; }
      else { q('.selNote').textContent = ''; eb.hidden = true; }
      q('.selMode').hidden = eb.hidden;
      if (s.state === 'error') { q('.selErr').textContent = s.error; q('.selErr').hidden = false; }
      q('.grab').disabled = s.state !== 'ok';
      q('.grab').textContent = result ? 'Capture this passage instead' : 'Capture passage';
      markStale(s.state === 'ok' && !!result);
    }
    function markStale(on) {
      if (!result) return;
      q('.aResult').classList.toggle('stale', on);
      q('.resLabel').textContent = on ? 'Your earlier capture is below. Capture the new selection to replace it.' : "You're annotating";
      // The page only ever shows one highlight: once you select something new, the earlier capture's mark goes.
      // The panel still keeps that capture below until you capture the new selection.
      if (on && ad.clearCaptured) ad.clearCaptured();
    }

    function crop(image, clip, bounds) {
      const x1 = Math.max(bounds.x, clip.x), y1 = Math.max(bounds.y, clip.y);
      const x2 = Math.min(bounds.x + bounds.w, clip.x + clip.w), y2 = Math.min(bounds.y + bounds.h, clip.y + clip.h);
      const sw = Math.max(1, x2 - x1), sh = Math.max(1, y2 - y1);
      const out = Math.min(1, 1400 / sw);
      const c = document.createElement('canvas');
      c.width = Math.round(sw * out); c.height = Math.round(sh * out);
      c.getContext('2d').drawImage(image, x1, y1, sw, sh, 0, 0, c.width, c.height);
      const clipped = clip.y < bounds.y - 1 || clip.y + clip.h > bounds.y + bounds.h + 1;
      return { dataUrl: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height, clipped };
    }

    async function grab() {
      if (busy) return;
      busy = true;
      q('.grab').disabled = true; q('.grab').textContent = 'Capturing';
      q('.selErr').hidden = true;
      let r;
      try { r = await ad.capture(); } catch (e) { r = { ok: false, error: e.message }; }
      busy = false;
      q('.grab').textContent = 'Capture passage';
      if (!r || !r.ok) {
        q('.selErr').textContent = (r && r.error) || 'The passage could not be captured.';
        q('.selErr').hidden = false;
        q('.grab').disabled = lastSel.state !== 'ok';
        return;
      }
      let shot = null;
      try { if (r.image) shot = crop(r.image, r.clip, r.bounds); } catch (e) { log('Screenshot crop failed. ' + e.message); }
      const m = r.meta;
      // A passage inside a post on X becomes an annotation of that post, with the selected words as the quote.
      result = r.post
        ? { kind: 'post', text: r.post.text, author: r.post.author, handle: r.post.handle, posted: r.post.posted, url: r.post.url, id: r.post.id,
            shot: shot && shot.dataUrl, display: 'shot', quote: r.text !== r.post.text ? r.text : '', captured: Date.now() }
        : { kind: 'article', text: r.text, meta: m, fragmentUrl: r.fragmentUrl, shot: shot && shot.dataUrl };

      q('.selBox').hidden = true; q('.selHint').hidden = true; q('.grab').disabled = true; q('.grab').hidden = true;
      q('.aResult').hidden = false; q('.aResult').classList.remove('stale');
      q('.resLabel').textContent = "You're annotating";
      q('.capQuote').textContent = r.text;
      PanelKit.clampQuote(q('.capQuote'));
      q('.ctxthumb').hidden = !shot;
      if (shot) q('.shot').src = shot.dataUrl;

      status.reset();
      if (r.post) status.add('pass', 'Part of a post on X', `${r.post.author} ${r.post.handle}. The annotation links to the post itself.`);
      status.add('pass', 'Passage captured', `${r.text.length.toLocaleString()} characters, ${words(r.text)} words`);
      status.add(m.title ? 'pass' : 'fail', 'Headline', m.title || 'Not found on the page');
      status.add('info', 'Outlet', m.site);
      status.add(m.author ? 'pass' : 'info', 'Author', m.author || 'Not listed on the page');
      status.add(m.published ? 'pass' : 'info', 'Publish date', fmtDate(m.published) || 'Not listed on the page');
      status.add(m.image ? 'pass' : 'info', 'Preview image', m.image ? 'Found' : 'None. The screenshot is used instead.');
      status.add('pass', 'Link to the exact passage', r.fragmentUrl);
      if (shot) status.add('pass', 'Screenshot of the passage', `${shot.w}x${shot.h}${shot.clipped ? '. Taller than the window, so only the visible part is shown.' : ''}`);
      else status.add('fail', 'Screenshot', r.shotError || 'Could not take a screenshot.');
      status.done(`Passage ready. From ${m.site}${m.author ? ', by ' + m.author : ''}.`, { quiet: true });

      q('.aPublished').hidden = true;
      compose.reset();
      q('.aCompose').hidden = false;
      PanelKit.setStep(root, 2);
      q('.aResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    async function publish(take, force = false) {
      if (!result) return;
      if (!force && opts.findDuplicate) {
        const ref = await opts.findDuplicate(result);
        if (ref) {
          PanelKit.dupWarn(q('.aDup'), { what: 'passage', onView: () => opts.onView && opts.onView(ref), onAnyway: () => { q('.aDup').hidden = true; publish(take, true); } });
          return;
        }
      }
      q('.aDup').hidden = true;
      compose.setBusy(true);
      try {
        pubRef = await opts.onPublish({ ...result }, take);
        published = true;
        // Published: the page goes back to normal, with no highlight left behind.
        if (ad.clearCaptured) ad.clearCaptured();
        q('.aCompose').hidden = true;
        PanelKit.setStep(root, 4);
        PanelKit.published(q('.aPublished'), { note: pubRef && pubRef.note, local: !!(pubRef && pubRef.local),
          permalink: pubRef && pubRef.permalink,
          xHref: pubRef && pubRef.permalink ? AnnotationPage.xUrl(result, take, pubRef.permalink) : null,
          onView: () => opts.onView && opts.onView(pubRef),
          onNew: () => { startFresh(); update(lastSel); },
        });
      } catch (e) {
        q('.selErr').textContent = 'Publishing failed. ' + e.message; q('.selErr').hidden = false;
      } finally { compose.setBusy(false); }
    }

    async function refresh() {
      const r = await ad.info();
      if (!r) return;
      q('.aTitle').textContent = r.meta.title || 'Untitled page';
      q('.ameta').textContent = metaLine(r.meta);
      update(r.sel || { state: 'empty' });
      if (r.autoCapture) grab();
    }

    function reset() {
      result = null; lastSel = { state: 'empty' }; published = false;
      q('.aResult').hidden = true; q('.aCompose').hidden = true; q('.aPublished').hidden = true;
      status.reset(); compose.reset();
      PanelKit.setStep(root, 1);
      q('.selBox').hidden = true; q('.selHint').hidden = false;
      q('.grab').disabled = true; q('.grab').hidden = true; q('.grab').textContent = 'Capture passage';
    }

    return { refresh, reset, captureNow: grab };
  }
  return { create, fmtDate, metaLine };
})();
