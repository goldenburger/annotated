// The four scenes on the front page, each one a small working version of the tool rather than a drawing of it.
// A passage and a post are selected and marked with the extension's own pen (ArticleCore). A clip and a
// podcast moment are cut with a trimmer whose handles drag like the panel's: three seconds at the least,
// ninety at the most, and the arrow keys move a handle by a second (five with Shift). The clip and the moment
// are real: a NASA video and a NASA podcast episode, both public domain, served from this site, with a filmstrip
// and a waveform made from the files themselves (media/). Play selection plays the stretch with its sound. Each
// ends as the brief's try-it does: a take, and the card it becomes, which plays the clip. Nothing is sent.
var SceneTry = (() => {
  const MIN = 3, MAX = 90;
  const INK = { hi: '#FFE14A', deep: '#F2C600', lift: '#FFEE9E' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PAUSE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>';

  function pen() {
    if (typeof ArticleCore === 'undefined' || document.querySelector('style[data-tryit-pen]')) return;
    const st = document.createElement('style'); st.dataset.tryitPen = '1';
    st.textContent = ArticleCore.penCss('chisel', INK); document.head.appendChild(st);
  }

  // The last part of every scene: the take box, then the card.
  function takeStep(root, { kind, what, source, kindIcon, onAgain, player = null, yours = () => ({}) }) {
    const t = root.querySelector('.stTake');
    t.hidden = false;
    // A post is shown as a screenshot, an embed or both, as the extension asks (Jason's round one feedback).
    const showAs = kind === 'post' ? `<div class="stShow"><span class="stShowL">Show the post as</span><span class="seg stShowSeg" role="radiogroup" aria-label="Show the post as">${['Screenshot', 'Embed', 'Both'].map((l, i) => `<button type="button" role="radio" class="stShowB" data-v="${l.toLowerCase()}" aria-checked="${i === 0}">${l}</button>`).join('')}</span></div>` : '';
    t.innerHTML = `${showAs}<label class="stLabel">Your take<textarea rows="2" maxlength="200" placeholder="What should people notice?"></textarea></label>
      <p class="stSay" role="status" hidden>Write a sentence first.</p>
      <p class="stRow"><button type="button" class="primary sm stMake" disabled>Make the annotation</button><button type="button" class="link stAgain">Start over</button></p>`;
    const box = t.querySelector('textarea'), make = t.querySelector('.stMake');
    let shown = 'screenshot';
    t.querySelectorAll('.stShowB').forEach((b) => b.addEventListener('click', () => {
      shown = b.dataset.v; t.querySelectorAll('.stShowB').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }));
    box.focus({ preventScroll: true });
    box.addEventListener('input', () => { make.disabled = !box.value.trim(); t.querySelector('.stSay').hidden = true; });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); make.click(); } });
    t.querySelector('.stAgain').addEventListener('click', onAgain);
    make.addEventListener('click', () => {
      const take = box.value.trim();
      if (!take) { t.querySelector('.stSay').hidden = false; return; }
      // It is the visitor's own take, so it is theirs, as on the brief's card, not an Example.
      t.innerHTML = `<article class="stCard"><p class="tiWho stWho"><span class="tiAv">${icon('user')}</span>You <span class="tiNow">just now</span></p><h4 class="stCardTake"></h4>
        <p class="stCardWhat"></p><div class="stCardPlay"></div><p class="stCardSrc">${icon(kindIcon)} <span></span></p></article>
        <p class="stRow"><button type="button" class="link stAgain">Make another</button></p>`;
      t.querySelector('.stCardTake').textContent = take;
      t.querySelector('.stCardWhat').textContent = what();
      t.querySelector('.stCardSrc span').textContent = source;
      if (player) t.querySelector('.stCardPlay').appendChild(player());
      if (kind === 'post') t.querySelector('.stCardPlay').appendChild(postAs(root, shown));
      t.querySelector('.stAgain').addEventListener('click', onAgain);
      root.classList.add('made');
      // The front page keeps your latest annotation in Latest on annotated, whichever tab it came from.
      document.dispatchEvent(new CustomEvent('annotated-scene-made', { detail: Object.assign({ kind, take, source, what: what(), card: t.querySelector('.stCard'), root }, yours()) }));
    });
  }

  // The post on the card, the way it was asked for. A screenshot is a picture of the post with the words marked,
  // kept even if the post is deleted; an embed is the post's words, linked; both is the two together.
  function postAs(root, how) {
    const box = document.createElement('div');
    box.className = 'stPostAs';
    const post = root.querySelector('.stStage .stPost');
    if (post && how !== 'embed') {
      const shot = document.createElement('figure'); shot.className = 'stShot';
      const copy = post.cloneNode(true); copy.removeAttribute('data-annotated-self');
      copy.querySelectorAll('[data-annotated-self]').forEach((x) => x.removeAttribute('data-annotated-self'));
      copy.querySelectorAll('a').forEach((a) => { a.removeAttribute('href'); a.setAttribute('tabindex', '-1'); });
      shot.appendChild(copy);
      shot.insertAdjacentHTML('beforeend', '<figcaption>Screenshot, kept even if the post is deleted</figcaption>');
      box.appendChild(shot);
      // The picture is taken where the quoted words are, as the extension's is, so they show in it.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const m = copy.querySelector('mark'); if (!m) return;
        copy.scrollTop = Math.max(0, m.offsetTop - copy.offsetTop - 40);
      }));
    }
    if (how !== 'screenshot') {
      const em = document.createElement('blockquote'); em.className = 'stEmbed';
      em.innerHTML = `<p class="stEmbedWho">${icon('x')} <b>${POST_WHO.name}</b> <span>${POST_WHO.handle} · ${POST_WHO.date}</span></p><p class="stEmbedText"></p><a class="link" href="${POST_URL}" target="_blank" rel="noopener">See the post on X</a>`;
      const pt = root.querySelector('.stPostText');
      em.querySelector('.stEmbedText').textContent = pt ? (pt.children.length ? [...pt.children].map((x) => ArticleCore.norm(x.textContent)).join(' ') : ArticleCore.norm(pt.textContent)) : '';
      box.appendChild(em);
    }
    return box;
  }

  // ---- words: a passage or a post, selected and marked with the real pen.
  function words(root, { kind, html, source, kindIcon, whole = null, forMe = '' }) {
    pen();
    root.innerHTML = `<div class="stStage">${html}</div>
      <div class="stBar"><p class="stHint" role="status">Select any words above.</p>
        ${forMe ? '<button type="button" class="link stForMe">Mark a sentence for me</button>' : ''}
        ${whole ? `<button type="button" class="link stWhole">${esc(whole)}</button>` : ''}
        <button type="button" class="stGo" hidden><i aria-hidden="true"></i>Annotate</button></div>
      <div class="stTake" hidden></div>`;
    const text = root.querySelector('[data-annotated-self]'), go = root.querySelector('.stGo'), hint = root.querySelector('.stHint');
    let marks = [], quote = '';
    const reset = () => {
      ArticleCore.clearHighlights(text); marks = []; quote = '';
      root.querySelector('.stTake').hidden = true; root.querySelector('.stTake').innerHTML = ''; root.classList.remove('made', 'taken');
      hint.textContent = 'Select any words above.'; go.hidden = true;
    };
    document.addEventListener('selectionchange', () => {
      if (root.classList.contains('taken')) return;
      const s = getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) { if (!go.hidden) { go.hidden = true; hint.textContent = 'Select any words above.'; } return; }
      const r = s.getRangeAt(0);
      if (!text.contains(r.commonAncestorContainer)) return;
      const n = ArticleCore.norm(r.toString()).split(' ').filter(Boolean).length;
      hint.textContent = n === 1 ? '1 word selected.' : `${n} words selected.`;
      go.hidden = false;
    });
    const mark = (range) => {
      const r = ArticleCore.expandToWords(range.cloneRange());
      quote = ArticleCore.norm(ArticleCore.quoteText(r));
      if (!quote) return;
      getSelection().removeAllRanges(); go.hidden = true;
      root.classList.add('taken');
      marks = ArticleCore.highlightRange(r);
      const ms = still() ? 0 : ArticleCore.sweep(marks);
      hint.textContent = kind === 'post' ? 'Those words become the quote, and the post is kept as it was.' : 'The same pen the extension uses on any page.';
      setTimeout(() => takeStep(root, { kind, what: () => `“${quote}”`, source, kindIcon, onAgain: reset, yours: () => ({ quote }) }), ms + 120);
    };
    go.addEventListener('mousedown', (e) => e.preventDefault());
    go.addEventListener('click', () => { const s = getSelection(); if (s && s.rangeCount && !s.isCollapsed) mark(s.getRangeAt(0)); });
    const fm = root.querySelector('.stForMe');
    if (fm) fm.addEventListener('click', () => { if (root.classList.contains('taken')) return; const r = ArticleCore.findText(text, forMe); if (r) mark(r); });
    const w = root.querySelector('.stWhole');
    if (w) w.addEventListener('click', () => { if (root.classList.contains('taken')) return; const r = document.createRange(); r.selectNodeContents(text.querySelector('.stPostText') || text); mark(r); });
  }

  // ---- time: a clip or a podcast moment, cut with two handles.
  function trimmer(root, { kind, duration, start, end, source, kindIcon, media }) {
    const video = kind === 'video';
    const N = video ? 10 : 64;
    root.innerHTML = `<div class="stStage">
        <p class="stSrc">${icon(kindIcon)}<a href="${esc(media.credit.href)}" target="_blank" rel="noopener"></a><span class="stSite">${esc(media.credit.site)}</span></p>
        ${video ? `<div class="stScreen"><video class="stMedia" preload="none" playsinline src="${esc(media.src)}"></video></div>` : `<audio class="stMedia" preload="none" src="${esc(media.src)}"></audio>`}
        <div class="stTrack" aria-label="${video ? 'The video' : 'The episode'}, ${fmt(duration)} long">
          ${video ? `<div class="stFrames">${'<span></span>'.repeat(N)}</div>` : `<div class="stWave">${'<span style="--v:.08"></span>'.repeat(N)}</div>`}
          <div class="stSel"><span class="stHead" hidden></span></div>
          <button type="button" class="stHandle a" aria-label="Start of the clip"></button>
          <button type="button" class="stHandle z" aria-label="End of the clip"></button>
        </div>
        <p class="stTimes"><span class="stRange"></span><span class="stLen"></span></p>
        <div class="stAll" aria-hidden="true"><span class="stWin"></span><span class="stDot"></span></div>
        <p class="stAllLbl"><span>0:00</span><span>${video ? 'Whole video' : 'Whole episode'}, ${fmt(duration)}</span></p>
      </div>
      <div class="stBar"><p class="stHint" role="status">Drag the ends, or the middle.</p>
        <button type="button" class="ghost sm stPlay">${icon('play')} <span>Play selection</span></button>
        <button type="button" class="stGo"><i aria-hidden="true"></i>Capture clip</button></div>
      <div class="stTake" hidden></div>`;
    root.querySelector('.stSrc a').textContent = media.credit.text;
    const track = root.querySelector('.stTrack'), sel = root.querySelector('.stSel'), ha = root.querySelector('.stHandle.a'), hz = root.querySelector('.stHandle.z');
    const el = root.querySelector('.stMedia'), head = root.querySelector('.stHead'), play = root.querySelector('.stPlay');
    let a = start, z = end;
    // A clip is seconds out of minutes, a sliver of any bar that long, so the track is a window of a few minutes
    // around it, and the whole length is the thin bar underneath, as in the panel.
    const span = Math.min(duration, video ? 150 : 180);
    let w0 = clamp((a + z) / 2 - span / 2, 0, duration - span), drawnW0 = -1;
    const pct = (t) => ((t - w0) / span) * 100;

    // The strip for the window on show: frames from the video's own sprite, cut to fill each tile, or the
    // episode's loudness, the loudest half second under each bar.
    let peaks = null, bright = null;
    if (video && media.sprite.bright) fetch(media.sprite.bright).then((r) => r.json()).then((j) => { bright = j.bright; }).catch(() => {});
    if (!video) fetch(media.peaks).then((r) => r.json()).then((p) => { peaks = p; drawnW0 = -1; draw(); }).catch(() => {});
    const strip = () => {
      if (w0 === drawnW0) return;
      drawnW0 = w0;
      if (video) {
        const sp = media.sprite, rows = Math.ceil(sp.count / sp.cols);
        root.querySelectorAll('.stFrames span').forEach((tile, i) => {
          const tw = tile.offsetWidth, th = tile.offsetHeight;
          if (!tw || !th) { drawnW0 = -1; return; }
          const fw = th * sp.w / sp.h;
          const idx = Math.min(sp.count - 1, Math.floor((w0 + (i + .5) * span / N) / sp.every));
          tile.style.backgroundImage = `url("${sp.src}")`;
          tile.style.backgroundSize = `${sp.cols * fw}px ${rows * th}px`;
          tile.style.backgroundPosition = `${-(idx % sp.cols) * fw + (tw - fw) / 2}px ${-Math.floor(idx / sp.cols) * th}px`;
        });
      } else if (peaks) {
        root.querySelectorAll('.stWave span').forEach((bar, i) => {
          const from = Math.floor((w0 + i * span / N) / peaks.every), to = Math.max(from + 1, Math.floor((w0 + (i + 1) * span / N) / peaks.every));
          const v = Math.max(0, ...peaks.peaks.slice(from, to));
          bar.style.setProperty('--v', Math.max(.08, v).toFixed(2));
        });
      }
    };
    // The screen shows the frame at the clip's start from the sprite until the video itself is playing. It was a
    // black box until Play selection (recording of 2026-09-25 at 06:24).
    const screen = root.querySelector('.stScreen');
    const still = () => {
      if (!screen || screen.classList.contains('live')) return;
      const sp = media.sprite, rows = Math.ceil(sp.count / sp.cols);
      const idx = Math.min(sp.count - 1, Math.max(0, Math.round(a / sp.every)));
      const col = idx % sp.cols, row = Math.floor(idx / sp.cols);
      screen.style.backgroundImage = `url("${sp.src}")`;
      screen.style.backgroundSize = `${sp.cols * 100}% ${rows * 100}%`;
      screen.style.backgroundPosition = `${sp.cols > 1 ? (col / (sp.cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
    };
    if (video) el.addEventListener('playing', () => screen.classList.add('live'), { once: true });
    // The sprite's frame is a 96 pixel tile, blurry at full size, so the video's own frame shows as soon as it has sought
    // there (it stayed hidden until Play selection; UX pass of 2026-09-29).
    if (video) el.addEventListener('seeked', () => { if (!playing && el.readyState >= 2) screen.classList.add('live'); });
    const draw = () => {
      if (video) still();
      if (a < w0) w0 = a; if (z > w0 + span) w0 = z - span;
      sel.style.left = pct(a) + '%'; sel.style.width = ((z - a) / span) * 100 + '%';
      ha.style.left = pct(a) + '%'; hz.style.left = pct(z) + '%';
      const win = root.querySelector('.stWin'), dot = root.querySelector('.stDot');
      win.style.left = (w0 / duration) * 100 + '%'; win.style.width = (span / duration) * 100 + '%';
      dot.style.left = (a / duration) * 100 + '%'; dot.style.width = Math.max(0.6, ((z - a) / duration) * 100) + '%';
      root.querySelector('.stRange').textContent = `${fmt(a)} to ${fmt(z)}`;
      const len = Math.round(z - a), lenEl = root.querySelector('.stLen');
      lenEl.textContent = len >= MAX ? `${len} seconds, as long as a clip goes` : len <= MIN ? `${len} seconds, as short as a clip goes` : `${len} seconds`;
      lenEl.classList.toggle('edge', len >= MAX || len <= MIN);
      ha.setAttribute('aria-valuetext', fmt(a)); hz.setAttribute('aria-valuetext', fmt(z));
      strip();
    };
    addEventListener('resize', () => { drawnW0 = -1; strip(); });

    // Playing the stretch: from the start handle to the end one, with the playhead crossing the selection.
    let playing = false, raf = 0;
    const stop = () => {
      if (!playing) return;
      playing = false; cancelAnimationFrame(raf);
      el.pause(); head.hidden = true;
      play.querySelector('span').textContent = 'Play selection';
      play.setAttribute('aria-pressed', 'false');
    };
    const tick = () => {
      if (!playing) return;
      const t = el.currentTime;
      head.style.left = clamp(((t - a) / (z - a)) * 100, 0, 100) + '%';
      if (t >= z || el.ended) { stop(); show(a); return; }
      raf = requestAnimationFrame(tick);
    };
    let onSeeked = null, onMeta = null;
    play.addEventListener('click', () => {
      if (playing) { stop(); return; }
      playing = true;
      head.hidden = false; head.style.transition = 'none'; head.style.left = '0%';
      play.querySelector('span').textContent = 'Stop';
      play.setAttribute('aria-pressed', 'true');
      // A seek before the file has said how long it is does not hold, so it waits for that, then for the seek.
      const go = () => {
        if (!playing) return;
        if (onSeeked) el.removeEventListener('seeked', onSeeked);
        el.addEventListener('seeked', onSeeked = () => {
          onSeeked = null;
          if (!playing) return;
          const p = el.play();
          if (p && p.catch) p.catch(() => { stop(); root.querySelector('.stHint').textContent = 'This browser would not play it. Try again.'; });
          raf = requestAnimationFrame(tick);
        }, { once: true });
        el.currentTime = a;
      };
      if (el.readyState >= 1) go();
      else { if (onMeta) el.removeEventListener('loadedmetadata', onMeta); el.addEventListener('loadedmetadata', onMeta = go, { once: true }); el.preload = 'metadata'; el.load(); }
    });
    // Anything else on the page taking over puts it away: another tab, or the scene scrolled out of sight.
    const hush = () => { stop(); root.querySelectorAll('.stCardPlay video, .stCardPlay audio').forEach((m) => m.pause()); };
    document.addEventListener('annotated-tryit-touched', hush);
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) hush(); })).observe(root);

    // The picture follows the handle being moved, and settles back on the start of the clip.
    let want = null;
    const show = (t) => {
      if (!video || playing) return;
      if (want === null) requestAnimationFrame(() => { if (want !== null && Math.abs(el.currentTime - want) > .05) el.currentTime = want; want = null; });
      want = t;
    };
    if (video) el.addEventListener('loadedmetadata', () => { el.currentTime = a; }, { once: true });
    // The video's first frame is fetched when its tab is first shown, not by every visitor to the front page
    // (about 0.3 to 1 MB for those who never open it, audit of 2026-09-24).
    if (video) {
      const panel = root.closest('.tryPanel') || root;
      const wake = () => { if (panel.hidden || el.preload !== 'none') return; el.preload = 'metadata'; el.load(); watch.disconnect(); };
      const watch = new MutationObserver(wake);
      watch.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
      wake();
    }

    const setA = (v) => { a = clamp(v, Math.max(0, z - MAX), z - MIN); draw(); show(a); };
    const setZ = (v) => { z = clamp(v, a + MIN, Math.min(duration, a + MAX)); draw(); show(z); };
    const at = (x) => clamp(w0 + ((x - track.getBoundingClientRect().left) / track.getBoundingClientRect().width) * span, 0, duration);
    const drag = (h, fn) => h.addEventListener('pointerdown', (e) => {
      if (root.classList.contains('taken')) return;
      e.preventDefault(); h.setPointerCapture(e.pointerId); stop();
      const x0 = e.clientX, a0 = a, z0 = z;
      const move = (m) => fn(m, x0, a0, z0);
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); show(a); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    drag(ha, (m) => setA(at(m.clientX)));
    drag(hz, (m) => setZ(at(m.clientX)));
    drag(sel, (m, x0, a0, z0) => {
      const d = ((m.clientX - x0) / track.getBoundingClientRect().width) * span;
      const len = z0 - a0, na = clamp(a0 + d, 0, duration - len);
      a = na; z = na + len; draw(); show(a);
    });
    [[ha, setA, () => a], [hz, setZ, () => z]].forEach(([h, set, get]) => h.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); stop(); set(get() - step); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); stop(); set(get() + step); }
    }));
    ha.setAttribute('role', 'slider'); hz.setAttribute('role', 'slider');
    const reset = () => {
      root.classList.remove('taken', 'made'); root.querySelector('.stTake').hidden = true; root.querySelector('.stTake').innerHTML = '';
      root.querySelector('.stGo').hidden = false; play.hidden = false;
      root.querySelector('.stHint').textContent = 'Drag the ends, or the middle.';
    };
    // The card plays exactly the clip. Its bar and its times run from the clip's start to its end, not over the
    // whole video, and at the end it goes back to the first frame, ready to play again.
    const player = () => {
      const c0 = a, c1 = z, len = c1 - c0;
      const box = document.createElement('div');
      box.className = 'stClip' + (video ? ' isVideo' : '');
      box.innerHTML = `${video ? '<video preload="metadata" playsinline></video>' : '<audio preload="metadata"></audio>'}
        <div class="stClipBar"><button type="button" class="stClipGo" aria-label="Play the clip">${icon('play')}</button>
          <span class="stClipTrack"><i></i></span><span class="stClipTime">0:00 / ${fmt(len)}</span></div>`;
      const m = box.querySelector(video ? 'video' : 'audio'), go = box.querySelector('.stClipGo'), fill = box.querySelector('.stClipTrack i'), time = box.querySelector('.stClipTime'), bar = box.querySelector('.stClipTrack');
      m.src = media.src;
      // Until the video has a frame of its own, it shows the clip's first frame from the sprite. The new card was an
      // empty grey box for a moment (recording of 2026-09-25 at 15:38, 2:28).
      if (video && media.sprite) {
        const sp = media.sprite, rows = Math.ceil(sp.count / sp.cols), idx = Math.min(sp.count - 1, Math.floor(c0 / sp.every));
        const col = idx % sp.cols, row = Math.floor(idx / sp.cols);
        m.style.backgroundImage = `url("${sp.src}")`;
        m.style.backgroundSize = `${sp.cols * 100}% ${rows * 100}%`;
        m.style.backgroundPosition = `${sp.cols > 1 ? (col / (sp.cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
      }
      let raf2 = 0;
      const at0 = () => { m.currentTime = c0; };
      m.addEventListener('loadedmetadata', at0, { once: true });
      const paint = () => {
        const p = clamp((m.currentTime - c0) / len, 0, 1);
        fill.style.width = p * 100 + '%'; time.textContent = `${fmt(p * len)} / ${fmt(len)}`;
      };
      const loop = () => {
        paint();
        if (m.currentTime >= c1) { m.pause(); at0(); paint(); return; }
        if (!m.paused) raf2 = requestAnimationFrame(loop);
      };
      m.addEventListener('play', () => { go.innerHTML = PAUSE; go.setAttribute('aria-label', 'Pause the clip'); raf2 = requestAnimationFrame(loop); });
      m.addEventListener('pause', () => { go.innerHTML = icon('play'); go.setAttribute('aria-label', 'Play the clip'); cancelAnimationFrame(raf2); paint(); });
      go.addEventListener('click', () => {
        if (!m.paused) { m.pause(); return; }
        if (m.currentTime < c0 || m.currentTime >= c1 - .05) m.currentTime = c0;
        const p = m.play(); if (p && p.catch) p.catch(() => {});
      });
      if (video) m.addEventListener('click', () => go.click());
      bar.addEventListener('click', (e) => { const r = bar.getBoundingClientRect(); m.currentTime = c0 + clamp((e.clientX - r.left) / r.width, 0, 1) * len; paint(); });
      return box;
    };
    root.querySelector('.stGo').addEventListener('click', () => {
      stop();
      root.classList.add('taken');
      root.querySelector('.stGo').hidden = true; play.hidden = true;
      root.querySelector('.stHint').textContent = video ? `${Math.round(z - a)} seconds captured, playing inside the annotation.` : `${Math.round(z - a)} seconds cut from the show's own audio.`;
      takeStep(root, { kind, what: () => `${video ? 'Clip' : 'Audio clip'} ${fmt(a)} to ${fmt(z)} of ${fmt(duration)}`, source, kindIcon, onAgain: reset, player, yours: () => {
        const out = { a, z, duration };
        if (video) {
          // The brightest frame inside the clip: the middle one of a night launch was a black square.
          const sp = media.sprite, lo = Math.floor(a / sp.every), hi = Math.min(sp.count - 1, Math.floor(z / sp.every));
          let idx = Math.min(sp.count - 1, Math.floor(((a + z) / 2) / sp.every));
          if (bright) for (let i = lo, best = -1; i <= hi; i++) if ((bright[i] || 0) > best) { best = bright[i] || 0; idx = i; }
          out.thumb = { src: sp.src, cols: sp.cols, rows: Math.ceil(sp.count / sp.cols), idx };
        }
        else if (peaks) { const from = Math.floor(a / peaks.every), to = Math.max(from + 1, Math.ceil(z / peaks.every)), n = 28; out.wave = [...Array(n)].map((_, i) => Math.max(.1, Math.max(0, ...peaks.peaks.slice(from + Math.floor(i * (to - from) / n), from + Math.floor((i + 1) * (to - from) / n) + 1)))).map((v) => +v.toFixed(2)); }
        return out;
      } });
    });
    draw();
  }

  // The action row under the example post: replies, reposts, likes, views, bookmark and share, drawn here.
  const XI = {
    reply: '<path d="M4.5 11a7 7 0 0 1 7-7h1a7 7 0 0 1 0 14h-2.2L6 21v-4.1A7 7 0 0 1 4.5 11z"/>',
    repost: '<path d="M7 6l-3 3 3 3M4 9h11a4 4 0 0 1 4 4v1M17 18l3-3-3-3M20 15H9a4 4 0 0 1-4-4v-1"/>',
    like: '<path d="M12 20s-7-4.4-8.6-9A4.6 4.6 0 0 1 12 7.3 4.6 4.6 0 0 1 20.6 11C19 15.6 12 20 12 20z"/>',
    views: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
    save: '<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  };
  const xi = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${XI[k]}</svg>`;
  const XACTS = `<span>${xi('reply')}</span><span>${xi('repost')}</span><span>${xi('like')}</span><span>${xi('views')}</span><span class="xEnd">${xi('save')}${xi('share')}</span>`;
  // Dario Amodei's post of September 12, 2026, the one that started the week's argument about slowing AI down (David's
  // choice, 2026-09-25; it was Elon Musk's of September 24). Word for word as X shows it, with the essay it links.
  const POST_URL = 'https://x.com/DarioAmodei/status/2098773920774074715';
  const POST_WHO = { name: 'Dario Amodei', handle: '@DarioAmodei', date: 'Sep 12, 2026', initial: 'D' };
  const POST_TEXT = [
    'We Must Pace the Frontier: I’ve written a new essay on why the AI industry should slow down, with a three-part plan for doing so.',
    'Anthropic is unilaterally committing to the first of these steps. We’ll provide third-party evaluators with permanent, employee-level access to our systems, so that they can verify adherence to our safety measures, report on incidents, and assess models’ alignment during training.',
  ].map((t) => `<p>${t}</p>`).join('') + '<p>You can read the full post here: <a href="https://darioamodei.com/post/we-must-pace-the-frontier" target="_blank" rel="noopener">darioamodei.com/post/we-must-p…</a></p>';

  const SCENES = {
    article: (root) => words(root, { kind: 'article', source: 'An example article', kindIcon: 'article', forMe: 'The council voted 7 to 2 to run buses through the night on three routes.',
      html: `<div class="stPaper"><p class="stKicker">Example article</p><div data-annotated-self><p class="stH">Council backs a six-month overnight bus trial</p>
        <p>The council voted 7 to 2 to run buses through the night on three routes. Supporters pointed to a survey in which six in ten night-shift workers said they had missed a shift for lack of a ride home.</p></div></div>` }),
    // Liftoff, from ignition to the rocket climbing clear of its cloud.
    // Ignition and liftoff, 2:44 to 3:06, lit the whole way. The clip used to run to 3:19, into the night after
    // the rocket had gone, and its card went black every loop (recording of 2026-09-25 at 04:48).
    video: (root) => trimmer(root, { kind: 'video', duration: 347, start: 164, end: 186, kindIcon: 'clip',
      source: 'NASA, To the Moon and Back: The Journey of Artemis I (5:47)',
      media: { src: '/media/artemis-i.mp4', sprite: { src: '/media/artemis-i-frames.jpg', bright: '/media/artemis-i-frames.json', every: 2, cols: 12, w: 96, h: 54, count: 174 },
        credit: { text: 'To the Moon and Back: The Journey of Artemis I', site: 'NASA, public domain', href: 'https://images.nasa.gov/details/jsc2022m000294_TheJourneyofArtemisI' } } }),
    // From one pause to the next, so the moment starts and ends on whole words.
    audio: (root) => trimmer(root, { kind: 'audio', duration: 664, start: 76, end: 98, kindIcon: 'podcast',
      source: 'NASA, Houston We Have a Podcast: So You Want to be an Astronaut? (11:04)',
      media: { src: '/media/astronaut.mp3', peaks: '/media/astronaut-peaks.json',
        credit: { text: 'Houston We Have a Podcast: So You Want to be an Astronaut?', site: 'NASA, public domain', href: 'https://www.nasa.gov/podcasts/houston-we-have-a-podcast/so-you-want-to-be-an-astronaut/' } } }),
    // A real post, word for word, with its author's name, handle and date and a link to the post. No view, like or
    // repost numbers, since the real ones change and made-up ones would be data that is not true.
    post: (root) => words(root, { kind: 'post', source: `${POST_WHO.name} on X`, kindIcon: 'post', whole: 'Use the whole post', forMe: 'Anthropic is unilaterally committing to the first of these steps.',
      html: `<div class="stPost stX"><div class="xHead"><span class="stAv" aria-hidden="true">${POST_WHO.initial}</span>
          <span class="xWho"><b>${POST_WHO.name}</b><span class="xHandle">${POST_WHO.handle}</span></span>
          <a class="xMark" href="${POST_URL}" target="_blank" rel="noopener" aria-label="See the post on X" title="See the post on X">${typeof Brand !== 'undefined' ? Brand.icon('x') : ''}</a></div>
        <div data-annotated-self><div class="stPostText">${POST_TEXT}</div></div>
        <p class="xTime"><a href="${POST_URL}" target="_blank" rel="noopener">${POST_WHO.date}</a></p>
        <div class="xActs" aria-hidden="true">${XACTS}</div></div>` }),
  };

  function mount(art, kind) {
    if (!SCENES[kind] || typeof ArticleCore === 'undefined') return false;
    art.innerHTML = '';
    art.removeAttribute('aria-hidden');
    art.classList.add('tryit', 'sceneTry', 'st-' + kind);
    SCENES[kind](art);
    return true;
  }
  return { mount, fmt };
})();
