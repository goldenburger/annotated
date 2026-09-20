// Records a segment of a <video> at 240p, or of an <audio> player as sound only. Page side, no extension APIs.
// ClipEngine.create({ getVideo, adShowing, meta, send, audioOnly }) where send(msg) delivers
// capture-progress, capture-done (with a Blob) and capture-error messages.
const ClipEngine = (() => {
  const MAX_CLIP = 90, TARGET_H = 240;
  const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const AUDIO_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

  function create({ getVideo, adShowing = () => false, meta, send, audioOnly = false }) {
    let job = null;

    function info() {
      const v = getVideo();
      if (!v) return { ok: false, error: audioOnly ? 'No audio player found on this page.' : 'No video player found on this page.' };
      return { ok: true, ...meta(), duration: v.duration, currentTime: v.currentTime, paused: v.paused, muted: v.muted,
        width: v.videoWidth, height: v.videoHeight, ad: adShowing(), capturing: !!job };
    }

    function seekTo(v, t) {
      return new Promise((resolve, reject) => {
        if (Math.abs(v.currentTime - t) < 0.04 && v.readyState >= 2) return resolve();
        const done = () => { cleanup(); resolve(); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('The video took too long to seek. Try again.')); }, 15000);
        function cleanup() { v.removeEventListener('seeked', done); clearTimeout(timer); }
        v.addEventListener('seeked', done);
        v.currentTime = t;
      });
    }

    // Frame methods: 'draw' paints the video element straight onto the canvas; 'frame' goes through a
    // VideoFrame (WebCodecs), a separate path that still works in some cases where the first returns blank.
    const canUse = (m) => m === 'draw' || (m === 'frame' && typeof VideoFrame !== 'undefined');
    function drawWith(m, v, ctx, w, h) {
      if (m === 'frame') {
        let f = null;
        try { f = new VideoFrame(v); ctx.drawImage(f, 0, 0, w, h); } catch { ctx.drawImage(v, 0, 0, w, h); } finally { if (f) f.close(); }
      } else ctx.drawImage(v, 0, 0, w, h);
    }
    // Blank means every sampled pixel is near black or fully transparent.
    function isBlank(ctx, w, h) {
      try {
        const d = ctx.getImageData(0, 0, w, h).data;
        const step = Math.max(4, Math.floor(d.length / 4 / 400)) * 4;
        for (let i = 0; i < d.length; i += step) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 36) return false;
        return true;
      } catch { return false; }
    }
    async function pickMethod(v, ctx, w, h) {
      drawWith('draw', v, ctx, w, h);
      if (!isBlank(ctx, w, h) || !canUse('frame')) return 'draw';
      drawWith('frame', v, ctx, w, h);
      return isBlank(ctx, w, h) ? 'draw' : 'frame';
    }

    function posterFrame(v) {
      try {
        const c = document.createElement('canvas');
        c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
        const g = c.getContext('2d', { willReadFrequently: true });
        drawWith('draw', v, g, c.width, c.height);
        if (isBlank(g, c.width, c.height) && canUse('frame')) drawWith('frame', v, g, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.82);
      } catch { return null; }
    }

    async function capture(start, end) {
      const v = getVideo();
      if (!v) throw new Error('No video player found on this page.');
      if (job) throw new Error('A capture is already running.');
      if (adShowing()) throw new Error('An ad is playing. Wait for it to finish, then capture again.');
      if (!isFinite(v.duration)) throw new Error('Live streams cannot be clipped yet.');
      start = Math.max(0, start); end = Math.min(end, v.duration);
      const len = end - start;
      if (!(len >= 1)) throw new Error('A clip must be at least 1 second long.');
      if (len > MAX_CLIP + 0.05) throw new Error(`This clip is ${len.toFixed(1)} seconds. The limit is ${MAX_CLIP}.`);
      if (audioOnly) return captureAudio(v, start, end);
      if (!v.videoWidth) throw new Error('The video has not loaded a frame yet. Press play once, then capture again.');

      const h = TARGET_H, w = Math.max(2, Math.round((h * v.videoWidth / v.videoHeight) / 2) * 2);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      try { ctx.drawImage(v, 0, 0, w, h); ctx.getImageData(0, 0, 1, 1); }
      catch (e) { throw new Error('This video blocks frame capture: ' + e.message); }
      // Some browsers hand back blank frames through one method while the video plays fine. Pick a method that
      // gives a real picture, check again every second while recording, and switch if it goes blank.
      let method = await pickMethod(v, ctx, w, h);

      const canvasStream = canvas.captureStream(30);
      let audioTracks = [];
      try {
        const es = v.captureStream ? v.captureStream() : v.mozCaptureStream();
        audioTracks = es.getAudioTracks();
        es.getVideoTracks().forEach((t) => t.stop());
      } catch { /* no audio available */ }
      const mimeType = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
      const rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 450000, audioBitsPerSecond: 64000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

      const prev = { rate: v.playbackRate, loop: v.loop };
      let stopped = false, internalSeek = false, rafId = null, poll = null, lastProgress = 0, poster = null;
      const t0 = performance.now();
      let lastCheck = performance.now(), methodSwitches = 0, blankChecks = 0, sawPicture = false;
      const draw = () => {
        drawWith(method, v, ctx, w, h);
        const now = performance.now();
        if (now - lastCheck > 1000) {
          lastCheck = now;
          if (isBlank(ctx, w, h)) {
            const other = method === 'draw' ? 'frame' : 'draw';
            if (canUse(other)) { drawWith(other, v, ctx, w, h); if (!isBlank(ctx, w, h)) { method = other; methodSwitches++; sawPicture = true; return; } }
            // Two seconds in and still nothing through either method: stop rather than record a black clip.
            if (!sawPicture && ++blankChecks >= 2) abort("This browser isn't giving annotated the video's picture, so the clip would come out black. Reload the page and try again. If the video really is black at this point, pick a different moment.");
          } else sawPicture = true;
        }
      };
      const onFrame = (_n, m) => {
        if (stopped) return;
        draw();
        const t = m && typeof m.mediaTime === 'number' ? m.mediaTime : v.currentTime;
        if (t >= end) return finish();
        schedule();
      };
      const schedule = () => { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame); else rafId = requestAnimationFrame(() => onFrame()); };
      const onPause = () => { if (!stopped && rec.state === 'recording') rec.pause(); };
      const onPlay = () => { if (!stopped && rec.state === 'paused') rec.resume(); };
      const onSeeking = () => { if (!stopped && !internalSeek) abort('The video was scrubbed during capture, so the capture was cancelled.'); };
      const onEnded = () => finish();
      function detach() {
        ['pause', 'waiting'].forEach((e) => v.removeEventListener(e, onPause));
        ['play', 'playing'].forEach((e) => v.removeEventListener(e, onPlay));
        v.removeEventListener('seeking', onSeeking); v.removeEventListener('ended', onEnded);
        if (rafId) cancelAnimationFrame(rafId);
        clearInterval(poll);
        stream.getTracks().forEach((t) => t.stop());
        v.playbackRate = prev.rate; v.loop = prev.loop;
      }
      function finish() {
        if (stopped) return;
        stopped = true; v.pause(); detach();
        rec.onstop = () => {
          job = null;
          const blob = new Blob(chunks, { type: 'video/webm' });
          send({ type: 'capture-done', blob, size: blob.size, recorderMime: mimeType || rec.mimeType, width: w, height: h,
            start, end, hasAudioTrack: audioTracks.length > 0, elapsedMs: Math.round(performance.now() - t0), poster, frameMethod: method, methodSwitches, ...meta() });
        };
        if (rec.state !== 'inactive') rec.stop();
      }
      function abort(reason) {
        if (stopped) return;
        stopped = true; v.pause(); detach();
        rec.onstop = () => { job = null; send({ type: 'capture-error', error: reason }); };
        if (rec.state !== 'inactive') rec.stop(); else { job = null; send({ type: 'capture-error', error: reason }); }
      }
      job = { abort };
      try {
        v.pause();
        internalSeek = true; await seekTo(v, start); internalSeek = false;
        v.playbackRate = 1; v.loop = false; draw();
        poster = posterFrame(v);
        ['pause', 'waiting'].forEach((e) => v.addEventListener(e, onPause));
        ['play', 'playing'].forEach((e) => v.addEventListener(e, onPlay));
        v.addEventListener('seeking', onSeeking); v.addEventListener('ended', onEnded);
        rec.start(1000); schedule(); await v.play();
      } catch (e) { abort('Capture could not start: ' + e.message); throw e; }
      poll = setInterval(() => {
        if (stopped) return;
        if (adShowing()) return abort('An ad started during capture, so the capture was cancelled. Capture again after the ad.');
        if (v.currentTime >= end) return finish();
        const now = performance.now();
        if (now - lastProgress > 250) { lastProgress = now; send({ type: 'capture-progress', t: v.currentTime, start, end }); }
      }, 100);
    }

    // Podcasts: records the player's sound only, in real time, the same way video clips are recorded.
    // Loads the same episode in a second, hidden player that asks the audio server for permission.
    // Many podcast servers allow this, and then the audio can be recorded even though it comes from another site.
    function corsCopy(v) {
      return new Promise((resolve, reject) => {
        const src = v.currentSrc || v.src || (v.querySelector('source') || {}).src;
        if (!src) return reject(new Error('no source'));
        const c = document.createElement('audio');
        c.crossOrigin = 'anonymous'; c.preload = 'auto';
        const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 10000);
        const ok = () => { cleanup(); resolve(c); };
        const bad = () => { cleanup(); reject(new Error('The audio server does not allow it.')); };
        function cleanup() { clearTimeout(t); c.removeEventListener('loadedmetadata', ok); c.removeEventListener('error', bad); }
        c.addEventListener('loadedmetadata', ok); c.addEventListener('error', bad);
        c.src = src;
      });
    }

    async function captureAudio(orig, start, end) {
      if (orig.mediaKeys) throw new Error('This audio is protected by its service, so annotated cannot record it.');
      let tracks = [], v = orig, copy = null;
      const grab = (el) => { const es = el.captureStream ? el.captureStream() : el.mozCaptureStream(); es.getVideoTracks().forEach((t) => t.stop()); return es.getAudioTracks(); };
      try { tracks = grab(v); }
      catch (e) {
        if (!/cross-origin/i.test(e.message)) throw new Error('This player does not allow its audio to be recorded. ' + e.message);
        try { copy = await corsCopy(orig); orig.pause(); v = copy; tracks = grab(copy); }
        catch {
          // The panel can still record the tab's sound instead.
          const err = new Error('This episode is streamed from another site that does not allow direct recording.');
          err.code = 'NEEDS_TAB_AUDIO'; throw err;
        }
      }
      if (!tracks.length) throw new Error('This player does not allow its audio to be recorded. That usually means the audio is protected.');
      const mimeType = AUDIO_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const stream = new MediaStream(tracks);
      const rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, audioBitsPerSecond: 64000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const prev = { rate: v.playbackRate, loop: v.loop, muted: v.muted, volume: v.volume };
      let stopped = false, internalSeek = false, poll = null, lastProgress = 0;
      const t0 = performance.now();
      const onPause = () => { if (!stopped && rec.state === 'recording') rec.pause(); };
      const onPlay = () => { if (!stopped && rec.state === 'paused') rec.resume(); };
      const onSeeking = () => { if (!stopped && !internalSeek) abort('The episode was scrubbed during capture, so the capture was cancelled.'); };
      const onEnded = () => finish();
      function detach() {
        ['pause', 'waiting'].forEach((e) => v.removeEventListener(e, onPause));
        ['play', 'playing'].forEach((e) => v.removeEventListener(e, onPlay));
        v.removeEventListener('seeking', onSeeking); v.removeEventListener('ended', onEnded);
        clearInterval(poll);
        stream.getTracks().forEach((t) => t.stop());
        v.playbackRate = prev.rate; v.loop = prev.loop;
        if (copy) { copy.pause(); copy.removeAttribute('src'); copy.load(); }
      }
      function finish() {
        if (stopped) return;
        stopped = true; v.pause(); detach();
        rec.onstop = () => {
          job = null;
          const blob = new Blob(chunks, { type: 'audio/webm' });
          send({ type: 'capture-done', blob, size: blob.size, recorderMime: mimeType || rec.mimeType, width: 0, height: 0,
            start, end, hasAudioTrack: true, audioOnly: true, elapsedMs: Math.round(performance.now() - t0), poster: null, ...meta() });
        };
        if (rec.state !== 'inactive') rec.stop();
      }
      function abort(reason) {
        if (stopped) return;
        stopped = true; v.pause(); detach();
        rec.onstop = () => { job = null; send({ type: 'capture-error', error: reason }); };
        if (rec.state !== 'inactive') rec.stop(); else { job = null; send({ type: 'capture-error', error: reason }); }
      }
      job = { abort };
      try {
        v.pause();
        internalSeek = true; await seekTo(v, start); internalSeek = false;
        if (Math.abs(v.currentTime - start) > 1) throw new Error('The audio could not jump to the start of the clip.');
        v.playbackRate = 1; v.loop = false;
        ['pause', 'waiting'].forEach((e) => v.addEventListener(e, onPause));
        ['play', 'playing'].forEach((e) => v.addEventListener(e, onPlay));
        v.addEventListener('seeking', onSeeking); v.addEventListener('ended', onEnded);
        rec.start(1000); await v.play();
      } catch (e) { abort('Capture could not start: ' + e.message); throw e; }
      poll = setInterval(() => {
        if (stopped) return;
        if (v.currentTime >= end) return finish();
        const now = performance.now();
        if (now - lastProgress > 250) { lastProgress = now; send({ type: 'capture-progress', t: v.currentTime, start, end }); }
      }, 50);
    }

    // Plays just the chosen range once, then pauses at its end.
    let previewStop = null;
    function preview(start, end) {
      const v = getVideo();
      if (!v || job) return;
      if (previewStop) previewStop();
      const onTime = () => { if (v.currentTime >= end) { v.pause(); previewStop && previewStop(); } };
      const onSeek = () => { if (!job && (v.currentTime < start - 0.5 || v.currentTime > end + 0.5)) previewStop && previewStop(); };
      previewStop = () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeked', onSeek); previewStop = null; };
      v.currentTime = start;
      v.addEventListener('seeked', function once() {
        v.removeEventListener('seeked', once);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('seeked', onSeek);
        v.play().catch(() => {});
      });
    }

    // For recording the tab's sound: plays the range once, reporting progress, then says when it is done.
    let rangeJob = null;
    async function playRange(start, end) {
      const v = getVideo();
      if (!v) throw new Error('No audio player found on this page.');
      if (rangeJob) rangeJob.stop();
      v.pause();
      await seekTo(v, start);
      let poll = null, lastProgress = 0;
      const stop = (done) => { clearInterval(poll); v.pause(); rangeJob = null; if (done) send({ type: 'pod-range-done', start, end }); };
      rangeJob = { stop: () => stop(false) };
      await v.play();
      poll = setInterval(() => {
        if (v.currentTime >= end || v.ended) return stop(true);
        const now = performance.now();
        if (now - lastProgress > 250) { lastProgress = now; send({ type: 'capture-progress', t: v.currentTime, start, end }); }
      }, 40);
    }

    return {
      info, capture, preview, playRange,
      pause() { const v = getVideo(); if (v && !job) v.pause(); if (previewStop) previewStop(); },
      stopRange() { if (rangeJob) rangeJob.stop(); },
      seek(t) { const v = getVideo(); if (v && !job && isFinite(t)) v.currentTime = t; },
      abort() { if (job) job.abort('Capture cancelled.'); },
    };
  }
  return { create, MAX_CLIP };
})();
