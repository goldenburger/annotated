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
    // A plain day is midnight in Greenwich, so it is shown there, or it reads a day early west of it.
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim());
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', ...(dayOnly ? { timeZone: 'UTC' } : {}) });
  }
  function metaLine(m) { return [m.site, m.author ? 'By ' + m.author : '', fmtDate(m.published)].filter(Boolean).join('. '); }
  const words = (t) => t.split(/\s+/).filter(Boolean).length;

  function create(root, ad, opts = {}) {
    const log = opts.log || (() => {});
    root.innerHTML = `
      ${PanelKit.phead(opts.xHost ? 'post' : opts.ytHost ? 'video' : 'article', 'aTitle', 'ameta')}
      <section class="passage">
        <div class="emptyState selHint">
          ${PanelKit.illo('article')}
          <p class="esTitle">${opts.xHost ? 'Quote a post' : opts.ytHost ? 'Open a video to clip it' : 'Highlight any words'}</p>
          <p class="esWhat">${opts.xHost
            ? 'Select the words you want inside a post, then click Annotate beside them. The annotation is of that post and links back to it. Right-clicking the selection works too.'
            : opts.ytHost ? 'Pick any video and the panel sets up a clip of it. You can still select words on this page and annotate them.'
            : 'Select anything on the page, a headline, a sentence or a few paragraphs, then click Annotate beside it. Right-clicking the selection works too.'}</p>
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
        <p class="frag aFrag" hidden></p>
        <p class="quoteActs"><button type="button" class="link aFragFix" hidden>Use the whole sentence</button></p>
        <button type="button" class="quiet ctxthumb" aria-label="See the screenshot of the passage">${Brand.icon('image')} See screenshot<img class="shot" alt="" hidden></button>
        <div class="aStatus"></div>
      </section>
      <section class="compose aCompose" hidden></section>
      <div class="aDup" hidden></div>
      <div class="aFragAsk" hidden></div>
      <section class="aPublished" hidden></section>`;
    const q = (s) => root.querySelector(s);
    // YouTube away from a video names itself at once, before the page has answered anything.
    if (opts.ytHost) { q('.aTitle').textContent = 'YouTube'; q('.ameta').textContent = 'Any video you open'; }
    const status = PanelKit.status(q('.aStatus'), log);
    const compose = Compose.create(q('.aCompose'), {
      draftKey: opts.draftKey,
      placeholder: 'What should people notice in this passage?',
      log, onMicBlocked: opts.onMicBlocked,
      onPublish: opts.onPublish ? publish : null,
    });
    let busy = false, result = null, lastSel = { state: 'empty' }, published = false, widening = false;
    const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    PanelKit.setStep(root, 1);
    if (opts.switchTo) PanelKit.modeSwitch(root, 'text', opts.switchTo.onClick);
    if (opts.onFindPodcast) q('.fpFind').addEventListener('click', opts.onFindPodcast);
    if (opts.wirePaste) opts.wirePaste(root);

    q('.grab').addEventListener('click', grab);
    q('.selClear').addEventListener('click', () => ad.clear());
    q('.exactBtn').addEventListener('click', () => ad.setExact(q('.exactBtn').dataset.exact === '1'));
    // Hold the same words again, grown to their sentence, then capture them. Nothing happens if the page
    // has moved on far enough that the passage can no longer be found.
    q('.aFragFix').addEventListener('click', async () => {
      const b = q('.aFragFix');
      if (!ad.widen || b.disabled) return;
      b.disabled = true;
      // The panel is about to change the words itself, so the watcher must not read that as you selecting
      // something new and send the panel back to Capture to do what it is already doing.
      widening = true;
      const r = await ad.widen();
      if (r && r.ok) await grab();
      else { q('.selErr').textContent = 'That passage has moved, so select the sentence on the page.'; q('.selErr').dataset.from = ''; q('.selErr').hidden = false; }
      widening = false;
      b.disabled = false;
    });
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
      if (opts.keep) opts.keep.clear().catch(() => {});
      q('.aResult').hidden = true; q('.aPublished').hidden = true; q('.aCompose').hidden = true; q('.aDup').hidden = true;
      q('.aFragAsk').hidden = true;
      compose.reset(); status.reset();
      PanelKit.setStep(root, 1);
    }
    function update(s) {
      if (widening) return;
      if (busy || !s) return;
      lastSel = s;
      // After publishing, a new selection starts a fresh annotation.
      if (published && s.state !== 'empty') startFresh();
      // Only new words put an error away. The page lets go of its selection the moment a capture starts, so
      // hiding it on every update wiped the reason a capture failed a tenth of a second after it appeared.
      if (s.state !== 'empty' || q('.selErr').dataset.from === 'sel') q('.selErr').hidden = true;
      // On X, words inside a post name that post in the heading, and the button says what it captures.
      if (opts.xHost && !result) {
        const by = s.state !== 'empty' && s.postBy;
        q('.aTitle').textContent = by ? `${by}'s post on X` : 'Posts on X';
        q('.ameta').textContent = by ? 'The words you selected become an annotation of this post' : 'Whichever post you select words in';
      }
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
      { const n = s.text.trim().split(/\s+/).filter(Boolean).length; q('.selCount').textContent = n === 1 ? '1 word selected' : `${n.toLocaleString()} words selected`; }
      const eb = q('.exactBtn');
      if (s.expanded) { q('.selNote').textContent = 'Snapped to full sentences.'; eb.textContent = 'Use exactly what I selected'; eb.dataset.exact = '1'; eb.hidden = false; }
      // The whole sentence is offered once, beside the captured quote, where the note saying it is part of a
      // sentence sits. Offering it here as well asked the same question twice in a row.
      else { q('.selNote').textContent = ''; eb.hidden = true; }
      q('.selMode').hidden = eb.hidden;
      if (s.state === 'error') { q('.selErr').textContent = s.error; q('.selErr').dataset.from = 'sel'; q('.selErr').hidden = false; }
      q('.grab').disabled = s.state !== 'ok';
      q('.grab').textContent = result ? 'Capture this passage instead' : s.postBy ? 'Capture from this post' : 'Capture passage';
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
        q('.selErr').dataset.from = ''; q('.selErr').textContent = (r && r.error) || 'The passage could not be captured.';
        q('.selErr').hidden = false;
        q('.grab').disabled = lastSel.state !== 'ok';
        return;
      }
      let shot = null;
      try { if (r.image) shot = crop(r.image, r.clip, r.bounds); } catch (e) { log('Screenshot crop failed. ' + e.message); }
      // Kept for this browser session, so a panel that reloads comes back to the passage and the take, where
      // it used to go back to "Highlight any words" and keep only the words you had written.
      if (opts.keep) { const { image, clip, bounds, ...keepR } = r; opts.keep.save({ r: keepR, shot }).catch(() => {}); }
      await showCaptured(r, shot);
    }
    async function showCaptured(r, shot) {
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
      // The note, and the offer to grow the quote, show only when growing it would change it. A headline has
      // no full stop and is still the whole thing, so the text alone cannot say it is part of a sentence.
      // The page is asked where the sentences around the quote begin and end, every time, because the text
      // alone mistook a quote opening on a name for one opening a sentence.
      let frag = PanelKit.fragmentNote(r.text);
      q('.aFragFix').hidden = true;
      if (ad.widen) {
        const peek = await ad.widen(true).catch(() => null);
        if (peek && peek.ok) {
          frag = PanelKit.fragmentFrom(r.text, peek.text);
          q('.aFragFix').hidden = !frag;
        }
      }
      q('.aFrag').textContent = frag;
      q('.aFrag').hidden = !frag;
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
      else status.add('fail', 'Screenshot', r.shotError || 'No picture this time.');
      status.done(`Passage ready. From ${m.site}${m.author ? ', by ' + m.author : ''}.`, { quiet: true });

      q('.aPublished').hidden = true;
      // A new capture replaces the quote, not what you wrote about it. Clearing the take here threw away a half
      // written take whenever the passage was swapped, and a take kept from before the panel reloaded.
      // Publishing and starting a new annotation still clear it, in startFresh.
      q('.aCompose').hidden = false;
      PanelKit.setStep(root, 2);
      q('.aResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // One publish at a time (audit of 2026-09-29).
    let publishing = false;
    async function publish(take, force = false) {
      if (publishing) return;
      publishing = true;
      try { return await publishOnce(take, force); } finally { publishing = false; }
    }
    async function publishOnce(take, force = false) {
      if (!result) return;
      if (!force && opts.findDuplicate) {
        const ref = await opts.findDuplicate(result);
        if (ref) {
          PanelKit.dupWarn(q('.aDup'), { what: 'passage', published: ref.published !== false, onView: () => opts.onView && opts.onView(ref, { justPublished: false }), onAnyway: () => { q('.aDup').hidden = true; publish(take, true); } });
          return;
        }
      }
      q('.aDup').hidden = true;
      // Any words may be annotated, a headline or half a sentence included, so Publish publishes. The line
      // beside the quote still says when it is part of a sentence, with the offer to grow it.
      q('.aFragAsk').hidden = true;
      compose.setBusy(true);
      PanelKit.sendOff(q('.aCompose'), { take: take && take.text, quote: result.text, source: result.meta && result.meta.title });
      try {
        pubRef = await opts.onPublish({ ...result }, take);
        published = true;
        if (opts.keep) opts.keep.clear().catch(() => {});
        compose.forgetDraft();
        // Published: the page goes back to normal, with no highlight left behind.
        if (ad.clearCaptured) ad.clearCaptured();
        q('.aCompose').hidden = true;
        // Growing the quote would capture a second time, and this one is already saved. The post panel has
        // always taken it away here, and the article panel went on offering it under a finished annotation.
        q('.aFragFix').hidden = true;
        PanelKit.setStep(root, 4);
        PanelKit.published(q('.aPublished'), { note: pubRef && pubRef.note, local: !!(pubRef && pubRef.local), id: pubRef && pubRef.id, offline: !!(pubRef && pubRef.offline),
          permalink: pubRef && pubRef.permalink,
          xHref: pubRef && pubRef.permalink ? AnnotationPage.xUrl(result, take, pubRef.permalink) : null,
          onView: () => opts.onView && opts.onView(pubRef),
          onNew: () => { startFresh(); update(lastSel); },
          onUndo: opts.onUndo ? async () => {
            await opts.onUndo(pubRef);
            pubRef = null; published = false;
            q('.aPublished').hidden = true; q('.aCompose').hidden = false;
            PanelKit.setStep(root, 2);
            q('.aCompose').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } : null,
        });
      } catch (e) {
        PanelKit.grounded();
        q('.selErr').textContent = 'Publishing failed. ' + e.message; q('.selErr').dataset.from = ''; q('.selErr').hidden = false;
      } finally { compose.setBusy(false); }
    }

    async function refresh() {
      const r = await ad.info();
      if (!r) return;
      // A timeline is not an article and it is not one post either. Naming it X with an article's icon read
      // like a news site, which is the one thing it is not.
      q('.aTitle').textContent = opts.xHost ? 'Posts on X' : opts.ytHost ? 'YouTube' : (r.meta.title || 'Untitled page');
      q('.ameta').textContent = opts.xHost ? 'Whichever post you select words in' : opts.ytHost ? 'Any video you open' : metaLine(r.meta);
      // A page with no words on it, a photo or a video on its own, has nothing to select, and telling
      // someone to highlight words on it sent them looking for words that were not there.
      if (!opts.xHost && !opts.ytHost && typeof r.textLen === 'number') {
        // Nought from a page that is still filling in is asked again shortly, since a page can start blank
        // and fill in a second later, as YouTube's home page does.
        const none = r.textLen === 0;
        if (r.textLen < 1 && root.isConnected && (opts._rechecks = (opts._rechecks || 0) + 1) <= 15) setTimeout(() => { if (root.isConnected) refresh(); }, 1200);
        q('.selHint .esTitle').textContent = none ? 'No words on this page' : 'Highlight any words';
        q('.selHint .esWhat').textContent = none ? 'There is nothing here to select. Paste a link below, or open a story, a video, a podcast episode or a post.'
          : 'Select anything on the page, a headline, a sentence or a few paragraphs, then click Annotate beside it. Right-clicking the selection works too.';
      }
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

    // A capture from before the panel reloaded, if there is one.
    if (opts.keep) opts.keep.load().then((k) => { if (k && k.r && !result && !busy) showCaptured(k.r, k.shot); }).catch(() => {});
    return { refresh, reset, captureNow: grab };
  }
  return { create, fmtDate, metaLine };
})();
