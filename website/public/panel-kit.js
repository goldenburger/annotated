// Small helpers shared by the side panel modes in the extension and the preview.
const PanelKit = (() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(s, tenths = false) {
    if (!isFinite(s)) return '--';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    const sec = tenths ? (s % 60).toFixed(1).padStart(4, '0') : String(Math.floor(s % 60)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  // One friendly status line. The individual checks only show in debug mode (Shift+D).
  function status(container, log) {
    container.innerHTML = '<p class="status"></p><ul class="checks dbg"></ul>';
    const st = container.querySelector('.status'), list = container.querySelector('.checks');
    let items = [];
    return {
      reset() { items = []; list.innerHTML = ''; st.textContent = ''; container.hidden = true; },
      failed() { return items.some((i) => i.state === 'fail'); },
      add(state, label, detail) {
        items.push({ state, label, detail });
        const li = document.createElement('li');
        li.className = state;
        li.innerHTML = '<span class="s"></span><span><span class="l"></span><span class="d"></span></span>';
        li.querySelector('.s').textContent = state === 'pass' ? '✓' : state === 'fail' ? '✗' : 'i';
        li.querySelector('.l').textContent = label;
        li.querySelector('.d').textContent = detail || '';
        list.appendChild(li);
        log && log(`${state.toUpperCase()} ${label}. ${detail || ''}`);
      },
      // quiet: a clean result says nothing outside debug mode, since the panel already shows it.
      done(okText, { quiet = false } = {}) {
        container.hidden = false;
        const fails = items.filter((i) => i.state === 'fail');
        st.className = 'status ' + (fails.length ? 'bad' : 'ok' + (quiet ? ' quietOk' : ''));
        st.textContent = fails.length
          ? fails.map((f) => `${f.label}. ${f.detail || ''}`.trim()).join(' ')
          : okText;
      },
    };
  }

  // Confirmation once an annotation is live, with the link and sharing built in.
  // note: a line under the heading, for example when it was saved on this computer only.
  // Set by the panel: signs in when needed and publishes an annotation saved on this computer, answering
  // with its link. The preview has no accounts and never sets it.
  let publishLater = null;
  // Publishing, with the paper planes on (fold.js, Display settings): what you are publishing folds into a
  // plane and flies off, out of the panel, and the card below appears once it has gone (and once publishing
  // has finished, whichever is later). sendOff is called by each panel as Publish is pressed, with what the
  // annotation says; grounded puts it back if publishing fails. The source keeps its place meanwhile.
  // One flight per tab's panel (the panel document holds one per tab): publishing in two tabs mixed their takes and
  // cards, and the "Publishing…" line stayed over the other tab's panel (audit after 2.38.7).
  const flights = new Map();
  const rootOf = (el) => (el && el.closest && el.closest('#articleMode > *, #postMode > *, #videoMode > *, #podcastMode > *')) || document.body;
  function sendOff(source, summary = null) {
    grounded(source);
    if (typeof Fold === 'undefined' || !Fold.on() || !source || !source.offsetWidth) return;
    let el = source, card = null;
    if (summary) {
      // A plain card of what is being published, laid over the take box, since a copy of a form would carry
      // empty boxes (a copied text box keeps none of what was typed in it).
      const b = Fold.pageBox(source);
      card = document.createElement('div');
      card.className = 'flyCard';
      card.innerHTML = '<p class="fcTake"></p><p class="fcQuote"></p><p class="fcSrc"></p>';
      card.querySelector('.fcTake').textContent = summary.take || 'Your annotation';
      card.querySelector('.fcQuote').textContent = summary.quote || '';
      card.querySelector('.fcSrc').textContent = summary.source || '';
      card.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;`;
      document.body.appendChild(card);
      el = card;
    }
    source.style.visibility = 'hidden';
    // Where the take was, a line saying what is happening until the card arrives. The space was left blank
    // for a second or two (recording of 2026-09-25 at 01:15, 3:25 to 3:27).
    const at = Fold.pageBox(source), note = document.createElement('p');
    note.className = 'flyNote'; note.setAttribute('role', 'status'); note.textContent = 'Publishing…';
    note.style.cssText = `position:absolute;left:${at.x}px;top:${at.y + 8}px;width:${at.w}px;`;
    document.body.appendChild(note);
    const gone = Fold.away(el);
    if (card) card.remove();
    const root = rootOf(source);
    note.__root = root;
    flights.set(root, { gone, source, note });
    // The line lies on the page, not in the panel, so it hides while its panel does (another tab in front).
    const keep = () => {
      if (!note.isConnected) return;
      // The panel went (its tab closed, the video changed) while publishing: nothing will land, so nothing waits.
      if (root !== document.body && !root.isConnected) { note.remove(); flights.delete(root); return; }
      note.style.visibility = root.offsetParent || root === document.body ? '' : 'hidden'; requestAnimationFrame(keep); };
    requestAnimationFrame(keep);
  }
  function grounded(near) {
    const root = rootOf(near), f = flights.get(root);
    if (!f) return;
    f.gone.cancel(); f.source.style.visibility = ''; f.note.remove(); flights.delete(root);
  }
  // onUndo: offered for UNDO_MS right after publishing, and gone once anything else on the card is pressed. It
  // deletes what was just made and puts the take back where it was, so a slip can be fixed and published again.
  const UNDO_MS = 10000;
  function published(container, { permalink, xHref, onView, onNew, note = '', local = false, id = null, offline = false, onUndo = null }) {
    const later = local && id && publishLater;
    const out = typeof document !== 'undefined' && document.body.classList.contains('signedOut');
    const inFlight = flights.get(rootOf(container)) || null;
    if (inFlight) flights.delete(rootOf(container));
    // A line this panel left behind, with no flight of its own to take it away.
    else if (typeof document !== 'undefined') document.querySelectorAll('.flyNote').forEach((n) => { if (n.__root === rootOf(container)) n.remove(); });
    container.innerHTML = `
      <div class="pubcard fresh" role="status">
        <div class="pubhead"><span class="pubcheck">${Brand.icon('check')}</span><div><b>${local ? 'Saved' : 'Published'}</b><p>${esc(note || 'It has a page of its own now.')}</p></div>${onUndo ? '<button type="button" class="link pubUndo">Undo</button>' : ''}</div>
        ${onUndo ? '<p class="error pubUndoErr" role="alert" hidden></p>' : ''}
        ${permalink && !local ? `<div class="publink"><span class="num">${esc(permalink.replace('https://', ''))}</span></div>` : ''}
        ${later ? `<button type="button" class="primary pubLater">${out ? 'Sign in and publish' : 'Publish it now'}</button><p class="error pubLaterErr" role="alert" hidden></p>` : ''}
        <button type="button" class="${later ? 'ghost sm' : 'primary'} view">View page ${Brand.icon('external')}</button>
        ${local ? '' : `<div class="row">
          ${permalink ? `<button type="button" class="ghost sm pcopy">${Brand.icon('link')} <span>Copy link</span></button>` : ''}
          ${xHref ? `<a class="ghost sm" href="${esc(xHref)}" target="_blank" rel="noopener">${Brand.icon('x')} Post to X</a>` : ''}
        </div>`}
        <button type="button" class="link new">Start a new annotation</button>
        ${typeof PaperDeco !== 'undefined' ? `<div class="pd pd-sent" aria-hidden="true">${PaperDeco.ART[local ? 'lone' : 'trail']()}</div>` : ''}
      </div>`;
    const undo = container.querySelector('.pubUndo');
    if (undo) {
      let timer = 0;
      const drop = () => { clearTimeout(timer); if (undo.isConnected) undo.remove(); };
      timer = setTimeout(drop, UNDO_MS);
      container.querySelectorAll('.pubcard button:not(.pubUndo), .pubcard a').forEach((b) => b.addEventListener('click', drop));
      undo.addEventListener('click', async () => {
        clearTimeout(timer);
        const err = container.querySelector('.pubUndoErr');
        undo.disabled = true; undo.textContent = 'Undoing'; err.hidden = true;
        try { await onUndo(); }
        catch (e) {
          undo.disabled = false; undo.textContent = 'Undo';
          err.textContent = (e && e.message) || 'It could not be undone just now.'; err.hidden = false;
          timer = setTimeout(drop, UNDO_MS);
        }
      });
    }
    container.querySelector('.view').addEventListener('click', onView);
    container.querySelector('.new').addEventListener('click', onNew);
    const pl = container.querySelector('.pubLater');
    // Saved because the connection was down: the button waits for it rather than offering what cannot work,
    // and wakes up by itself when the browser is back online. Offline used to say "Publish it from its page
    // when you are back online" above a button saying Sign in and publish.
    const readyLabel = () => (document.body.classList.contains('signedOut') ? 'Sign in and publish' : 'Publish it now');
    if (pl && offline && typeof navigator !== 'undefined' && navigator.onLine === false) {
      pl.disabled = true; pl.textContent = "Publish when you're back online";
      window.addEventListener('online', () => { if (pl.isConnected) { pl.disabled = false; pl.textContent = readyLabel(); } }, { once: true });
    }
    if (pl) pl.addEventListener('click', async () => {
      const err = container.querySelector('.pubLaterErr');
      pl.disabled = true; pl.textContent = 'Publishing'; err.hidden = true;
      sendOff(container.querySelector('.pubcard'));
      try {
        const link = await publishLater(id);
        published(container, { permalink: link, xHref: null, onView, onNew, id });
      } catch (e) {
        grounded(container);
        pl.disabled = false; pl.textContent = document.body.classList.contains('signedOut') ? 'Sign in and publish' : 'Publish it now';
        err.textContent = (e && e.message) || 'It could not be published just now.'; err.hidden = false;
      }
    });
    const cp = container.querySelector('.pcopy');
    if (cp) cp.addEventListener('click', async () => {
      const lab = cp.querySelector('span');
      try { await navigator.clipboard.writeText(permalink); if (typeof Fold !== 'undefined' && Fold.toss) Fold.toss(lab.parentElement); lab.textContent = 'Link copied'; } catch { lab.textContent = 'Copy failed'; }
      setTimeout(() => { lab.textContent = 'Copy link'; }, 2000);
    });
    container.hidden = false;
    container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (inFlight) {
      // Shown once the plane has gone, with its check, as it would have been had there been no plane.
      const { gone, source, note } = inFlight;
      source.style.visibility = '';
      // The line stays until the card takes its place.
      gone.then(() => note.remove());
      setTimeout(() => note.remove(), 3000);
      const card = container.querySelector('.pubcard');
      card.classList.remove('fresh'); card.classList.add('pl-hidden');
      gone.then(() => { if (!card.isConnected) return; card.classList.remove('pl-hidden'); void card.offsetWidth; card.classList.add('fresh'); });
    }
  }

  // Sticky header for a panel mode: what kind of source, its title, and where you are in the three steps.
  // The header shrinks once the panel scrolls, dropping the detail line.
  // Marks a panel as narrow (under 360 pixels) so tight controls can use short labels.
  function watchWidth() {
    const ro = new ResizeObserver((es) => es.forEach((e) => e.target.classList.toggle('narrowPanel', e.contentRect.width < 360)));
    document.querySelectorAll('.panel').forEach((p) => ro.observe(p));
  }
  function compactOnScroll() {
    watchWidth();
    const onScroll = (e) => {
      const el = e.target === document ? document.scrollingElement : e.target;
      if (!el || !el.classList || !(el.classList.contains('panel') || el === document.scrollingElement)) return;
      // Hysteresis: compacting the header shortens the page, which pulled the scroll back under one threshold and
      // undid it, every frame, a 2px jitter under the Publish button (2.35.1). Compact past 40, open again under 8.
      document.querySelectorAll('.phead').forEach((h) => {
        const on = h.classList.contains('scrolled');
        if (!on && el.scrollTop > 40) h.classList.add('scrolled');
        else if (on && el.scrollTop < 8) h.classList.remove('scrolled');
      });
    };
    document.addEventListener('scroll', onScroll, true);
  }

  function phead(kind, titleClass, metaClass) {
    const label = { video: 'Video', article: 'Article', post: 'Post on X', podcast: 'Podcast' }[kind];
    const icon = { video: 'clip', article: 'article', post: 'post', podcast: 'podcast' }[kind];
    return `<header class="phead">
      <div class="ptop"><span class="pkind" title="${label}">${Brand.icon(icon)}<span class="sr">${label}</span></span><h1 class="ptitle ${titleClass}"></h1></div>
      <div class="pmeta ${metaClass}"></div>
      <ol class="steps" aria-label="Steps"><li><i></i>Capture</li><li><i></i>Take</li><li><i></i><span class="stPub">Publish</span><span class="stSave">Save</span></li></ol>
    </header>`;
  }
  // Small line illustrations for empty states.
  function illo(kind) {
    const lines = (hi) => [0, 1, 2, 3].map((i) => `<rect x="${i === 3 ? 18 : 18}" y="${22 + i * 16}" width="${i === 3 ? 70 : 124}" height="6" rx="3" fill="var(--rule)"/>`).join('')
      + (hi ? `<path d="M14 36.5c30-3 70-3.6 116-2.2 1 3.4.8 7.8-.6 11.6-40 2.6-80 2.8-115.2 1.4-1.2-3.6-1.2-7.4-.2-10.8z" fill="var(--hi)" opacity=".9"/><rect x="18" y="38" width="124" height="6" rx="3" fill="var(--ink-3)"/>` : '');
    if (kind === 'article') return `<svg class="illo" viewBox="0 0 160 96" aria-hidden="true">${lines(true)}<path d="M136 52l8 20 3-8 8-3z" fill="var(--ink)"/></svg>`;
    if (kind === 'post') return `<svg class="illo" viewBox="0 0 160 96" aria-hidden="true"><rect x="12" y="10" width="136" height="76" rx="10" fill="var(--sheet)" stroke="var(--rule)"/><circle cx="30" cy="28" r="8" fill="var(--rule)"/><rect x="44" y="24" width="60" height="6" rx="3" fill="var(--rule)"/><rect x="24" y="46" width="112" height="6" rx="3" fill="var(--rule)"/><rect x="24" y="60" width="84" height="6" rx="3" fill="var(--rule)"/></svg>`;
    return `<svg class="illo" viewBox="0 0 160 96" aria-hidden="true">${lines(false)}</svg>`;
  }

  // First-time tips: shown once, then tucked behind a small "?" button.
  const TIP_KEY = 'annotated-tips-seen';
  const seenTips = () => { try { return JSON.parse(localStorage.getItem(TIP_KEY) || '[]'); } catch { return []; } };
  function markTip(k) { try { const s = seenTips(); if (!s.includes(k)) { s.push(k); localStorage.setItem(TIP_KEY, JSON.stringify(s)); } } catch {} }
  const tipButton = (k) => `<button type="button" class="tipBtn" data-tip-for="${k}" aria-label="Show tip" aria-expanded="false" title="Tip">?</button>`;
  function initTips(root) {
    const seen = seenTips();
    root.querySelectorAll('.tip[data-tip]').forEach((t) => {
      const k = t.dataset.tip;
      t.hidden = seen.includes(k);
      if (!t.hidden) markTip(k);
      const b = root.querySelector(`.tipBtn[data-tip-for="${k}"]`);
      // The button says which it will do. A tip shows the first time, so the first press hides it, and a
      // question mark alone read as help that ought to appear.
      const say = () => { b.setAttribute('aria-expanded', String(!t.hidden)); const w = t.hidden ? 'Show the tip' : 'Hide the tip'; b.title = w; b.setAttribute('aria-label', w); };
      if (b) {
        say();
        b.addEventListener('click', () => { t.hidden = !t.hidden; say(); });
      }
    });
  }

  // Pages with both audio and text: a switch under the header picks which one to annotate.
  let msn = 0;
  function modeSwitch(root, current, onSwitch, modes) {
    const head = root.querySelector('.phead');
    const el = document.createElement('div');
    const name = 'ms-' + (++msn);
    el.className = 'modeSeg seg'; el.setAttribute('role', 'radiogroup'); el.setAttribute('aria-label', 'What to annotate on this page');
    el.innerHTML = (modes || [['audio', 'podcast', 'Clip the audio'], ['text', 'article', 'Highlight text']]).map(([v, ic, l]) =>
      `<label><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}><span>${Brand.icon(ic)} ${l}</span></label>`).join('');
    head.after(el);
    el.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { if (i.value !== current) onSwitch(i.value); }));
  }

  function setStep(root, n) {
    root.querySelectorAll('.steps li').forEach((li, i) => {
      const k = i + 1;
      li.className = k < n ? 'done' : k === n ? 'now' : '';
      if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.querySelector('i').innerHTML = k < n ? Brand.icon('check') : '';
      li.title = k < n ? `${li.textContent} done` : k === n ? `${li.textContent}, current step` : li.textContent;
    });
    // Reaching the take puts the cursor in the take box, so you can type straight away. Both captures in the
    // recording of 2026-09-25 at 23:23 needed a click there first (1:36, 2:23). Not while you are typing elsewhere.
    if (n === 2) requestAnimationFrame(() => requestAnimationFrame(() => {
      const box = [...root.querySelectorAll('.takeInput')].find((t) => t.offsetParent);
      const a = document.activeElement;
      if (box && !(a && a !== document.body && (a.matches('input, textarea, select, [contenteditable]')))) box.focus({ preventScroll: true });
    }));
  }

  // Shown instead of publishing when the same clip or passage is already published.
  // An annotation saved only on this computer was never published, so the warning says what really happened.
  function dupWarn(container, { what, published = true, onView, onAnyway }) {
    container.innerHTML = `
      <div class="dupcard" role="alert">
        <p>${published ? `You already published this ${what}.` : `You already saved this ${what} on this computer.`}</p>
        <div class="row"><button type="button" class="ghost dView">View it</button><button type="button" class="strong dAny">${published ? 'Publish anyway' : 'Save another'}</button></div>
      </div>`;
    container.querySelector('.dView').addEventListener('click', onView);
    container.querySelector('.dAny').addEventListener('click', onAnyway);
    container.hidden = false;
  }

  // Crops a region out of a screenshot. clip and bounds are boxes in the image's own pixels.
  function crop(image, clip, bounds, maxW = 1400) {
    const x1 = Math.max(bounds.x, clip.x), y1 = Math.max(bounds.y, clip.y);
    const x2 = Math.min(bounds.x + bounds.w, clip.x + clip.w), y2 = Math.min(bounds.y + bounds.h, clip.y + clip.h);
    const sw = Math.max(1, x2 - x1), sh = Math.max(1, y2 - y1);
    const out = Math.min(1, maxW / sw);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * out); c.height = Math.round(sh * out);
    c.getContext('2d').drawImage(image, x1, y1, sw, sh, 0, 0, c.width, c.height);
    const clipped = clip.y < bounds.y - 1 || clip.y + clip.h > bounds.y + bounds.h + 1;
    return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height, clipped };
  }

  // One-time welcome: what annotated does in three steps, shown the first time the panel opens.
  // The "?" in the top bar brings it back.
  const WELCOME_KEY = 'annotated-welcome-seen';
  function welcome(panel, { shortcut = '', force = false, onDisplayChoice = null, bare = false } = {}) {
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_KEY) === '1'; } catch {}
    const brand = panel.querySelector('.brand');
    if (brand && !brand.querySelector('.helpBtn')) {
      const h = document.createElement('button');
      h.type = 'button'; h.className = 'helpBtn hasTip'; h.dataset.tooltip = 'How annotated works';
      h.setAttribute('aria-label', 'How annotated works'); h.textContent = '?';
      const x = brand.querySelector('.x');
      brand.insertBefore(h, x || null);
      h.addEventListener('click', () => { if (typeof Account !== 'undefined' && Account.close) Account.close(); welcome(panel, { shortcut, force: true, onDisplayChoice }); });
    }
    if (seen && !force) return;
    let w = panel.querySelector('.welcome');
    // The ? button toggles: a second press closes it.
    if (w && force && document.body.classList.contains('welcoming')) { closeWelcome(); return; }
    if (!w) {
      w = document.createElement('section');
      w.className = 'welcome'; w.setAttribute('aria-labelledby', 'welcomeTitle');
      w.innerHTML = `
        <div class="wHero">${illo('article')}${typeof PaperDeco !== 'undefined' ? `<div class="pd pd-trail" aria-hidden="true">${PaperDeco.ART.trail()}</div>` : ''}</div>
        <h1 id="welcomeTitle">Say what you think about anything.</h1>
        <p class="wLead">annotated turns a passage, a clip, a podcast moment, or a post into a page with your take on top and the source underneath.</p>
        <ol class="wSteps">
          <li><span class="wIcon">${Brand.icon('highlighter')}</span><div><b>Capture</b><span>Select any words on a page, drag to pick up to 90 seconds of a video or podcast, or save a post.</span></div></li>
          <li><span class="wIcon">${Brand.icon('edit')}</span><div><b>Take</b><span>Write what people should notice. Add a tag, a poll, a GIF, emoji, or a voice note.</span></div></li>
          <li><span class="wIcon">${Brand.icon('share')}</span><div><b>Publish</b><span>It gets a page of its own, with a link to share, and it always credits the source.</span></div></li>
        </ol>
        ${typeof Prefs !== 'undefined' && onDisplayChoice ? `<fieldset class="dmGroup wDisplay"><legend>How should annotated appear?</legend><div class="seg">
          <label><input type="radio" name="w-display" value="side" ${Prefs.get().display !== 'float' ? 'checked' : ''}><span>Side panel</span></label>
          <label><input type="radio" name="w-display" value="float" ${Prefs.get().display === 'float' ? 'checked' : ''}><span>Floating</span></label></div>
          <p class="note">You can change this any time under the gear.</p></fieldset>` : ''}
        <button type="button" class="primary wGo">${seen ? 'Got it' : bare ? 'Show me where to start' : 'Try it on this page'}</button>
        <a class="ghost wSite" href="https://annotated-app.netlify.app/" target="_blank" rel="noopener">Open annotated's home page ${Brand.icon('external')}</a>
        <p class="wKey">${shortcut ? `Open this panel any time with <kbd>${shortcut.split('+').join('</kbd> + <kbd>')}</kbd>.` : 'Set a keyboard shortcut to open this panel at chrome://extensions/shortcuts.'}</p>`;
      brand.insertAdjacentElement('afterend', w);
      w.querySelector('.wGo').addEventListener('click', () => {
        try { localStorage.setItem(WELCOME_KEY, '1'); } catch {}
        const choice = w.querySelector('input[name="w-display"]:checked');
        w.remove(); document.body.classList.remove('welcoming');
        if (choice && onDisplayChoice && choice.value !== Prefs.get().display) { Prefs.set('display', choice.value); onDisplayChoice(choice.value); }
      });
    }
    // Reopened: the choice shows the display in use now, not the last click.
    const cur = w.querySelector(`input[name="w-display"][value="${Prefs.get().display === 'float' ? 'float' : 'side'}"]`);
    if (cur) cur.checked = true;
    w.querySelector('.wGo').textContent = seen ? 'Got it' : bare ? 'Show me where to start' : 'Try it on this page';
    document.body.classList.add('welcoming');
    w.querySelector('.wGo').focus({ preventScroll: true });
  }
  // Escape leaves the help screen the way it leaves every other menu. It used to close Display settings and
  // do nothing here. Leaving counts as having seen it, the same as the button at the foot.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.body.classList.contains('welcoming')) return;
    const go = document.querySelector('.welcome .wGo');
    if (go) { e.preventDefault(); go.click(); }
  });
  function closeWelcome() {
    document.querySelectorAll('.welcome').forEach((w) => w.remove());
    document.body.classList.remove('welcoming');
  }

  // Home and your own profile, beside the wordmark, in every mode. They used to appear only once you had
  // published something, so there was no way back to what you had already made while you were capturing.
  function topLinks(panel, { onHome, onProfile } = {}) {
    const brand = panel.querySelector('.brand');
    if (!brand || brand.querySelector('.homeBtn')) return;
    const make = (cls, icon, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls + ' topLink hasTip'; b.dataset.tooltip = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = Brand.icon(icon);
      b.addEventListener('click', () => fn && fn());
      return b;
    };
    // Before anything that floats to the right, so these sit with the wordmark.
    const right = brand.querySelector('.build') || brand.querySelector('.acctBtn')
      || brand.querySelector('.gearBtn') || brand.querySelector('.helpBtn') || brand.querySelector('.x');
    brand.insertBefore(make('homeBtn', 'home', 'Home', onHome), right || null);
    brand.insertBefore(make('youBtn', 'user', 'Your profile', onProfile), right || null);
  }

  // Display menu: how annotated appears, plus a few preferences. Lives under the gear in the top bar.
  function displayMenu(panel, { onDisplay, sideHint = '' } = {}) {
    const brand = panel.querySelector('.brand');
    if (!brand || brand.querySelector('.gearBtn')) return;
    const g = document.createElement('button');
    g.type = 'button'; g.className = 'gearBtn hasTip'; g.dataset.tooltip = 'Display and preferences';
    g.setAttribute('aria-label', 'Display and preferences'); g.setAttribute('aria-expanded', 'false');
    g.innerHTML = Brand.icon('gear');
    const help = brand.querySelector('.helpBtn'), x = brand.querySelector('.x');
    brand.insertBefore(g, help || x || null);
    let pop = null;
    const seg = (name, label, opts2, val) => `<fieldset class="dmGroup"><legend>${label}</legend><div class="seg">${opts2.map(([v, l]) =>
      `<label><input type="radio" name="dm-${name}" value="${v}" ${val === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>`;
    const PENS = [['chisel', 'Chisel'], ['wet', 'Wet edge'], ['twice', 'Two passes'], ['streak', 'Streaky'], ['flat', 'Flat']];
    // Colour and nib are the same decision made twice, so they sit together. The swatches take their colour
    // from ui.css rather than from the table here, because all six have to show at once and only the chosen
    // one is on the page.
    const swatches = (val) => Prefs.TINTS.map(([v, l]) =>
      `<button type="button" class="tintBtn" data-tint="${v}" aria-label="${l}" title="${l}" aria-pressed="${val === v}"><span class="tintInk" aria-hidden="true"></span><span class="tintName">${l}</span></button>`).join('');
    function close() { if (pop) { pop.remove(); pop = null; g.setAttribute('aria-expanded', 'false'); } }
    function open(anchor) {
      if (pop) return;
      const p = Prefs.get();
      pop = document.createElement('div');
      pop.className = 'dmPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Display and preferences');
      // Two kinds of setting, so two headings. What annotated does comes first, because it changes what
      // happens next. How it looks follows. One long list of eight made each one hard to find.
      pop.innerHTML = `<h2>Display</h2>
        <h3 class="dmSub">How it works</h3>
        ${seg('display', 'Show annotated as', [['side', 'Side panel'], ['float', 'Floating']], p.display)}
        <p class="note dmHint">${p.display === 'float' ? 'Drag the top bar to move it and a bottom corner to resize. Shrink it to a button when you are reading.' : sideHint}</p>
        ${seg('afterPublish', 'After publishing', [['stay', 'Stay here'], ['page', 'Open the page']], p.afterPublish)}
        ${seg('snap', 'What a selection captures', [['exact', 'Exactly what I select'], ['sentences', 'The whole sentence']], p.snap)}
        <label class="dmSwitch"><input type="checkbox" class="dmPageBtn" ${p.pageButton ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span>Show the Annotate button next to selected text</span></label>
        <label class="dmSwitch"><input type="checkbox" class="dmSuggest" ${p.suggest ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span>Suggest places to start on an empty panel</span></label>
        <h3 class="dmSub">How it looks</h3>
        <label class="dmSwitch"><input type="checkbox" class="dmPlanes" ${p.planes !== false ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span>Paper plane animations</span></label>
        <fieldset class="dmGroup"><legend>Colour</legend><div class="tintRow">${swatches(p.tint)}</div></fieldset>
        <fieldset class="dmGroup"><legend>Highlighter</legend><div class="penRow">${PENS.map(([v, l]) =>
          `<button type="button" class="penBtn" data-pen="${v}" aria-pressed="${p.pen === v}"><span class="penInk ${v}" aria-hidden="true"></span>${l}</button>`).join('')}</div></fieldset>
        ${seg('theme', 'Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], p.theme)}
        ${seg('density', 'Density', [['comfortable', 'Comfortable'], ['compact', 'Compact']], p.density)}
        <button type="button" class="ghost sm dmDone">Done</button>`;
      document.body.appendChild(pop);
      // Anchor under the gear, or at the top right when the gear is hidden (inside the floating frame).
      const gr = anchor || g.getBoundingClientRect(), W = Math.min(300, window.innerWidth - 16);
      const r = gr.width ? gr : { bottom: 2, right: window.innerWidth - 8 };
      pop.style.width = W + 'px';
      pop.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, r.right - W)) + 'px';
      // Fit the room actually below the gear, not the whole window. In a short panel this menu is taller than
      // the space under it, and the controls at the bottom used to sit off screen with no way to reach them.
      const below = window.innerHeight - (r.bottom + 6) - 10, above = r.top - 16;
      if (below >= 260 || below >= above) {
        pop.style.top = (r.bottom + 6) + 'px';
        pop.style.maxHeight = Math.max(180, below) + 'px';
      } else {
        pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
        pop.style.maxHeight = Math.max(180, above) + 'px';
      }
      g.setAttribute('aria-expanded', 'true');
      pop.querySelectorAll('input[type=radio]').forEach((i) => i.addEventListener('change', () => {
        const key = i.name.replace('dm-', '');
        Prefs.set(key, i.value);
        if (key === 'display') { close(); closeWelcome(); onDisplay && onDisplay(i.value); }
      }));
      pop.querySelectorAll('.tintBtn').forEach((b) => b.addEventListener('click', () => {
        Prefs.set('tint', b.dataset.tint);
        pop.querySelectorAll('.tintBtn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      pop.querySelectorAll('.penBtn').forEach((b) => b.addEventListener('click', () => {
        Prefs.set('pen', b.dataset.pen);
        pop.querySelectorAll('.penBtn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      pop.querySelector('.dmPageBtn').addEventListener('change', (e) => Prefs.set('pageButton', e.target.checked));
      pop.querySelector('.dmSuggest').addEventListener('change', (e) => Prefs.set('suggest', e.target.checked));
      pop.querySelector('.dmPlanes').addEventListener('change', (e) => Prefs.set('planes', e.target.checked));
      pop.querySelector('.dmDone').addEventListener('click', () => { close(); g.focus(); });
      pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); g.focus(); } });
      (pop.querySelector('input:checked') || pop.querySelector('input')).focus();
      setTimeout(() => document.addEventListener('mousedown', function out(ev) {
        if (!pop) return document.removeEventListener('mousedown', out);
        if (!pop.contains(ev.target) && !g.contains(ev.target)) { document.removeEventListener('mousedown', out); close(); }
      }), 0);
    }
    g.addEventListener('click', () => (pop ? close() : open()));
    return { open, close, toggle: (anchor) => (pop ? close() : open(anchor)) };
  }

  // Long passages show about six lines, with a Show all link to read the rest in place.
  function clampQuote(el) {
    let more = el.nextElementSibling && el.nextElementSibling.classList.contains('qMore') ? el.nextElementSibling : null;
    el.classList.remove('open');
    el.classList.add('clampQ');
    requestAnimationFrame(() => {
      const over = el.scrollHeight > el.clientHeight + 4;
      if (!over) { if (more) more.remove(); if (!over) el.classList.remove('clampQ'); return; }
      if (!more) {
        more = document.createElement('button');
        more.type = 'button'; more.className = 'link qMore';
        more.addEventListener('click', () => { const open = el.classList.toggle('open'); more.textContent = open ? 'Show less' : 'Show all'; more.setAttribute('aria-expanded', String(open)); });
        el.after(more);
      }
      more.textContent = 'Show all'; more.setAttribute('aria-expanded', 'false');
    });
  }

  // Reports the panel's content height, so a floating frame can fit it.
  function reportHeight(root, cb) {
    const measure = () => {
      let h = 0;
      for (const el of root.children) {
        if (el.hidden || getComputedStyle(el).display === 'none' || el.matches('script, style, dialog, .dmPop, .emojiPop, .emojiAc, .quickBar')) continue;
        h = Math.max(h, el.offsetTop + el.offsetHeight);
      }
      const pad = parseFloat(getComputedStyle(root).paddingBottom) || 0;
      const need = Number(document.body.dataset.popNeed || 0);
      const next = Math.ceil(Math.max(h + pad + 4, need));
      if (next !== lastH) { lastH = next; cb(next); }
    };
    let lastH = -1, queued = false;
    // One measurement a frame however many changes arrive in it; each reads the layout of every part of the panel.
    const soon = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; measure(); }); };
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['data-pop-need'] });
    const ro = new ResizeObserver(soon);
    ro.observe(root);
    new MutationObserver(soon).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    for (const el of root.querySelectorAll('*')) { if (el.parentElement === root) ro.observe(el); }
    measure();
  }

  function initDebug() {
    let on = false;
    try { on = localStorage.getItem('annotated-debug') === '1'; } catch {}
    document.body.classList.toggle('debug', on);
    document.addEventListener('keydown', (e) => {
      if (!e.shiftKey || e.key.toLowerCase() !== 'd' || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
      const now = !document.body.classList.contains('debug');
      document.body.classList.toggle('debug', now);
      try { localStorage.setItem('annotated-debug', now ? '1' : '0'); } catch {}
    });
  }

  function makeLog(pre) {
    return (line) => { if (!pre) return; pre.textContent += `[${new Date().toLocaleTimeString()}] ${line}\n`; pre.scrollTop = pre.scrollHeight; };
  }

  // A quote that begins or ends in the middle of a sentence is allowed, because what you pick is what you get.
  // It reads like a mistake to everyone else unless the page says it was on purpose, so the panel says so.
  function fragmentNote(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    const head = /^[a-z]/.test(t);
    const tail = !/[.!?…][”’"')\]]?$/.test(t);
    if (head && tail) return 'This quote starts and ends in the middle of a sentence.';
    if (head) return 'This quote starts in the middle of a sentence.';
    if (tail) return 'This quote ends in the middle of a sentence.';
    return '';
  }

  // What the page itself says about the quote. whole is the same words grown to full sentences on the page,
  // so where the quote sits inside it says which end is cut, where the text alone could only guess from a
  // capital letter and a full stop, and a name at the start of a quote passed for the start of a sentence.
  function fragmentFrom(quote, whole) {
    const n = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const q = n(quote), w = n(whole);
    if (!q || !w || q === w) return '';
    const i = w.indexOf(q);
    if (i < 0) return fragmentNote(quote);
    const head = i > 0, tail = i + q.length < w.length;
    if (head && tail) return 'This quote starts and ends in the middle of a sentence.';
    if (head) return 'This quote starts in the middle of a sentence.';
    if (tail) return 'This quote ends in the middle of a sentence.';
    return '';
  }

  return { fragmentFrom, clamp, esc, fmt, status, published, sendOff, grounded, setPublishLater: (fn) => { publishLater = fn; }, phead, setStep, modeSwitch, illo, tipButton, initTips, topLinks, compactOnScroll, welcome, closeWelcome, displayMenu, reportHeight, clampQuote, dupWarn, crop, fragmentNote, initDebug, makeLog };
})();
