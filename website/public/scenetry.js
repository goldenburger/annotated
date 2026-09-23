// The four scenes on the front page, each one a small working version of the tool rather than a drawing of it.
// A passage and a post are selected and marked with the extension's own pen (ArticleCore). A clip and a
// podcast moment are cut with a trimmer whose handles drag like the panel's: three seconds at the least,
// ninety at the most, and the arrow keys move a handle by a second (five with Shift). Each ends as the brief's
// try-it does: a take, and the card it becomes. Everything is an example, labelled so, and nothing is sent.
var SceneTry = (() => {
  const MIN = 3, MAX = 90;
  const INK = { hi: '#FFE14A', deep: '#F2C600', lift: '#FFEE9E' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof Brand !== 'undefined' ? Brand.icon(n) : '');
  const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function pen() {
    if (typeof ArticleCore === 'undefined' || document.querySelector('style[data-tryit-pen]')) return;
    const st = document.createElement('style'); st.dataset.tryitPen = '1';
    st.textContent = ArticleCore.penCss('chisel', INK); document.head.appendChild(st);
  }

  // The last part of every scene: the take box, then the card.
  function takeStep(root, { what, source, kindIcon, onAgain }) {
    const t = root.querySelector('.stTake');
    t.hidden = false;
    t.innerHTML = `<label class="stLabel">Your take<textarea rows="2" maxlength="200" placeholder="What should people notice?"></textarea></label>
      <p class="stSay" role="status" hidden>Write a sentence first.</p>
      <p class="stRow"><button type="button" class="primary sm stMake" disabled>Make the annotation</button><button type="button" class="link stAgain">Start over</button></p>`;
    const box = t.querySelector('textarea'), make = t.querySelector('.stMake');
    box.focus({ preventScroll: true });
    box.addEventListener('input', () => { make.disabled = !box.value.trim(); t.querySelector('.stSay').hidden = true; });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); make.click(); } });
    t.querySelector('.stAgain').addEventListener('click', onAgain);
    make.addEventListener('click', () => {
      const take = box.value.trim();
      if (!take) { t.querySelector('.stSay').hidden = false; return; }
      t.innerHTML = `<article class="stCard"><p class="tiExample">Example</p><h4 class="stCardTake"></h4>
        <p class="stCardWhat"></p><p class="stCardSrc">${icon(kindIcon)} <span></span></p></article>
        <p class="stRow"><button type="button" class="link stAgain">Make another</button></p>`;
      t.querySelector('.stCardTake').textContent = take;
      t.querySelector('.stCardWhat').textContent = what();
      t.querySelector('.stCardSrc span').textContent = source;
      t.querySelector('.stAgain').addEventListener('click', onAgain);
      root.classList.add('made');
    });
  }

  // ---- words: a passage or a post, selected and marked with the real pen.
  function words(root, { kind, html, source, kindIcon, whole = null }) {
    pen();
    root.innerHTML = `<div class="stStage">${html}</div>
      <div class="stBar"><p class="stHint" role="status">Select any words above.</p>
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
      setTimeout(() => takeStep(root, { what: () => `“${quote}”`, source, kindIcon, onAgain: reset }), ms + 120);
    };
    go.addEventListener('mousedown', (e) => e.preventDefault());
    go.addEventListener('click', () => { const s = getSelection(); if (s && s.rangeCount && !s.isCollapsed) mark(s.getRangeAt(0)); });
    const w = root.querySelector('.stWhole');
    if (w) w.addEventListener('click', () => { if (root.classList.contains('taken')) return; const r = document.createRange(); r.selectNodeContents(text.querySelector('.stPostText') || text); mark(r); });
  }

  // ---- time: a clip or a podcast moment, cut with two handles.
  function trimmer(root, { kind, duration, start, end, source, kindIcon, strip }) {
    root.innerHTML = `<div class="stStage">
        <div class="stTrack" aria-label="${kind === 'video' ? 'The video' : 'The episode'}, ${fmt(duration)} long">${strip}
          <div class="stSel"><span class="stHead" hidden></span></div>
          <button type="button" class="stHandle a" aria-label="Start of the clip"></button>
          <button type="button" class="stHandle z" aria-label="End of the clip"></button>
        </div>
        <p class="stTimes"><span class="stRange"></span><span class="stLen"></span></p>
        <div class="stAll" aria-hidden="true"><span class="stWin"></span><span class="stDot"></span></div>
        <p class="stAllLbl"><span>0:00</span><span>${kind === 'video' ? 'Whole video' : 'Whole episode'}, ${fmt(duration)}</span></p>
      </div>
      <div class="stBar"><p class="stHint" role="status">Drag either end, or the middle to move it.</p>
        ${kind === 'audio' ? '<button type="button" class="ghost sm stPlay">' + icon('play') + ' Play selection</button>' : ''}
        <button type="button" class="stGo"><i aria-hidden="true"></i>${kind === 'video' ? 'Capture clip' : 'Clip it'}</button></div>
      <div class="stTake" hidden></div>`;
    const track = root.querySelector('.stTrack'), sel = root.querySelector('.stSel'), ha = root.querySelector('.stHandle.a'), hz = root.querySelector('.stHandle.z');
    let a = start, z = end;
    // A clip is seconds out of minutes or an hour, a sliver of any bar that long, so the track is a window of a
    // few minutes around it, and the whole length is the thin bar underneath, as in the panel.
    const span = Math.min(duration, kind === 'video' ? 150 : 180);
    let w0 = clamp((a + z) / 2 - span / 2, 0, duration - span);
    const pct = (t) => ((t - w0) / span) * 100;
    const draw = () => {
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
    };
    const setA = (v) => { a = clamp(v, Math.max(0, z - MAX), z - MIN); draw(); };
    const setZ = (v) => { z = clamp(v, a + MIN, Math.min(duration, a + MAX)); draw(); };
    const at = (x) => clamp(w0 + ((x - track.getBoundingClientRect().left) / track.getBoundingClientRect().width) * span, 0, duration);
    const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
      if (root.classList.contains('taken')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const x0 = e.clientX, a0 = a, z0 = z;
      const move = (m) => fn(m, x0, a0, z0);
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    drag(ha, (m) => setA(at(m.clientX)));
    drag(hz, (m) => setZ(at(m.clientX)));
    drag(sel, (m, x0, a0, z0) => {
      const d = ((m.clientX - x0) / track.getBoundingClientRect().width) * span;
      const len = z0 - a0, na = clamp(a0 + d, 0, duration - len);
      a = na; z = na + len; draw();
    });
    [[ha, setA, () => a], [hz, setZ, () => z]].forEach(([h, set, get]) => h.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(get() - step); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(get() + step); }
    }));
    ha.setAttribute('role', 'slider'); hz.setAttribute('role', 'slider');
    // A preview of the stretch, drawn rather than heard: nothing on this page has sound of its own.
    const play = root.querySelector('.stPlay');
    if (play) play.addEventListener('click', () => {
      const head = root.querySelector('.stHead');
      head.hidden = false; head.style.transition = 'none'; head.style.left = '0%';
      requestAnimationFrame(() => { head.style.transition = still() ? 'none' : `left ${Math.min(4, (z - a) / 6).toFixed(2)}s linear`; head.style.left = '100%'; });
      play.disabled = true; setTimeout(() => { head.hidden = true; play.disabled = false; }, still() ? 400 : Math.min(4000, ((z - a) / 6) * 1000) + 200);
      root.querySelector('.stHint').textContent = 'The panel plays it with sound. This page is silent.';
    });
    const reset = () => {
      root.classList.remove('taken', 'made'); root.querySelector('.stTake').hidden = true; root.querySelector('.stTake').innerHTML = '';
      root.querySelector('.stGo').hidden = false; if (play) play.hidden = false;
      root.querySelector('.stHint').textContent = 'Drag either end, or the middle to move it.';
    };
    root.querySelector('.stGo').addEventListener('click', () => {
      root.classList.add('taken');
      root.querySelector('.stGo').hidden = true; if (play) play.hidden = true;
      root.querySelector('.stHint').textContent = kind === 'video' ? `${Math.round(z - a)} seconds captured, playing inside the annotation.` : `${Math.round(z - a)} seconds cut from the show's own audio.`;
      takeStep(root, { what: () => `${kind === 'video' ? 'Clip' : 'Audio clip'} ${fmt(a)} to ${fmt(z)} of ${fmt(duration)}`, source, kindIcon, onAgain: reset });
    });
    draw();
  }

  // The strips under the handles: a filmstrip of frames and a waveform, drawn from numbers, not pictures.
  function filmstrip(n = 14) {
    return `<div class="stFrames">${[...Array(n)].map((_, i) => `<span style="--h:${(200 + i * 11) % 360}"></span>`).join('')}</div>`;
  }
  function waveform(n = 64) {
    let seed = 7;
    const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    return `<div class="stWave">${[...Array(n)].map((_, i) => `<span style="--v:${(0.25 + 0.75 * Math.abs(Math.sin(i / 3.1)) * (0.55 + r() * 0.45)).toFixed(2)}"></span>`).join('')}</div>`;
  }

  const SCENES = {
    article: (root) => words(root, { kind: 'article', source: 'An example article', kindIcon: 'article',
      html: `<div class="stPaper"><p class="stKicker">Example article</p><div data-annotated-self><p class="stH">Council backs a six-month overnight bus trial</p>
        <p>The council voted 7 to 2 to run buses through the night on three routes. Supporters pointed to a survey in which six in ten night-shift workers said they had missed a shift for lack of a ride home.</p></div></div>` }),
    video: (root) => trimmer(root, { kind: 'video', duration: 760, start: 190, end: 232, source: 'An example YouTube video, 12:40', kindIcon: 'clip', strip: filmstrip() }),
    audio: (root) => trimmer(root, { kind: 'audio', duration: 3480, start: 1265, end: 1285, source: 'An example podcast episode, 58:00, from Spotify or anywhere else', kindIcon: 'podcast', strip: waveform() }),
    post: (root) => words(root, { kind: 'post', source: 'An example post on X', kindIcon: 'post', whole: 'Use the whole post',
      html: `<div class="stPost"><p class="stPostWho"><span class="stAv" aria-hidden="true"></span><b>Example post</b> <span>@example</span></p>
        <div data-annotated-self><p class="stPostText">We shipped the redesign on Friday. Sign-ups are up 40 percent, and support tickets doubled over the weekend.</p></div></div>` }),
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
