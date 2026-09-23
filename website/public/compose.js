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
      <div class="takefield">
        <textarea class="takeInput" rows="4" maxlength="${MAX_TEXT}" aria-label="Written take" placeholder="${opts.placeholder || 'What should people notice?'}"></textarea>
        <div class="tfbar">
          <span class="count num" aria-live="polite"><span class="takeCount">0</span> of ${MAX_TEXT}</span>
          <span class="tfTools">
            <span class="emojiSlot"></span>
            <button type="button" class="quiet pollBtn hasTip" data-tooltip="Add a poll" aria-label="Add a poll" aria-pressed="false">${Brand.icon('poll')}</button>
            <button type="button" class="quiet upBtn hasTip" data-tooltip="Add a photo or video" aria-label="Add a photo or video" aria-pressed="false">${Brand.icon('image')}</button>
            <button type="button" class="quiet gifBtn hasTip" data-tooltip="Add a GIF" aria-label="Add a GIF" aria-pressed="false" hidden><span class="gifMark" aria-hidden="true">GIF</span></button>
            <button type="button" class="quiet recBtn hasTip" data-tooltip="Record up to 60 seconds">${Brand.icon('mic')} Voice note</button>
          </span>
        </div>
      </div>
      <div class="kindLabel" id="kindLbl${++uid}">Tag <span>(optional)</span></div>
      <div class="tags" role="radiogroup" aria-labelledby="kindLbl${uid}">
        ${TAGS.map((t) => `<button type="button" class="tagbtn" role="radio" aria-checked="false">${t}</button>`).join('')}
      </div>
      <input type="file" class="upFile" accept="${MEDIA_ACCEPT}" hidden>
      <div class="upChosen" hidden>
        <div class="upMedia"></div>
        <input type="text" class="upAlt" maxlength="200" aria-label="Describe it" placeholder="Describe it for anyone who cannot see it">
        <p class="note upHint">A few words of description let people who cannot see it know what it shows.</p>
        <button type="button" class="quiet upRemove">${Brand.icon('trash')} <span>Remove</span></button>
      </div>
      <p class="error upErr" role="alert" hidden></p>
      <p class="note swapNote" role="status" hidden></p>
      <div class="gifPick" hidden></div>
      <div class="gifChosen" hidden>
        <img class="gcImg" alt="">
        <button type="button" class="quiet gcRemove">${Brand.icon('trash')} Remove the GIF</button>
      </div>
      <div class="pollEdit" hidden>
        <div class="peHead"><b>Poll</b><button type="button" class="quiet peRemove">${Brand.icon('trash')} Remove poll</button></div>
        <input type="text" class="peQ" maxlength="80" aria-label="Poll question, optional" placeholder="Ask a question (optional)">
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
        <button type="button" class="primary publish" disabled>${typeof document !== 'undefined' && document.body.classList.contains('signedOut') ? 'Save on this computer' : 'Publish'}</button>
        <p class="hint publishHint">Add a written take, a voice note, a poll, a GIF, or a photo or video.</p>
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
    // Ctrl or Cmd and Enter publishes, like comments, from anywhere in the take box. It used to listen on the
    // text alone, so after choosing a tag or writing a poll option the shortcut the hint offers did nothing.
    root.addEventListener('keydown', (e) => {
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
      q('.peOpts').querySelectorAll('.peDel').forEach((b) => b.addEventListener('click', () => { const o = pollOpts(); o.splice(Number(b.dataset.i), 1); drawPoll(o); validate(); }));
    };
    const pollOpts = () => [...q('.peOpts').querySelectorAll('.peOpt')].map((i) => i.value);
    const setPoll = (on) => {
      pollOn = on; q('.pollEdit').hidden = !on; q('.pollBtn').setAttribute('aria-pressed', String(on));
      if (on && !q('.peOpt')) drawPoll(['Agree', 'Disagree']);
      if (on) { q('.pollEdit').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); q('.peQ').focus({ preventScroll: true }); }
    };
    // A GIF in a take, the way you would put one in a message. The button stays hidden until there is a key
    // to search with, so it never offers something that cannot work.
    let gif = null;
    // Choosing one picture puts the other away, and that is said, because a photo that vanished when a GIF was
    // picked read as the photo having failed.
    const swapSay = (t) => { const n = q('.swapNote'); if (n) { n.textContent = t || ''; n.hidden = !t; } };
    const gifShown = (g) => {
      const hadPhoto = !!(g && upload);
      gif = g;
      // One picture per take. A GIF and a photo side by side read as two takes, so choosing one puts the other away.
      if (g && root._resetUp) root._resetUp();
      swapSay(hadPhoto ? `The GIF replaced your ${root._lastUpKind === 'video' ? 'video' : 'photo'}. A take holds one picture.` : '');
      q('.gifChosen').hidden = !g;
      if (g) { q('.gcImg').src = g.preview || g.url; q('.gcImg').alt = g.alt || 'A GIF'; }
      q('.gifBtn').setAttribute('aria-pressed', String(!!g));
      validate();
    };
    const hasGiphy = typeof Giphy !== 'undefined' && Giphy.ready();
    q('.gifBtn').hidden = !hasGiphy;
    const picker = hasGiphy ? Giphy.mount(q('.gifPick'), {
      // The picker is tall enough to push Publish below the fold, so choosing one brings it back into view
      // rather than leaving you to hunt for the button you were on your way to.
      onPick: (g) => {
        gifShown(g);
        q('.gifPick').hidden = true;
        requestAnimationFrame(() => { if (!q('.publish').hidden) q('.publish').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      },
      onClose: () => { q('.gifPick').hidden = true; q('.gifBtn').focus(); },
    }) : null;
    q('.gifBtn').addEventListener('click', () => {
      const box = q('.gifPick');
      if (!picker) return;
      box.hidden = !box.hidden;
      if (box.hidden) return;
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      picker.opened();
    });
    q('.gcRemove').addEventListener('click', () => { gifShown(null); q('.gifBtn').focus(); });
    root._resetGif = () => { gifShown(null); q('.gifPick').hidden = true; if (picker) picker.clear(); };
    root._gifValue = () => gif;
    // What the picker calls when a GIF is chosen, reachable so a test can stand in for GIPHY.
    root.__pickGif = (g) => gifShown(g);

    // A photo or a short video of your own. The file stays in the browser until you publish, and it goes up
    // to the media bucket beside the clip and the screenshot. The bucket holds 25 MB a file, so anything
    // bigger is refused here with its size, rather than failing at Publish after the take is written.
    let upload = null, upUrl = null;
    const upErr = (text) => { q('.upErr').textContent = text || ''; q('.upErr').hidden = !text; };
    const upShown = (u) => {
      if (upUrl) { URL.revokeObjectURL(upUrl); upUrl = null; }
      upload = u;
      if (u) {
        upUrl = u.url;
        showMedia(q('.upMedia'), u);
        q('.upRemove span').textContent = u.kind === 'video' ? 'Remove the video' : 'Remove the photo';
        q('.upAlt').placeholder = u.kind === 'video' ? 'Say what happens in it, for anyone who cannot watch' : 'Describe it for anyone who cannot see it';
        if (gif) { gifShown(null); swapSay(`Your ${u.kind === 'video' ? 'video' : 'photo'} replaced the GIF. A take holds one picture.`); }
        else swapSay('');
        root._lastUpKind = u.kind;
      } else { q('.upMedia').textContent = ''; q('.upAlt').value = ''; }
      q('.upChosen').hidden = !u;
      q('.upBtn').setAttribute('aria-pressed', String(!!u));
      validate();
    };
    async function takeFile(file) {
      upErr('');
      if (!file) return;
      q('.upBtn').disabled = true;
      const r = await checkMedia(file);
      q('.upBtn').disabled = false;
      if (r.error) { upErr(r.error); return; }
      upShown(r.upload);
    }
    // Focus comes back to the button when the picker closes, and a tip on focus then sat on screen and over
    // the photo. The button lets go of it, unless you are using the keyboard.
    q('.upBtn').addEventListener('click', (e) => { q('.upFile').click(); if (e.detail) e.currentTarget.blur(); });
    q('.upFile').addEventListener('change', (e) => { takeFile(e.target.files && e.target.files[0]); e.target.value = ''; });
    q('.upRemove').addEventListener('click', () => { upShown(null); q('.upBtn').focus(); });
    // A picture dropped or pasted onto the take goes in the same way as one chosen with the button.
    q('.takefield').addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault(); });
    q('.takefield').addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); takeFile(f); } });
    q('.takeInput').addEventListener('paste', (e) => { const f = e.clipboardData && [...e.clipboardData.files][0]; if (f) { e.preventDefault(); takeFile(f); } });
    root._resetUp = () => { upShown(null); upErr(''); };
    root._upValue = () => (upload ? { ...upload, alt: q('.upAlt').value.trim() } : null);
    root._takeFile = takeFile;

    q('.pollBtn').addEventListener('click', () => { setPoll(!pollOn); validate(); });
    q('.peRemove').addEventListener('click', () => { setPoll(false); q('.peOpts').innerHTML = ''; validate(); });
    q('.peAdd').addEventListener('click', () => { const o = pollOpts(); if (o.length < 4) { o.push(''); drawPoll(o); q('.peOpts').lastElementChild.querySelector('input').focus(); } validate(); });
    // The question and the options are redrawn as they change, so this listens to the whole editor.
    q('.pollEdit').addEventListener('input', () => validate());
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

    function value() { return { tag, text: q('.takeInput').value.trim(), voice, poll: root._pollValue ? root._pollValue() : null, gif: root._gifValue ? root._gifValue() : null, upload: root._upValue ? root._upValue() : null }; }
    // A poll with a question is a take. Asking the room whether the clip holds up says as much as writing it
    // does, and the recording on 2026-09-21 showed a finished poll sitting next to a Publish button that
    // would not turn on and a line about written takes.
    const asked = (p) => !!(p && p.question && (p.options || []).length >= 2);
    // Signed out nothing is published, only kept on this computer, so the button and the step say Save.
    const signedOut = () => document.body.classList.contains('signedOut');
    const pubLabel = () => (busy ? (signedOut() ? 'Saving' : 'Publishing') : signedOut() ? 'Save on this computer' : 'Publish');
    function validate() {
      const v = value(), ready = !busy && !rec && (v.text || v.voice || asked(v.poll) || v.gif || v.upload);
      q('.publish').disabled = !ready;
      if (q('.publish').textContent !== pubLabel()) q('.publish').textContent = pubLabel();
      // What happens next depends on a setting, so the line says the one that is set rather than guessing.
      const after = typeof Prefs !== 'undefined' && Prefs.get ? Prefs.get().afterPublish : 'stay';
      q('.publishHint').textContent = busy ? 'Sending it now.'
        : rec ? 'Stop the recording to publish.'
        // Signed out there is no link to share, only a copy on this computer, so the line says that instead.
        : ready ? (signedOut() ? 'It stays on this computer until you sign in. Ctrl or Cmd + Enter works too.'
          : after === 'page' ? 'Opens your annotation page. Ctrl or Cmd + Enter works too.'
          : 'You stay here, with a link to share. Ctrl or Cmd + Enter works too.')
        : 'Add a written take, a voice note, a poll, a GIF, or a photo or video.';
    }
    // The words and the tag of a take in progress are kept while this panel is open, so reloading it or the
    // extension updating does not throw away what was written. A photo or a voice note is a file and is not
    // kept, and the line under the box says so when words come back without one.
    const DKEY = opts.draftKey ? 'annotated-draft:' + opts.draftKey : '';
    const saveDraft = () => { if (!DKEY) return; try { const t = q('.takeInput').value; if (t.trim() || tag) sessionStorage.setItem(DKEY, JSON.stringify({ text: t, tag })); else sessionStorage.removeItem(DKEY); } catch { /* nowhere to keep it */ } };
    function forgetDraft() { if (DKEY) try { sessionStorage.removeItem(DKEY); } catch { /* nothing kept */ } }
    q('.takeInput').addEventListener('input', saveDraft);
    root.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.tagbtn')) setTimeout(saveDraft, 0); });
    if (DKEY) {
      let d = null;
      try { d = JSON.parse(sessionStorage.getItem(DKEY) || 'null'); } catch { d = null; }
      if (d && (d.text || d.tag)) {
        q('.takeInput').value = d.text || '';
        if (d.tag) root.querySelectorAll('.tagbtn').forEach((b) => { if (b.textContent === d.tag) b.click(); });
        const n = document.createElement('p');
        n.className = 'note draftNote'; n.textContent = 'Your words from before were kept. A photo or voice note has to be added again.';
        q('.takefield').after(n);
        q('.takeInput').addEventListener('input', () => n.remove(), { once: true });
        setTimeout(() => { count(); validate(); }, 0);
      }
    }
    // Signing in or out changes what that line should say, and it happens in the account button, not here.
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => validate()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    function setBusy(b) { busy = b; validate(); }
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
      // Record again makes a new one, so the address of the old recording is given back rather than left
      // holding it in memory for as long as the panel is open.
      if (voice && voice.url && (!v || v.url !== voice.url)) { try { URL.revokeObjectURL(voice.url); } catch { /* already gone */ } }
      voice = v;
      q('.voiceOut').hidden = !v;
      q('.recBtn').hidden = !!v;
      if (v) { q('.voiceAudio').src = v.url; fixDuration(q('.voiceAudio')); } else q('.voiceAudio').removeAttribute('src');
    }
    function reset() {
      forgetDraft();
      stopRec(true);
      tag = null;
      root.querySelectorAll('.tagbtn').forEach((b) => b.setAttribute('aria-checked', 'false'));
      q('.takeInput').value = ''; q('.takeCount').textContent = '0'; q('.count').classList.remove('near', 'full'); q('.takeInput').style.height = '';
      if (root._resetPoll) root._resetPoll();
      if (root._resetGif) root._resetGif();
      if (root._resetUp) root._resetUp();
      setVoice(null); hideMic(); setBusy(false);
    }
    // A panel that goes away stops a voice note being recorded, so the microphone is never left on unseen.
    root.dataset.compose = '1';
    root.__stopRec = () => stopRec(true);
    return { reset, value, setBusy };
  }
  // What may be uploaded, and how it is checked. The take box and the comment box both ask here, so the two
  // cannot come to disagree about what a file may be.
  const MEDIA_MAX = 25 * 1024 * 1024;
  const MEDIA_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/;
  const MEDIA_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
  // The file is opened once, here, and the same address is used for the preview. Opening it twice meant the
  // Remove button and the description line appeared about two seconds before the picture itself.
  function checkMedia(file) {
    if (!file) return Promise.resolve({ error: '' });
    if (!MEDIA_TYPES.test(file.type)) return Promise.resolve({ error: 'That kind of file cannot go on an annotation. Use a JPEG, PNG, WebP or GIF picture, or an MP4, WebM or QuickTime video.' });
    if (file.size > MEDIA_MAX) return Promise.resolve({ error: `That file is ${(file.size / 1048576).toFixed(1)} MB, and the most a file can be is 25 MB.` });
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    return new Promise((done) => {
      const url = URL.createObjectURL(file), el = document.createElement(kind === 'video' ? 'video' : 'img');
      const ok = (w, h, seconds) => done({ upload: { blob: file, url, kind, type: file.type, name: file.name, w: w || 0, h: h || 0, seconds: seconds || 0 } });
      const bad = () => { URL.revokeObjectURL(url); done({ error: kind === 'video' ? 'That video would not play here, so it cannot be added.' : 'That picture would not open here, so it cannot be added.' }); };
      if (kind === 'video') { el.preload = 'metadata'; el.onloadedmetadata = () => ok(el.videoWidth, el.videoHeight, el.duration); }
      else el.onload = () => ok(el.naturalWidth, el.naturalHeight);
      el.onerror = bad;
      el.src = url;
    });
  }
  // The preview of a chosen file, drawn from the address checkMedia already opened.
  function showMedia(box, u) {
    box.textContent = '';
    const el = document.createElement(u.kind === 'video' ? 'video' : 'img');
    el.className = 'upPreview';
    if (u.kind === 'video') { el.controls = true; el.preload = 'metadata'; } else el.alt = '';
    if (u.w && u.h) { el.width = u.w; el.height = u.h; }
    el.src = u.url;
    box.appendChild(el);
  }
  return { create, fixDuration, checkMedia, showMedia, MEDIA_ACCEPT };
})();
