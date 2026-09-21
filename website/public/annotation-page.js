// The public annotation page and the feed. Shared by the extension and the preview.
// AnnotationPage.render(container, opts, hooks) -> Promise<{ setStats, hideBanner }>
//   opts:  { id, item, take, permalink, backLabel, showBanner, stats, comments, reactions, created, records }
//   hooks: { onBack, onHome, onProfile, onTag(tag), onOpen(id), onDismissBanner, onComments(list), onReactions(list), onPollVote(i), onOpenSource(item), onDelete, onEdit({ text, tag }) }
// AnnotationPage.renderFeed(container, { records, tag, mode: 'home' | 'profile', onOpen(id), onTag(tag), onAll(), onHome(), onProfile() })
const AnnotationPage = (() => {
  const { esc, fmt } = PanelKit;

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
  const statsLine = (st) => `${plural(st.annotations, 'annotation')}, ${plural(st.followers || 0, 'follower')}${st.following !== undefined ? `, ${st.following} following` : ''}`;

  function xText(item, take) {
    const src = titleOf(item);
    const tail = ` (on "${src}")`;
    const room = 280 - 24 - tail.length;
    let t = take.text || '';
    if (t.length > room) t = t.slice(0, Math.max(0, room - 1)).trimEnd() + '…';
    return t ? t + tail : `On "${src}"`;
  }
  const xUrl = (item, take, permalink) => `https://x.com/intent/post?text=${encodeURIComponent(xText(item, take))}&url=${encodeURIComponent(permalink)}`;
  const srcUrlOf = (item) => item.kind === 'video' ? `https://www.youtube.com/watch?v=${item.videoId}&t=${Math.floor(item.start)}s`
    : item.kind === 'post' || item.kind === 'audio' ? item.url : item.fragmentUrl;
  const titleOf = (item) => item.kind === 'video' || item.kind === 'audio' ? item.title : item.kind === 'post' ? `${item.author} on X` : item.meta.title;
  const kindLabel = (item) => ({ video: 'Video', post: 'Post', article: 'Article', audio: 'Podcast' }[item.kind] || 'Article');
  const TAGS = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'];
  const fmtDate = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; };

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
        <p class="note">Use this if the clip uses your work beyond fair use. The clip stays up while the claim is reviewed.</p>
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
        catch (err) { send.disabled = false; send.textContent = 'Send claim'; alert('The claim could not be sent. ' + (err.message || '')); return; }
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
  function shell(container, { active, onHome, onProfile }) {
    container.classList.add('site');
    container.innerHTML = `
      <header class="sitebar">
        <button type="button" class="wmBtn navHome" aria-label="annotated home">${Brand.wordmark()}</button>
        <nav class="sitenav" aria-label="Site">
          <button type="button" class="navBtn navHome" ${active === 'home' ? 'aria-current="page"' : ''}>${Brand.icon('home')} Home</button>
          <button type="button" class="navBtn navProfile" ${active === 'profile' ? 'aria-current="page"' : ''}>${av('xs')} You</button>
        </nav>
      </header>
      <div class="sitegrid"><div class="sitemain"></div><aside class="rail" aria-label="More"></aside></div>`;
    container.querySelectorAll('.navHome').forEach((b) => b.addEventListener('click', () => onHome && onHome()));
    container.querySelector('.navProfile').addEventListener('click', () => onProfile && onProfile());
    return { main: container.querySelector('.sitemain'), rail: container.querySelector('.rail') };
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
    document.addEventListener('click', (e) => { if (!m.contains(e.target)) close(); });
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
  const mineCount = (records) => records.filter((r) => r.mine || !r.author).length;
  // Saved on this computer and nowhere else, so nobody else's feed has it.
  const onlyHere = (r) => !r.cloud && !r.author;
  function railYou(stats) {
    return `<section class="railcard"><div class="who">${av('')}<div><div class="name">${esc(me.name)} <span class="uname">${esc(meHandle())}</span></div>
      <div class="stats">${statsLine(stats)}</div></div></div></section>`;
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
    if (!social.people.length) return '';
    return `<section class="railcard"><h2>People worth following</h2><ul class="peopleList">${social.people.map((p) => `<li>
        <button type="button" class="railPerson" data-handle="${esc(p.handle)}">${pAv(p, 'sm')}<span class="rlText"><span class="rlTake">${esc(p.name)}</span><span class="note">@${esc(p.handle)}. ${plural(p.annotations, 'annotation')} this month</span></span></button>
        <button type="button" class="ghost sm followBtn" data-id="${esc(p.id)}" aria-pressed="false">Follow</button></li>`).join('')}</ul></section>`;
  }
  function railTrending(social) {
    const t = social && social.trending;
    if (!t || (!t.sources.length && !t.tags.length)) return '';
    return `<section class="railcard"><h2>Trending this week</h2>
      ${t.sources.length ? `<ul class="raillist trend">${t.sources.map((x) => `<li><button type="button" class="railOpen" data-id="${esc(x.sample_id)}"><span class="rlKind">${kindIcon({ kind: x.kind })}</span><span class="rlText"><span class="rlTake">${esc(x.title)}</span><span class="note">${plural(Number(x.annotations), 'annotation')}${Number(x.activity) > Number(x.annotations) ? (() => { const n = Number(x.activity) - Number(x.annotations); return `, ${n} ${n === 1 ? 'reply or reaction' : 'replies and reactions'}`; })() : ''}</span></span></button></li>`).join('')}</ul>` : ''}
      ${t.tags.length ? `<div class="tagcloud">${t.tags.map((x) => `<button type="button" class="tagpill railTag" data-tag="${esc(x.tag)}">${esc(x.tag)} <span class="num">${x.uses}</span></button>`).join('')}</div>` : ''}</section>`;
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
        if (ok === false) set(!on);
        else { const n = root.querySelector(`.followCount[data-id="${b.dataset.id}"]`); if (n) n.textContent = String(Math.max(0, Number(n.textContent) + (on ? 1 : -1))); }
      });
    });
    root.querySelectorAll('.railPerson').forEach((b) => b.addEventListener('click', () => social.onPerson && social.onPerson(b.dataset.handle)));
  }
  function railList(list) {
    return `<ul class="raillist">${list.map((r) => `<li><button type="button" class="railOpen" data-id="${esc(r.id)}"><span class="rlKind">${kindIcon(r.item)}</span><span class="rlText"><span class="rlTake">${esc(r.take.text || 'Voice note')}</span><span class="note">${esc(withTime(titleOf(r.item), relTime(r.created)))}</span></span></button></li>`).join('')}</ul>`;
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
      <p>Highlight a passage, clip a video or a podcast, or save a post, then say what you think. Every annotation links back to its source.</p>
      <p class="note">${Brand.icon('flag')} If an annotation uses your work unfairly, File a claim sends it for review.</p></section>`;
  }

  // A comment made only of emoji (up to six) shows large.
  const isJumbo = (t) => { const s = String(t).trim(); return !!s && [...s.replace(/[\u200d\ufe0f\s]/g, '')].length <= 12 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200d\ufe0f\s])+$/u.test(s); };
  // "Title. Just now", without a stray period after a title that already ends in punctuation.
  const withTime = (t, when) => (/[.?!…]["”']?$/.test(String(t).trim()) ? `${t} ${when}` : `${t}. ${when}`);
  // Who "you" are: the signed-in account when there is one, otherwise the local placeholder.
  let me = { name: 'You', handle: '', avatar: '' };
  const setMe = (p) => { me = p ? { name: p.name || 'You', handle: p.handle || '', avatar: p.avatar || '' } : { name: 'You', handle: '', avatar: '' }; };
  const meHandle = () => (me.handle ? '@' + me.handle : '@you');
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
  const reactEmojis = (list) => normR(list).map((r) => r.emoji);
  // Shared annotations come from other people's accounts, so every address is checked before it goes on the page.
  // Links must be web addresses. Images may also be data or blob addresses made by this extension.
  const safeLink = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const safeImg = (u) => (/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);|blob:)/i.test(String(u || '')) ? String(u) : '');
  const kindIcon = (item) => Brand.icon({ video: 'clip', post: 'post', article: 'article', audio: 'podcast' }[item.kind] || 'article');

  /* ---------------- annotation page ---------------- */
  async function render(container, opts, hooks = {}) {
    const { item, take, permalink, backLabel } = opts;
    const records = opts.records || [];
    const showBanner = opts.showBanner !== false;
    let stats = opts.stats || { annotations: mineCount(records) || 1, followers: 0 };
    const isVideo = item.kind === 'video', isPost = item.kind === 'post', isAudio = item.kind === 'audio';
    const srcUrl = safeLink(srcUrlOf(item)) || '#', title = titleOf(item);
    // Clip addresses made for the previous annotation shown here are released first.
    (container._urls || []).forEach((u) => URL.revokeObjectURL(u));
    container._urls = [];
    const own = (u) => { container._urls.push(u); return u; };
    const clipUrl = isVideo || isAudio ? (item.blob ? own(URL.createObjectURL(item.blob)) : safeLink(item.mediaUrl) || null) : null;
    const voiceUrl = take.voice ? (take.voice.blob ? own(URL.createObjectURL(take.voice.blob)) : safeLink(take.voice.url) || null) : null;
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
        <blockquote><mark>${esc(item.text)}</mark></blockquote>
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
    const source = isAudio ? srcBar(item.show || 'Podcast', '', 'Listen to the episode')
      : isPost ? '' : isVideo ? srcBar('YouTube', item.channel || '', `Watch from ${fmt(item.start)}`) : `
      ${item.meta.image || item.shot ? cardOpen : cardOpen.replace('class="srccard', 'class="srccard noimg')}
        ${safeImg(item.meta.image) ? `<img src="${esc(safeImg(item.meta.image))}" alt="">` : safeImg(item.shot) ? `<img class="topleft" src="${esc(safeImg(item.shot))}" alt="">` : ''}
        <span class="scard"><span class="skind">${kindIcon(item)} ${esc(item.meta.site)}</span><span class="st">${esc(title)}</span>${item.meta.description ? `<span class="sdesc">${esc(item.meta.description)}</span>` : ''}<span class="sd">${esc([item.meta.author ? 'By ' + item.meta.author : '', fmtDate(item.meta.published)].filter(Boolean).join('. '))}</span></span>
      ${cardClose}`;

    const { main, rail } = shell(container, { active: null, onHome: hooks.onHome, onProfile: hooks.onProfile });
    main.classList.add('ann', 'loading');
    main.innerHTML = `
      <div class="loadmsg" role="status" aria-label="Loading the annotation">
        <div class="skel" aria-hidden="true"><div class="sk skwho"></div><div class="sk skline w90"></div><div class="sk skline w60"></div><div class="sk skblock"></div><div class="sk skline w40"></div></div>
      </div>
      <div class="annBody">
        ${showBanner ? `<div class="banner toast" role="status">
          <div class="toastRow">
            <span class="toastCheck">${Brand.icon('check')}</span>
            <b class="toastText">${opts.localOnly ? 'Saved on this computer' : 'Published'}</b>
            ${opts.localOnly ? '<span class="toastSub">Sign in and publish it again to share it.</span>' : ''}
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
        ${hooks.onBack ? `<button type="button" class="quiet back">${Brand.icon('arrowLeft')} ${esc(backLabel || 'Back')}</button>` : ''}
        ${opts.localOnly ? `<p class="localNote" role="status">${Brand.icon('info')} <span>This annotation is only on this computer.</span>${hooks.onShareNow ? '<button type="button" class="strong sm shareNow">Publish it now</button>' : '<span class="note">Sign in from the panel to share it.</span>'}</p>` : ''}
        <article class="annCard">
          <header class="who">
            <button type="button" class="avatar asLink profileLink ${(opts.author || me).avatar ? 'hasImg' : ''}" aria-label="${opts.author && !opts.mine ? esc(pName(opts.author)) + "'s profile" : 'Your profile'}">${opts.author ? pInner(opts.author) : avInner()}</button>
            <div><div class="name"><button type="button" class="asLink profileLink">${esc(pName(opts.author))}</button> <span class="uname">${esc(pHandle(opts.author))}</span>
              ${opts.author && !opts.mine && opts.social && opts.social.onFollow ? `<button type="button" class="ghost sm followBtn inline" data-id="${esc(opts.author.id)}" ${opts.social.followsAuthor ? 'data-on="1"' : ''}>Follow</button>` : ''}</div>
              <time class="when" datetime="${new Date(created).toISOString()}">${relTime(created)}</time></div>
            <span class="tagSlot">${take.tag ? `<button type="button" class="tag tagLink" title="See all ${esc(take.tag)} annotations">${esc(take.tag)}</button>` : ''}</span>
          </header>
          <p class="take" ${take.text ? '' : 'hidden'}>${esc(take.text || '')}</p>
          <div class="editBox" hidden></div>
          ${voiceUrl ? `<div class="vnote">${Brand.icon('mic')}<audio class="pageVoice" controls src="${esc(voiceUrl)}"></audio></div>` : ''}
          <div class="mediaUnit ${isVideo || isAudio ? 'av' : ''}">
            <div class="media">${media}${isPost && item.quote ? `<figure class="pq postQuote"><blockquote><mark>${esc(item.quote)}</mark></blockquote></figure>` : ''}</div>
            ${isVideo || isAudio ? source : ''}
            <div class="pollBox" ${take.poll ? '' : 'hidden'}></div>
          </div>
          ${isVideo || isAudio ? '' : source}
          <div class="reactHost" hidden></div>
          <div class="actions">
            <button type="button" class="ghost sm reactBtn" aria-label="Add a reaction">${Brand.icon('smile')} React</button>
            <span class="mwrap" ${opts.localOnly ? 'hidden' : ''}><button type="button" class="ghost sm shareBtn">${Brand.icon('share')} Share</button></span>
            ${hooks.onEdit || hooks.onDelete ? `<span class="mwrap"><button type="button" class="quiet moreBtn" aria-label="More options">${Brand.icon('more', 'lg')}</button></span>` : ''}
            <button type="button" class="claim">${Brand.icon('flag')} File a claim</button>
          </div>
          <div class="delWrap" hidden></div>
        </article>
        <section class="comments" aria-label="Comments">
          <h3 class="cTitle">Comments</h3>
          <textarea class="cText" rows="2" aria-label="Add a comment" placeholder="Add a comment. Type : for emoji. Ctrl or Cmd + Enter posts it."></textarea>
          <div class="cRow"><span class="cEmojiSlot"></span><button type="button" class="strong sm cPost">Comment</button></div>
          <ul class="cList"></ul>
          <button type="button" class="link cMore" hidden></button>
        </section>
      </div>`;
    const same = records.filter((r) => r.id !== opts.id && sameSourceDoc(r.item, item));
    const social = opts.social || null;
    rail.innerHTML = railYou(social && social.you ? social.you : stats)
      + (same.length ? `<section class="railcard"><h2>More on this source</h2>${railList(same)}</section>` : '')
      + railRecent(records.filter((r) => r.id !== opts.id && !same.includes(r)))
      + railTrending(social) + railFollow(social) + railTags(records) + railAbout();
    const q = (s) => container.querySelector(s);

    // Share and more menus
    // Tall post screenshots (a post with a video, say) start at a fixed height with a button to show all of it.
    const xs = q('.xshot img');
    if (xs) {
      const fit = () => { const f = q('.xshotFrame'); if (f && xs.clientHeight > 480 && !f.classList.contains('open')) { f.classList.add('tall'); q('.xshotMore').hidden = false; } };
      if (xs.complete) fit(); else xs.addEventListener('load', fit, { once: true });
      q('.xshotMore').addEventListener('click', () => { const f = q('.xshotFrame'); const open = f.classList.toggle('open'); f.classList.toggle('tall', !open); q('.xshotMore').textContent = open ? 'Show less' : 'Show the whole post'; });
    }
    if (q('.shareNow')) q('.shareNow').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Publishing';
      try { await hooks.onShareNow(); } catch (err) { b.disabled = false; b.textContent = 'Publish it now'; alert('Sharing failed. ' + (err.message || '')); }
    });
    const share = menu(q('.shareBtn'), `
      <button type="button" role="menuitem" class="copyBtn">${Brand.icon('link')} <span class="cpText">Copy link</span></button>
      <a role="menuitem" href="${xUrl(item, take, permalink)}" target="_blank" rel="noopener" data-close>${Brand.icon('x')} Post to X</a>`);
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
    if (showBanner) { q('.annCard').classList.add('fresh'); setTimeout(() => { const c = q('.annCard'); if (c) c.classList.remove('fresh'); }, 2200); }

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
          <div class="kindLabel">Kind <span>(optional)</span></div>
          <div class="tags" role="radiogroup" aria-label="Kind of annotation">${TAGS.map((t) => `<button type="button" class="tagbtn" role="radio" aria-checked="${t === tag}">${t}</button>`).join('')}</div>
          <textarea class="editText" rows="3" maxlength="500" aria-label="Your take"></textarea>
          <p class="error editErr" hidden>Add a written take, or keep the voice note.</p>
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
          if (!text && !take.voice) { box.querySelector('.editErr').hidden = false; return; }
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
        del.querySelector('.delYes').addEventListener('click', () => hooks.onDelete());
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
        try { await navigator.clipboard.writeText(permalink); lab.textContent = 'Copied'; tc.classList.add('done'); } catch { lab.textContent = 'Copy failed'; }
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
      try { await navigator.clipboard.writeText(permalink); lab.textContent = 'Link copied'; cp.classList.add('done'); cp.querySelector('svg').outerHTML = Brand.icon('check'); }
      catch { lab.textContent = 'Copy failed'; }
      clearTimeout(cpTimer);
      cpTimer = setTimeout(() => { lab.textContent = 'Copy link'; cp.classList.remove('done'); cp.querySelector('svg').outerHTML = Brand.icon('link'); }, 2000);
    });
    q('.claim').addEventListener('click', () => {
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
            ${!c.author || c.mine ? `<button type="button" class="link cDel" data-t="${c.t}">Delete</button>` : ''}</div><p class="${isJumbo(c.text) ? 'jumbo' : ''}">${esc(c.text)}</p><div class="cReact" data-t="${c.t}"></div></div></li>`).join('')
        : '<li class="empty">No comments yet. Start the conversation.</li>';
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
    const post = () => {
      const txt = q('.cText').value.trim();
      if (!txt) return;
      const added = { text: txt, t: Date.now(), mine: true };
      comments.push(added);
      q('.cText').value = '';
      drawComments();
      hooks.onComments && hooks.onComments(comments.slice(), { added });
    };
    q('.cPost').addEventListener('click', post);
    q('.cEmojiSlot').replaceWith(EmojiKit.button(q('.cText')));
    EmojiKit.autocomplete(q('.cText'));

    // Reactions on the annotation. Until there are accounts, every reaction shown is yours.
    EmojiKit.reactions(q('.reactHost'), { list: opts.reactions || [], addButton: q('.reactBtn'), onChange: (list, change) => hooks.onReactions && hooks.onReactions(list, change) });

    // Poll: tap an option to vote. With no accounts yet, your vote is the only one.
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
      }).join('') + `<p class="note pollNote">${voted ? `${total} vote${total === 1 ? '' : 's'}. Tap another option to change yours.` : total ? `${total} vote${total === 1 ? '' : 's'} so far. Tap an option to vote.` : 'Tap an option to vote.'}</p>`;
      box.querySelectorAll('.pollOpt').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        if (p.counts) { if (p.vote !== null && p.vote !== undefined) p.counts[p.vote]--; if (p.vote !== i) p.counts[i]++; }
        p.vote = p.vote === i ? null : i;
        drawPollBox();
        hooks.onPollVote && hooks.onPollVote(p.vote);
      }));
    };
    drawPollBox();
    q('.cText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });
    drawComments();
    setInterval(() => { drawComments(); q('.when').textContent = relTime(created); }, 30000);

    // Source links jump back to the original when the shell can do it (the preview), otherwise they open normally.
    if (jump) container.querySelectorAll('.srcJump').forEach((b) => b.addEventListener('click', () => hooks.onOpenSource(item)));

    return {
      setStats(s) { stats = s; const e = q('.rail .stats'); if (e) e.textContent = statsLine(stats); },
      hideBanner() { const b = q('.banner'); if (b) b.remove(); },
    };
  }
  // Same source document, ignoring which part was captured.
  function sameSourceDoc(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'video') return a.videoId === b.videoId;
    if (a.kind === 'audio') return a.url === b.url;
    if (a.kind === 'post') return (a.id && a.id === b.id) || a.url === b.url;
    return (a.meta.url || '') === (b.meta.url || '');
  }

  /* ---------------- feed ---------------- */
  // Home shows everything on annotated, your profile shows yours, and a tag shows one tag. Follows need accounts.
  // social (optional): { you, people, trending, onFollow, onPerson, personStats, followsPerson,
  //   tabs: { current: 'foryou' | 'following' | 'everyone', onTab, note } } for the home feed's tabs.
  function renderFeed(container, { records, tag, mode = 'home', person = null, getMedia = null, social = null, onOpen, onTag, onAll, onHome, onProfile }) {
    let filter = 'all', sort = 'new';
    const { main, rail } = shell(container, { active: tag ? null : mode, onHome: onHome || onAll, onProfile: onProfile || onAll });
    // Most discussed: comments and reactions together, newest first on ties.
    const buzz = (r) => (r.comments || []).length + reactTotal(r.reactions) + (r.take.poll && r.take.poll.vote != null ? 1 : 0);
    main.classList.add('ann', 'feed');
    const draw = () => {
      // "For you" arrives already ranked, so its order is kept.
      const ranked = social && social.tabs && social.tabs.current === 'foryou' && mode === 'home' && !tag;
      const list = records.filter((r) => (!tag || r.take.tag === tag) && (filter === 'all' || r.item.kind === filter));
      if (!ranked) list.sort((a, b) => (sort === 'hot' ? buzz(b) - buzz(a) : 0) || b.created - a.created);
      const scope = records.filter((r) => !tag || r.take.tag === tag);
      const counts = { all: scope.length, video: 0, audio: 0, article: 0, post: 0 };
      scope.forEach((r) => { counts[r.item.kind] = (counts[r.item.kind] || 0) + 1; });
      // Every kind stays selectable, because each empty state says how to make one. Only the zeros are dropped,
      // so the row stops reading like a scoreboard of nothing.
      const kinds = [['all', 'All'], ['video', 'Clips'], ['audio', 'Audio'], ['article', 'Passages'], ['post', 'Posts']];
      main.innerHTML = `
        <header class="feedHead">
          ${tag ? `<h1>Tagged <span class="tag">${esc(tag)}</span></h1><button type="button" class="link allLink">See everything</button>`
            : mode === 'profile' ? `<div class="who">${pAv(person, 'lg')}<div><h1 class="name">${esc(pName(person))} <span class="uname">${esc(pHandle(person))}</span></h1>
               <div class="stats">${plural(records.length, 'annotation')}, <span class="followCount num" data-id="${esc(person ? person.id : '')}">${social && social.personStats ? social.personStats.followers : 0}</span> follower${social && social.personStats && social.personStats.followers === 1 ? '' : 's'}, ${social && social.personStats ? social.personStats.following : 0} following</div>
               ${person && social && social.onFollow ? `<button type="button" class="ghost sm followBtn" data-id="${esc(person.id)}" ${social.followsPerson ? 'data-on="1"' : ''}>Follow</button>` : ''}</div></div>`
            : `<h1>Home</h1><p class="note stats">${social && social.tabs ? esc(social.tabs.note || '') : `${plural(records.length, 'annotation')} from everyone, newest first.`}</p>`}
        </header>
        ${!tag && mode === 'home' && social && social.tabs ? `<div class="seg feedTabs" role="radiogroup" aria-label="Which annotations">
          ${[['foryou', 'For you'], ['following', 'Following'], ['everyone', 'Everyone']].map(([k, l]) => `<label><input type="radio" name="ft" value="${k}" ${social.tabs.current === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>` : ''}
        <div class="seg feedFilter" role="radiogroup" aria-label="Show">
          ${kinds.map(([k, l]) => `<label><input type="radio" name="ff" value="${k}" ${filter === k ? 'checked' : ''}><span>${l}${counts[k] ? ` <span class="num">${counts[k]}</span>` : ''}</span></label>`).join('')}
        </div>
        <div class="feedSortRow" ${social && social.tabs && social.tabs.current === 'foryou' && mode === 'home' && !tag ? 'hidden' : ''}><div class="feedSort seg" role="radiogroup" aria-label="Sort">
          <label><input type="radio" name="fs" value="new" ${sort === 'new' ? 'checked' : ''}><span>Newest</span></label>
          <label><input type="radio" name="fs" value="hot" ${sort === 'hot' ? 'checked' : ''}><span>Most discussed</span></label>
        </div></div>
        <ul class="cards">${list.length ? list.map((r) => {
          const it = r.item;
          // Posts get no thumbnail: a shrunken screenshot of text is unreadable, so the snippet carries it.
          const thumb = safeImg(it.kind === 'video' ? it.poster : it.kind === 'audio' ? (it.artwork || it.poster) : it.kind === 'post' ? null : (it.meta.image || it.shotThumb || it.shot));
          // Break at a word. Cutting mid-word gave things like 'years. Ove…'.
          const cut = (t, n) => { if (t.length <= n) return t; const s = t.slice(0, n); const sp = s.lastIndexOf(' '); return (sp > n * 0.6 ? s.slice(0, sp) : s).trimEnd() + '…'; };
          const brief = (it.end - it.start) < 10;
          const range = `${fmt(it.start, brief)} to ${fmt(it.end, brief)}${it.duration > 0 ? ` of ${fmt(it.duration)}` : ''}`;
          const snippet = it.kind === 'video' ? `YouTube${it.channel ? ', ' + it.channel : ''}. Clip ${range}`
            : it.kind === 'audio' ? `${it.show || 'Podcast'}. Audio clip ${range}`
            : it.kind === 'post' ? (it.text ? `"${cut(it.text, 160)}"` : 'Post') : `"${cut(it.text, 120)}"`;
          const srcTitle = it.kind === 'post' ? `${it.author}${it.handle ? ' ' + it.handle : ''}` : it.kind === 'article' && it.meta.site ? `${it.meta.site}: ${titleOf(it)}` : titleOf(it);
          const playable = (it.kind === 'video' || it.kind === 'audio') && (it.blob || it.mediaUrl || it.hasMedia);
          // Stats row: reactions, poll and comments, each only when there is something to count.
          const nC = (r.comments || []).length, nReact = reactTotal(r.reactions), poll = r.take.poll;
          const stats = [];
          if (nReact) stats.push(`<span class="fStat fReact" aria-label="${plural(nReact, 'reaction')}">${reactEmojis(r.reactions).slice(0, 4).join('')}<span class="num">${nReact}</span></span>`);
          if (poll) stats.push(`<span class="fStat" aria-label="Poll">${Brand.icon('poll')}${poll.vote !== null && poll.vote !== undefined ? '1 vote' : 'Poll'}</span>`);
          if (nC) stats.push(`<span class="fStat" aria-label="${plural(nC, 'comment')}">${Brand.icon('comment')}<span class="num">${nC}</span></span>`);
          if (r.take.voice) stats.push(`<span class="fStat" aria-label="Voice note">${Brand.icon('mic')}Voice</span>`);
          return `<li class="cardItem"><button type="button" class="card ${thumb ? '' : 'nothumb'}" data-id="${esc(r.id)}">
            <span class="cbody">
              <span class="cmeta">${pAv(r.author && !r.mine ? r.author : null, 'xs')} ${esc(pName(r.author && !r.mine ? r.author : null))} <span class="dotsep">${relTime(r.created)}</span>${r.take.tag ? ` <span class="tag sm">${esc(r.take.tag)}</span>` : ''}${onlyHere(r) ? ' <span class="localTag">On this computer</span>' : ''}</span>
              <span class="ctake">${esc(r.take.text || (r.take.voice ? 'Voice note' : ''))}</span>
              <span class="csource">${kindIcon(it)}<span><span class="cst">${esc(srcTitle)}</span><span class="csn">${esc(snippet)}</span></span></span>
              ${stats.length ? `<span class="fStats">${stats.join('')}</span>` : ''}
            </span>
            ${thumb && !playable ? `<span class="cthumb"><img src="${esc(thumb)}" alt=""></span>` : thumb ? '<span class="cthumb ghost" aria-hidden="true"></span>' : ''}
          </button>
          ${thumb && playable ? `<button type="button" class="cthumb cplayBtn" data-id="${esc(r.id)}" aria-label="Play the ${it.kind === 'audio' ? 'audio' : 'clip'} here" aria-expanded="false"><img src="${esc(thumb)}" alt=""><span class="cdur num">${fmt(it.end - it.start)}</span><span class="cplay">${Brand.icon('play')}</span></button>` : ''}
          </li>`;
        }).join('') : `<li class="emptyState"><p class="esTitle">Nothing here yet</p><p>${social && social.tabs && social.tabs.current === 'following' ? 'Follow someone and their annotations show up here.' : { all: 'Publish an annotation from the panel and it shows up here.', video: 'Open a YouTube video and capture a clip from the panel.', audio: 'Open a podcast episode and clip it from the panel.', article: 'Select a passage in any article and click Annotate.', post: 'Open a post on X and capture it from the panel.' }[filter]}</p></li>`}</ul>`;
      rail.innerHTML = railYou(social && social.you ? social.you : { annotations: mineCount(records), followers: 0 }) + railTrending(social) + railFollow(social) + railTags(records) + railAbout();
      main.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => onOpen(c.dataset.id)));
      main.querySelectorAll('.feedFilter input').forEach((i) => i.addEventListener('change', () => { filter = i.value; draw(); }));
      main.querySelectorAll('.feedSort input').forEach((i) => i.addEventListener('change', () => { sort = i.value; draw(); }));
      // Clips and audio play right in the feed. Opening the annotation stays a click on the card.
      main.querySelectorAll('.cplayBtn').forEach((b) => b.addEventListener('click', async () => {
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
  function renderSide(container, { current, records, permalinkOf, onOpen, onFeed, onDelete, onPublishNow, localAware = false }) {
    const list = records.slice().sort((a, b) => b.created - a.created);
    const statsOf = (r) => {
      const nC = (r.comments || []).length, nR = reactTotal(r.reactions), bits = [];
      if (nR) bits.push(`<span class="fStat fReact">${reactEmojis(r.reactions).slice(0, 4).join('')}<span class="num">${nR}</span></span>`);
      if (r.take.poll) bits.push(`<span class="fStat">${Brand.icon('poll')}Poll</span>`);
      if (nC) bits.push(`<span class="fStat">${Brand.icon('comment')}<span class="num">${nC}</span></span>`);
      return bits.length ? `<span class="fStats">${bits.join('')}</span>` : '';
    };
    container.innerHTML = `<div class="annside">
      ${current ? `<section class="sideNow" aria-label="This annotation">
        <div class="snHead"><span class="rlKind">${kindIcon(current.item)}</span><span class="snLabel">This annotation</span>${current.take.tag ? `<span class="tag sm">${esc(current.take.tag)}</span>` : ''}</div>
        <p class="snTake">${esc(current.take.text || (current.take.voice ? 'Voice note' : 'Untitled'))}</p>
        <p class="note snSrc">${esc(withTime(titleOf(current.item), relTime(current.created)))}</p>
        ${statsOf(current)}
        ${!localAware || current.cloud || current.author ? `<div class="row"><button type="button" class="ghost sm sideCopy">${Brand.icon('link')} <span>Copy link</span></button>
          <a class="ghost sm" target="_blank" rel="noopener" href="${xUrl(current.item, current.take, permalinkOf(current.id))}">${Brand.icon('x')} Post to X</a></div>`
          : `<p class="note snLocal">${Brand.icon('info')} Only on this computer, so there is no link to share yet.</p>
          ${onPublishNow ? '<p class="row"><button type="button" class="strong sm sidePub">Publish it now</button></p>' : ''}`}
        ${onDelete ? '<p class="sideDel"><button type="button" class="link sideDelBtn">Delete this annotation</button></p>' : ''}
      </section>` : ''}
      <div class="sideListHead"><h2>Your annotations</h2><button type="button" class="link sideFeed">Open your profile</button></div>
      <ul class="sideList">${list.map((r) => {
        const now = current && r.id === current.id;
        return `<li><button type="button" data-id="${esc(r.id)}" ${now ? 'aria-current="page"' : ''}>
          <span class="rlKind">${kindIcon(r.item)}</span>
          <span class="rlText"><span class="rlTake">${esc(r.take.text || (r.take.voice ? 'Voice note' : 'Untitled'))}${localAware && onlyHere(r) ? ' <span class="localTag">On this computer</span>' : ''}</span><span class="note">${esc(withTime(titleOf(r.item), relTime(r.created)))}</span></span>
          ${now ? '<span class="nowBadge">Viewing</span>' : ''}</button></li>`;
      }).join('')}</ul>
    </div>`;
    const pub = container.querySelector('.sidePub');
    if (pub) pub.addEventListener('click', async () => {
      pub.disabled = true; pub.textContent = 'Publishing';
      try { await onPublishNow(current.id); } catch (e) { pub.disabled = false; pub.textContent = 'Publish it now'; alert('Publishing failed. ' + (e.message || '')); }
    });
    const cp = container.querySelector('.sideCopy');
    if (cp) cp.addEventListener('click', async () => {
      const lab = cp.querySelector('span');
      try { await navigator.clipboard.writeText(permalinkOf(current.id)); lab.textContent = 'Link copied'; } catch { lab.textContent = 'Copy failed'; }
      setTimeout(() => { lab.textContent = 'Copy link'; }, 2000);
    });
    container.querySelector('.sideFeed').addEventListener('click', onFeed);
    const sd = container.querySelector('.sideDelBtn');
    if (sd) sd.addEventListener('click', () => {
      const p = sd.parentElement;
      p.innerHTML = 'Delete this annotation? <button type="button" class="link sdYes">Delete</button> <button type="button" class="link sdNo">Keep</button>';
      p.querySelector('.sdYes').addEventListener('click', () => onDelete(current.id));
      p.querySelector('.sdNo').addEventListener('click', () => renderSide(container, { current, records, permalinkOf, onOpen, onFeed, onDelete }));
    });
    container.querySelectorAll('.sideList li button').forEach((b) => b.addEventListener('click', () => onOpen(b.dataset.id)));
  }

  // True when two captures are the same clip or the same passage.
  function sameSource(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'video') return a.videoId === b.videoId && Math.abs(a.start - b.start) < 0.3 && Math.abs(a.end - b.end) < 0.3;
    if (a.kind === 'audio') return a.url === b.url && Math.abs(a.start - b.start) < 0.3 && Math.abs(a.end - b.end) < 0.3;
    // The same post quoting different words is a different annotation.
    if (a.kind === 'post') return ((a.id && a.id === b.id) || a.url === b.url) && (a.quote || '') === (b.quote || '');
    return a.text === b.text && (a.meta.url || '') === (b.meta.url || '');
  }

  return { kindLabel, sameSource, render, renderFeed, renderSide, xText, xUrl, srcUrlOf, titleOf, relTime, setMe };
})();
