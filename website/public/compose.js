// Commentary step. Shared by the extension and the preview.
// Compose.create(container, { placeholder, onPublish, onMicBlocked, log }) -> { reset, value, setBusy }
const Compose = (() => {
  const TAGS = ['Hot take', 'Fact check', 'Steelman', 'Receipts', 'Explainer'];
  const MAX_TEXT = 500, MAX_VOICE = 60;
  let uid = 0;
  const fmtS = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // MediaRecorder WebM has no duration header, so the player shows no length until it finds the end.
  // Resolves once the length is known and the player is back at the start (or after 4 seconds).
  function fixDuration(a) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); resolve(); };
      const t = setTimeout(resolve, 4000);
      a.addEventListener('loadedmetadata', function f() {
        a.removeEventListener('loadedmetadata', f);
        if (isFinite(a.duration)) return done();
        a.addEventListener('durationchange', function g() {
          if (!isFinite(a.duration)) return;
          a.removeEventListener('durationchange', g);
          a.addEventListener('seeked', done, { once: true });
          a.currentTime = 0;
        });
        a.currentTime = Number.MAX_SAFE_INTEGER;
      });
    });
  }

  function create(root, opts = {}) {
    let tag = null, voice = null, rec = null, stream = null, timer = null, recStart = 0, audioCtx = null, meterRaf = null, busy = false;
    const q = (s) => root.querySelector(s);
    const log = (m) => opts.log && opts.log(m);

    root.innerHTML = `
      <h2 class="step">Add your take</h2>
      <div class="kindLabel" id="kindLbl${++uid}">Kind <span>(optional)</span></div>
      <div class="tags" role="radiogroup" aria-labelledby="kindLbl${uid}">
        ${TAGS.map((t) => `<button type="button" class="tagbtn" role="radio" aria-checked="false">${t}</button>`).join('')}
      </div>
      <div class="takefield">
        <textarea class="takeInput" rows="4" maxlength="${MAX_TEXT}" aria-label="Written take" placeholder="${opts.placeholder || 'What should people notice?'}"></textarea>
        <div class="tfbar">
          <span class="count num" aria-live="polite"><span class="takeCount">0</span> of ${MAX_TEXT}</span>
          <span class="tfTools">
            <span class="emojiSlot"></span>
            <button type="button" class="quiet pollBtn hasTip" data-tooltip="Add a poll" aria-label="Add a poll" aria-pressed="false">${Brand.icon('poll')}</button>
            <button type="button" class="quiet recBtn hasTip" data-tooltip="Record up to 60 seconds">${Brand.icon('mic')} Voice note</button>
          </span>
        </div>
      </div>
      <div class="pollEdit" hidden>
        <div class="peHead"><b>Poll</b><button type="button" class="quiet peRemove">${Brand.icon('trash')} Remove poll</button></div>
        <input type="text" class="peQ" maxlength="80" aria-label="Poll question, optional" placeholder="Ask a question (optional), like Is this figure accurate?">
        <div class="peOpts"></div>
        <button type="button" class="link peAdd">Add an option</button>
      </div>
      <div class="voice">
        <div class="recstate" hidden>
          <span class="dot" aria-hidden="true"></span>
          <span class="recTime">0:00 of 1:00</span>
          <span class="meter" aria-hidden="true"><span class="meterFill"></span></span>
          <button type="button" class="quiet recStop">${Brand.icon('stop')} Stop</button>
        </div>
        <div class="voiceOut" hidden>
          <audio class="voiceAudio" controls></audio>
          <div class="row"><button type="button" class="ghost sm reRec">${Brand.icon('mic')} Record again</button><button type="button" class="ghost sm rmVoice">${Brand.icon('trash')} Remove</button></div>
        </div>
        <p class="error micMsg" hidden></p>
        <button type="button" class="ghost sm micFix" hidden>Allow the microphone</button>
      </div>
      <div class="pubBar">
        <p class="pubSignIn">Signed out, this is saved only on this computer. <button type="button" class="link pubSignInBtn">Sign in to publish it for everyone</button></p>
        <button type="button" class="primary publish" disabled>Publish</button>
        <p class="hint publishHint">Add a written take, a voice note, or both.</p>
      </div>`;

    // Shown only while signed out in the extension (the panel marks the page). The preview has no accounts.
    root.querySelector('.pubSignInBtn').addEventListener('click', () => { if (typeof Account !== 'undefined') Account.signIn(); });
    root.querySelectorAll('.tagbtn').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      root.querySelectorAll('.tagbtn').forEach((x) => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', String(on));
      tag = on ? b.textContent : null;
    }));
    // The take box grows with its text, and the counter only appears near the limit.
    const grow = () => { const t = q('.takeInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 260) + 'px'; };
    const count = () => {
      const n = q('.takeInput').value.length, c = q('.count');
      q('.takeCount').textContent = n;
      c.classList.toggle('near', n >= MAX_TEXT - 100);
      c.classList.toggle('full', n >= MAX_TEXT - 20);
    };
    q('.takeInput').addEventListener('input', () => { count(); grow(); validate(); });
    // Ctrl or Cmd and Enter publishes, like comments.
    q('.takeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && opts.onPublish && !q('.publish').disabled) { e.preventDefault(); opts.onPublish(value()); }
    });
    // Emoji: a picker button and :shortcode: autocomplete in the take.
    q('.emojiSlot').replaceWith(EmojiKit.button(q('.takeInput')));
    EmojiKit.autocomplete(q('.takeInput'));
    // Polls: two to four options of up to 25 characters, starting as Agree and Disagree.
    let pollOn = false;
    const drawPoll = (opts) => {
      q('.peOpts').innerHTML = opts.map((o, i) => `<div class="peRow"><input type="text" class="peOpt" maxlength="25" value="${PanelKit.esc(o)}" aria-label="Option ${i + 1}" placeholder="Option ${i + 1}">${opts.length > 2 ? `<button type="button" class="quiet peDel" data-i="${i}" aria-label="Remove option ${i + 1}">${Brand.icon('close')}</button>` : ''}</div>`).join('');
      q('.peAdd').hidden = opts.length >= 4;
      q('.peOpts').querySelectorAll('.peDel').forEach((b) => b.addEventListener('click', () => { const o = pollOpts(); o.splice(Number(b.dataset.i), 1); drawPoll(o); }));
    };
    const pollOpts = () => [...q('.peOpts').querySelectorAll('.peOpt')].map((i) => i.value);
    const setPoll = (on) => {
      pollOn = on; q('.pollEdit').hidden = !on; q('.pollBtn').setAttribute('aria-pressed', String(on));
      if (on && !q('.peOpt')) drawPoll(['Agree', 'Disagree']);
      if (on) { q('.pollEdit').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); q('.peQ').focus({ preventScroll: true }); }
    };
    q('.pollBtn').addEventListener('click', () => setPoll(!pollOn));
    q('.peRemove').addEventListener('click', () => { setPoll(false); q('.peOpts').innerHTML = ''; });
    q('.peAdd').addEventListener('click', () => { const o = pollOpts(); if (o.length < 4) { o.push(''); drawPoll(o); q('.peOpts').lastElementChild.querySelector('input').focus(); } });
    const pollValue = () => { if (!pollOn) return null; const o = pollOpts().map((x) => x.trim()).filter(Boolean); return o.length >= 2 ? { question: q('.peQ').value.trim(), options: o, vote: null } : null; };
    root._resetPoll = () => { setPoll(false); q('.peOpts').innerHTML = ''; q('.peQ').value = ''; };
    root._pollValue = pollValue;
    q('.recBtn').addEventListener('click', () => startRec());
    q('.reRec').addEventListener('click', () => startRec());
    q('.recStop').addEventListener('click', () => stopRec());
    q('.rmVoice').addEventListener('click', () => { setVoice(null); validate(); });
    q('.micFix').addEventListener('click', () => opts.onMicBlocked && opts.onMicBlocked());
    if (opts.onPublish) q('.publish').addEventListener('click', () => { if (!q('.publish').disabled) opts.onPublish(value()); });
    else { q('.publish').hidden = true; q('.publishHint').hidden = true; }

    function value() { return { tag, text: q('.takeInput').value.trim(), voice, poll: root._pollValue ? root._pollValue() : null }; }
    function validate() {
      const v = value(), ready = !busy && !rec && (v.text || v.voice);
      q('.publish').disabled = !ready;
      q('.publishHint').textContent = rec ? 'Stop the recording to publish.' : ready ? 'Opens your annotation page in a new tab. Ctrl or Cmd + Enter works too.' : 'Add a written take, a voice note, or both.';
    }
    function setBusy(b) { busy = b; q('.publish').textContent = b ? 'Publishing' : 'Publish'; validate(); }
    function hideMic() { q('.micMsg').hidden = true; q('.micFix').hidden = true; }

    function micError(e) {
      const name = e && e.name;
      let text;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        text = opts.onMicBlocked
          ? 'Chrome did not show a microphone prompt in the side panel. Allow the microphone once in a tab, then record again.'
          : 'The microphone is blocked for this page. Allow it in your browser settings, then record again.';
        q('.micFix').hidden = !opts.onMicBlocked;
      } else if (name === 'NotFoundError') text = 'No microphone was found. Connect one and record again.';
      else text = 'The microphone could not start. ' + ((e && e.message) || '');
      q('.micMsg').textContent = text; q('.micMsg').hidden = false;
      log(`Mic error ${name || ''}. ${(e && e.message) || ''}`);
    }

    async function startRec() {
      if (rec) return;
      hideMic();
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { return micError(e); }
      setVoice(null);
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const chunks = [];
      rec = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 48000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const secs = (performance.now() - recStart) / 1000;
        const blob = new Blob(chunks, { type: (mime || 'audio/webm').split(';')[0] });
        cleanupStream(); rec = null;
        if (blob.size && secs >= 0.5) { setVoice({ blob, url: URL.createObjectURL(blob), secs }); log(`Voice note ${secs.toFixed(1)}s, ${(blob.size / 1024).toFixed(0)} KB`); }
        showRecording(false); validate();
      };
      try {
        audioCtx = new AudioContext(); audioCtx.resume().catch(() => {});
        const an = audioCtx.createAnalyser(); an.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          let sum = 0; for (const x of buf) sum += x * x;
          q('.meterFill').style.width = (Math.min(1, Math.sqrt(sum / buf.length) * 6) * 100).toFixed(0) + '%';
          meterRaf = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* the meter is optional */ }
      rec.start(250); recStart = performance.now();
      showRecording(true); validate();
      timer = setInterval(() => {
        const s = (performance.now() - recStart) / 1000;
        q('.recTime').textContent = `${fmtS(s)} of ${fmtS(MAX_VOICE)}`;
        if (s >= MAX_VOICE) stopRec();
      }, 200);
    }
    function stopRec(discard = false) {
      clearInterval(timer);
      if (rec && rec.state !== 'inactive') {
        if (discard) rec.onstop = () => { cleanupStream(); rec = null; showRecording(false); };
        rec.stop();
      } else cleanupStream();
    }
    function cleanupStream() {
      cancelAnimationFrame(meterRaf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      if (audioCtx) audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    function showRecording(on) {
      q('.recBtn').hidden = on || !!voice;
      q('.recstate').hidden = !on;
      if (on) q('.voiceOut').hidden = true;
    }
    function setVoice(v) {
      voice = v;
      q('.voiceOut').hidden = !v;
      q('.recBtn').hidden = !!v;
      if (v) { q('.voiceAudio').src = v.url; fixDuration(q('.voiceAudio')); } else q('.voiceAudio').removeAttribute('src');
    }
    function reset() {
      stopRec(true);
      tag = null;
      root.querySelectorAll('.tagbtn').forEach((b) => b.setAttribute('aria-checked', 'false'));
      q('.takeInput').value = ''; q('.takeCount').textContent = '0'; q('.count').classList.remove('near', 'full'); q('.takeInput').style.height = '';
      if (root._resetPoll) root._resetPoll();
      setVoice(null); hideMic(); setBusy(false);
    }
    return { reset, value, setBusy };
  }
  return { create, fixDuration };
})();
