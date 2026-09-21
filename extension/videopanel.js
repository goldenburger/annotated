// Video mode of the side panel. Shared by the extension and the preview.
// VideoPanel.create(root, adapter, opts)
//   adapter: { seek(t), preview(start, end), capture(start, end) -> Promise<{ ok, error }>, abort() }
//   opts:    { log, onPublish(item, take) -> Promise<ref>, onView(ref), findDuplicate(item) -> ref|null, onMicBlocked }
// The shell calls panel.update(info) with fresh player info, and panel.engine(msg) for capture messages.
const VideoPanel = (() => {
  const { clamp, fmt } = PanelKit;
  const MAX = 90, MIN = 1, DEFAULT_LEN = 30;
  const snap = (t) => Math.round(t * 10) / 10;

  // opts.kind 'audio' makes this the podcast panel: the same trimmer over a waveform, recording sound only.
  function create(root, ad, opts = {}) {
    const log = opts.log || (() => {});
    const isAudio = opts.kind === 'audio';
    let wave = null, waveAsked = false, checking = false, film = null, filmAsked = false, checksFailed = false;
    // Small buttons that move one end of the clip by a tenth of a second.
    const nudge = (w) => `<span class="nudges"><button type="button" class="nudge" data-w="${w}" data-d="-0.1" aria-label="Move the ${w} back a tenth of a second" title="Back 0.1 s">${Brand.icon('arrowLeft')}</button><button type="button" class="nudge fwd" data-w="${w}" data-d="0.1" aria-label="Move the ${w} forward a tenth of a second" title="Forward 0.1 s">${Brand.icon('arrowLeft')}</button></span>`;
    root.innerHTML = `
      ${PanelKit.phead(isAudio ? 'podcast' : 'video', 'vTitle', 'vMeta')}
      <section class="clipper" aria-label="Choose the clip">
        <div class="readout">
          <div class="rField"><span class="k">Start ${nudge('start')}</span><input class="v rStart num" inputmode="decimal" aria-label="Start time" spellcheck="false"></div>
          <span class="dash" aria-hidden="true">to</span>
          <div class="rField"><span class="k">End ${nudge('end')}</span><input class="v rEnd num" inputmode="decimal" aria-label="End time" spellcheck="false"></div>
          <div class="lenbox"><span class="k">Length</span><span class="v rLen num"></span></div>
        </div>
        <div class="track" role="group" aria-label="Clip range">
          ${isAudio ? '<canvas class="wave" aria-hidden="true"></canvas>' : '<canvas class="film" aria-hidden="true"></canvas>'}
          <div class="ticks" aria-hidden="true"></div>
          <div class="dimL" aria-hidden="true"></div><div class="dimR" aria-hidden="true"></div>
          <div class="range"></div>
          <button class="handle hStart" role="slider" aria-label="Clip start"><span class="hBubble num" aria-hidden="true"></span></button>
          <button class="handle hEnd" role="slider" aria-label="Clip end"><span class="hBubble num" aria-hidden="true"></span></button>
          <div class="playhead" aria-hidden="true"></div>
        </div>
        <div class="scale num"><span class="vStart"></span><span class="vEnd"></span></div>
        <div class="ovRow"><span class="ovLabel">${isAudio ? 'Whole episode' : 'Whole video'}</span>
          <div class="overview" title="Click to move the clip here">
            <div class="owin"></div><div class="osel"></div><div class="oplay"></div>
          </div><span class="ovLen num"></span></div>
        <div class="tools">
          <button type="button" class="quiet playSel" aria-pressed="false">${Brand.icon('play')} <span class="lblLong">Play selection</span><span class="lblShort">Play</span></button>
          <span class="toolsR">
            <button type="button" class="ghost sm setStart" title="Set the start to where the video is now"><span class="lblLong">Start here</span><span class="lblShort">Start</span></button>
            <button type="button" class="ghost sm setEnd" title="Set the end to where the video is now"><span class="lblLong">End here</span><span class="lblShort">End</span></button>
            ${PanelKit.tipButton('trim')}
          </span>
        </div>
        <p class="hint tip" data-tip="trim">Drag the highlight or its edges, or type a time. Clips can be up to 90 seconds.</p>
      </section>
      <section class="act">
        <button class="primary capBtn">Capture clip</button>
        <div class="progress" hidden>
          <div class="pbar"><div class="fill"></div></div>
          <div class="prow"><span class="pText num"></span><button class="link cancel">Cancel</button></div>
          <p class="hint tip" data-tip="realtime">Capture runs in real time, so a 60 second clip takes about 60 seconds.</p>
        </div>
        <p class="error capErr" role="alert" hidden></p>
        <p class="note capNote" role="status" hidden></p>
      </section>
      <section class="vResult result" hidden>
        <p class="resLabel" hidden></p>
        <div class="clipCard">
          <button type="button" class="ccThumb" aria-label="Play the clip" aria-expanded="false"><img class="ccPoster" alt=""><span class="ccPlay">${Brand.icon('play')}</span></button>
          <div class="ccText"><b class="csText"></b><span class="ccMeta"></span></div>
          <button type="button" class="quiet csChange">${Brand.icon('edit')} Change</button>
        </div>
        ${isAudio ? '<audio class="vPreview" controls hidden></audio>' : '<video class="vPreview" controls playsinline hidden></video>'}
        <div class="vStatus"></div>
        <div class="failBox" hidden><p>This clip didn't pass its checks. Capture it again before you publish.</p>
          <button type="button" class="primary sm failRetry">Capture again</button></div>
      </section>
      <section class="compose vCompose" hidden></section>
      <div class="vDup" hidden></div>
      <section class="vPublished" hidden></section>`;
    const q = (s) => root.querySelector(s);
    const status = PanelKit.status(q('.vStatus'), log);
    const compose = Compose.create(q('.vCompose'), {
      placeholder: 'What should people notice in this clip?',
      log, onMicBlocked: opts.onMicBlocked,
      onPublish: opts.onPublish ? publish : null,
    });

    PanelKit.setStep(root, 1);
    PanelKit.initTips(root);
    if (opts.switchTo) PanelKit.modeSwitch(root, 'audio', opts.switchTo.onClick);
    let info = null, sel = null, view = { start: 0, len: 60 }, drag = null, capturing = false, lastVideoId = null, lastSeek = 0;
    let result = null, isPublished = false, pubRef = null, anim = null, collapsed = false, edgeTimer = null, lastX = 0;

    /* ---------- view window: zooms so the clip is about a third of the track ---------- */
    function wantedLen() {
      const len = sel.end - sel.start;
      return Math.min(info.duration, clamp(len * 3, 10, 180));
    }
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function recenter(force = false, instant = false) {
      const D = info.duration, want = wantedLen();
      let len = view.len;
      if (Math.abs(want - len) > 0.5) { len = want; force = true; }
      const inView = sel.start >= view.start && sel.end <= view.start + len;
      if (!force && inView) return;
      const start = clamp((sel.start + sel.end) / 2 - len / 2, 0, Math.max(0, D - len));
      animateView(start, len, instant || reduced);
    }
    // Ease the zoom so the track does not jump when a handle is released.
    function animateView(start, len, instant) {
      cancelAnimationFrame(anim);
      if (instant) { view = { start, len }; drawTicks(); render(); return; }
      const from = { ...view }, t0 = performance.now(), dur = 280;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        view = { start: from.start + (start - from.start) * e, len: from.len + (len - from.len) * e };
        drawTicks(); render();
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const pctView = (t) => ((t - view.start) / view.len) * 100;
    const pctAll = (t) => (t / info.duration) * 100;

    // Podcasts: the episode's waveform sits behind the trimmer, redrawn for the part in view.
    function drawWave() {
      const c = q('.wave');
      if (!c || !wave || !info) return;
      // Waveforms fetched a window at a time ask for the part in view, and redraw as it arrives.
      if (wave.ensure) { wave.onupdate = () => requestAnimationFrame(drawWave); wave.ensure(view.start, view.start + view.len); }
      Waveform.draw(c, wave, view.start, view.start + view.len, { color: getComputedStyle(root).getPropertyValue('--ink-3').trim() || '#9AA1AF', bar: 2, gap: 2 });
    }
    // Video: frames from the video sit behind the trimmer, redrawn for the part in view.
    function drawFilm() {
      const c = q('.film');
      if (!c || !film || !info) return;
      const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const tw = Math.max(40, Math.round(H * 16 / 9)), n = Math.ceil(W / tw);
      let drew = false;
      for (let i = 0; i < n; i++) {
        const t = view.start + (((i + 0.5) * tw) / W) * view.len;
        if (t > info.duration) break;
        if (film.draw(g, Math.min(info.duration - 0.05, t), i * tw, 0, tw - 1, H)) drew = true;
      }
      q('.track').classList.toggle('filmReady', drew);
    }
    function drawTicks() {
      drawWave();
      drawFilm();
      const ticks = q('.ticks'); ticks.innerHTML = '';
      const step = view.len > 120 ? 30 : view.len > 50 ? 10 : 5;
      for (let t = Math.ceil(view.start / step) * step; t < view.start + view.len; t += step) {
        const i = document.createElement('i'); i.style.left = pctView(t) + '%'; ticks.appendChild(i);
      }
    }

    function initSelection() {
      const D = info.duration;
      let s = Math.floor(info.currentTime), e = Math.min(D, s + DEFAULT_LEN);
      if (e - s < MIN) s = Math.max(0, e - DEFAULT_LEN);
      sel = { start: s, end: e };
      view = { start: 0, len: Math.min(info.duration, 60) };
      recenter(true, true);
    }

    function stale() {
      return result && (Math.abs(sel.start - result.start) > 0.05 || Math.abs(sel.end - result.end) > 0.05);
    }

    function render() {
      if (!info || !sel) return;
      // Keep the zoomed view inside the video, even mid-animation or mid-drag.
      view.len = Math.min(view.len, info.duration);
      view.start = clamp(view.start, 0, Math.max(0, info.duration - view.len));
      // After publishing, choosing a different range starts a fresh annotation.
      if (isPublished && stale() && !capturing) clearResult();
      const len = sel.end - sel.start;
      // Outside the clip the filmstrip or waveform is dimmed, so the chosen part stands out.
      q('.dimL').style.width = pctView(Math.max(view.start, Math.min(sel.start, view.start + view.len))) + '%';
      const rEdge = pctView(Math.min(view.start + view.len, Math.max(sel.end, view.start)));
      q('.dimR').style.left = rEdge + '%'; q('.dimR').style.width = (100 - rEdge) + '%';
      if (previewing && info.paused && Date.now() > previewGrace) setPlaying(false);
      q('.hStart .hBubble').textContent = fmt(sel.start, true);
      q('.hEnd .hBubble').textContent = fmt(sel.end, true);
      q('.ovLen').textContent = fmt(info.duration);
      if (document.activeElement !== q('.rStart')) q('.rStart').value = fmt(sel.start, true);
      if (document.activeElement !== q('.rEnd')) q('.rEnd').value = fmt(sel.end, true);
      for (const [c, t] of [['.hStart', sel.start], ['.hEnd', sel.end]]) {
        const h = q(c);
        h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(Math.round(info.duration)));
        h.setAttribute('aria-valuenow', t.toFixed(1)); h.setAttribute('aria-valuetext', fmt(t, true));
      }
      q('.rLen').textContent = `${len.toFixed(1)}s`;
      q('.rLen').classList.toggle('over', len > MAX);
      q('.range').style.left = pctView(sel.start) + '%';
      q('.range').style.width = (pctView(sel.end) - pctView(sel.start)) + '%';
      q('.hStart').style.left = pctView(sel.start) + '%';
      q('.hEnd').style.left = pctView(sel.end) + '%';
      const p = pctView(info.currentTime);
      q('.playhead').style.display = p >= 0 && p <= 100 ? '' : 'none';
      q('.playhead').style.left = p + '%';
      q('.vStart').textContent = fmt(view.start);
      q('.vEnd').textContent = fmt(view.start + view.len);
      q('.owin').style.left = pctAll(view.start) + '%';
      q('.owin').style.width = pctAll(view.len) + '%';
      q('.osel').style.left = pctAll(sel.start) + '%';
      q('.osel').style.width = pctAll(len) + '%';
      q('.oplay').style.left = pctAll(info.currentTime) + '%';
      q('.capBtn').disabled = capturing || info.ad || len < MIN || len > MAX;
      q('.capBtn').textContent = info.ad && !capturing ? 'Waiting for the ad to finish'
        : isPublished ? 'Capture a new clip' : result && !stale() ? 'Capture again' : result ? 'Capture the new range' : 'Capture clip';
      q('.capBtn').className = result && !stale() && !capturing && !isPublished ? 'ghost capBtn' : 'primary capBtn';
      q('.setStart').disabled = q('.setEnd').disabled = q('.playSel').disabled = capturing;
      if (result) {
        const st = stale();
        q('.vResult').classList.toggle('stale', st);
        q('.resLabel').hidden = !st;
        q('.resLabel').textContent = st ? 'This is your last capture. Capture again to use the new range.' : '';
        q('.csText').textContent = `Clip ${fmt(result.start, true)} to ${fmt(result.end, true)}`;
        q('.ccMeta').textContent = checksFailed ? "Didn't pass its checks" : checking ? 'Checking the clip' : isAudio ? `${(result.end - result.start).toFixed(1)} seconds of audio` : `${(result.end - result.start).toFixed(1)} seconds, 240p`;
      }
    }

    /* ---------- trimming ---------- */
    function previewSeek(t) { const now = performance.now(); if (now - lastSeek < 120) return; lastSeek = now; ad.seek(t); }
    function beginDrag(kind, ev) {
      if (capturing || !sel) return;
      ev.preventDefault();
      lastX = ev.clientX;
      drag = { kind, x0: ev.clientX, s0: sel.start, e0: sel.end, w: q('.track').clientWidth };
      ev.currentTarget.setPointerCapture(ev.pointerId);
      q('.track').dataset.drag = kind;
    }
    // While dragging near either end of the track, keep moving and pan the view so the clip never runs off the edge.
    function edgeCheck() {
      const r = q('.track').getBoundingClientRect();
      const edge = lastX < r.left + 18 ? -1 : lastX > r.right - 18 ? 1 : 0;
      if (edge && !edgeTimer) edgeTimer = setInterval(() => {
        if (!drag) return stopEdge();
        const rr = q('.track').getBoundingClientRect();
        const e2 = lastX < rr.left + 18 ? -1 : lastX > rr.right - 18 ? 1 : 0;
        if (!e2) return stopEdge();
        drag.x0 -= e2 * drag.w * 0.02;
        applyDrag();
      }, 50);
      if (!edge) stopEdge();
    }
    function stopEdge() { clearInterval(edgeTimer); edgeTimer = null; }
    function moveDrag(ev) {
      if (!drag) return;
      lastX = ev.clientX;
      applyDrag();
      edgeCheck();
    }
    function applyDrag() {
      const D = info.duration, dt = ((lastX - drag.x0) / drag.w) * view.len;
      let s = drag.s0, e = drag.e0;
      if (drag.kind === 'start') { s = clamp(drag.s0 + dt, 0, drag.e0 - MIN); if (e - s > MAX) e = s + MAX; }
      else if (drag.kind === 'end') { e = clamp(drag.e0 + dt, drag.s0 + MIN, D); if (e - s > MAX) s = e - MAX; }
      else { const l = drag.e0 - drag.s0; s = clamp(drag.s0 + dt, 0, D - l); e = s + l; }
      sel = { start: snap(s), end: snap(Math.min(e, D)) };
      // Pan the view to follow the part being dragged.
      const lead = drag.kind === 'start' ? sel.start : drag.kind === 'end' ? sel.end : null;
      if (lead !== null ? lead > view.start + view.len : sel.end > view.start + view.len) view.start = Math.min(D - view.len, (lead ?? sel.end) - view.len);
      if (lead !== null ? lead < view.start : sel.start < view.start) view.start = Math.max(0, lead ?? sel.start);
      previewSeek(drag.kind === 'end' ? sel.end : sel.start);
      drawTicks(); render();
    }
    function endDrag() { if (!drag) return; drag = null; delete q('.track').dataset.drag; stopEdge(); recenter(); drawTicks(); render(); }
    for (const [c, kind] of [['.hStart', 'start'], ['.hEnd', 'end'], ['.range', 'range']]) {
      const el = q(c);
      el.addEventListener('pointerdown', (e) => beginDrag(kind, e));
      el.addEventListener('pointermove', moveDrag);
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
    }
    for (const [c, key] of [['.hStart', 'start'], ['.hEnd', 'end']]) {
      q(c).addEventListener('keydown', (e) => {
        if (capturing || !sel || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1);
        let { start, end } = sel;
        if (key === 'start') start = clamp(start + d, Math.max(0, end - MAX), end - MIN);
        else end = clamp(end + d, start + MIN, Math.min(info.duration, start + MAX));
        sel = { start: snap(start), end: snap(end) };
        previewSeek(key === 'start' ? sel.start : sel.end);
        recenter(); drawTicks(); render();
      });
    }
    q('.overview').addEventListener('click', (e) => {
      if (capturing || !sel) return;
      const r = e.currentTarget.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * info.duration, l = sel.end - sel.start;
      const s = clamp(t, 0, info.duration - l);
      sel = { start: snap(s), end: snap(s + l) };
      previewSeek(sel.start); recenter(true); drawTicks(); render();
    });
    q('.setStart').addEventListener('click', () => {
      const l = sel.end - sel.start;
      let s = info.currentTime, e = sel.end;
      if (e - s < MIN || e - s > MAX) e = Math.min(info.duration, s + Math.min(l, MAX));
      if (e - s < MIN) s = Math.max(0, e - MIN);
      sel = { start: snap(s), end: snap(e) }; recenter(); drawTicks(); render();
    });
    q('.setEnd').addEventListener('click', () => {
      const l = sel.end - sel.start;
      let s = sel.start, e = info.currentTime;
      if (e - s < MIN || e - s > MAX) s = Math.max(0, e - Math.min(l, MAX));
      if (e - s < MIN) e = Math.min(info.duration, s + MIN);
      sel = { start: snap(s), end: snap(e) }; recenter(); drawTicks(); render();
    });

    // Typed times accept 1:04.6, 64.6 or 1:02:03.
    function parseTime(txt) {
      const parts = String(txt).trim().split(':').map((x) => x.trim());
      if (!parts.length || parts.some((x) => x === '' || isNaN(Number(x)))) return NaN;
      return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
    }
    function applyTyped(which) {
      const inp = q(which === 'start' ? '.rStart' : '.rEnd');
      const t = parseTime(inp.value);
      if (!isFinite(t)) { inp.value = fmt(which === 'start' ? sel.start : sel.end, true); return; }
      const D = info.duration, l = sel.end - sel.start;
      let s = sel.start, e = sel.end;
      // Too long keeps the time you typed and moves the other end to exactly 90 seconds away.
      // Too short or backwards keeps the clip's previous length.
      if (which === 'start') {
        s = clamp(t, 0, D - MIN);
        if (e - s > MAX) e = Math.min(D, s + MAX);
        else if (e - s < MIN) e = Math.min(D, s + Math.min(l, MAX));
      } else {
        e = clamp(t, MIN, D);
        if (e - s > MAX) s = Math.max(0, e - MAX);
        else if (e - s < MIN) s = Math.max(0, e - Math.min(l, MAX));
      }
      sel = { start: snap(s), end: snap(e) };
      inp.value = fmt(which === 'start' ? sel.start : sel.end, true);
      previewSeek(which === 'start' ? sel.start : sel.end);
      recenter(); drawTicks(); render();
    }
    for (const w of ['start', 'end']) {
      const inp = q(w === 'start' ? '.rStart' : '.rEnd');
      inp.addEventListener('change', () => applyTyped(w));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = fmt(w === 'start' ? sel.start : sel.end, true); inp.blur(); } });
      inp.addEventListener('focus', () => inp.select());
    }
    root.querySelectorAll('.nudge').forEach((b) => b.addEventListener('click', () => {
      if (!sel || capturing) return;
      const w = b.dataset.w, inp = q(w === 'start' ? '.rStart' : '.rEnd');
      inp.value = String(Math.max(0, (w === 'start' ? sel.start : sel.end) + Number(b.dataset.d)).toFixed(1));
      applyTyped(w);
    }));
    // Play selection turns into Stop while it plays, and back when the range ends or the player pauses.
    let previewing = false;
    const setPlaying = (on) => {
      previewing = on;
      const b = q('.playSel');
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = on ? `${Brand.icon('stop')} <span class="lblLong">Stop</span><span class="lblShort">Stop</span>` : `${Brand.icon('play')} <span class="lblLong">Play selection</span><span class="lblShort">Play</span>`;
    };
    q('.playSel').addEventListener('click', () => {
      if (!sel || capturing) return;
      if (previewing) { setPlaying(false); if (ad.pause) ad.pause(); return; }
      if (ad.preview) { ad.preview(sel.start, sel.end); setPlaying(true); previewGrace = Date.now() + 1200; }
    });
    let previewGrace = 0;

    /* ---------- capture ---------- */
    function setCapturing(on) {
      capturing = on;
      q('.progress').hidden = !on;
      q('.track').style.opacity = on ? 0.6 : 1;
      if (!on) q('.fill').style.width = '0';
      opts.onCapturing && opts.onCapturing(on);
      render();
    }
    // Stopping a capture yourself is not a failure, so it reads as a note rather than a red error.
    const CANCELLED = 'Capture cancelled.';
    function showError(t) {
      if (t === CANCELLED) { showNote('Capture stopped. Nothing was saved, so capture again when you are ready.'); return; }
      q('.capNote').hidden = true;
      q('.capErr').textContent = t; q('.capErr').hidden = false; log('Error. ' + t);
    }
    function showNote(t) { q('.capErr').hidden = true; q('.capNote').textContent = t; q('.capNote').hidden = false; log(t); }
    function clearMessages() { q('.capErr').hidden = true; q('.capNote').hidden = true; }
    // After a capture the trimmer shrinks to one line, so the take box is in view without scrolling.
    // After a capture the trimmer folds away. The clip card keeps a Change button to bring it back.
    function setCollapsed(on) {
      collapsed = on;
      q('.clipper').hidden = on;
      q('.act').hidden = on;
      q('.csChange').hidden = !on;
    }
    // After publishing, Change starts a fresh annotation on the same range instead of reopening the published one.
    q('.csChange').addEventListener('click', () => { if (isPublished) clearResult(); setCollapsed(false); recenter(true, true); render(); });
    // The thumbnail opens the full player in place.
    q('.ccThumb').addEventListener('click', () => {
      const pv = q('.vPreview'), open = pv.hidden;
      pv.hidden = !open;
      q('.ccThumb').setAttribute('aria-expanded', String(open));
      q('.ccThumb').setAttribute('aria-label', open ? 'Hide the player' : 'Play the clip');
      if (open) pv.play().catch(() => {}); else pv.pause();
    });
    function clearResult() {
      result = null; isPublished = false; checking = false; checksFailed = false;
      if (q('.failBox')) q('.failBox').hidden = true;
      setCollapsed(false);
      q('.vPreview').hidden = true; q('.ccThumb').setAttribute('aria-expanded', 'false');
      PanelKit.setStep(root, 1);
      q('.vResult').hidden = true; q('.vPreview').removeAttribute('src');
      status.reset();
      q('.vCompose').hidden = true; q('.vPublished').hidden = true; q('.vDup').hidden = true;
      compose.reset();
    }
    q('.capBtn').addEventListener('click', async () => {
      if (!sel || capturing) return;
      clearMessages(); clearResult(); setCapturing(true);
      q('.pText').textContent = 'Seeking to the start';
      log(`Capture ${fmt(sel.start, true)} to ${fmt(sel.end, true)} (${(sel.end - sel.start).toFixed(1)}s). Muted: ${info.muted}`);
      const r = await ad.capture(sel.start, sel.end).catch((e) => ({ ok: false, error: e.message }));
      if (!r || !r.ok) { setCapturing(false); showError((r && r.error) || 'Capture could not start.'); }
    });
    q('.cancel').addEventListener('click', () => ad.abort());

    const once = (el, ev, ms = 4000) => new Promise((res) => {
      const t = setTimeout(res, ms);
      el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
    });
    async function realDuration(v) {
      if (isFinite(v.duration)) return v.duration;
      v.currentTime = Number.MAX_SAFE_INTEGER; await once(v, 'durationchange');
      const d = v.duration; v.currentTime = 0; await once(v, 'seeked', 2000); return d;
    }
    async function frameBrightness(v, t) {
      v.currentTime = t; await once(v, 'seeked', 3000);
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const g = c.getContext('2d', { willReadFrequently: true });
      // The check reads the clip the same two ways the capture can, so a browser that paints blank through
      // one method does not make a good clip look black.
      const measure = () => { const d = g.getImageData(0, 0, 64, 36).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return sum / (d.length / 4); };
      g.drawImage(v, 0, 0, 64, 36);
      let b = measure();
      if (b <= 4 && typeof VideoFrame !== 'undefined') { try { const f = new VideoFrame(v); g.drawImage(f, 0, 0, 64, 36); f.close(); b = Math.max(b, measure()); } catch {} }
      return b;
    }
    // Every check has a time limit, so one stuck step can never leave the clip on "Checking the clip".
    const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
    async function audioLevel(blob) {
      try {
        const ac = new OfflineAudioContext(1, 48000, 48000);
        const buf = await ac.decodeAudioData(await blob.arrayBuffer());
        let sum = 0, n = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < ch.length; i += 32) { sum += ch[i] * ch[i]; n++; } }
        return { rms: Math.sqrt(sum / Math.max(1, n)) };
      } catch (e) { return { error: e.message }; }
    }

    async function onDone(m) {
      if (isAudio) return onAudioDone(m);
      const url = URL.createObjectURL(m.blob);
      result = { kind: 'video', blob: m.blob, url, start: m.start, end: m.end, duration: info.duration, poster: m.poster, title: m.title || info.title,
        videoId: m.videoId || info.videoId, channel: m.channel || '', thumb: m.thumb || '' };
      // The visible preview stays at the start. The checks scrub a hidden copy instead.
      const pv = q('.vPreview');
      pv.style.visibility = 'hidden';
      if (m.poster) { pv.poster = m.poster; q('.ccPoster').src = m.poster; }
      // Reveal the preview only once its first frame can play, so no spinner shows.
      const pvReady = Compose.fixDuration(pv)
        .then(() => (pv.readyState >= 3 ? null : once(pv, 'canplay', 2500)))
        .then(() => { pv.style.visibility = ''; });
      pv.src = url;
      q('.vResult').hidden = false;
      showTakeStep();
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto';
      const vm = once(v, 'loadedmetadata');
      v.src = url;
      await vm;
      if (!v.videoWidth) {
        // No picture track at all: say so straight away instead of running the other checks.
        status.add('fail', 'Clip has a picture', 'The recording has no video frames. Capture again.');
        status.done('Clip ready.', { quiet: false });
        flagFailures(); v.removeAttribute('src'); v.load(); await pvReady; checking = false; render(); flagFailures();
        return;
      }
      const req = m.end - m.start, dur = await withTimeout(realDuration(v), 5000, NaN);
      status.add(v.videoHeight === 240 ? 'pass' : 'fail', 'Output is 240p', `Decoded ${v.videoWidth}x${v.videoHeight}`);
      status.add(isFinite(dur) && Math.abs(dur - req) <= 0.75 ? 'pass' : 'fail', 'Length matches the selection', `Asked for ${req.toFixed(1)}s, got ${isFinite(dur) ? dur.toFixed(2) + 's' : 'unknown'}`);
      status.add(isFinite(dur) && dur <= MAX + 0.5 ? 'pass' : 'fail', 'Under the 90 second cap', '');
      const span = isFinite(dur) && dur > 0 ? dur : req;
      let mid = 0;
      try { mid = await withTimeout(frameBrightness(v, Math.min(span / 2, Math.max(0, span - 0.5))), 5000, 0); } catch (e) { log('Picture check could not run. ' + e.message); }
      status.add(mid > 4 ? 'pass' : 'fail', 'Frames contain picture', mid > 4 ? `Mid-clip brightness ${mid.toFixed(0)} of 255` : 'The middle of the clip is black. The video may be protected.');
      v.currentTime = 0;
      if (!m.hasAudioTrack) status.add('fail', 'Clip has audio', 'No audio track was available from the player.');
      else {
        const a = await withTimeout(audioLevel(m.blob), 6000, { error: 'timed out' });
        if (a.error) status.add('info', 'Clip has an audio track', `Could not measure loudness (${a.error}).`);
        else status.add(a.rms > 0.002 ? 'pass' : 'fail', 'Clip has audible sound', `RMS level ${a.rms.toFixed(4)}`);
      }
      status.add('info', 'File size', `${(m.size / 1048576).toFixed(2)} MB at ${(m.size * 8 / 1000 / req).toFixed(0)} kbps`);
      status.add('info', 'Capture time', `${(m.elapsedMs / 1000).toFixed(1)}s for ${req.toFixed(1)}s. Recorder ${m.recorderMime}`);
      if (m.frameMethod) status.add('info', 'Frame method', m.frameMethod === 'frame' ? `VideoFrame${m.methodSwitches ? `, switched ${m.methodSwitches} time${m.methodSwitches > 1 ? 's' : ''} after blank frames` : ''}` : `Canvas drawing${m.methodSwitches ? `, switched ${m.methodSwitches} time${m.methodSwitches > 1 ? 's' : ''}` : ''}`);
      status.done(`Clip ready. ${(isFinite(dur) ? dur : req).toFixed(1)} seconds at 240p.`, { quiet: true });
      flagFailures();
      v.removeAttribute('src'); v.load();
      await pvReady;
      checking = false;
      render();
    }
    // The take step appears as soon as the clip exists. The checks finish behind it.
    function showTakeStep() {
      checking = true;
      render();
      compose.reset();
      q('.vCompose').hidden = false;
      setCollapsed(true);
      PanelKit.setStep(root, 2);
      q('.vResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // Podcast clips: check the recording, then draw its waveform as the clip's picture.
    async function onAudioDone(m) {
      const url = URL.createObjectURL(m.blob);
      result = { kind: 'audio', blob: m.blob, start: m.start, end: m.end, duration: info.duration, url: m.url || info.url, title: m.title || info.title,
        show: m.show || info.show || '', artwork: m.artwork || info.artwork || '', poster: null };
      const pv = q('.vPreview');
      pv.src = url;
      q('.vResult').hidden = false;
      showTakeStep();
      const a = document.createElement('audio');
      a.preload = 'auto';
      const am = once(a, 'loadedmetadata');
      a.src = url;
      await am;
      const req = m.end - m.start, dur = await realDuration(a);
      status.add(isFinite(dur) && Math.abs(dur - req) <= 0.75 ? 'pass' : 'fail', 'Length matches the selection', `Asked for ${req.toFixed(1)}s, got ${isFinite(dur) ? dur.toFixed(2) + 's' : 'unknown'}`);
      status.add(isFinite(dur) && dur <= MAX + 0.5 ? 'pass' : 'fail', 'Under the 90 second cap', '');
      let w = null;
      try { w = await Waveform.fromBlob(m.blob, 40); } catch (e) { log('Waveform failed. ' + e.message); }
      const audible = w && w.peak > 0.003;
      status.add(audible ? 'pass' : 'fail', 'Clip has audible sound', audible ? `Peak level ${w.peak.toFixed(3)}` : 'The recording is silent. This site probably does not allow its audio to be recorded.');
      if (w) { result.poster = Waveform.image(w); q('.ccPoster').src = result.poster; }
      status.add('info', 'File size', `${(m.size / 1048576).toFixed(2)} MB at ${(m.size * 8 / 1000 / req).toFixed(0)} kbps`);
      status.add('info', 'Capture time', `${(m.elapsedMs / 1000).toFixed(1)}s for ${req.toFixed(1)}s. Recorder ${m.recorderMime}`);
      status.done(`Clip ready. ${(isFinite(dur) ? dur : req).toFixed(1)} seconds of audio.`, { quiet: audible });
      flagFailures();
      a.removeAttribute('src'); a.load();
      await Compose.fixDuration(pv);
      checking = false;
      render();
    }

    // A clip that failed a check puts Capture again first, and publishing it asks before going ahead.
    function flagFailures() {
      checksFailed = status.failed();
      q('.failBox').hidden = !checksFailed;
      q('.ccMeta').classList.toggle('bad', checksFailed);
      if (checksFailed) q('.ccMeta').textContent = "Didn't pass its checks";
    }
    q('.failRetry').addEventListener('click', () => {
      q('.failBox').hidden = true; checksFailed = false;
      setCollapsed(false);
      q('.capBtn').click();
    });
    async function publish(take, force = false) {
      if (!result) return;
      if (!force && checksFailed) {
        q('.vDup').innerHTML = `<div class="dupcard" role="alert"><p>This clip didn't pass its checks. Publish it anyway?</p>
          <div class="row"><button type="button" class="ghost dRetry">Capture again</button><button type="button" class="strong dAny">Publish anyway</button></div></div>`;
        q('.vDup').hidden = false;
        q('.vDup .dRetry').addEventListener('click', () => { q('.vDup').hidden = true; q('.failRetry').click(); });
        q('.vDup .dAny').addEventListener('click', () => { q('.vDup').hidden = true; checksFailed = false; publish(take, true); });
        return;
      }
      if (!force && opts.findDuplicate) {
        const ref = await opts.findDuplicate(result);
        if (ref) {
          PanelKit.dupWarn(q('.vDup'), { what: 'clip', onView: () => opts.onView && opts.onView(ref), onAnyway: () => { q('.vDup').hidden = true; publish(take, true); } });
          return;
        }
      }
      q('.vDup').hidden = true;
      compose.setBusy(true);
      try {
        pubRef = await opts.onPublish({ ...result }, take);
        isPublished = true;
        q('.vCompose').hidden = true;
        PanelKit.setStep(root, 4);
        PanelKit.published(q('.vPublished'), { note: pubRef && pubRef.note, local: !!(pubRef && pubRef.local),
          permalink: pubRef && pubRef.permalink,
          xHref: pubRef && pubRef.permalink ? AnnotationPage.xUrl(result, take, pubRef.permalink) : null,
          onView: () => opts.onView && opts.onView(pubRef),
          onNew: () => { clearResult(); render(); },
        });
      } catch (e) {
        showError('Publishing failed. ' + e.message);
      } finally { compose.setBusy(false); }
    }

    return {
      update(next) {
        if (drag || !next || !next.ok) return;
        info = next;
        const key = info.videoId || info.url;
        if (key !== lastVideoId) {
          lastVideoId = key;
          initSelection();
          if (!capturing) clearResult();
          q('.vTitle').textContent = info.title;
          if (isAudio) {
            let host = ''; try { host = new URL(info.url).hostname.replace(/^www\./, ''); } catch {}
            q('.vMeta').textContent = info.show || host || 'Podcast';
            wave = null; waveAsked = false;
          } else { film = null; filmAsked = false; }
          if (!isAudio) q('.vMeta').textContent = info.channel ? `${info.channel} on YouTube` : 'YouTube';
          log(`${isAudio ? 'Episode' : 'Video ' + info.videoId}, ${fmt(info.duration)}${isAudio ? '' : `, source ${info.width}x${info.height}`}`);
        }
        if (!isAudio && !filmAsked && ad.frames) {
          filmAsked = true;
          ad.frames(info).then((f) => {
            if (!f) return;
            film = f;
            f.onupdate = () => {
              if (f.failed) { log('Filmstrip unavailable: every frame came back blank, so the trimmer stays plain.'); film = null; q('.track').classList.remove('filmReady'); return; }
              requestAnimationFrame(drawFilm);
              if (f.done && f.stats) log(`Filmstrip: ${f.stats.kept} frames kept, ${f.stats.blank} blank, method ${f.stats.method}`);
            };
            drawFilm(); log('Filmstrip loading');
          }).catch((e) => log('No filmstrip. ' + e.message));
        }
        // Titles and channels can arrive after the video does. Keep the header current.
        if (info.title && q('.vTitle').textContent !== info.title) q('.vTitle').textContent = info.title;
        if (!isAudio) { const mt = info.channel ? `${info.channel} on YouTube` : 'YouTube'; if (q('.vMeta').textContent !== mt) q('.vMeta').textContent = mt; }
        if (isAudio && !waveAsked && ad.peaks) {
          waveAsked = true;
          ad.peaks().then((w) => { if (w) { wave = w; drawWave(); log(`Waveform ready, ${w.data.length} points`); } }).catch((e) => log('No waveform. ' + e.message));
        }
        render();
      },
      engine(m) {
        if (m.type === 'capture-progress') {
          q('.fill').style.width = clamp(((m.t - m.start) / (m.end - m.start)) * 100, 0, 100) + '%';
          q('.pText').textContent = `Recording ${(m.t - m.start).toFixed(0)}s of ${(m.end - m.start).toFixed(0)}s`;
        } else if (m.type === 'capture-done') { setCapturing(false); onDone(m); }
        else if (m.type === 'capture-error') { setCapturing(false); showError(m.error); }
      },
      get capturing() { return capturing; },
    };
  }
  return { create };
})();
