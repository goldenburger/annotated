// The public annotation page and the feed. Shared by the extension and the preview.
// AnnotationPage.render(container, opts, hooks) -> Promise<{ setStats, hideBanner }>
//   opts:  { id, item, take, permalink, backLabel, showBanner, stats, comments, reactions, created, records }
//   hooks: { onBack, onHome, onProfile, onTag(tag), onOpen(id), onDismissBanner, onComments(list), onReactions(list), onPollVote(i), onOpenSource(item), onDelete, onEdit({ text, tag }) }
// AnnotationPage.renderFeed(container, { records, tag, mode: 'home' | 'profile', onOpen(id), onTag(tag), onAll(), onHome(), onProfile() })
const AnnotationPage = (() => {
  const { esc, fmt } = PanelKit;
  // The two sign-in marks, small, in their owners' colours: Google's four and X's black (white on a dark button).
  const GMARK = '<svg class="gmark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const XMARK = '<svg class="xmark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-7.2 8.2L23.3 22h-6.6l-5.2-6.8L5.6 22H2.5l7.7-8.8L2 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20z"/></svg>';

  // Folded pages: fold the corner of an annotation to keep it, as you would a page in a book. Kept in this
  // browser, newest first; the feed's Folded filter lists them (2.34.0).
  const Folded = (() => {
    const K = 'annotated-folded';
    // Read once and kept, since has() is asked once per card (performance audit of 2026-09-29); another tab's change
    // is picked up through the storage event.
    let cache = null;
    const read = () => { if (cache) return cache.slice(); try { const v = JSON.parse(localStorage.getItem(K) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; } cache.set = new Set(cache); return cache.slice(); };
    const write = (v) => { cache = null; try { localStorage.setItem(K, JSON.stringify(v.slice(0, 500))); } catch { /* nowhere to keep it */ } };
    try { addEventListener('storage', (e) => { if (e.key === K) cache = null; }); } catch { /* no window */ }
    return {
      has: (id) => { read(); return cache.set.has(id); },
      ids: () => read(),
      toggle: (id) => { const v = read(); const i = v.indexOf(id); if (i >= 0) v.splice(i, 1); else v.unshift(id); write(v); return i < 0; },
    };
  })();

  // Deleting: the sheet crumples into the bin while the delete runs, and comes back if the delete fails (it used to
  // crumple first and stay hidden after a refused delete, and a second press ran a second delete; bug audit 2026-09-29).
  async function crumpleWhile(el, del) {
    const anim = typeof Fold !== 'undefined' && Fold.trash && el ? Fold.trash(el).catch(() => {}) : Promise.resolve();
    let ok = true;
    try { const r = await del(); if (r === false) ok = false; } catch { ok = false; }
    if (!ok && el) { await anim; el.style.visibility = ''; }
  }
  function relTime(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'Just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // The number of people you follow has a name of its own, because pressing Follow has to move it. The same
  // screen used to say Following on the byline and nought following in your own card.
  // Every part of this is a number of our own counting, so it carries a span and goes in as markup.
  const num = (v) => Number(v) || 0;
  // Each count stays on one line. A narrow card broke "0 following" in two.
  const statsLine = (st) => `<span class="stat">${plural(num(st.annotations), 'annotation')},</span> <span class="stat">${plural(num(st.followers), 'follower')}${st.following !== undefined ? ',' : ''}</span>${st.following !== undefined ? ` <span class="stat"><span class="youFollowing num">${num(st.following)}</span> following</span>` : ''}`;

  function xText(item, take) {
    const src = titleOf(item);
    const tail = ` (on "${src}")`;
    const room = 280 - 24 - tail.length;
    let t = take.text || '';
    if (t.length > room) t = t.slice(0, Math.max(0, room - 1)).trimEnd() + '…';
    return t ? t + tail : `On "${src}"`;
  }
  const xUrl = (item, take, permalink) => `https://x.com/intent/post?text=${encodeURIComponent(xText(item, take))}&url=${encodeURIComponent(permalink)}`;
  // The video id comes from whoever published it, so it is encoded rather than trusted to be eleven letters.
  const srcUrlOf = (item) => item.kind === 'video' && item.site === 'x' ? item.url : item.kind === 'video' ? `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId || '')}&t=${Math.floor(Number(item.start) || 0)}s`
    : item.kind === 'post' || item.kind === 'audio' ? item.url : item.fragmentUrl;
  const titleOf = (item) => item.kind === 'video' || item.kind === 'audio' ? item.title : item.kind === 'post' ? `${item.author} on X` : item.meta.title;
  const kindLabel = (item) => ({ video: 'Video', post: 'Post', article: 'Article', audio: 'Podcast' }[item.kind] || 'Article');
  // What the thing this was taken from is called, for the control that opens it. Back is a different job and
  // wears a different label, because one button doing both under the name Back sent people to X when they
  // meant to return to the list they came from.
  const sourceLabel = (item) => item.kind === 'video' && item.site === 'x' ? 'See the post on X' : ({ video: 'Watch the original', post: 'See the post on X', audio: 'Listen to the episode' }[item.kind] || 'Read the article');
  const TAGS = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'];
  // A plain day, 2026-09-17, is read as midnight in Greenwich, and shown in local time it came out a day early
  // anywhere west of there. A date with a time in it is a real moment, and local time is right for that.
  const dayOnly = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '').trim());
  const fmtDate = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', ...(dayOnly(iso) ? { timeZone: 'UTC' } : {}) }) : ''; };

  let claimHandler = null;
  function claimDialog() {
    let dlg = document.getElementById('annotated-claim');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'annotated-claim';
    dlg.setAttribute('aria-labelledby', 'claimTitle');
    dlg.innerHTML = `
      <form method="dialog" class="claimForm">
        <h3 id="claimTitle">File a claim</h3>
        <p class="note">Use this if the annotation uses your work beyond fair use. It stays up while the claim is reviewed.</p>
        <label for="cName">Your name</label><input id="cName" type="text" required>
        <label for="cEmail">Email</label><input id="cEmail" type="email" required>
        <fieldset><legend>You are</legend>
          <label class="radio"><input type="radio" name="role" value="owner" required> The copyright owner</label>
          <label class="radio"><input type="radio" name="role" value="agent"> Authorized to act for the owner</label>
        </fieldset>
        <label for="cWhat">What is the problem?</label><textarea id="cWhat" rows="3" required></textarea>
        <label class="radio"><input type="checkbox" id="cGood" required> I believe in good faith that this use is not authorized.</label>
        <div class="row"><button type="button" class="ghost claimCancel">Cancel</button><button class="strong">Send claim</button></div>
      </form>
      <div class="claimDone" hidden>
        <h3>Claim received</h3>
        <p>The annotation's author and the annotated team will review it.</p>
        <button type="button" class="strong claimClose">Close</button>
      </div>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('.claimForm');
    dlg.querySelector('.claimCancel').addEventListener('click', () => dlg.close());
    dlg.querySelector('.claimClose').addEventListener('click', () => dlg.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const role = (form.querySelector('input[name="role"]:checked') || {}).value || '';
      const data = { name: dlg.querySelector('#cName').value.trim(), email: dlg.querySelector('#cEmail').value.trim(), what: dlg.querySelector('#cWhat').value.trim(), reason: role === 'agent' ? 'Authorized to act for the owner' : 'The copyright owner' };
      const send = form.querySelector('button:not([type])');
      if (claimHandler) {
        send.disabled = true; send.textContent = 'Sending';
        try { await claimHandler(data); }
        catch (err) {
          console.warn('claim', err); send.disabled = false; send.textContent = 'Send claim';
          // The database limits how many claims come in at once and says why in plain words, so that is what
          // is passed on. Anything else is most likely the connection.
          const m = String((err && err.message) || '');
          alert(/lot of claims/.test(m) ? m : 'The claim could not be sent. Check your connection and try again.');
          return;
        }
        send.disabled = false; send.textContent = 'Send claim';
      }
      form.hidden = true; dlg.querySelector('.claimDone').hidden = false;
    });
    return dlg;
  }

  function mediaReady(el, ev, ms = 5000) {
    return new Promise((res) => {
      const t = setTimeout(() => res('timeout'), ms);
      el.addEventListener(ev, () => { clearTimeout(t); res('ok'); }, { once: true });
      el.addEventListener('error', () => { clearTimeout(t); res('error'); }, { once: true });
    });
  }

  /* ---------------- site chrome ---------------- */
  // annotated.com frame: a top bar with the wordmark and navigation, a main column, and a right rail on wide screens.
  // siteNav is off inside the extension, where the panel beside the page already carries Home and your
  // profile and a second pair of them a few centimetres away is just two of everything. The wordmark still
  // goes home, so the page is never a dead end. On the website there is no panel, so the nav stays.
  function shell(container, { active, onHome, onFeed = null, onProfile, siteNav = true }) {
    container.classList.add('site');
    container.innerHTML = `
      <header class="sitebar">
        ${siteNav ? `<button type="button" class="wmBtn navHome" aria-label="annotated home">${Brand.wordmark()}</button>`
          // Inside the extension the panel beside the page has Home, and the logo opens annotated's home page, which
          // is what four clicks on it expected in the recording of 2026-09-24 at 21:03.
          : `<a class="wmBtn" href="https://annotated-app.netlify.app/" target="_blank" rel="noopener" aria-label="annotated's home page" title="annotated's home page">${Brand.wordmark()}</a>`}
        ${siteNav ? `<nav class="sitenav" aria-label="Site">
          <button type="button" class="navBtn navFeed" ${active === 'home' ? 'aria-current="page"' : ''}>Feed</button>
          <button type="button" class="navBtn navProfile" ${active === 'profile' ? 'aria-current="page"' : ''}>${av('xs')} You</button>
        </nav>` : ''}
      </header>
      <div class="sitegrid"><div class="sitemain"></div><aside class="rail" aria-label="More"></aside></div>`;
    // On the website the logo is the home page and Feed is the feed. The nav's button was called Home and opened
    // the feed, so pressing Home on the feed went nowhere (recording of 2026-09-25 at 05:47, 0:32).
    container.querySelectorAll('.navHome').forEach((b) => b.addEventListener('click', () => onHome && onHome()));
    // Inside the extension the logo goes to a tab already on annotated's home page, when there is one, rather than
    // opening another copy each time (recording of 2026-09-25 at 14:08, 2:36).
    container.querySelectorAll('a.wmBtn[target="_blank"]').forEach((a) => a.addEventListener('click', async (e) => {
      if (!(typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query)) return;
      e.preventDefault();
      const tabs = await chrome.tabs.query({ url: 'https://annotated-app.netlify.app/*' }).catch(() => []);
      const open = tabs.find((x) => { try { const u = new URL(x.url); return u.pathname === '/' && !u.searchParams.has('feed') && !u.searchParams.has('tag'); } catch { return false; } });
      if (!open) { chrome.tabs.create({ url: a.href }).catch(() => {}); return; }
      await chrome.tabs.update(open.id, { active: true }).catch(() => {});
      if (open.windowId != null && chrome.windows) chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
      // It opens at the top, where it used to keep wherever it had been scrolled to (recording of 2026-09-25 at
      // 20:19, 1:58, halfway down at Receipts that stay).
      if (chrome.scripting) chrome.scripting.executeScript({ target: { tabId: open.id }, func: () => scrollTo({ top: 0, behavior: 'instant' }) }).catch(() => {});
    }));
    container.querySelectorAll('.navFeed').forEach((b) => b.addEventListener('click', () => (onFeed || onHome) && (onFeed || onHome)()));
    const you = container.querySelector('.navProfile');
    if (you) you.addEventListener('click', () => onProfile && onProfile());
    // Paper on the desk in the page's margins, where there is room for it (paperdeco.js).
    if (typeof PaperDeco !== 'undefined') PaperDeco.desk(document.body);
    return { main: container.querySelector('.sitemain'), rail: container.querySelector('.rail') };
  }

  // A page for an annotation that is not there, deleted or never found, inside the same frame as every other
  // page, with the wordmark to go home. It used to be one line of text on an empty page.
  // An empty list's drawing: a crumpled sheet and a plane (paperdeco.js), or nothing where it is not loaded.
  const emptyArt = () => (typeof PaperDeco !== 'undefined' ? `<div class="pdEmpty" aria-hidden="true">${PaperDeco.emptyArt()}</div>` : '');
  // The panel's quiet corner under a list.
  const cornerArt = () => (typeof PaperDeco !== 'undefined' ? `<div class="pd pd-corner" aria-hidden="true">${PaperDeco.ART.corner()}</div>` : '');
  function renderMissing(container, { title, why = '', onHome, onProfile, onAll = null, siteNav = true }) {
    stopClock(container);
    const { main, rail } = shell(container, { active: null, onHome, onFeed: onAll, onProfile, siteNav });
    main.classList.add('ann');
    main.innerHTML = `<div class="emptyState shellEmpty">${emptyArt()}<p class="esTitle">${esc(title)}</p>${why ? `<p>${esc(why)}</p>` : ''}
      <p><button type="button" class="ghost sm missHome">See annotations</button></p></div>`;
    rail.remove();
    main.querySelector('.missHome').addEventListener('click', () => (onAll || onHome) && (onAll || onHome)());
  }

  // A small popup menu anchored to a button. Closes on outside click or Escape.
  function menu(btn, items) {
    const wrap = btn.parentElement;
    const m = document.createElement('div');
    m.className = 'menu'; m.setAttribute('role', 'menu'); m.hidden = true;
    m.innerHTML = items;
    wrap.appendChild(m);
    const close = () => { m.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = m.hidden;
      document.querySelectorAll('.menu').forEach((x) => { x.hidden = true; });
      m.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) { const f = m.querySelector('button, a'); if (f) f.focus(); }
    });
    // One listener for the whole document, put on once. A menu is built again on every render, and one
    // listener per menu stayed on the document forever holding the page it came from in memory.
    if (!document.__annMenus) {
      document.__annMenus = true;
      document.addEventListener('click', (e) => {
        document.querySelectorAll('.menu:not([hidden])').forEach((x) => {
          if (x.contains(e.target)) return;
          x.hidden = true;
          const b = x.parentElement && x.parentElement.querySelector('[aria-haspopup="menu"]');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
      });
    }
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    return m;
  }

  function tagCounts(records) {
    const c = {};
    for (const r of records) if (r.take.tag) c[r.take.tag] = (c[r.take.tag] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }
  // Only your own. A feed or a shared list also holds other people's annotations.
  // Your annotations, not the ones this computer happens to hold. Two accounts share one browser and one
  // store, so counting the store told David he had written four when he had written one.
  const mineCount = (records, youId) => records.filter((r) => r.mine || !r.author || (youId && r.author && r.author.id === youId)).length;
  // Saved on this computer and nowhere else, so nobody else's feed has it.
  const onlyHere = (r) => !r.cloud && !r.author;
  function railYou(stats) {
    // Signed out there are no followers to count, and "0 followers" sat beside a header saying the same annotations
    // were saved on this computer (exploration of 2026-09-26). The card says what is true of them.
    const line = me.handle || stats.following !== undefined ? statsLine(stats) : `${plural(num(stats.annotations), 'annotation')} saved on this computer`;
    return `<section class="railcard"><div class="who">${av('')}<div><div class="name">${esc(me.name)} <span class="uname">${esc(meHandle())}</span></div>
      <div class="stats">${line}</div></div></div></section>`;
  }
  // Empty or placeholder cards stay in debug mode so a demo never shows unfinished parts.
  function railTags(records) {
    // Only your own annotations: shared lists also hold other people's.
    const tc = tagCounts(records.filter((r) => r.mine || !r.author));
    return tc.length ? `<section class="railcard"><h2>Your tags</h2><div class="tagcloud">${tc.map(([t, n]) => `<button type="button" class="tagpill railTag" data-tag="${esc(t)}">${esc(t)} <span class="num">${n}</span></button>`).join('')}</div></section>`
      : '<section class="railcard dbg"><h2>Your tags</h2><p class="note">Tag an annotation as a hot take, fact check, steelman, receipts or explainer and it shows up here.</p></section>';
  }
  // With shared accounts: people worth following and what is trending. Without, the old placeholder stays in debug mode.
  function railFollow(social) {
    if (!social || !social.people) return `<section class="railcard dbg"><h2>Who to follow</h2><p class="note">Sign in to see people worth following.</p></section>`;
    // An empty card used to simply disappear, so following the last person made the whole thing vanish with
    // no word about where everyone went.
    if (!social.people.length) return `<section class="railcard"><h2>People worth following</h2><p class="note">${social.followed && social.followed.size ? 'You follow everyone who has published this month. Their annotations are under Following.' : 'Nobody else has published this month. Yours will show up here for them.'}</p></section>`;
    return `<section class="railcard"><h2>People worth following</h2><ul class="peopleList">${social.people.map((p) => `<li>
        <button type="button" class="railPerson" data-handle="${esc(p.handle)}">${pAv(p, 'sm')}<span class="rlText"><span class="rlTake">${esc(p.name)}</span><span class="note">@${esc(p.handle)}. ${plural(p.annotations, 'annotation')} this month</span></span></button>
        <button type="button" class="ghost sm followBtn" data-id="${esc(p.id)}" aria-pressed="false">Follow</button></li>`).join('')}</ul></section>`;
  }
  // here is the annotation on the page, if there is one. Trending listed the very source you were reading
  // about, and pressing it only drew the same page again, so that row is left out.
  // also is anything already listed in the rail, such as your recent annotations, so a source is not named
  // twice in a row. With one person publishing, trending was simply that person's recent list again.
  function railTrending(social, here = null, also = []) {
    const t0 = social && social.trending;
    if (!t0) return '';
    const keyOf = (it) => (it ? (it.videoId || (it.meta && it.meta.url) || it.url || it.audioUrl || '') : '');
    const skipIds = new Set([here && here.id, ...also.map((r) => r.id)].filter(Boolean));
    const skipKeys = new Set([here && keyOf(here.item), ...also.map((r) => keyOf(r.item))].filter(Boolean));
    const t = { ...t0, sources: (t0.sources || []).filter((x) => !skipIds.has(x.sample_id) && !(x.source_key && skipKeys.has(x.source_key))) };
    if (!t.sources.length && !(t.tags || []).length) return '';
    return `<section class="railcard"><h2>Trending this week</h2>
      ${t.sources.length ? `<ul class="raillist trend">${t.sources.map((x) => `<li><button type="button" class="railOpen" data-id="${esc(x.sample_id)}"><span class="rlKind">${kindIcon({ kind: x.kind })}</span><span class="rlText"><span class="rlTake">${esc(x.title)}</span><span class="note">${x.quote ? `&ldquo;${esc(x.quote)}&rdquo;. ` : ''}${plural(Number(x.annotations), 'annotation')}${Number(x.activity) > Number(x.annotations) ? (() => { const n = Number(x.activity) - Number(x.annotations); return `, ${n} ${n === 1 ? 'reply or reaction' : 'replies and reactions'}`; })() : ''}</span></span></button></li>`).join('')}</ul>` : ''}
      ${t.tags.length ? `<div class="tagcloud">${t.tags.map((x) => `<button type="button" class="tagpill railTag" data-tag="${esc(x.tag)}">${esc(x.tag)} <span class="num">${x.uses}</span></button>`).join('')}</div>` : ''}</section>`;
  }
  // Something that needs an account, asked for signed out. It says so on its own line under what was pressed,
  // with a button, where a browser dialog used to ask and, cancelled, left the card saying it had failed.
  const twoWays = (cls) => `<span class="twoWays"><button type="button" class="strong sm ${cls}" data-provider="google">${GMARK} Continue with Google</button><button type="button" class="strong sm ${cls}" data-provider="x">${XMARK} Continue with X</button></span>`;
  // Google or X, the two ways in, as equal buttons. onSignIn is handed 'google' or 'x'.
  function signInPrompt({ text, near = null, onSignIn = null, onClose = null }) {
    document.querySelectorAll('.signAsk').forEach((x) => x.remove());
    // A prompt with nothing beside it opens at the top right, where the account card opens too, so that card goes
    // (it covered the prompt's buttons, 2.37.0).
    if (!near && typeof Account !== 'undefined' && Account.close) { try { Account.close(); } catch { /* not open */ } }
    const box = document.createElement('p');
    box.className = 'signAsk' + (near ? '' : ' floating');
    box.setAttribute('role', 'status');
    box.innerHTML = `<span></span>${onSignIn ? `<button type="button" class="strong sm saYes" data-provider="google">${GMARK} Continue with Google</button><button type="button" class="strong sm saYes" data-provider="x">${XMARK} Continue with X</button>` : ''}<button type="button" class="link saNo">Not now</button>`;
    box.querySelector('span').textContent = text;
    if (near) near.after(box); else document.body.appendChild(box);
    const yes = [...box.querySelectorAll('.saYes')];
    yes.forEach((b) => b.addEventListener('click', () => { box.remove(); onSignIn(b.dataset.provider); }));
    box.querySelector('.saNo').addEventListener('click', () => { box.remove(); if (onClose) onClose(); });
    if (yes[0]) yes[0].focus({ preventScroll: true });
    return box;
  }
  // Follow buttons anywhere on the page: optimistic, and put back if saving fails.
  function wireFollow(root, social) {
    if (!social || !social.onFollow) return;
    root.querySelectorAll('.followBtn').forEach((b) => {
      const set = (on) => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Following' : 'Follow'; b.classList.toggle('on', on); };
      if (b.dataset.on === '1') set(true);
      b.addEventListener('click', async () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        set(on); b.disabled = true;
        const ok = await social.onFollow(b.dataset.id, on).catch(() => false);
        b.disabled = false;
        if (ok === null) { set(!on); signInPrompt({ text: 'Sign in to follow people.', near: b.closest('li') || b, onSignIn: social.signIn }); return; }
        // A refused follow used to flip the button back and say nothing, which looked like a button that did
        // not work. The database refuses following yourself, so that is the one worth naming.
        if (ok === false) {
          set(!on);
          let say = b.parentElement && b.parentElement.querySelector('.followErr');
          if (!say) { say = document.createElement('p'); say.className = 'note followErr'; say.setAttribute('role', 'status'); b.after(say); }
          say.textContent = social.you && social.you.id === b.dataset.id ? 'That is you.' : 'That did not save. Try again in a moment.';
          setTimeout(() => say.remove(), 4000);
        }
        else {
          const n = root.querySelector(`.followCount[data-id="${b.dataset.id}"]`);
          if (n) n.textContent = String(Math.max(0, Number(n.textContent) + (on ? 1 : -1)));
          // Your own card counts the people you follow, and this is the moment that number changes.
          root.querySelectorAll('.youFollowing').forEach((mine) => { mine.textContent = String(Math.max(0, Number(mine.textContent) + (on ? 1 : -1))); });
          // Someone you have just followed is no longer someone worth following, so they leave that list
          // rather than sitting there under a button that now says Following.
          const row = b.closest('.peopleList li');
          if (row && on) row.remove();
        }
      });
    });
    root.querySelectorAll('.railPerson').forEach((b) => b.addEventListener('click', () => social.onPerson && social.onPerson(b.dataset.handle)));
  }
  function railList(list) {
    return `<ul class="raillist">${list.map((r) => `<li><button type="button" class="railOpen" data-id="${esc(r.id)}"><span class="rlKind">${kindIcon(r.item)}</span><span class="rlText"><span class="rlTake">${esc(takeLine(r.take) || 'Untitled')}</span><span class="note">${esc(withTime(titleOf(r.item), relTime(r.created)))}</span></span></button></li>`).join('')}</ul>`;
  }
  function railRecent(list) {
    const recent = list.slice().sort((a, b) => b.created - a.created).slice(0, 4);
    return recent.length ? `<section class="railcard"><h2>Your recent annotations</h2>${railList(recent)}</section>` : '';
  }
  // The About card is for a first visit. After that the rail keeps to your own things.
  function railAbout() {
    let seen = false;
    try { seen = localStorage.getItem('annotated-about-seen') === '1'; localStorage.setItem('annotated-about-seen', '1'); } catch {}
    if (seen) return '';
    return `<section class="railcard about"><h2>${Brand.wordmark('sm')}</h2>
      <p>Select any words on a page, clip a video or a podcast, or save a post, then say what you think. Every annotation links back to its source.</p>
      <p class="note">${Brand.icon('flag')} If an annotation uses your work unfairly, File a claim sends it for review.</p></section>`;
  }

  // A comment made only of emoji (up to six) shows large.
  const isJumbo = (t) => { const s = String(t).trim(); return !!s && [...s.replace(/[\u200d\ufe0f\s]/g, '')].length <= 12 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200d\ufe0f\s])+$/u.test(s); };
  // "Title. Just now", without a stray period after a title that already ends in punctuation.
  const withTime = (t, when) => (/[.?!…]["”']?$/.test(String(t).trim()) ? `${t} ${when}` : `${t}. ${when}`);
  // Who "you" are: the signed-in account when there is one, otherwise the local placeholder.
  let me = { name: 'You', handle: '', avatar: '' };
  const setMe = (p) => { me = p ? { name: p.name || 'You', handle: p.handle || '', avatar: p.avatar || '' } : { name: 'You', handle: '', avatar: '' }; };
  // Signed out there is no handle, and "@you" looked like one that somebody owned.
  const meHandle = () => (me.handle ? '@' + me.handle : '');
  const avInner = () => (me.avatar ? `<img src="${esc(me.avatar)}" alt="" referrerpolicy="no-referrer">` : esc((me.name || 'Y').trim().slice(0, 1).toUpperCase()));
  const av = (cls) => `<span class="avatar ${cls} ${me.avatar ? 'hasImg' : ''}" aria-hidden="true">${avInner()}</span>`;
  // Anyone else: their own name, handle and photo.
  const pInner = (p) => (p && safeImg(p.avatar) ? `<img src="${esc(safeImg(p.avatar))}" alt="" referrerpolicy="no-referrer">` : esc(((p && p.name) || '?').trim().slice(0, 1).toUpperCase()));
  const pAv = (p, cls) => (p ? `<span class="avatar ${cls} ${p.avatar ? 'hasImg' : ''}" aria-hidden="true">${pInner(p)}</span>` : av(cls));
  const pName = (p) => (p ? p.name : me.name);
  const pHandle = (p) => (p ? (p.handle ? '@' + p.handle : '') : meHandle());
  // Reactions saved before sharing are plain emoji; shared ones carry counts. Feed pages don't load the emoji kit.
  const normR = (list) => (list || []).map((x) => (typeof x === 'string' ? { emoji: x, count: 1 } : { emoji: x.emoji, count: x.count || 1 }));
  const reactTotal = (list) => normR(list).reduce((n, r) => n + r.count, 0);
  // Escaped here rather than where they are used, because every one of these comes from someone else's
  // account and these lists go into the page as markup.
  const reactEmojis = (list) => normR(list).map((r) => esc(r.emoji));
  // Shared annotations come from other people's accounts, so every address is checked before it goes on the page.
  // Links must be web addresses. Images may also be data or blob addresses made by this extension.
  const safeLink = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  // A GIF is GIPHY's to serve (giphy.js only ever offers theirs). Any other address in the gif column was written
  // by hand, and could be a tracking image logging everyone who reads it (security audit of 2026-09-24).
  const safeGif = (u) => (/^https:\/\/([a-z0-9-]+\.)?giphy\.com\//i.test(String(u || '')) ? String(u) : '');
  const safeImg = (u) => (/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);|blob:)/i.test(String(u || '')) ? String(u) : '');
  const kindIcon = (item) => Brand.icon({ video: 'clip', post: 'post', article: 'article', audio: 'podcast' }[item.kind] || 'article');

  /* ---------------- annotation page ---------------- */
  // Every render starts a clock that keeps the comment times current. Drawing into the same element again,
  // which is what happens now that annotations share one tab, used to leave the old clock running forever.
  function stopClock(container) { if (container && container.__annClock) { clearInterval(container.__annClock); container.__annClock = null; } }
  async function render(container, opts, hooks = {}) {
    stopClock(container);
    // Arriving from Publish the page is held from its first frame, not only once the plane is made. The back link,
    // the rail and the comment box showed for a moment before the plane (recording of 2026-09-25 at 16:02, 1:56).
    if (opts.showBanner === true && typeof Fold !== 'undefined' && Fold.on()) container.classList.add('pl-landing', 'pl-arriving');
    const { item, take, permalink, backLabel } = opts;
    // Saved only here, the banner just says so. The line under it already says how to share it, and the
    // banner used to repeat that in other words, asking to publish "again" something never published.
    // Straight after publishing, Back already returns to the page you annotated (backIsSource), so the source
    // control beside it is left out. Two controls to one place under two names read as two different places.
    const records = opts.records || [];
    // An annotation kept on this computer has one notice, the one that can do something about it. The toast
    // saying Saved on this computer sat right above it and said the same thing.
    const showBanner = opts.showBanner !== false && !opts.localOnly;
    let stats = opts.stats || { annotations: mineCount(records, opts.youId) || 1, followers: 0 };
    const isVideo = item.kind === 'video', isPost = item.kind === 'post', isAudio = item.kind === 'audio';
    const srcUrl = safeLink(srcUrlOf(item)) || '#', title = titleOf(item);
    // Clip addresses made for the previous annotation shown here are released first.
    (container._urls || []).forEach((u) => URL.revokeObjectURL(u));
    container._urls = [];
    const own = (u) => { container._urls.push(u); return u; };
    const clipUrl = isVideo || isAudio ? (item.blob ? own(URL.createObjectURL(item.blob)) : safeLink(item.mediaUrl) || null) : null;
    const voiceUrl = take.voice ? (take.voice.blob ? own(URL.createObjectURL(take.voice.blob)) : safeLink(take.voice.url) || null) : null;
    // The author's own photo or video, from this computer or from the bucket. Other people write this, so the
    // address is checked like every other one before it reaches the page.
    const upSrc = take.upload ? (take.upload.blob ? own(URL.createObjectURL(take.upload.blob))
      : take.upload.kind === 'video' ? safeLink(take.upload.url) : safeImg(take.upload.url)) : '';
    const videoThumb = isVideo ? (item.thumb || item.poster) : null;
    const created = opts.created || Date.now();
    // In the preview, source links are buttons so the host page cannot intercept them. Elsewhere they are real links.
    const jump = !!hooks.onOpenSource;
    const srcLink = (cls, label) => jump ? `<button type="button" class="link ${cls} srcJump">${label}</button>`
      : `<a class="${cls}" href="${esc(srcUrl)}" target="_blank" rel="noopener">${label}</a>`;
    const cardOpen = jump ? '<button type="button" class="srccard srcJump">' : `<a class="srccard" href="${esc(srcUrl)}" target="_blank" rel="noopener">`;
    const cardClose = jump ? '</button>' : '</a>';
    const shotBtn = (label) => `<button type="button" class="quiet shotBtn">${Brand.icon('image')} ${label}</button>`;

    // X posts: an embed card with the text and a link to the live post, a saved screenshot, or both.
    const postCard = isPost ? `
      <blockquote class="xembed">
        <div class="xhead"><span class="avatar sm" aria-hidden="true">${esc((item.author || '?').slice(0, 1))}</span>
          <span><b>${esc(item.author)}</b> <span class="uname">${esc(item.handle)}</span></span></div>
        ${item.text ? `<p>${esc(item.text)}</p>` : ''}
        <div class="xfoot"><span>${esc(fmtDate(item.posted))}</span>${srcLink('xlink', 'View on X')}</div>
      </blockquote>` : '';
    const postShot = isPost && item.shot ? `
      <figure class="xshot"><div class="xshotFrame"><img src="${esc(safeImg(item.shot))}" alt="Screenshot of the post by ${esc(item.author)}"></div><button type="button" class="ghost sm xshotMore" hidden>Show the whole post</button>
        <figcaption><span>Saved ${esc(fmtDate(new Date(item.captured || Date.now()).toISOString()))}. It stays even if the post is deleted.</span>${srcLink('xlink2', 'View on X')}</figcaption></figure>` : '';
    // Podcast clips: the clip's waveform with a player, and a link to the full episode.
    const audioCard = isAudio ? `
      <figure class="clip aclip">
        <canvas class="waveCanvas" role="img" aria-label="Waveform of the clip. Click to jump."></canvas>
        <audio class="clipAudio" controls preload="auto"></audio>
      </figure>` : '';
    const media = isAudio ? audioCard : isPost
      ? (item.display === 'embed' || !item.shot ? postCard
        : item.display === 'both' ? postCard + `<div class="mediaTools">${shotBtn('See the saved screenshot')}</div>` : postShot)
      : isVideo ? `
      <figure class="clip">
        <video class="clipVideo" playsinline preload="auto" ${safeImg(item.poster) ? `poster="${esc(safeImg(item.poster))}"` : ''}></video>
      </figure>` : `
      ${item.shot ? `<figure class="pageShot">
        <button type="button" class="shotZoom" aria-label="Show the screenshot full size"><img src="${esc(safeImg(item.shot))}" alt="The passage as it appeared on ${esc(item.meta.site || 'the page')}"></button>
        <figcaption>${Brand.icon('image')} As it appeared on ${esc(item.meta.site || 'the page')}, ${esc(fmtDate(new Date(created).toISOString()))}</figcaption>
      </figure>` : ''}
      <figure class="pq">
        <blockquote>${/\n\n/.test(item.text || '') ? inked(item.text) : `<mark>${esc(item.text)}</mark>`}</blockquote>
      </figure>`;
    // Clips: one source line attached to the player, with where the clip sits in the original.
    const srcBar = (where, who, action) => {
      // A clip of a few seconds needs tenths, or 5:31.4 to 5:33.1 reads as 5:31 to 5:33.
      const short = (item.end - item.start) < 10;
      const D = item.duration, pos = D > 0 ? `<span class="sbTrack" aria-hidden="true"><i style="left:${(item.start / D) * 100}%;width:${Math.max(0.8, ((item.end - item.start) / D) * 100)}%"></i></span>` : '';
      return `${cardOpen.replace('class="srccard', 'class="srccard srcbar')}
        <span class="sbInfo"><span class="skind">${kindIcon(item)} ${esc(where)}${who ? ` <span class="sbWho">${esc(who)}</span>` : ''}</span><span class="st">${esc(title)}</span></span>
        <span class="sbPos">${pos}<span class="sbTime num">${fmt(item.start, short)} to ${fmt(item.end, short)}${D > 0 ? ` of ${fmt(D)}` : ''}</span><span class="sbGo">${action} ${Brand.icon('external')}</span></span>
      ${cardClose}`;
    };
    // An article's card carries the site's own picture or none. It used to fall back to the top left corner
    // of the page screenshot, which is usually blank margin, so the card showed an empty white box, and the
    // screenshot is already on the page just above it.
    const source = isAudio ? srcBar(item.show || 'Podcast', '', 'Listen to the episode')
      : isPost ? '' : isVideo && item.site === 'x' ? srcBar('X', item.handle || item.author || '', 'See the post') : isVideo ? srcBar('YouTube', item.channel || '', `Watch from ${fmt(item.start)}`) : `
      ${safeImg(item.meta.image) ? cardOpen : cardOpen.replace('class="srccard', 'class="srccard noimg')}
        ${safeImg(item.meta.image) ? `<img src="${esc(safeImg(item.meta.image))}" alt="">` : ''}
        <span class="scard"><span class="skind">${kindIcon(item)} ${esc(item.meta.site)}</span><span class="st">${esc(title)}</span>${item.meta.description ? `<span class="sdesc">${esc(item.meta.description)}</span>` : ''}<span class="sd">${esc([item.meta.author ? 'By ' + item.meta.author : '', fmtDate(item.meta.published)].filter(Boolean).join('. '))}</span></span>
      ${cardClose}`;

    const { main, rail } = shell(container, { active: null, onHome: hooks.onHome, onFeed: hooks.onAll, onProfile: hooks.onProfile, siteNav: opts.siteNav !== false });
    main.classList.add('ann', 'loading');
    main.innerHTML = `
      <div class="loadmsg" role="status" aria-label="Loading the annotation">
        <div class="skel" aria-hidden="true"><div class="sk skwho"></div><div class="sk skline w90"></div><div class="sk skline w60"></div><div class="sk skblock"></div><div class="sk skline w40"></div></div>
      </div>
      <div class="annBody">
        ${showBanner ? `<div class="banner toast" role="status">
          <div class="toastRow">
            <span class="toastCheck">${Brand.mark ? Brand.mark() : Brand.icon('check')}</span>
            <b class="toastText">${opts.localOnly ? 'Saved on this computer' : 'Published'}</b>
            <span class="toastActions" ${opts.localOnly ? 'hidden' : ''}>
              <button type="button" class="ghost sm toastCopy">${Brand.icon('link')} <span>Copy link</span></button>
              <button type="button" class="ghost sm inviteOpen" aria-expanded="false">${Brand.icon('user')} Invite</button>
            </span>
            <button type="button" class="bannerX" aria-label="Dismiss">${Brand.icon('close')}</button>
          </div>
          <div class="invite" hidden><input class="inviteEmail" type="email" placeholder="friend@example.com" aria-label="Email to invite"><button type="button" class="strong sm inviteBtn">Write the invite</button></div>
          <p class="note inviteMsg" hidden></p>
          <p class="note dbg">Nothing is saved or sent in this build.</p>
        </div>` : ''}
        <div class="topRow">
          ${hooks.onBack ? `<button type="button" class="quiet back">${Brand.icon('arrowLeft')} ${esc(backLabel || 'Back')}</button>` : ''}
          ${srcUrl && srcUrl !== '#' && !(hooks.onBack && opts.backIsSource) ? (jump
            ? `<button type="button" class="quiet toSource srcJump">${esc(sourceLabel(item))} ${Brand.icon('external')}</button>`
            : `<a class="quiet toSource" href="${esc(srcUrl)}" target="_blank" rel="noopener">${esc(sourceLabel(item))} ${Brand.icon('external')}</a>`) : ''}
        </div>
        ${opts.localOnly ? `<p class="localNote" role="status">${Brand.icon('info')} <span>Only on this computer. Nobody else can see it yet.</span>${hooks.onShareNow ? (hooks.shareNeedsSignIn ? `<span class="note">Sign in to publish it.</span>${twoWays('shareNow')}` : '<button type="button" class="strong sm shareNow">Publish it now</button>') : ''}</p><p class="error shareErr" role="alert" hidden></p>` : ''}
        <article class="annCard${Folded.has(opts.id) ? ' folded' : ''}">
          <span class="underSheet" aria-hidden="true"></span>
          <button type="button" class="foldBtn" aria-pressed="${Folded.has(opts.id)}" aria-label="${Folded.has(opts.id) ? 'Folded. Unfold the corner' : 'Fold the corner to keep this'}" title="${Folded.has(opts.id) ? 'Folded, under Folded in the feed. Press to unfold' : 'Fold the corner to keep this'}"></button>
          <header class="who">
            <button type="button" class="avatar asLink profileLink ${(opts.author || me).avatar ? 'hasImg' : ''}" aria-label="${opts.author && !opts.mine ? esc(pName(opts.author)) + "'s profile" : 'Your profile'}">${opts.author ? pInner(opts.author) : avInner()}</button>
            <div><div class="name"><button type="button" class="asLink profileLink">${esc(pName(opts.author))}</button> <span class="uname">${esc(pHandle(opts.author))}</span>
              ${opts.author && !opts.mine && opts.social && opts.social.onFollow && opts.social.youId ? `<button type="button" class="ghost sm followBtn inline" data-id="${esc(opts.author.id)}" ${opts.social.followsAuthor ? 'data-on="1"' : ''}>Follow</button>` : ''}</div>
              <time class="when" datetime="${new Date(created).toISOString()}">${relTime(created)}</time></div>
            <span class="tagSlot">${take.tag ? `<button type="button" class="tag tagLink" title="See all ${esc(take.tag)} annotations">${esc(take.tag)}</button>` : ''}</span>
          </header>
          <p class="take" ${take.text ? '' : 'hidden'}>${esc(take.text || '')}</p>
          ${take.gif && safeGif(take.gif.url) ? `<figure class="takeGif"><img src="${esc(safeGif(take.gif.url))}" alt="${esc(take.gif.alt || 'A GIF')}" loading="lazy">
            <figcaption class="note">Powered by GIPHY</figcaption></figure>` : ''}
          ${upSrc ? (take.upload.kind === 'video'
            ? `<figure class="takeUp"><video controls preload="metadata" src="${esc(upSrc)}" ${take.upload.alt ? `aria-label="${esc(take.upload.alt)}"` : ''}></video></figure>`
            : `<figure class="takeUp"><img src="${esc(upSrc)}" alt="${esc(take.upload.alt || '')}" loading="lazy" ${take.upload.w && take.upload.h ? `width="${Number(take.upload.w)}" height="${Number(take.upload.h)}"` : ''}></figure>`) : ''}
          <div class="editBox" hidden></div>
          ${voiceUrl ? `<div class="vnote">${Brand.icon('mic')}<audio class="pageVoice" controls src="${esc(voiceUrl)}"></audio></div>` : ''}
          <div class="mediaUnit ${isVideo || isAudio ? 'av' : ''}">
            <div class="media">${media}${isPost && item.quote ? `<figure class="pq postQuote"><blockquote>${inked(item.quote)}</blockquote></figure>` : ''}</div>
            ${isVideo || isAudio ? source : ''}
            <div class="pollBox" ${take.poll ? '' : 'hidden'}></div>
          </div>
          ${isVideo || isAudio ? '' : source}
          <div class="reactHost" hidden></div>
          <div class="actions">
            <button type="button" class="ghost sm reactBtn" aria-label="Add a reaction">${Brand.icon('smile')} React</button>
            <span class="mwrap" ${opts.localOnly ? 'hidden' : ''}><button type="button" class="ghost sm shareBtn">${Brand.icon('share')} Share</button></span>
            ${hooks.onEdit || hooks.onDelete ? `<span class="mwrap"><button type="button" class="quiet moreBtn" aria-label="More options">${Brand.icon('more', 'lg')}</button></span>` : ''}
            ${opts.localOnly ? '' : `<button type="button" class="claim">${Brand.icon('flag')} File a claim</button>`}
          </div>
          <div class="delWrap" hidden></div>
        </article>
        <section class="comments" aria-label="Comments">
          <h3 class="cTitle">Comments</h3>
          ${opts.localOnly ? '<p class="note cLocal">Only you can see comments here until it is published.</p>' : ''}
          <textarea class="cText" rows="2" aria-label="Add a comment" placeholder="Add a comment. Type : for emoji. Ctrl or Cmd + Enter posts it."></textarea>
          <div class="cRow"><span class="cEmojiSlot"></span>
            ${typeof Compose !== 'undefined' && Compose.checkMedia ? `<button type="button" class="quiet cUpBtn hasTip" data-tooltip="Add a photo or video" aria-label="Add a photo or video">${Brand.icon('image')}</button>
            <input type="file" class="cUpFile" accept="${Compose.MEDIA_ACCEPT}" hidden>` : ''}
            <button type="button" class="quiet cGifBtn hasTip" data-tooltip="Add a GIF" aria-label="Add a GIF" hidden><span class="gifMark" aria-hidden="true">GIF</span></button>
            <button type="button" class="strong sm cPost">Comment</button></div>
          <div class="gifPick cGifPick" hidden></div>
          <div class="gifChosen cGifChosen" hidden><img class="gcImg" alt=""><button type="button" class="quiet gcRemove">${Brand.icon('trash')} Remove the GIF</button></div>
          <div class="upChosen cUpChosen" hidden><div class="upMedia"></div>
            <input type="text" class="upAlt" maxlength="200" aria-label="Describe it" placeholder="Describe it for anyone who cannot see it">
        <p class="note upHint">A few words of description let people who cannot see it know what it shows.</p>
            <button type="button" class="quiet upRemove">${Brand.icon('trash')} <span>Remove</span></button></div>
          <p class="error upErr cUpErr" role="alert" hidden></p>
          <ul class="cList"></ul>
          <button type="button" class="link cMore" hidden></button>
        </section>
      </div>`;
    const same = records.filter((r) => r.id !== opts.id && sameSourceDoc(r.item, item));
    const social = opts.social || null;
    const recentHere = yoursOnly(records, opts.youId).filter((r) => r.id !== opts.id && !same.includes(r));
    rail.innerHTML = railYou(social && social.you ? social.you : stats)
      + (same.length ? `<section class="railcard"><h2>More on this source</h2>${railList(same)}</section>` : '')
      // Yours only. This computer can hold another account's annotations as well.
      + railRecent(recentHere)
      + railTrending(social, { id: opts.id, item }, recentHere.slice().sort((a, b) => b.created - a.created).slice(0, 4)) + railFollow(social) + railTags(records) + railAbout();
    const q = (s) => container.querySelector(s);

    // Share and more menus
    // Tall post screenshots (a post with a video, say) start at a fixed height with a button to show all of it.
    const xs = q('.xshot img');
    if (xs) {
      const fit = () => { const f = q('.xshotFrame'); if (f && xs.clientHeight > 480 && !f.classList.contains('open')) { f.classList.add('tall'); q('.xshotMore').hidden = false; } };
      if (xs.complete) fit(); else xs.addEventListener('load', fit, { once: true });
      q('.xshotMore').addEventListener('click', () => { const f = q('.xshotFrame'); const open = f.classList.toggle('open'); f.classList.toggle('tall', !open); q('.xshotMore').textContent = open ? 'Show less' : 'Show the whole post'; });
    }
    const foldBtn = q('.foldBtn');
    if (foldBtn) foldBtn.addEventListener('click', () => {
      const on = Folded.toggle(opts.id);
      q('.annCard').classList.toggle('folded', on);
      foldBtn.setAttribute('aria-pressed', String(on));
      foldBtn.setAttribute('aria-label', on ? 'Folded. Unfold the corner' : 'Fold the corner to keep this');
      foldBtn.title = on ? 'Folded, under Folded in the feed. Press to unfold' : 'Fold the corner to keep this';
    });
    container.querySelectorAll('.shareNow').forEach((b0) => b0.addEventListener('click', async (e) => {
      const b = e.currentTarget, was = b.innerHTML, err = q('.shareErr');
      container.querySelectorAll('.shareNow').forEach((x) => { x.disabled = true; }); b.textContent = 'Publishing'; if (err) err.hidden = true;
      try { await hooks.onShareNow(b.dataset.provider); } catch (x) {
        container.querySelectorAll('.shareNow').forEach((y) => { y.disabled = false; }); b.innerHTML = was;
        if (err) { err.textContent = (x && x.message) || 'It could not be published just now.'; err.hidden = false; }
      }
    }));
    const share = menu(q('.shareBtn'), `
      <button type="button" role="menuitem" class="copyBtn">${Brand.icon('link')} <span class="cpText">Copy link</span></button>
      <a role="menuitem" href="${xUrl(item, take, permalink)}" target="_blank" rel="noopener" data-close>${Brand.icon('x')} Post to X</a>
      ${isVideo && typeof GifMaker !== 'undefined' ? `<button type="button" role="menuitem" class="gifBtn">${Brand.icon('image')} <span class="gifText">Save as GIF</span></button>` : ''}`);
    // A GIF of the clip, made here rather than anywhere else. It has no sound, so it sits beside the clip
    // rather than in place of it, and it is the thing you can drop straight into a post.
    const gifBtn = share.querySelector('.gifBtn');
    if (gifBtn) gifBtn.addEventListener('click', async () => {
      const lab = gifBtn.querySelector('.gifText'), v = q('.clipVideo');
      const src = v && (v.currentSrc || v.src);
      if (!src) { lab.textContent = 'There is no clip to turn into a GIF'; return; }
      gifBtn.disabled = true;
      try {
        const blob = await GifMaker.fromVideo(src, { onProgress: (a, b) => { lab.textContent = `Making a GIF, ${Math.round((a / b) * 100)} percent`; } });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (titleOf(item) || 'annotated').replace(/[^\w \-]+/g, '').trim().slice(0, 60).replace(/\s+/g, '-') + '.gif';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 20000);
        lab.textContent = `Saved, ${(blob.size / 1048576).toFixed(1)} MB`;
      } catch (err) {
        lab.textContent = err && err.message ? err.message : 'The GIF could not be made.';
      }
      setTimeout(() => { lab.textContent = 'Save as GIF'; gifBtn.disabled = false; }, 4000);
    });
    if (q('.moreBtn')) menu(q('.moreBtn'), `
      ${hooks.onEdit ? `<button type="button" role="menuitem" class="editBtn" data-close>${Brand.icon('edit')} Edit your take</button>` : ''}
      ${hooks.onDelete ? `<button type="button" role="menuitem" class="delBtn danger" data-close>${Brand.icon('trash')} Delete</button>` : ''}`);

    const waits = [];
    if (isVideo) {
      const v = q('.clipVideo');
      waits.push(mediaReady(v, 'loadeddata').then((r) => {
        if (r === 'error') v.closest('figure').insertAdjacentHTML('afterbegin', '<p class="error mediaErr">This clip could not be played in this browser. Try Chrome.</p>');
      }));
      // Reveal the page only once the clip can actually play, so its player never shows a spinner.
      waits.push(Compose.fixDuration(v).then(() => (v.readyState >= 4 ? null : mediaReady(v, 'canplaythrough', 3000))));
      v.src = clipUrl;
    }
    if (isAudio) {
      const au = q('.clipAudio');
      waits.push(mediaReady(au, 'loadedmetadata').then((r) => { if (r === 'error') au.closest('figure').insertAdjacentHTML('afterbegin', '<p class="error mediaErr">This clip could not be played in this browser. Try Chrome.</p>'); }));
      waits.push(Compose.fixDuration(au));
      au.src = clipUrl;
      // The waveform fills in yellow as the clip plays, and clicking it jumps there.
      if (typeof Waveform !== 'undefined') {
        const cv = q('.waveCanvas');
        (item.blob ? Promise.resolve(item.blob) : fetch(item.mediaUrl).then((r) => r.blob())).then((b) => Waveform.fromBlob(b, 40)).then((w) => {
          const paint = () => Waveform.draw(cv, w, 0, w.duration, { color: '#5B6170', playedColor: '#FFE14A', bar: 3, gap: 2, progress: au.duration ? au.currentTime / au.duration : 0 });
          paint();
          au.addEventListener('timeupdate', paint); au.addEventListener('seeked', paint);
          new ResizeObserver(paint).observe(cv);
          let raf = null;
          au.addEventListener('play', () => { const loop = () => { paint(); if (!au.paused) raf = requestAnimationFrame(loop); }; loop(); });
          au.addEventListener('pause', () => cancelAnimationFrame(raf));
          cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(); if (isFinite(au.duration)) au.currentTime = ((e.clientX - r.left) / r.width) * au.duration; });
        }).catch(() => { cv.hidden = true; });
      } else q('.waveCanvas').hidden = true;
    }
    const st = q('.srcthumb');
    // YouTube answers unknown or removed videos with a small gray placeholder instead of an error, so check its size too.
    if (st && item.poster) {
      st.addEventListener('error', () => { st.src = item.poster; }, { once: true });
      st.addEventListener('load', () => { if (st.naturalWidth && st.naturalWidth <= 120 && st.src !== item.poster) st.src = item.poster; });
    }
    for (const img of container.querySelectorAll('img')) waits.push(img.decode().catch(() => {}));
    if (voiceUrl) Compose.fixDuration(q('.pageVoice'));
    await Promise.all(waits);
    main.classList.remove('loading');
    // Chrome's player can flash a loading spinner while it paints its first frame after the page appears.
    // The controls arrive once that frame is on screen, so the spinner never shows.
    if (isVideo) {
      const v = q('.clipVideo'), show = () => { v.controls = true; };
      if (v.requestVideoFrameCallback) { const t = setTimeout(show, 1200); v.requestVideoFrameCallback(() => { clearTimeout(t); show(); }); }
      else show();
    }
    // The signature moment: on the first visit after publishing, the highlighter sweeps across the annotation.
    // It plays once. Removing the class afterwards stops it replaying when the page is shown again.
    // Arriving from Publish, it lands: as a paper plane (fold.js) when they are on, or with the rise-in. It lands
    // whether it was published or saved on this computer, which has no banner.
    // The rest of the page waits for the card, so comments and the rail do not sit under an empty space while
    // the plane comes down (recording of 2026-09-25 at 01:15, 2:10), and comes in once it has opened.
    // The whole annotation folds into the plane and opens out as itself, as it did before 2.33.11. A small card of
    // the take and quote stood in for it for one version and David missed the post unwrapping (recording of
    // 2026-09-25 at 14:50, 0:24 and 1:18). The rest of the page, the Published toast included, waits for it.
    if (opts.showBanner === true && typeof Fold !== 'undefined' && Fold.on() && q('.annCard')) {
      container.classList.add('pl-landing');
      let done = false;
      const land = () => { if (done) return; done = true; container.classList.remove('pl-landing', 'pl-arriving'); };
      // The whole post still unwraps; how it opens changes from one annotation to the next.
      const unfold = ['classic', 'cascade', 'flutter', 'drift', 'bounce', 'peel', 'float'][Math.floor(Math.random() * 7)];
      Fold.arrive(q('.annCard'), { z0: 220, T: 1100, openT: 1100, unfold, s0: Fold.clamp(200 / Math.max(1, q('.annCard').offsetWidth), .2, .45) }).then(land);
      // The card is the plane's to show now (pl-hidden until it opens), so the first-frame hold can go.
      container.classList.remove('pl-arriving');
      // Never held for longer than the flight, whatever becomes of it.
      setTimeout(land, 3500);
    }
    else container.classList.remove('pl-landing', 'pl-arriving');
    if (!(opts.showBanner === true && typeof Fold !== 'undefined' && Fold.on() && q('.annCard')) && showBanner) { q('.annCard').classList.add('fresh'); setTimeout(() => { const c = q('.annCard'); if (c) c.classList.remove('fresh'); }, 2200); }

    if (hooks.onBack) q('.back').addEventListener('click', hooks.onBack);
    container.querySelectorAll('.profileLink').forEach((b) => b.addEventListener('click', () => hooks.onProfile && hooks.onProfile()));
    container.querySelectorAll('.railTag').forEach((b) => b.addEventListener('click', () => hooks.onTag && hooks.onTag(b.dataset.tag)));
    container.querySelectorAll('.railOpen').forEach((b) => b.addEventListener('click', () => hooks.onOpen && hooks.onOpen(b.dataset.id)));
    wireFollow(container, social);
    const bindTag = () => { const t = q('.tagLink'); if (t) t.addEventListener('click', () => hooks.onTag && hooks.onTag(take.tag)); };
    bindTag();

    // Screenshot opens full size
    // Screenshot opens full size, from the post's button or the article screenshot itself.
    container.querySelectorAll('.shotBtn, .shotZoom').forEach((sb) => sb.addEventListener('click', () => {
      let dlg = document.getElementById('annotated-shot');
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.id = 'annotated-shot'; dlg.className = 'shotdlg';
        dlg.innerHTML = '<img alt=""><button type="button" class="strong">Close</button>';
        dlg.querySelector('button').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
        document.body.appendChild(dlg);
      }
      const img = dlg.querySelector('img'); img.src = item.shot; img.alt = isPost ? 'Saved screenshot of the post' : 'The passage as it appeared on the page';
      dlg.showModal();
    }));

    // Edit your take and tag in place. The capture itself stays as it was.
    if (hooks.onEdit) {
      const box = q('.editBox');
      q('.editBtn').addEventListener('click', () => {
        let tag = take.tag || null;
        box.innerHTML = `
          <div class="kindLabel">Tag <span>(optional)</span></div>
          <div class="tags" role="radiogroup" aria-label="Tag for this annotation">${TAGS.map((t) => `<button type="button" class="tagbtn" role="radio" aria-checked="${t === tag}">${t}</button>`).join('')}</div>
          <textarea class="editText" rows="3" maxlength="500" aria-label="Your take"></textarea>
          <p class="error editErr" hidden>Write something, or the annotation has nothing of yours on it.</p>
          <div class="row"><button type="button" class="ghost editCancel">Cancel</button><button type="button" class="strong editSave">Save</button></div>`;
        box.querySelector('.editText').value = take.text || '';
        EmojiKit.autocomplete(box.querySelector('.editText'));
        box.querySelector('.editText').insertAdjacentElement('afterend', EmojiKit.button(box.querySelector('.editText')));
        box.querySelectorAll('.tagbtn').forEach((b) => b.addEventListener('click', () => {
          const on = b.getAttribute('aria-checked') !== 'true';
          box.querySelectorAll('.tagbtn').forEach((x) => x.setAttribute('aria-checked', 'false'));
          b.setAttribute('aria-checked', String(on)); tag = on ? b.textContent : null;
        }));
        const close = () => { box.hidden = true; q('.take').hidden = !take.text; };
        box.querySelector('.editCancel').addEventListener('click', close);
        box.querySelector('.editSave').addEventListener('click', async () => {
          const text = box.querySelector('.editText').value.trim();
          // Words may go when something else of yours stays: a voice note, a GIF, a photo or a poll.
          const rest = take.voice || take.gif || take.upload || (take.poll && take.poll.options && take.poll.options.length >= 2);
          if (!text && !rest) { box.querySelector('.editErr').hidden = false; return; }
          take.text = text; take.tag = tag;
          await hooks.onEdit({ text, tag });
          q('.take').textContent = text;
          q('.tagSlot').innerHTML = tag ? `<button type="button" class="tag tagLink" title="See all ${esc(tag)} annotations">${esc(tag)}</button>` : '';
          bindTag();
          close();
        });
        q('.take').hidden = true; box.hidden = false;
        box.querySelector('.editText').focus();
      });
    }
    if (hooks.onDelete) {
      const del = q('.delWrap');
      q('.delBtn').addEventListener('click', () => {
        del.innerHTML = `<span class="delAsk">Delete this annotation? This cannot be undone.</span>
          <span><button type="button" class="quiet delNo">Keep it</button><button type="button" class="quiet danger delYes">${Brand.icon('trash')} Delete</button></span>`;
        del.hidden = false;
        del.querySelector('.delYes').addEventListener('click', (e) => { e.currentTarget.disabled = true; crumpleWhile(q('.annCard'), () => hooks.onDelete()); });
        del.querySelector('.delNo').addEventListener('click', () => { del.hidden = true; });
      });
    }
    if (showBanner) {
      q('.bannerX').addEventListener('click', () => { q('.banner').remove(); hooks.onDismissBanner && hooks.onDismissBanner(); });
      // The toast scrolls with the page and fades after twelve seconds. It waits while you are using it.
      const toast = q('.banner');
      const fade = () => {
        if (!toast.isConnected) return;
        if (toast.matches(':hover, :focus-within') || !q('.banner .invite').hidden) return setTimeout(fade, 3000);
        toast.classList.add('gone'); setTimeout(() => toast.remove(), 350);
      };
      setTimeout(fade, 12000);
      q('.inviteOpen').addEventListener('click', () => {
        const box = q('.banner .invite'), open = box.hidden;
        box.hidden = !open; q('.inviteOpen').setAttribute('aria-expanded', String(open));
        if (open) q('.inviteEmail').focus();
      });
      q('.inviteEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('.inviteBtn').click(); });
      const tc = q('.toastCopy');
      tc.addEventListener('click', async () => {
        const lab = tc.querySelector('span');
        try { await navigator.clipboard.writeText(permalink); if (typeof Fold !== 'undefined' && Fold.toss) Fold.toss(tc); lab.textContent = 'Copied'; tc.classList.add('done'); } catch { lab.textContent = 'Copy failed'; }
        setTimeout(() => { lab.textContent = 'Copy link'; tc.classList.remove('done'); }, 2000);
      });
      const email = q('.inviteEmail'), imsg = q('.inviteMsg');
      email.addEventListener('input', () => { imsg.hidden = true; });
      // The invite goes out from your own email app, already written, with the link to this annotation.
      q('.inviteBtn').addEventListener('click', () => {
        if (!email.value || !email.checkValidity()) { imsg.textContent = 'Enter a valid email address.'; imsg.className = 'note inviteMsg bad'; imsg.hidden = false; return; }
        let origin = ''; try { origin = new URL(permalink).origin; } catch {}
        const subject = `${me.name === 'You' ? 'Someone' : me.name} shared an annotation with you`;
        const body = [take.text ? `"${take.text}"` : `An annotation of ${title}`, `On: ${title}`, '', permalink, '',
          'annotated lets you highlight a passage, clip a video or podcast, or save a post, and say what you think. Every annotation links back to its source.',
          origin ? `Get it here: ${origin}/install` : ''].join('\n');
        // An anchor rather than replacing the address, so this page stays where it is and a test can see the
        // invite without the computer's mail program opening a window.
        const a = document.createElement('a');
        a.href = `mailto:${encodeURIComponent(email.value)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        imsg.textContent = `Your email app opened with an invite to ${email.value}. Send it from there.`; imsg.className = 'note inviteMsg'; imsg.hidden = false; email.value = '';
      });
    }
    const cp = share.querySelector('.copyBtn');
    let cpTimer = null;
    cp.addEventListener('click', async () => {
      const lab = cp.querySelector('.cpText');
      try { await navigator.clipboard.writeText(permalink); if (typeof Fold !== 'undefined' && Fold.toss) Fold.toss(cp); lab.textContent = 'Link copied'; cp.classList.add('done'); cp.querySelector('svg').outerHTML = Brand.icon('check'); }
      catch { lab.textContent = 'Copy failed'; }
      clearTimeout(cpTimer);
      cpTimer = setTimeout(() => { lab.textContent = 'Copy link'; cp.classList.remove('done'); cp.querySelector('svg').outerHTML = Brand.icon('link'); }, 2000);
    });
    // An annotation kept only on this computer has nobody else looking at it and nowhere a claim could go, and
    // the form used to say "Claim received" while sending nothing. The button comes with publishing.
    if (q('.claim')) q('.claim').addEventListener('click', () => {
      claimHandler = hooks.onClaim || null;
      const dlg = claimDialog();
      const form = dlg.querySelector('.claimForm');
      form.reset(); form.hidden = false; dlg.querySelector('.claimDone').hidden = true;
      dlg.querySelector('#cWhat').value = isVideo || isAudio
        ? `The clip from ${fmt(item.start, true)} to ${fmt(item.end, true)} of "${title}".`
        : isPost ? `The post by ${item.author} ${item.handle}.`.replace(' .', '.') : `The quoted passage from "${title}".`;
      dlg.showModal();
    });

    // Newest first, box on top, long threads collapsed. Every comment here is yours, so each can be deleted.
    const comments = (opts.comments || []).slice();
    let showAll = false;
    const SHOW = 5;
    const drawComments = () => {
      q('.cTitle').textContent = comments.length ? `Comments (${comments.length})` : 'Comments';
      const list = comments.slice().sort((a, b) => b.t - a.t);
      const shown = showAll ? list : list.slice(0, SHOW);
      q('.cList').innerHTML = list.length ? shown.map((c) => `
        <li class="cmt">${pAv(c.author && !c.mine ? c.author : null, 'sm')}
          <div class="cBody"><div class="cHead"><b>${esc(pName(c.author && !c.mine ? c.author : null))}</b><time datetime="${new Date(c.t).toISOString()}">${relTime(c.t)}</time>
            ${!c.author || c.mine ? `<button type="button" class="link cDel" data-t="${c.t}">Delete</button>` : ''}</div><p class="${isJumbo(c.text) ? 'jumbo' : ''}">${esc(c.text)}</p>${c.gif && safeGif(c.gif.url) ? `<figure class="cmtGif"><img src="${esc(safeGif(c.gif.url))}" alt="${esc(c.gif.alt || 'A GIF')}" loading="lazy"><figcaption class="note">Powered by GIPHY</figcaption></figure>` : ''}${cmtUpload(c)}<div class="cReact" data-t="${c.t}"></div></div></li>`).join('')
        : `<li class="empty">${typeof PaperDeco !== 'undefined' ? PaperDeco.waiting() : ''}No comments yet. Start the conversation.</li>`;
      const more = q('.cMore');
      more.hidden = list.length <= SHOW;
      more.textContent = showAll ? 'Show fewer comments' : `Show all ${list.length} comments`;
      q('.cList').querySelectorAll('.cReact').forEach((host) => {
        const c = comments.find((x) => String(x.t) === host.dataset.t);
        EmojiKit.reactions(host, { list: c.reactions || [], size: 'sm', onChange: (list, change) => { c.reactions = list; hooks.onComments && hooks.onComments(comments.slice(), { comment: c, reaction: change }); } });
      });
      q('.cList').querySelectorAll('.cDel').forEach((b) => b.addEventListener('click', () => {
        const i = comments.findIndex((c) => String(c.t) === b.dataset.t);
        if (i < 0) return;
        const [gone] = comments.splice(i, 1);
        drawComments();
        hooks.onComments && hooks.onComments(comments.slice(), { removed: gone });
        // A few seconds to take it back.
        const bar = document.createElement('div');
        bar.className = 'cUndo'; bar.setAttribute('role', 'status');
        bar.innerHTML = '<span>Comment deleted.</span><button type="button" class="link cUndoBtn">Undo</button>';
        q('.cList').before(bar);
        const t = setTimeout(() => bar.remove(), 6000);
        bar.querySelector('.cUndoBtn').addEventListener('click', () => {
          clearTimeout(t); bar.remove();
          delete gone.dbId; comments.push(gone); drawComments();
          hooks.onComments && hooks.onComments(comments.slice(), { added: gone });
        });
      }));
    };
    q('.cMore').addEventListener('click', () => { showAll = !showAll; drawComments(); });
    // A GIF can go in a comment the same way it goes in a take, through the same picker.
    let cGif = null;
    const cGifShown = (g) => {
      cGif = g;
      if (g && cUp) cUpShown(null);
      q('.cGifChosen').hidden = !g;
      if (g) { q('.cGifChosen .gcImg').src = g.preview || g.url; q('.cGifChosen .gcImg').alt = g.alt || 'A GIF'; }
    };
    const cHasGiphy = typeof Giphy !== 'undefined' && Giphy.ready();
    q('.cGifBtn').hidden = !cHasGiphy;
    const cPicker = cHasGiphy ? Giphy.mount(q('.cGifPick'), {
      onPick: (g) => { cGifShown(g); q('.cGifPick').hidden = true; },
      onClose: () => { q('.cGifPick').hidden = true; q('.cGifBtn').focus(); },
    }) : null;
    q('.cGifBtn').addEventListener('click', () => {
      const box = q('.cGifPick');
      box.hidden = !box.hidden;
      if (!box.hidden) { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); cPicker.opened(); }
    });
    q('.cGifChosen .gcRemove').addEventListener('click', () => { cGifShown(null); q('.cGifBtn').focus(); });
    // A photo or video in a comment, checked by the same rules as the take box.
    let cUp = null;
    const cUpErr = (t) => { const e = q('.cUpErr'); if (e) { e.textContent = t || ''; e.hidden = !t; } };
    function cUpShown(u) {
      if (cUp && cUp.url && (!u || u.url !== cUp.url)) URL.revokeObjectURL(cUp.url);
      cUp = u;
      const box = q('.cUpChosen');
      if (!box) return;
      if (u) {
        Compose.showMedia(box.querySelector('.upMedia'), u);
        box.querySelector('.upRemove span').textContent = u.kind === 'video' ? 'Remove the video' : 'Remove the photo';
        if (cGif) cGifShown(null);
      } else { box.querySelector('.upMedia').textContent = ''; box.querySelector('.upAlt').value = ''; }
      box.hidden = !u;
    }
    const cTakeFile = async (file) => {
      cUpErr('');
      if (!file) return;
      const r = await Compose.checkMedia(file);
      if (r.error) { cUpErr(r.error); return; }
      cUpShown(r.upload);
    };
    if (q('.cUpBtn')) {
      q('.cUpBtn').addEventListener('click', (e) => { q('.cUpFile').click(); if (e.detail) e.currentTarget.blur(); });
      q('.cUpFile').addEventListener('change', (e) => { cTakeFile(e.target.files && e.target.files[0]); e.target.value = ''; });
      q('.cUpChosen .upRemove').addEventListener('click', () => { cUpShown(null); q('.cUpBtn').focus(); });
      q('.cText').addEventListener('paste', (e) => { const f = e.clipboardData && [...e.clipboardData.files][0]; if (f) { e.preventDefault(); cTakeFile(f); } });
      container._takeCommentFile = cTakeFile;
    }
    const post = () => {
      const txt = q('.cText').value.trim();
      // A GIF on its own is a reply, the same as a word is, and so is a photo.
      if (!txt && !cGif && !cUp) return;
      const upload = cUp ? { blob: cUp.blob, kind: cUp.kind, type: cUp.type, w: cUp.w, h: cUp.h, alt: q('.cUpChosen .upAlt').value.trim() } : null;
      const added = { text: txt, gif: cGif || null, upload, t: Date.now(), mine: true };
      comments.push(added);
      q('.cText').value = '';
      cUp = null; cUpShown(null);
      cGifShown(null);
      if (cPicker) cPicker.clear();
      q('.cGifPick').hidden = true;
      drawComments();
      hooks.onComments && hooks.onComments(comments.slice(), { added });
    };
    q('.cPost').addEventListener('click', post);
    q('.cEmojiSlot').replaceWith(EmojiKit.button(q('.cText')));
    EmojiKit.autocomplete(q('.cText'));

    // Reactions on the annotation. Until there are accounts, every reaction shown is yours.
    EmojiKit.reactions(q('.reactHost'), { list: opts.reactions || [], addButton: q('.reactBtn'), onChange: (list, change) => hooks.onReactions && hooks.onReactions(list, change) });

    // Poll: tap an option to vote. With no accounts yet, your vote is the only one.
    // Pressing your own choice again takes the vote back. That is worth saying the moment it happens.
    let pollSaid = '';
    const drawPollBox = () => {
      const p = take.poll, box = q('.pollBox');
      if (!p) { box.hidden = true; return; }
      box.hidden = false;
      const voted = p.vote !== null && p.vote !== undefined;
      // Everyone's votes when shared, otherwise only yours.
      const counts = p.counts ? p.counts.slice() : p.options.map((_, i) => (i === p.vote ? 1 : 0));
      const total = counts.reduce((a, b) => a + b, 0);
      box.innerHTML = `<div class="pollHead">${Brand.icon('poll')} Poll</div>${p.question ? `<p class="pollQ">${esc(p.question)}</p>` : ''}` + p.options.map((o, i) => {
        const pct = voted && total ? Math.round((counts[i] / total) * 100) : 0;
        return `<button type="button" class="pollOpt ${voted ? 'voted' : ''} ${i === p.vote ? 'mine' : ''}" data-i="${i}" aria-pressed="${i === p.vote}">
          <span class="pollFill" style="width:${pct}%"></span><span class="pollLabel">${esc(o)}${i === p.vote ? ` ${Brand.icon('check')}` : ''}</span>${voted ? `<span class="pollPct num">${pct}%</span>` : ''}</button>`;
      }).join('') + `<p class="note pollNote">${pollSaid ? `${pollSaid} ` : ''}${voted ? `${total} vote${total === 1 ? '' : 's'}. Choose another option to change yours, or the same one to take it back.` : total ? `${total} vote${total === 1 ? '' : 's'} so far. Choose an option to vote.` : 'Choose an option to vote.'}</p>`;
      box.querySelectorAll('.pollOpt').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        if (p.counts) { if (p.vote !== null && p.vote !== undefined) p.counts[p.vote]--; if (p.vote !== i) p.counts[i]++; }
        pollSaid = p.vote === i ? 'Your vote is taken back.' : '';
        p.vote = p.vote === i ? null : i;
        drawPollBox();
        hooks.onPollVote && hooks.onPollVote(p.vote);
      }));
    };
    drawPollBox();
    q('.cText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });
    drawComments();
    container.__annClock = setInterval(() => {
      // The page this clock keeps current can be replaced without a new render, when the annotation is
      // deleted while it is open, and the clock then threw every thirty seconds for as long as the tab stayed.
      if (!container.isConnected || !q('.cTitle') || !q('.when')) return stopClock(container);
      drawComments();
      q('.when').textContent = relTime(created);
    }, 30000);

    // Source links jump back to the original when the shell can do it (the preview), otherwise they open normally.
    if (jump) container.querySelectorAll('.srcJump').forEach((b) => b.addEventListener('click', () => hooks.onOpenSource(item)));

    return {
      setStats(s) { stats = s; const e = q('.rail .stats'); if (e) e.innerHTML = statsLine(stats); },
      hideBanner() { const b = q('.banner'); if (b) b.remove(); },
    };
  }
  // Same source document, ignoring which part was captured.
  // Which source a card is about. Empty when there is nothing to go on, so those are never grouped.
  // What to call an annotation in a list. A poll is a take of its own now, so it is named by its question
  // rather than being filed under Untitled.
  const blobUrls = new WeakMap();
  function cmtUpload(c) {
    const u = c && c.upload;
    if (!u) return '';
    // A file saved on this computer gets one address per file, held beside it rather than on it, because the
    // comment is saved again later and an address written into it would be dead after a reload.
    let src;
    if (u.blob) { src = blobUrls.get(u.blob); if (!src) { src = URL.createObjectURL(u.blob); blobUrls.set(u.blob, src); } }
    else src = u.kind === 'video' ? safeLink(u.url) : safeImg(u.url);
    if (!src) return '';
    return u.kind === 'video'
      ? `<figure class="cmtUp"><video controls preload="metadata" src="${esc(src)}" ${u.alt ? `aria-label="${esc(u.alt)}"` : ''}></video></figure>`
      : `<figure class="cmtUp"><img src="${esc(src)}" alt="${esc(u.alt || '')}" loading="lazy" ${u.w && u.h ? `width="${Number(u.w)}" height="${Number(u.h)}"` : ''}></figure>`;
  }
  const takeLine = (t) => (t && t.text) || (t && t.poll && t.poll.question) || (t && t.voice ? 'Voice note' : '') || (t && t.gif ? 'A GIF' : '')
    || (t && t.upload ? (t.upload.kind === 'video' ? 'A video' : 'A photo') : '');
  const srcKey = (it) => (it.kind === 'video' ? 'v:' + (it.videoId || it.url || '')
    : it.kind === 'audio' ? 'a:' + (it.url || '')
      : it.kind === 'post' ? 'p:' + (it.id || it.url || '')
        : 'd:' + ((it.meta && it.meta.url) || '')).replace(/^\w:$/, '');
  const sameAgain = (it) => (it.kind === 'post' ? 'Same post'
    : it.kind === 'video' ? 'Same video' : it.kind === 'audio' ? 'Same episode' : 'Same page');

  function sameSourceDoc(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'video') return (a.videoId || a.url) === (b.videoId || b.url);
    if (a.kind === 'audio') return a.url === b.url;
    if (a.kind === 'post') return (a.id && a.id === b.id) || a.url === b.url;
    return (a.meta.url || '') === (b.meta.url || '');
  }

  /* ---------------- feed ---------------- */
  // Home shows everything on annotated, your profile shows yours, and a tag shows one tag. Follows need accounts.
  // social (optional): { you, people, trending, onFollow, onPerson, personStats, followsPerson,
  //   tabs: { current: 'foryou' | 'following' | 'everyone', onTab, note } } for the home feed's tabs.
  // A quoted post keeps its paragraphs. One mark to a line, so the blank line between paragraphs stays bare.
  // Marking the whole quote at once left a stray block of ink sitting in every gap.
  const inked = (t) => String(t || '').split(/\n{2,}/)
    .map((para) => para.split('\n').filter((l) => l.trim()).map((l) => `<mark>${esc(l)}</mark>`).join('<br>'))
    .filter(Boolean).map((para) => `<p>${para}</p>`).join('');

  // yours is everything of yours, before a tab narrowed the list. Your card and your tags describe you, not
  // the tab you are on, and counting the tab's list said nought annotations on Following.
  // A clip card plays its clip silently while at least half of it is on screen, and stops when it is not. The
  // file is only asked for once it is seen, and a shared one is asked for again only when seen again, which
  // keeps a long feed from pulling every clip down (the free plan has five gigabytes of downloads a month).
  // Play with sound, the button over the picture, puts it on hold for good.
  let previewIo = null;
  // Clip previews made from a file on this computer are given back when the list is drawn again (performance audit).
  let previewBlobs = [];
  function wirePreviews(root, records, getMedia) {
    // A picture that cannot be fetched, a video's poster gone or a show's artwork moved, leaves the card
    // without one rather than showing an empty black box where it was.
    root.querySelectorAll('.cthumb.cwide img').forEach((img) => {
      const drop = () => { const box = img.closest('.cthumb'); if (box && !box.querySelector('.cplayBtn')) box.remove(); else img.remove(); };
      if (img.complete && img.naturalWidth === 0 && img.src) drop(); else img.addEventListener('error', drop, { once: true });
    });
    if (previewIo) previewIo.disconnect();
    previewBlobs.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* gone */ } }); previewBlobs = [];
    const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const vids = [...root.querySelectorAll('video.cpv')];
    if (!vids.length || still || typeof IntersectionObserver === 'undefined') return;
    previewIo = new IntersectionObserver((rows) => rows.forEach(async (row) => {
      const v = row.target;
      if (!row.isIntersecting || v.dataset.held) { if (!v.paused) v.pause(); return; }
      if (!v.src) {
        const r = records.find((x) => x.id === v.dataset.id);
        if (!r) return;
        let src = safeLink(r.item.mediaUrl);
        if (!src && r.item.blob) { src = URL.createObjectURL(r.item.blob); previewBlobs.push(src); }
        if (!src && r.item.hasMedia && getMedia) { const b = await getMedia(r.id).catch(() => null); if (b) { r.item.blob = b; src = URL.createObjectURL(b); previewBlobs.push(src); } }
        if (!src || !v.isConnected) return;
        v.src = src;
        v.addEventListener('playing', () => v.closest('.cthumb').classList.add('live'), { once: true });
      }
      v.play().catch(() => {});
    }), { threshold: 0.5 });
    vids.forEach((v) => previewIo.observe(v));
  }
  function renderFeed(container, { records, yours = null, tag, mode = 'home', person = null, getMedia = null, social = null, onOpen, onTag, onAll, onHome, onProfile, onDeleteAll = null, siteNav = true, onSignIn = null, loadFailed = false, onRetry = null }) {
    stopClock(container);
    let filter = 'all', sort = 'new';
    const { main, rail } = shell(container, { active: tag ? null : mode, onHome: onHome || onAll, onFeed: onAll, onProfile: onProfile || onAll, siteNav });
    // Most discussed: comments and reactions together, newest first on ties.
    const buzz = (r) => (r.comments || []).length + reactTotal(r.reactions) + (r.take.poll && r.take.poll.vote != null ? 1 : 0);
    main.classList.add('ann', 'feed');
    // Someone else's profile counts their follows, and your own counts yours. Only the first used to be
    // asked for, so your own profile said nought followers beside a card that said one.
    const pStats = (person ? social && social.personStats : social && social.youCounts) || {};
    const draw = () => {
      // "For you" arrives already ranked, so its order is kept.
      const ranked = social && social.tabs && social.tabs.current === 'foryou' && mode === 'home' && !tag;
      const folded = Folded.ids();
      const list = records.filter((r) => (!tag || r.take.tag === tag) && (filter === 'all' || (filter === 'folded' ? folded.includes(r.id) : r.item.kind === filter)));
      if (!ranked) list.sort((a, b) => (sort === 'hot' ? buzz(b) - buzz(a) : 0) || b.created - a.created);
      const scope = records.filter((r) => !tag || r.take.tag === tag);
      const counts = { all: scope.length, video: 0, audio: 0, article: 0, post: 0 };
      scope.forEach((r) => { counts[r.item.kind] = (counts[r.item.kind] || 0) + 1; });
      counts.folded = scope.filter((r) => folded.includes(r.id)).length;
      // Every kind stays selectable, because each empty state says how to make one. Only the zeros are dropped,
      // so the row stops reading like a scoreboard of nothing, and a kind with nothing in it is drawn faint, since
      // Audio and Passages looked like any other filter and led only to "Nothing here yet" (recording of
      // 2026-09-25 at 23:23, 2:57).
      const kinds = [['all', 'All'], ['video', 'Clips'], ['audio', 'Audio'], ['article', 'Passages'], ['post', 'Posts']].concat(counts.folded || filter === 'folded' ? [['folded', 'Folded']] : []);
      main.innerHTML = `
        <header class="feedHead">
          ${tag ? `<h1>Tagged <span class="tag">${esc(tag)}</span></h1><button type="button" class="link allLink">See everything</button>`
            : mode === 'profile' ? `<div class="who">${pAv(person, 'lg')}<div><h1 class="name">${esc(pName(person))} <span class="uname">${esc(pHandle(person))}</span></h1>
               ${!person && onSignIn ? `<div class="stats">${plural(records.length, 'annotation')} saved on this computer. Sign in to publish ${records.length === 1 ? 'it' : 'them'} under your name.</div>${twoWays('pSignIn')}`
                 : `<div class="stats">${loadFailed ? 'Annotations did not load' : plural(records.length, 'annotation')}, <span class="followCount num" data-id="${esc(person ? person.id : '')}">${num(pStats.followers)}</span> follower${num(pStats.followers) === 1 ? '' : 's'}, <span class="${person ? '' : 'youFollowing '}num">${num(pStats.following)}</span> following</div>`}
               ${person && social && social.onFollow ? `<button type="button" class="ghost sm followBtn" data-id="${esc(person.id)}" ${social.followsPerson ? 'data-on="1"' : ''}>Follow</button>` : ''}</div></div>`
            : `<h1>Feed</h1>${typeof PaperDeco !== 'undefined' ? PaperDeco.rule() + `<div class="pd pd-feedTop" aria-hidden="true">${PaperDeco.ART[['swallow', 'stunt', 'lock', 'banking', 'loose'][Math.floor(Math.random() * 5)]]()}</div>` : ''}<p class="note stats">${social && social.tabs ? esc(social.tabs.note || '') : `${plural(records.length, 'annotation')} from everyone, newest first.`}</p>`}
        </header>
        <div class="feedBar">
          ${!tag && mode === 'home' && social && social.tabs ? `<div class="seg feedTabs" role="radiogroup" aria-label="Which annotations">
            ${[['foryou', 'For you'], ['following', 'Following'], ['everyone', 'Everyone']].map(([k, l]) => `<label><input type="radio" name="ft" value="${k}" ${social.tabs.current === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>` : ''}
          <div class="feedSortRow" ${social && social.tabs && social.tabs.current === 'foryou' && mode === 'home' && !tag ? 'hidden' : ''}><div class="feedSort seg" role="radiogroup" aria-label="Sort">
            <label><input type="radio" name="fs" value="new" ${sort === 'new' ? 'checked' : ''}><span>Newest</span></label>
            <label><input type="radio" name="fs" value="hot" ${sort === 'hot' ? 'checked' : ''}><span>Most discussed</span></label>
          </div></div>
          <div class="seg feedFilter" role="radiogroup" aria-label="Show">
            ${kinds.map(([k, l]) => `<label${k !== 'all' && !counts[k] && !loadFailed ? ' class="zero"' : ''}><input type="radio" name="ff" value="${k}" ${filter === k ? 'checked' : ''}><span>${l}${counts[k] ? ` <span class="num">${counts[k]}</span>` : ''}</span></label>`).join('')}
          </div>
        </div>
        <ul class="cards">${(() => { let lastKey = ''; return list.length ? list.map((r) => { try {
          const it = r.item;
          // Three takes on one post used to repeat the author and the post three times over. The source is
          // named once and the takes below it just say they are on the same thing. The quote still differs
          // on every card, because that is what tells them apart.
          const key = srcKey(it), again = !!key && key === lastKey;
          lastKey = key;
          // Posts get no thumbnail: a shrunken screenshot of text is unreadable, so the snippet carries it.
          // A post is shown by its screenshot, the same as an article is. Posts were the one kind with no
          // picture at all, and a column of cards all from X had nothing for the eye to catch.
          // A published screenshot is the full-size picture online; the copy kept here for lists is small (it
          // was 360 pixels wide, stretched to twice that on a card, and read as blurry). Online comes first.
          const shotBest = /^https?:/.test(it.shot || '') ? it.shot : (it.shotThumb || it.shot);
          const thumb = safeImg(it.kind === 'video' ? it.poster
            : it.kind === 'audio' ? (it.artwork || it.poster)
            : it.kind === 'post' ? shotBest
            : ((it.meta && it.meta.image) || shotBest));
          // A screenshot is read from its top left corner. A preview image made for sharing is composed to
          // be seen whole, so that one stays centred.
          const fromShot = it.kind !== 'video' && it.kind !== 'audio' && !(it.meta && it.meta.image);
          // Break at a word. Cutting mid-word gave things like 'years. Ove…'.
          const cut = (t, n) => { if (t.length <= n) return t; const s = t.slice(0, n); const sp = s.lastIndexOf(' '); return (sp > n * 0.6 ? s.slice(0, sp) : s).trimEnd() + '…'; };
          const brief = (it.end - it.start) < 10;
          const range = `${fmt(it.start, brief)} to ${fmt(it.end, brief)}${it.duration > 0 ? ` of ${fmt(it.duration)}` : ''}`;
          const snippet = it.kind === 'video' ? `${it.site === 'x' ? 'X' : 'YouTube'}${it.channel ? ', ' + it.channel : ''}. Clip ${range}`
            : it.kind === 'audio' ? `${it.show || 'Podcast'}. Audio clip ${range}`
            // The words the person picked out are the point of the annotation, so the card shows those and
            // falls back to the post itself only when the whole post was taken.
            : it.kind === 'post' ? ((it.quote || it.text) ? `"${cut(it.quote || it.text, 160)}"` : 'Post') : `"${cut(it.text, 120)}"`;
          const srcTitle = it.kind === 'post' ? `${it.author}${it.handle ? ' ' + it.handle : ''}` : it.kind === 'article' && it.meta.site ? `${it.meta.site}: ${titleOf(it)}` : titleOf(it);
          const playable = (it.kind === 'video' || it.kind === 'audio') && (it.blob || it.mediaUrl || it.hasMedia);
          // Stats row: reactions, poll and comments, each only when there is something to count.
          const nC = (r.comments || []).length, nReact = reactTotal(r.reactions), poll = r.take.poll;
          const stats = [];
          if (nReact) stats.push(`<span class="fStat fReact" aria-label="${plural(nReact, 'reaction')}">${reactEmojis(r.reactions).slice(0, 4).join('')}<span class="num">${nReact}</span></span>`);
          const nVotes = poll ? (poll.counts ? poll.counts.reduce((a, b) => a + (Number(b) || 0), 0) : Number.isFinite(r.pollVotes) ? r.pollVotes : (poll.vote !== null && poll.vote !== undefined ? 1 : 0)) : 0;
          if (poll) stats.push(`<span class="fStat" aria-label="Poll">${Brand.icon('poll')}${nVotes ? plural(nVotes, 'vote') : 'Poll'}</span>`);
          if (nC) stats.push(`<span class="fStat" aria-label="${plural(nC, 'comment')}">${Brand.icon('comment')}<span class="num">${nC}</span></span>`);
          if (r.take.voice) stats.push(`<span class="fStat" aria-label="Voice note">${Brand.icon('mic')}Voice</span>`);
          if (r.take.upload) stats.push(`<span class="fStat" aria-label="${r.take.upload.kind === 'video' ? 'A video' : 'A photo'}">${Brand.icon('image')}${r.take.upload.kind === 'video' ? 'Video' : 'Photo'}</span>`);
          // The source sits large under the take, the way it does on the annotation's own page, so a feed can be
          // scanned by what people were looking at. It used to be a small square beside the words. A clip plays
          // silently while its card is on screen, and Play with sound opens the full player under it.
          const preview = it.kind === 'video' && playable;
          // A passage with no picture shows the words themselves, inked, as its picture. They are what was chosen.
          // A post's screenshot already shows its marked words, so the line under it names the post and does not quote
          // it again (UX pass of 2026-09-29).
          const inkQuote = !thumb && it.kind === 'article' && it.text ? `<span class="cquote"><span class="cqInk">${esc(cut(it.text, 220))}</span></span>` : '';
          const media = inkQuote || (thumb ? `<span class="cthumb cwide${preview ? ' cprev' : ''}${it.kind === 'audio' ? ' caudio' : ''}"><img class="${fromShot ? 'top' : ''}" src="${esc(thumb)}" alt="" loading="lazy">${preview ? `<video class="cpv" muted playsinline loop preload="none" aria-hidden="true" data-id="${esc(r.id)}"></video>` : ''}${playable ? `<span class="cdur num" title="${esc(fmt(it.end - it.start))} long">${fmt(it.start)}–${fmt(it.end)}</span><button type="button" class="cplayBtn" data-id="${esc(r.id)}" aria-label="Play the ${it.kind === 'audio' ? 'audio' : 'clip'} here, with sound" aria-expanded="false">${Brand.icon('play')}<span>${it.kind === 'audio' ? 'Listen here' : 'Play with sound'}</span></button>` : ''}</span>` : '');
          // The card is a link to the annotation rather than a button, so Play with sound can be a real button on
          // the picture inside it.
          return `<li class="cardItem"><div class="card mf ${thumb ? '' : 'nothumb'}${Folded.has(r.id) ? ' folded' : ''}" role="link" tabindex="0" data-id="${esc(r.id)}">
            <span class="cbody">
              ${r.why ? `<span class="cwhy">${esc(r.why)}</span>` : ''}
              <span class="cmeta">${pAv(r.author && !r.mine ? r.author : null, 'xs')} ${esc(pName(r.author && !r.mine ? r.author : null))} <span class="dotsep">${relTime(r.created)}</span>${r.take.tag ? ` <span class="tag sm">${esc(r.take.tag)}</span>` : ''}${onlyHere(r) ? ' <span class="localTag">On this computer</span>' : ''}</span>
              <span class="ctake">${esc(takeLine(r.take))}</span>
              ${media}
              <span class="csource${again ? ' again' : ''}">${kindIcon(it)}<span><span class="cst">${esc(again ? sameAgain(it) : srcTitle)}</span>${inkQuote || (it.kind === 'post' && thumb) ? '' : `<span class="csn">${esc(snippet)}</span>`}</span></span>
              ${stats.length ? `<span class="fStats">${stats.join('')}</span>` : ''}
              ${r.firstReply && r.firstReply.text ? `<span class="creply"><b>${esc(r.firstReply.name)}</b> <span>${esc(r.firstReply.text.length > 140 ? r.firstReply.text.slice(0, 139) + '…' : r.firstReply.text)}</span></span>` : ''}
            </span>
          </div>
          </li>`;
          // One card that cannot be drawn is left out, rather than taking the whole feed down (security audit of 2026-09-29).
          } catch (e) { return ''; }
        }).join('') : (() => {
          // Each tab says why it is empty, as the panel does. The page used to say "Publish an annotation from
          // the panel" under For you to someone with two annotations saved, which are on their profile.
          const mineHere = mode === 'home' && !tag && (yours || []).length;
          const tabs = social && social.tabs;
          const why = tabs && tabs.current === 'following' ? (tabs.empty || 'Follow someone and their annotations show up here.')
            : tabs && tabs.empty && filter === 'all' ? tabs.empty
            // Your own profile says what the panel's does (recording of 2026-09-25 at 14:08, 2:30 and 2:34), and
            // someone else's says it is theirs.
            : filter === 'all' && person ? `${person.name || 'They'} has not published anything yet.`
            : filter === 'folded' ? 'Fold the corner of an annotation to keep it here.'
            : { all: 'Select words on any page, or clip a video or podcast, and it shows up here.', video: 'Open a YouTube video and capture a clip from the panel.', audio: 'Open a podcast episode and clip it from the panel.', article: 'Select any words in an article and click Annotate.', post: 'Open a post on X and capture it from the panel.' }[filter];
          // On the website an empty list leads to the extension, which is where annotations are published. It led to
          // the home page, whose takes are demonstrations that never reach a feed or a profile (recording of
          // 2026-09-25 at 06:58, 1:00 and 1:22). With the extension already installed there is nothing to offer.
          const web = !(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
          const hasExt = document.documentElement.dataset.annotatedInstalled === '1';
          // Following, signed out on the website: what helps is signing in, not the extension (UX pass of 2026-09-29).
          const followIn = web && onSignIn && tabs && tabs.current === 'following';
          // A list that did not load is not an empty one. The profile said "0 annotations" and "Nothing here yet"
          // for half a second before three appeared (recording of 2026-09-25 at 23:23, 2:51).
          if (loadFailed) return `<li class="emptyState">${emptyArt()}<p class="esTitle">These annotations did not load</p><p>Check your connection and try again.</p>${onRetry ? '<button type="button" class="ghost sm esRetry">Try again</button>' : ''}</li>`;
          return `<li class="emptyState">${emptyArt()}<p class="esTitle">Nothing here yet</p><p>${esc(why)}</p>${mineHere && onProfile ? `<button type="button" class="ghost sm esMine">See your ${plural(yours.length, 'annotation')}</button>` : ''}${followIn ? twoWays('pSignIn') : web && !hasExt ? '<a class="ghost sm esMake" href="/install">Get the extension to publish one</a>' : ''}</li>`;
        })(); })()}</ul>
        ${mode === 'profile' && !person ? `<footer class="profileFoot">${onDeleteAll && records.length ? delAllBox(records) : ''}</footer>` : ''}`;
      // Your own profile ends with Delete all and Sign out. As the first thing under your name, the red button
      // led the page, above your annotations (recording of 2026-09-25 at 04:48).
      const ownProfile = mode === 'profile' && !person;
      const inExt = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
      const youCard = ownProfile ? ''
        : social && social.you ? railYou(social.you)
        // Signed out on the website there is no "you" yet: it used to say "You, 0 annotations, 0 followers".
        : !inExt && onSignIn ? `<section class="railcard"><p class="note">Sign in to follow people, react and comment.</p>${twoWays('railSignIn')}</section>`
        : !inExt ? ''
        : railYou({ annotations: mineCount(yours || records, social && social.youId), followers: 0 });
      rail.innerHTML = youCard + railTrending(social, null, mode === 'profile' && !person ? records : []) + railFollow(social) + railTags(yours || records) + railAbout();
      wireDelAll(main, onDeleteAll);
      const esMine = main.querySelector('.esMine');
      if (esMine) esMine.addEventListener('click', () => onProfile());
      const esRetry = main.querySelector('.esRetry');
      if (esRetry) esRetry.addEventListener('click', () => { esRetry.disabled = true; esRetry.textContent = 'Loading…'; onRetry(); });
      main.querySelectorAll('.pSignIn').forEach((b) => b.addEventListener('click', () => onSignIn(b.dataset.provider)));
      rail.querySelectorAll('.railSignIn').forEach((b) => b.addEventListener('click', () => onSignIn(b.dataset.provider)));
      // A card opens its annotation, by click or by Enter and Space, since it is a link and not a button now.
      main.querySelectorAll('.card').forEach((c) => {
        c.addEventListener('click', (e) => { if (!e.target.closest('.cplayBtn')) onOpen(c.dataset.id); });
        c.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); onOpen(c.dataset.id); } });
      });
      main.querySelectorAll('.feedFilter input').forEach((i) => i.addEventListener('change', () => { filter = i.value; draw(); }));
      main.querySelectorAll('.feedSort input').forEach((i) => i.addEventListener('change', () => { sort = i.value; draw(); }));
      wirePreviews(main, records, getMedia);
      // Clips and audio play right in the feed. Opening the annotation stays a click on the card.
      main.querySelectorAll('.cplayBtn').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pv = b.closest('.cardItem').querySelector('.cpv'); if (pv) { pv.pause(); pv.dataset.held = '1'; }
        const li = b.closest('.cardItem'), open = li.querySelector('.cardPlayer');
        main.querySelectorAll('.cardPlayer').forEach((p) => { const m = p.querySelector('video,audio'); if (m) { m.pause(); URL.revokeObjectURL(m.src); } p.remove(); });
        main.querySelectorAll('.cplayBtn').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        if (open) return;
        const r = records.find((x) => x.id === b.dataset.id);
        if (!r) return;
        // Light copies carry no clip: fetch it when you press play.
        if (!r.item.blob && !r.item.mediaUrl && r.item.hasMedia && getMedia) { b.disabled = true; r.item.blob = await getMedia(r.id); b.disabled = false; }
        if (!(r.item.blob || r.item.mediaUrl)) return;
        const isA = r.item.kind === 'audio';
        const box = document.createElement('div');
        box.className = 'cardPlayer' + (isA ? ' audio' : '');
        const m = document.createElement(isA ? 'audio' : 'video');
        m.controls = true; m.autoplay = true; m.playsInline = true;
        if (!isA && r.item.poster) m.poster = r.item.poster;
        m.src = r.item.blob ? URL.createObjectURL(r.item.blob) : safeLink(r.item.mediaUrl);
        box.appendChild(m);
        li.appendChild(box);
        b.setAttribute('aria-expanded', 'true');
      }));
      const all = main.querySelector('.allLink');
      if (all) all.addEventListener('click', onAll);
      rail.querySelectorAll('.railTag').forEach((b) => b.addEventListener('click', () => onTag && onTag(b.dataset.tag)));
      rail.querySelectorAll('.railOpen').forEach((b) => b.addEventListener('click', () => onOpen && onOpen(b.dataset.id)));
      main.querySelectorAll('.feedTabs input').forEach((i) => i.addEventListener('change', () => social.tabs.onTab(i.value)));
      wireFollow(container, social);
    };
    draw();
  }

  // Side panel view while an annotation page is the active tab: share tools and your other annotations.
  // localAware: the extension knows which annotations are only saved locally. The preview does not.
  // Deleting everything at once, rather than opening each annotation to delete it. Two steps, because it
  // cannot be undone, and the second one says how many and how many of them other people can see. Offered
  // both on your profile page and in the panel, because on the page alone it took some finding.
  const delAllBox = (records) => {
    const shared = records.filter((r) => r.cloud || r.author).length;
    return `<div class="delAll"><button type="button" class="ghost sm danger delAllOpen">${Brand.icon('trash')} Delete all your annotations</button>
      <div class="delAllAsk" hidden role="alertdialog"><p>${plural(records.length, 'annotation')} will be deleted${shared ? `, including ${shared} published for everyone` : ''}. This cannot be undone.</p>
        <div class="row"><button type="button" class="ghost sm delAllNo">Keep them</button><button type="button" class="primary sm delAllYes">Delete ${plural(records.length, 'annotation')}</button></div>
        <p class="note delAllMsg" role="status"></p></div></div>`;
  };
  function wireDelAll(root, onDeleteAll) {
    const open = root.querySelector('.delAllOpen');
    if (!open) return;
    const ask = root.querySelector('.delAllAsk'), msg = root.querySelector('.delAllMsg');
    open.addEventListener('click', () => { ask.hidden = false; open.hidden = true; root.querySelector('.delAllNo').focus(); });
    root.querySelector('.delAllNo').addEventListener('click', () => { ask.hidden = true; open.hidden = false; open.focus(); });
    root.querySelector('.delAllYes').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Deleting';
      try {
        const failed = await onDeleteAll((done, total) => { msg.textContent = `Deleted ${done} of ${total}.`; });
        if (failed && failed.length) msg.textContent = `${plural(failed.length, 'annotation')} could not be deleted. ${failed[0]}`;
      } catch (err) { b.disabled = false; b.textContent = 'Delete them'; msg.textContent = 'Nothing was deleted. ' + (err.message || ''); }
    });
  }

  // The panel's own Home and profile. A menu shows you its contents where you are, so these read inside the
  // panel rather than taking a tab. Opening one annotation is a page, because that is where its comments,
  // its source and the conversation live, and that page still shares the one annotated tab.
  // The full page of a list, named for what it opens. "See all annotations", a small grey link beside the
  // heading, was hunted for twice in the recording of 2026-09-25 at 01:15.
  // The full list is called Feed on the website and in the extension alike, so the panel's Home opens "the feed"
  // (recording of 2026-09-25 at 06:58, 3:44: the extension's page said Home, the website's the same list Feed).
  const fullLabel = (title) => (/profile/i.test(title) ? 'Open your profile as a full page' : /^home$/i.test(title) ? 'Open the feed as a full page' : `Open ${title} as a full page`);
  function renderBrowse(container, { title, records, note = '', emptyNote = '', tabs = null, onOpen, onBack, onFull, onDeleteAll = null, localAware = true, backTo = 'Back', action = null }) {
    stopClock(container);
    // For you arrives ranked, so its order is kept. Everything else is newest first.
    const list = tabs && tabs.current === 'foryou' ? records.slice() : records.slice().sort((a, b) => b.created - a.created);
    // Drawn again only when something on it would change. Redrawing the same list replaced the button under the
    // pointer, and "Open your profile as a full page" took two seconds to answer (recording of 2026-09-25 at 14:08,
    // 2:30 to 2:32).
    const sig = JSON.stringify([title, note, emptyNote, tabs && tabs.current, backTo, !!onBack, action && action.label, !!onDeleteAll, list.map((r) => [r.id, takeLine(r.take), r.why || '', onlyHere(r)])]);
    if (container.dataset.sig === sig && container.querySelector('.annside.browse')) return;
    container.dataset.sig = sig;
    // The way back says where it goes, like the one beside the feed. An arrow on its own left people guessing.
    container.innerHTML = `<div class="annside browse">
      ${onBack ? `<button type="button" class="ghost sm browseBack" title="${esc(backTo)}">${Brand.icon('arrowLeft')}<span>${esc(backTo)}</span></button>` : ''}
      <div class="browseHead"><h2>${esc(title)}</h2></div>
      ${tabs ? `<div class="seg browseTabs" role="radiogroup" aria-label="Which annotations">${tabs.options.map(([k, l]) =>
        `<label><input type="radio" name="browseTab" value="${esc(k)}" ${tabs.current === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>` : ''}
      ${note ? `<p class="note browseNote">${esc(note)}</p>` : ''}
      <ul class="sideList">${list.length ? list.map((r) => `<li><button type="button" data-id="${esc(r.id)}">
        <span class="rlKind">${kindIcon(r.item)}</span>
        <span class="rlText">${r.why ? `<span class="cwhy">${esc(r.why)}</span>` : ''}<span class="rlTake">${esc(takeLine(r.take) || 'Untitled')}${localAware && onlyHere(r) ? ' <span class="localTag">On this computer</span>' : ''}</span><span class="note">${esc(withTime(titleOf(r.item), relTime(r.created)))}</span></span>
        </button></li>`).join('') : `<li class="browseEmpty">${emptyArt()}<p class="note">${esc(emptyNote || 'Nothing here yet. Select words on any page, or clip a video or podcast, and it shows up here.')}</p></li>`}</ul>
      ${action ? `<p class="browseAction"><button type="button" class="primary browseAct">${esc(action.label)}</button></p>` : ''}
      ${onFull ? `<p class="fullRow"><button type="button" class="ghost fullBtn browseFullBtn">${esc(fullLabel(title))} ${Brand.icon('external')}</button></p>` : ''}
      ${onDeleteAll && list.length ? delAllBox(list) : ''}
      ${list.length ? cornerArt() : ''}
    </div>`;
    wireDelAll(container, onDeleteAll);
    const bk = container.querySelector('.browseBack');
    if (bk) bk.addEventListener('click', () => onBack());
    const act = container.querySelector('.browseAct');
    if (act) act.addEventListener('click', () => action.onClick());
    // One way to the full page, under the list. A small "See all annotations" at the top did the same thing
    // under another name (recording of 2026-09-25 at 03:14).
    // It says it heard you at once, since the page it opens can take a moment.
    container.querySelectorAll('.browseFullBtn').forEach((b) => b.addEventListener('click', () => {
      // Back as soon as the page has opened. A fixed second and a half kept it saying Opening after the page was
      // already there (recording of 2026-09-25 at 19:26, 3:09).
      const was = b.innerHTML; b.textContent = 'Opening…'; b.disabled = true;
      const back = () => { if (b.isConnected) { b.innerHTML = was; b.disabled = false; } };
      const t = setTimeout(back, 3000);
      Promise.resolve(onFull()).catch(() => {}).finally(() => { clearTimeout(t); setTimeout(back, 150); });
    }));
    if (tabs) container.querySelectorAll('.browseTabs input').forEach((i) => i.addEventListener('change', () => tabs.onTab(i.value)));
    container.querySelectorAll('.sideList li button').forEach((b) => b.addEventListener('click', () => onOpen(b.dataset.id)));
  }

  // Everything in the local store belongs to this computer, not to whoever is signed in, because one browser
  // can be used by two accounts. Yours means you published it, or it has never been published at all.
  const yoursOnly = (records, youId) => records.filter((r) => !r.author || (youId && r.author.id === youId));
  function renderSide(container, { current, records, youId = null, permalinkOf, onOpen, onFeed, onDelete, onPublishNow, localAware = false, mirrors = '', onSource = null, sourceName = '' }) {
    stopClock(container);
    // The tab is already showing this list, so the panel does not show it again with a link to where you
    // already are. It offers the way back, named, says what is open, and leaves .mirrorStart for the panel
    // to put the start page in. On its own the sentence and one button were a dead end for twenty seconds
    // at a time in the recording of 2026-09-23 at 02:48.
    if (mirrors) {
      const where = sourceName ? `Back to ${sourceName}` : 'Back to what you were reading';
      container.innerHTML = `<div class="annside mirror">
        ${onSource ? `<button type="button" class="ghost sm sideBack" title="${esc(where)}">${Brand.icon('arrowLeft')}<span>${esc(where)}</span></button>` : ''}
        <p class="mirrorWhat">${esc(mirrors)} is open beside this.</p>
        <div class="mirrorStart"></div></div>`;
      const back = container.querySelector('.sideBack');
      if (back) back.addEventListener('click', onSource);
      return;
    }
    const list = yoursOnly(records, youId).slice().sort((a, b) => b.created - a.created);
    // Delete belongs to the person who wrote it. Offering it on someone else's annotation used to take away
    // the copy held here and report success, while the shared one stayed where it was.
    const canDelete = !!(current && (!current.author || (youId && current.author.id === youId)));
    const statsOf = (r) => {
      const nC = (r.comments || []).length, nR = reactTotal(r.reactions), bits = [];
      if (nR) bits.push(`<span class="fStat fReact">${reactEmojis(r.reactions).slice(0, 4).join('')}<span class="num">${nR}</span></span>`);
      const votes = r.take.poll && r.take.poll.counts ? r.take.poll.counts.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
      if (r.take.poll) bits.push(`<span class="fStat">${Brand.icon('poll')}${votes ? plural(votes, 'vote') : 'Poll'}</span>`);
      if (nC) bits.push(`<span class="fStat">${Brand.icon('comment')}<span class="num">${nC}</span></span>`);
      return bits.length ? `<span class="fStats">${bits.join('')}</span>` : '';
    };
    container.innerHTML = `<div class="annside">
      ${current ? `<section class="sideNow" aria-label="This annotation">
        <div class="snHead"><span class="rlKind">${kindIcon(current.item)}</span><span class="snLabel">${current.author && current.author.name && !(youId && current.author.id === youId) ? `By ${esc(current.author.name)}` : 'This annotation'}</span>${current.take.tag ? `<span class="tag sm">${esc(current.take.tag)}</span>` : ''}</div>
        <p class="snTake">${esc(takeLine(current.take) || 'Untitled')}</p>
        <p class="note snSrc">${esc(withTime(titleOf(current.item), relTime(current.created)))}</p>
        ${statsOf(current)}
        ${!localAware || current.cloud || current.author ? `<div class="row"><button type="button" class="ghost sm sideCopy">${Brand.icon('link')} <span>Copy link</span></button>
          <a class="ghost sm" target="_blank" rel="noopener" href="${xUrl(current.item, current.take, permalinkOf(current.id))}">${Brand.icon('x')} Post to X</a></div>`
          : `<p class="note snLocal">${Brand.icon('info')} Only on this computer, so there is no link to share yet.</p>
          ${onPublishNow ? '<p class="row"><button type="button" class="strong sm sidePub">Publish it now</button></p>' : ''}`}
        ${onDelete && canDelete ? '<p class="sideDel"><button type="button" class="link sideDelBtn">Delete this annotation</button></p>' : ''}
      </section>` : ''}
      <div class="sideListHead"><h2>Your annotations</h2></div>
      <ul class="sideList">${list.map((r) => {
        const now = current && r.id === current.id;
        return `<li><button type="button" data-id="${esc(r.id)}" ${now ? 'aria-current="page"' : ''}>
          <span class="rlKind">${kindIcon(r.item)}</span>
          <span class="rlText"><span class="rlTake">${esc(takeLine(r.take) || 'Untitled')}${localAware && onlyHere(r) ? ' <span class="localTag">On this computer</span>' : ''}</span><span class="note">${esc(withTime(titleOf(r.item), relTime(r.created)))}</span></span>
          ${now ? '<span class="nowBadge">Viewing</span>' : ''}</button></li>`;
      }).join('')}</ul>
      ${list.length ? `<p class="fullRow"><button type="button" class="ghost fullBtn sideFeedBtn">Open your profile as a full page ${Brand.icon('external')}</button></p>` : '<p class="note sideNone">You have no annotations yet. Capture something on a page and it shows up here.</p>'}
    </div>`;
    const pub = container.querySelector('.sidePub');
    if (pub) pub.addEventListener('click', async () => {
      pub.disabled = true; pub.textContent = 'Publishing';
      try { await onPublishNow(current.id); } catch (e) { pub.disabled = false; pub.textContent = 'Publish it now'; alert('Publishing failed. ' + (e.message || '')); }
    });
    const cp = container.querySelector('.sideCopy');
    if (cp) cp.addEventListener('click', async () => {
      const lab = cp.querySelector('span');
      try { await navigator.clipboard.writeText(permalinkOf(current.id)); if (typeof Fold !== 'undefined' && Fold.toss) Fold.toss(lab.parentElement); lab.textContent = 'Link copied'; } catch { lab.textContent = 'Copy failed'; }
      setTimeout(() => { lab.textContent = 'Copy link'; }, 2000);
    });
    container.querySelectorAll('.sideFeedBtn').forEach((b) => b.addEventListener('click', onFeed));
    const sd = container.querySelector('.sideDelBtn');
    if (sd) sd.addEventListener('click', () => {
      const p = sd.parentElement;
      p.innerHTML = 'Delete this annotation? <button type="button" class="link sdYes">Delete</button> <button type="button" class="link sdNo">Keep</button>';
      p.querySelector('.sdYes').addEventListener('click', (e) => { e.currentTarget.disabled = true; crumpleWhile(container.querySelector('.sideNow') || p, () => onDelete(current.id)); });
      p.querySelector('.sdNo').addEventListener('click', () => renderSide(container, { current, records, youId, permalinkOf, onOpen, onFeed, onDelete, onPublishNow, localAware }));
    });
    container.querySelectorAll('.sideList li button').forEach((b) => b.addEventListener('click', () => onOpen(b.dataset.id)));
  }

  // True when two captures are the same clip or the same passage.
  function sameSource(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'video') return (a.videoId || a.url) === (b.videoId || b.url) && Math.abs(a.start - b.start) < 0.3 && Math.abs(a.end - b.end) < 0.3;
    if (a.kind === 'audio') return a.url === b.url && Math.abs(a.start - b.start) < 0.3 && Math.abs(a.end - b.end) < 0.3;
    // The same post quoting different words is a different annotation.
    if (a.kind === 'post') return ((a.id && a.id === b.id) || a.url === b.url) && (a.quote || '') === (b.quote || '');
    return a.text === b.text && (a.meta.url || '') === (b.meta.url || '');
  }

  return { signInPrompt, twoWays, Folded, GMARK, XMARK, renderMissing, kindLabel, sameSource, render, renderFeed, renderSide, renderBrowse, xText, xUrl, srcUrlOf, titleOf, relTime, setMe, mineCount, stopClock };
})();
