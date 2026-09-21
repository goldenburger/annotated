// Extension side panel shell. Keeps one panel per tab, so switching tabs never loses a capture or a draft.
const $ = (s) => document.querySelector(s);
const log = PanelKit.makeLog($('#log'));
PanelKit.initDebug();
PanelKit.compactOnScroll();

// Display: side panel or floating over the page. Inside the floating frame this page runs with ?embed=float.
const EMBED = new URLSearchParams(location.search).get('embed') === 'float';
const PINNED = Number(new URLSearchParams(location.search).get('tab')) || null;
if (EMBED) document.body.classList.add('embedded');
// Any page is allowed to load an extension page it can reach, so a hostile site could put this panel in a
// frame of its own and lay itself over the buttons. The frame the extension makes carries a key only the
// extension could have written. Nothing is drawn and nothing is started until that key matches, so a page
// that framed the panel is left with one sentence and no buttons to lay anything over.
const OURS = (async () => {
  if (!EMBED) return true;
  document.documentElement.style.visibility = 'hidden';
  const name = 'floatKey' + PINNED, given = new URLSearchParams(location.search).get('k') || '';
  let ok = false;
  try { const o = await chrome.storage.local.get(name); ok = !!given && o[name] === given; } catch {}
  if (!ok) document.body.textContent = 'Open annotated from its own button.';
  document.documentElement.style.visibility = '';
  return ok;
})();
function onDisplay(mode) {
  if (mode === 'side' && EMBED) {
    // Opening the side panel needs this click, so it happens right away. The frame removes itself when the setting changes.
    chrome.sidePanel.open({ tabId: PINNED }).catch(() => {});
  } else if (mode === 'float' && !EMBED) {
    // The background shows the floating panel on this tab, then the side panel closes.
    setTimeout(() => window.close(), 400);
  }
}
let displayApi = null, shortcutText = '';
if (!EMBED) document.body.classList.add('nativeSide');
// Inside the floating frame: the frame's bar sends the gear and help clicks here, and this page reports its height.
OURS.then((ok) => {
  if (!ok || !EMBED) return;
  window.addEventListener('message', (e) => {
    // Only the window hosting this frame. Anything else with a handle on us is not the frame's own bar.
    if (e.source !== parent) return;
    const d = e.data;
    if (!d || d.type !== 'annotated-cmd') return;
    if (d.cmd === 'display' && displayApi) displayApi.toggle();
    if (d.cmd === 'help') PanelKit.welcome(document.body, { shortcut: shortcutText, force: true, onDisplayChoice: onDisplay });
  });
  PanelKit.reportHeight(document.body, (h) => parent.postMessage({ type: 'annotated-height', h }, '*'));
});
Prefs.onChange((v) => {
  // Changing what a selection captures takes effect on every open page at once.
  for (const tid of panels.keys()) {
    sendTo(tid, { type: 'set-snap', exact: v.snap === 'exact' }).catch(() => {});
    sendTo(tid, { type: 'set-pen', pen: v.pen }).catch(() => {});
  }
});
Prefs.init(Prefs.chromeBackend()).then(async () => {
  if (!(await OURS)) return;
  PanelKit.topLinks(document.body, {
    onHome: () => openBrowse('home'),
    onProfile: () => openBrowse('profile'),
  });
  displayApi = PanelKit.displayMenu(document.body, { onDisplay, sideHint: EMBED ? '' : "Drag the side panel's edge to resize it. Chrome can also show it on the left, in Settings under Appearance." });
  Account.mount(document.body);
  chrome.commands.getAll().then((cmds) => {
    const c = cmds.find((x) => x.name === '_execute_action');
    shortcutText = (c && c.shortcut) || '';
    PanelKit.welcome(document.body, { shortcut: shortcutText, onDisplayChoice: onDisplay });
  }).catch(() => PanelKit.welcome(document.body, { shortcut: '', onDisplayChoice: onDisplay }));
});
$('#esIcons').innerHTML = ['clip', 'article', 'post'].map((n) => Brand.icon(n, 'lg')).join('');

const isWatch = (u) => { try { const x = new URL(u); return x.hostname.endsWith('youtube.com') && x.pathname === '/watch' && !!x.searchParams.get('v'); } catch { return false; } };
const isPost = (u) => { try { const x = new URL(u); return /(^|\.)(x|twitter)\.com$/.test(x.hostname) && /\/status\/\d+/.test(x.pathname); } catch { return false; } };
const isWeb = (u) => /^https?:\/\//.test(u || '') && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(u);
const slug = (s) => (s || 'annotation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'annotation';
const sendTo = (tid, m) => chrome.tabs.sendMessage(tid, m);

let activeTab = null, annKey = null;
const panels = new Map();   // tabId -> { kind, url, el, api, selCb }

async function publish(tid, item, take) {
  const title = AnnotationPage.titleOf(item);
  const id = `${slug(take.text || title)}-${Math.random().toString(36).slice(2, 6)}`;
  const saved = { tag: take.tag, text: take.text, voice: take.voice ? { blob: take.voice.blob } : null, poll: take.poll || null, gif: take.gif || null };
  await Store.put(id, { item, take: saved, reactions: [], sourceTabId: tid, created: Date.now() });
  // Signed in: share it, files and all, so it has a public page. Signed out, or if sharing fails, it stays on this computer.
  let author = null, note = '', local = false;
  try {
    author = await Cloud.publish(id, item, saved);
    if (author) await Store.update(id, { cloud: true, author });
    else { local = true; note = 'Saved on this computer. Sign in to publish it for everyone.'; }
  } catch (e) {
    local = true; note = 'Saved on this computer. Sharing failed: ' + e.message;
    log('Sharing failed: ' + e.message);
  }
  // Publishing leaves you where you are. Being thrown onto a page after every annotation lost your place in
  // whatever you were reading, and the panel already holds the link, the page and a fresh start.
  const after = Prefs.get().afterPublish;
  const t = after === 'page' ? await openExtPage('annotation.html#' + id) : null;
  log((author ? 'Published ' : 'Saved locally ') + id);
  return { tabId: t && t.id, id, permalink: Backend.permalink(id, author && author.handle), note, local };
}
// annotated's own reading pages live in one tab. Home, a profile and every annotation move that tab rather
// than each taking one of their own, which left a strip of identical tabs behind after a few captures. A tab
// already showing the exact page is simply brought forward. Anywhere that is not annotated, a source or a
// post on X, still opens a tab of its own, because that is leaving rather than moving around.
const OWN_PAGE = /\/(annotation|feed)\.html/;
async function openExtPage(path) {
  const url = chrome.runtime.getURL(path);
  const tabs = await chrome.tabs.query({});
  const same = tabs.find((t) => t.url === url);
  if (same) return chrome.tabs.update(same.id, { active: true });
  if (OWN_PAGE.test(url)) {
    const base = chrome.runtime.getURL('');
    const mine = tabs.filter((t) => t.url && t.url.startsWith(base) && OWN_PAGE.test(t.url));
    const here = await chrome.windows.getCurrent().catch(() => null);
    const reuse = (here && mine.find((t) => t.windowId === here.id)) || mine[0];
    if (reuse) return chrome.tabs.update(reuse.id, { url, active: true });
  }
  return chrome.tabs.create({ url });
}
const viewPublished = (ref) => {
  if (!ref) return;
  if (ref.tabId) chrome.tabs.update(ref.tabId, { active: true }).catch(() => openExtPage('annotation.html#' + ref.id));
  else openExtPage('annotation.html#' + ref.id);
};
const findDuplicate = async (item) => {
  const hit = (await Store.allMeta().catch(() => [])).find((r) => AnnotationPage.sameSource(r.item, item));
  return hit ? { id: hit.id, permalink: Backend.permalink(hit.id, hit.author && hit.author.handle) } : null;
};
async function deleteAnnotation(id) {
  const rec = await Store.get(id).catch(() => null);
  if (rec && rec.cloud) {
    // A shared annotation can only be deleted everywhere while signed in. Otherwise it would reappear from the shared copy.
    const me = await Backend.profile().catch(() => null);
    if (!me) { alert('This annotation is shared. Sign in from the panel first, so it is deleted everywhere.'); return; }
    try { await Cloud.remove(id, me.id); } catch (e) { alert('It could not be deleted online, so it was kept. ' + e.message); return; }
  }
  await Store.del(id);
  const url = chrome.runtime.getURL('annotation.html') + '#' + id;
  for (const t of await chrome.tabs.query({})) if (t.url === url) chrome.tabs.remove(t.id).catch(() => {});
  annKey = null;
  log('Deleted ' + id);
  refresh();
}
const onMicBlocked = () => openExtPage('mic.html');

function makeVideo(tid) {
  const el = document.createElement('div');
  $('#videoMode').appendChild(el);
  const api = VideoPanel.create(el, {
    seek: (t) => sendTo(tid, { type: 'seek', t }).catch(() => {}),
    preview: (start, end) => sendTo(tid, { type: 'preview', start, end }).catch(() => {}),
    pause: () => sendTo(tid, { type: 'pause' }).catch(() => {}),
    frames: async () => { const sb = await sendTo(tid, { type: 'storyboard' }).catch(() => null); return sb ? Filmstrip.fromStoryboard(sb) : null; },
    capture: (start, end) => sendTo(tid, { type: 'capture', start, end }),
    abort: () => sendTo(tid, { type: 'abort' }).catch(() => {}),
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, findDuplicate, onMicBlocked });
  return { kind: 'video', el, api };
}

// Which mode a page with audio is shown in, when someone switches it by hand.
const modeOverride = new Map();
const switchMode = (tid, url, mode) => { modeOverride.set(tid + ' ' + url, mode); drop(tid); refresh(); };

// Records the tab's own sound while the page plays the chosen range. Used when the episode is streamed from
// another site that does not allow direct recording. The listener still hears it through the panel.
async function tabAudioCapture(p, tid, start, end) {
  let id;
  try { id = await chrome.tabCapture.getMediaStreamId({ targetTabId: tid }); }
  catch (e) { log('Tab sound not available. ' + e.message); return { ok: false, error: 'This episode streams from another site. Click the annotated button in the toolbar while on this tab, then Capture clip again.' }; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } }, video: false });
  const ac = new AudioContext();
  ac.createMediaStreamSource(stream).connect(ac.destination);
  const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 64000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const cleanup = () => { stream.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}); p.tabRec = null; };
  p.tabRec = {
    finish() {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        cleanup();
        p.api.engine({ type: 'capture-done', blob, size: blob.size, recorderMime: mime || rec.mimeType, start, end, audioOnly: true,
          elapsedMs: Math.round(performance.now() - t0), ...(p.meta || {}) });
      };
      if (rec.state !== 'inactive') rec.stop();
    },
    abort(reason) { rec.onstop = () => { cleanup(); p.api.engine({ type: 'capture-error', error: reason }); }; if (rec.state !== 'inactive') rec.stop(); else { cleanup(); } },
  };
  const t0 = performance.now();
  const r = await sendTo(tid, { type: 'pod-play-range', start, end }).catch((e) => ({ ok: false, error: e.message }));
  if (!r || !r.ok) { cleanup(); return { ok: false, error: (r && r.error) || 'The episode could not be played.' }; }
  rec.start(1000);
  log('Recording the tab sound for this episode');
  return { ok: true };
}

// Podcasts from their public feed, for podcast apps whose own player can't be recorded (Spotify, Amazon,
// iHeartRadio and others) and for clipping any podcast by name. The episode plays in the panel itself.
const PODCAST_APPS = [/(^|\.)spotify\.com$/, /^music\.amazon\./, /(^|\.)iheart\.com$/, /^podcasts\.apple\.com$/, /(^|\.)pocketcasts\.com$/, /(^|\.)castbox\.fm$/, /(^|\.)overcast\.fm$/, /(^|\.)podbean\.com$/, /(^|\.)audible\./, /(^|\.)podcastaddict\.com$/];
const isPodcastApp = (url) => { try { const h = new URL(url).hostname; return PODCAST_APPS.some((re) => re.test(h)); } catch { return false; } };
// The page title without the app's name, as a starting search. These apps put their name at either end, so
// "Spotify - Search" used to be searched for word for word and came back with six unrelated shows.
const APP_TAIL = /\s*[|·•\-–—]\s*(?:podcast on spotify|spotify|apple podcasts|amazon music|iheart(?:radio)?|pocket casts|castbox|overcast|podbean|audible|podcast addict)\b.*$/i;
const APP_HEAD = /^(?:podcast on spotify|spotify|apple podcasts|amazon music|iheart(?:radio)?|pocket casts|castbox|overcast|podbean|audible|podcast addict)\s*[|·•\-–—]\s*/i;
// What is left once the app's name goes, when the page was only the app's own furniture.
const APP_CHROME = /^(your library|home|search|browse|explore|podcasts?|music|playlists?|queue|liked songs|web player[\s\S]*)$/i;
const episodeGuess = (title) => {
  const t = (title || '').replace(/^\(\d+\+?\)\s*/, '').replace(APP_TAIL, '').replace(APP_HEAD, '').trim();
  return APP_CHROME.test(t) ? '' : t;
};

function makeFeedPod(tid, url, pageTitle) {
  const el = document.createElement('div');
  $('#podcastMode').appendChild(el);
  el.innerHTML = `<section class="fpPick">
      <div class="fpHead"><span class="fpKind">${Brand.icon('podcast')}</span><div><b class="fpTitle">Find the episode</b>
        <p class="note fpNote">This player cannot be recorded, but most shows publish their episodes openly. annotated finds that original audio.</p></div></div>
      <form class="fpSearch" role="search"><input class="fpQ" type="search" placeholder="Episode or show name" aria-label="Search for an episode"><button class="strong sm">Search</button></form>
      <p class="note fpStatus" role="status"></p>
      <ul class="fpList"></ul>
      <button type="button" class="link fpChange" hidden>Choose a different episode</button>
    </section>
    <div class="fpClip" hidden></div>`;
  const q = (s) => el.querySelector(s);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  let probe = null, ep = null, api = null, stopAt = null;
  audio.addEventListener('timeupdate', () => { if (stopAt !== null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; } });
  const info = () => ({
    ok: !!probe, duration: probe ? probe.duration : NaN, currentTime: audio.currentTime, paused: audio.paused,
    title: ep ? ep.title : '', show: ep ? ep.show : '', url: ep ? (isPodcastApp(url) ? url : ep.link) : url, artwork: ep ? ep.artwork : '',
  });
  const p = { kind: 'audio', url, el, feed: true, api: null };
  api = VideoPanel.create(q('.fpClip'), {
    seek: (t) => { audio.currentTime = t; },
    preview: (s, e) => { audio.currentTime = s; stopAt = e; audio.play().catch(() => {}); },
    pause: () => { audio.pause(); stopAt = null; },
    // The clip is cut straight from the episode's file: only those bytes are downloaded.
    async capture(start, end) {
      const t0 = performance.now();
      try {
        const cut = await FeedPod.slice(probe, start, end);
        const i = info();
        api.engine({ type: 'capture-done', blob: cut.blob, size: cut.blob.size, recorderMime: 'audio/mpeg (cut from the original file, not re-recorded)',
          start, end, audioOnly: true, elapsedMs: Math.round(performance.now() - t0), url: i.url, title: i.title, show: i.show, artwork: i.artwork });
        log(`Cut ${cut.seconds.toFixed(2)}s from the episode file. Downloaded ${(cut.downloaded / 1024).toFixed(0)} KB of ${(probe.total / 1048576).toFixed(0)} MB.`);
        return { ok: true };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    peaks: async () => (probe ? FeedPod.waveform(probe, 10) : null),
  }, { kind: 'audio', log, onPublish: (i, t) => publish(tid, { ...i, feedUrl: ep && ep.feedUrl, audioUrl: ep && ep.audioUrl }, t), onView: viewPublished, findDuplicate, onMicBlocked });
  p.api = { update: () => probe && api.update(info()), engine: (m) => api.engine(m) };
  const tick = setInterval(() => { if (!el.isConnected) return clearInterval(tick); if (probe && !q('.fpClip').hidden) api.update(info()); }, 400);

  async function choose(e) {
    ep = e; probe = null;
    q('.fpStatus').textContent = `Opening "${e.title}"…`;
    q('.fpList').innerHTML = '';
    try {
      probe = await FeedPod.probe(e.audioUrl);
      audio.src = probe.url;
      q('.fpTitle').textContent = e.title;
      q('.fpNote').textContent = `${e.show}. From the show's public feed.`;
      q('.fpSearch').hidden = true; q('.fpStatus').textContent = ''; q('.fpChange').hidden = false; q('.fpHead').hidden = true;
      q('.fpClip').hidden = false;
      // "Choose a different episode" sits right under the episode's name.
      const ph = q('.fpClip .phead'); if (ph && q('.fpChange').parentElement !== q('.fpClip')) ph.after(q('.fpChange'));
      api.update(info());
      log(`Episode file: ${(probe.total / 1048576).toFixed(1)} MB, ${probe.kbps} kbps${probe.vbr ? ' variable' : ''}, ${Math.round(probe.duration)}s`);
    } catch (err) {
      q('.fpStatus').textContent = err.message + ' Try another result.';
      ep = null;
    }
  }
  async function run(term) {
    q('.fpList').innerHTML = '';
    // A link can never match, because the directory only knows names.
    if (/^\s*(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(term)) {
      q('.fpStatus').textContent = 'That is a link, and the directory only knows names. Type the show and a few words of the episode title.';
      return;
    }
    q('.fpStatus').textContent = 'Searching…';
    let res = [];
    try { res = await FeedPod.search(term); } catch (err) { q('.fpStatus').textContent = err.message; return; }
    if (!res.length) { q('.fpStatus').textContent = term ? 'No episodes found. Try the show name and a few words of the title.' : ''; return; }
    q('.fpStatus').textContent = res.length === 1 ? '1 episode found.' : `${res.length} episodes found. Pick the right one.`;
    q('.fpList').innerHTML = res.map((r, i) => `<li><button type="button" data-i="${i}">
        ${/^https:\/\//.test(r.thumb) ? `<img src="${PanelKit.esc(r.thumb)}" alt="" loading="lazy">` : `<span class="fpNoArt">${Brand.icon('podcast')}</span>`}
        <span class="fpText"><b>${PanelKit.esc(r.title)}</b><span class="note">${PanelKit.esc(r.show)}${r.released ? '. ' + new Date(r.released).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}${r.duration ? '. ' + PanelKit.fmt(r.duration) : ''}</span></span></button></li>`).join('');
    q('.fpList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => choose(res[Number(b.dataset.i)])));
  }
  q('.fpSearch').addEventListener('submit', (e) => { e.preventDefault(); run(q('.fpQ').value); });
  q('.fpChange').addEventListener('click', () => {
    audio.pause(); q('.fpClip').hidden = true; q('.fpChange').hidden = true; q('.fpSearch').hidden = false; q('.fpHead').hidden = false;
    q('.fpTitle').textContent = 'Find the episode'; q('.fpQ').focus();
  });
  const guess = episodeGuess(pageTitle);
  q('.fpQ').value = guess;
  if (!guess) q('.fpStatus').textContent = 'Type the show and a few words of the episode title.';
  if (!isPodcastApp(url)) {
    q('.fpNote').textContent = 'Search for any podcast episode by name. annotated clips it from the show\'s public feed.';
    // A way back to whatever this page offered before.
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'link fpBack'; back.textContent = 'Back to this page';
    back.addEventListener('click', () => { audio.pause(); feedAsked.delete(tid); drop(tid); refresh(); });
    q('.fpPick').appendChild(back);
  }
  if (guess) run(guess);
  return p;
}

function makePodcast(tid, url, src) {
  const el = document.createElement('div');
  $('#podcastMode').appendChild(el);
  const p = { kind: 'audio', url, el, route: 'unknown', meta: null, tabRec: null };
  const api = VideoPanel.create(el, {
    seek: (t) => sendTo(tid, { type: 'pod-seek', t }).catch(() => {}),
    preview: (start, end) => sendTo(tid, { type: 'pod-preview', start, end }).catch(() => {}),
    pause: () => sendTo(tid, { type: 'pod-pause' }).catch(() => {}),
    async capture(start, end) {
      if (p.route === 'protected') return { ok: false, error: 'This audio is protected by its service, so annotated cannot record it.' };
      if (p.route === 'tab') return tabAudioCapture(p, tid, start, end);
      const r = await sendTo(tid, { type: 'pod-capture', start, end });
      if (r && !r.ok && r.code === 'NEEDS_TAB_AUDIO') { p.route = 'tab'; return tabAudioCapture(p, tid, start, end); }
      return r;
    },
    abort: () => { if (p.tabRec) p.tabRec.abort('Capture cancelled.'); sendTo(tid, { type: 'pod-abort' }).catch(() => {}); },
    // The episode's waveform. MP3s with partial downloads load it 30 seconds at a time as the trimmer moves.
    // Anything else falls back to reading the whole file, when it is small enough (up to 60 MB).
    async peaks() {
      if (!/^https?:/.test(src || '')) return null;
      try { const pr = await FeedPod.probe(src); return FeedPod.waveform(pr, 10); } catch { /* not an MP3 with partial downloads */ }
      const head = await fetch(src, { method: 'HEAD' }).catch(() => null);
      const len = head && Number(head.headers.get('content-length'));
      if (len && len > 60 * 1048576) return null;
      const res = await fetch(src);
      if (!res.ok) return null;
      return Waveform.fromArrayBuffer(await res.arrayBuffer(), 10);
    },
  }, { kind: 'audio', log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, findDuplicate, onMicBlocked,
    switchTo: { label: 'Highlight text on this page instead', onClick: () => switchMode(tid, url, 'article') } });
  p.api = api;
  return p;
}

function makeArticle(tid, url, hasAudio = false) {
  const el = document.createElement('div');
  $('#articleMode').appendChild(el);
  const p = { kind: 'article', url, el, hasAudio, selCb: () => {} };
  // The page keeps its own copy of the capture preference, so tell it as soon as the panel exists.
  sendTo(tid, { type: 'set-snap', exact: Prefs.get().snap === 'exact' }).catch(() => {});
  sendTo(tid, { type: 'set-pen', pen: Prefs.get().pen }).catch(() => {});
  p.api = ArticlePanel.create(el, {
    onSelection(cb) { p.selCb = cb; },
    info: () => sendTo(tid, { type: 'a-info' }).catch(() => null),
    setExact: (v) => sendTo(tid, { type: 'set-exact', exact: v }).catch(() => {}),
    clear: () => sendTo(tid, { type: 'clear-selection' }).catch(() => {}),
    clearCaptured: () => sendTo(tid, { type: 'clear-captured' }).catch(() => {}),
    async capture() {
      const r = await sendTo(tid, { type: 'capture-passage' });
      if (!r || !r.ok) return r || { ok: false };
      try { await tabShot(tid, r); } catch (e) { r.shotError = 'Could not take a screenshot. ' + e.message; }
      return r;
    },
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, findDuplicate, onMicBlocked,
    switchTo: hasAudio ? { label: "Clip this page's audio instead", onClick: () => switchMode(tid, url, 'audio') } : null,
    onFindPodcast: () => { feedAsked.add(tid); drop(tid); refresh(); },
    pasteForm, wirePaste });
  return p;
}

// Screenshot the visible tab and convert a viewport box into image pixels.
async function tabShot(tid, r) {
  const tab = await chrome.tabs.get(tid);
  // Chrome only ever gives a picture of whichever tab is in front of a window, never of the tab it is asked
  // about, and setting a capture up takes about a second. A tab change inside that second used to put a
  // picture of somewhere else on the annotation, and publishing sends that picture to a bucket that is
  // public by link. No picture at all is better than a picture of the wrong page.
  const [front] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (!front || front.id !== tid) throw new Error('Another tab was in front, so the picture would have been of that page. Go back to the page and capture again.');
  if (EMBED) await sendTo(tid, { type: 'float-hide' }).catch(() => {});
  let shotUrl;
  try { shotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }); }
  finally {
    if (EMBED) sendTo(tid, { type: 'float-show' }).catch(() => {});
    sendTo(tid, { type: 'fold-restore' }).catch(() => {});
  }
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = shotUrl; });
  const k = img.width / r.vw;
  r.image = img;
  r.clip = { x: r.clip.x * k, y: r.clip.y * k, w: r.clip.w * k, h: r.clip.h * k };
  r.bounds = { x: 0, y: 0, w: img.width, h: img.height };
  return r;
}

function makePost(tid, url) {
  const el = document.createElement('div');
  $('#postMode').appendChild(el);
  const api = PostPanel.create(el, {
    info: () => sendTo(tid, { type: 'p-info' }).catch(() => null),
    clearCaptured: () => sendTo(tid, { type: 'clear-captured' }).catch(() => {}),
    async capture() {
      const r = await sendTo(tid, { type: 'capture-post' });
      if (!r || !r.ok) return r || { ok: false };
      try { await tabShot(tid, r); } catch (e) { r.shotError = 'Could not take a screenshot. ' + e.message; }
      return r;
    },
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, findDuplicate, onMicBlocked });
  return { kind: 'post', url, el, api };
}

// Services that encrypt their audio. annotated never records encrypted audio, so these get a clear message
// and a way to find the same episode somewhere it can be clipped.
const PROTECTED = [[/(^|\.)spotify\.com$/, 'Spotify'], [/^music\.apple\.com$/, 'Apple Music'], [/(^|\.)tidal\.com$/, 'Tidal'],
  [/^music\.amazon\./, 'Amazon Music'], [/(^|\.)audible\./, 'Audible'], [/(^|\.)pandora\.com$/, 'Pandora'], [/(^|\.)deezer\.com$/, 'Deezer']];
const protectedService = (url) => { try { const h = new URL(url).hostname; const hit = PROTECTED.find(([re]) => re.test(h)); return hit ? hit[1] : null; } catch { return null; } };
let lastProtected = '';
// Tabs where someone chose "Clip a podcast by name" from the empty panel.
const feedAsked = new Set();
function showProtected(tab, service) {
  const key = tab.id + ' ' + tab.url + ' ' + tab.title;
  if (key === lastProtected && !$('#empty').hidden) return;
  lastProtected = key;
  show(null, `${service} protects its audio, so annotated can't clip it. Many podcasts are also on YouTube or the show's own website, where you can clip them.`, `${service} can't be clipped`);
  const clean = (tab.title || '').replace(/\s*[|·-]\s*(podcast on )?(spotify|apple music|tidal|amazon music|audible|pandora|deezer).*$/i, '').replace(/^\(\d+\+?\)\s*/, '').trim();
  const box = $('#emptyAction');
  box.hidden = false;
  box.innerHTML = '';
  box.dataset.kind = 'protected';
  const a = document.createElement('a');
  a.className = 'primary sm'; a.target = '_blank'; a.rel = 'noopener';
  a.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(clean || service + ' podcast');
  a.textContent = clean && !/^(your library|home|search)$/i.test(clean) ? `Find "${clean.length > 50 ? clean.slice(0, 50) + '…' : clean}" on YouTube` : 'Search YouTube for the episode';
  box.appendChild(a);
}
// Paste a link: an article, a YouTube video, a post on X or a podcast episode opens in this tab, ready to annotate.
const pasteForm = () => `<form class="pasteForm" role="search" novalidate><label for="pasteUrl">Paste a link to annotate</label>
  <div class="row"><input id="pasteUrl" type="url" inputmode="url" placeholder="https://" autocomplete="off" spellcheck="false"><button class="strong sm">Open</button></div>
  <p class="note pasteMsg" role="status"></p></form>`;
function wirePaste(root) {
  const f = root.querySelector('.pasteForm');
  if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    let v = f.querySelector('input').value.trim();
    if (v && !/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
    let u = null; try { u = new URL(v); } catch {}
    if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) { f.querySelector('.pasteMsg').textContent = 'That does not look like a web link.'; return; }
    // The tab this panel is working with (the same one the panel shows).
    const pinned = Number(new URLSearchParams(location.search).get('tab'));
    const [t] = pinned ? [await chrome.tabs.get(pinned).catch(() => null)] : await chrome.tabs.query({ active: true, currentWindow: true });
    if (t) chrome.tabs.update(t.id, { url: u.href }); else chrome.tabs.create({ url: u.href });
    f.querySelector('.pasteMsg').textContent = 'Opening it here.';
  });
}
// Home and your profile read inside the panel. A menu shows its contents where you are, and opening a tab
// for one was both a lost place and a tab to close afterwards. An annotation is still a page, because its
// comments, its source and the conversation live there, and that page shares the one annotated tab.
let browsing = null, browseTab = 'foryou';
async function openBrowse(kind) {
  browsing = kind;
  for (const [, q] of panels) q.el.hidden = true;
  ['#videoMode', '#articleMode', '#postMode', '#podcastMode', '#annMode', '#empty'].forEach((s) => { $(s).hidden = true; });
  $('#browseMode').hidden = false;
  await drawBrowse();
}
function closeBrowse() {
  browsing = null;
  $('#browseMode').hidden = true;
  return refresh();
}
// Annotating something while the panel is showing Home or your profile puts it back on what you are
// annotating, because that is plainly what you just asked it for. The panel for that tab may not have been
// built while the list was up, so this waits for it rather than dropping the request.
async function annotateNow(tid) {
  await closeBrowse();
  for (let i = 0; i < 25; i++) {
    const q = panels.get(tid);
    if (q && q.api && q.api.captureNow) return q.api.captureNow();
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function drawBrowse() {
  const kind = browsing;
  const local = await Store.allMeta().catch(() => []);
  const me = await cachedProfile();
  let records = local, title = 'You', note = '', tabs = null;
  if (kind === 'profile' && me) {
    // Anything published from another computer belongs here too, and to whatever is deleted from here.
    let mine = [];
    try { mine = await Cloud.list({ authorId: me.id, limit: 100 }); } catch { /* signed out, or no connection */ }
    const here = new Set(local.map((r) => r.id));
    records = [...local, ...mine.filter((r) => !here.has(r.id))];
  }
  if (kind === 'home') {
    title = 'Home';
    let shared = [];
    try { shared = await Cloud.list({ limit: 60 }); } catch { /* signed out, or no connection */ }
    const seen = new Set(shared.map((r) => r.id));
    const merged = [...shared.map((r) => ({ ...r, mine: !!(me && r.author && r.author.id === me.id) })),
      ...local.filter((r) => !seen.has(r.id))];
    let soc = null;
    try { soc = await Cloud.discovery(me, {}); } catch { /* the rails are not needed here */ }
    soc = soc || { followed: new Set(), people: [], trending: { sources: [], tags: [] } };
    const t = Cloud.homeTabs(merged, soc, me, merged.filter((r) => r.mine || !r.author));
    const cur = t[browseTab] ? browseTab : 'foryou';
    records = t[cur].records; note = t[cur].note || '';
    tabs = { current: cur, options: [['foryou', 'For you'], ['following', 'Following'], ['everyone', 'Everyone']],
      onTab: (k) => { browseTab = k; drawBrowse(); } };
  }
  if (browsing !== kind) return;
  AnnotationPage.renderBrowse($('#browseMode'), {
    title, records, note, tabs, localAware: true,
    onOpen: (id) => openExtPage('annotation.html#' + id),
    onBack: closeBrowse,
    onFull: () => openExtPage(kind === 'home' ? 'feed.html' : 'feed.html#profile'),
    // The same control as on your profile page, where it took some finding.
    onDeleteAll: kind === 'profile' ? async (progress) => {
      const all = records.slice(), failed = [];
      let done = 0;
      for (const r of all) {
        if ((r.cloud || r.author) && me) {
          try { await Cloud.remove(r.id, me.id); } catch (e) { failed.push(e.message || 'It is still online.'); continue; }
        }
        await Store.del(r.id).catch(() => {});
        progress(++done, all.length);
      }
      await drawBrowse();
      return failed;
    } : null,
  });
}
function show(tid, msg, title) {
  if (browsing) return;
  const p = tid != null ? panels.get(tid) : null;
  if (!title) {
    // Nothing on this page to annotate: podcasts can still be clipped by name.
    const box = $('#emptyAction');
    box.hidden = false;
    if (!box.querySelector('.fpAny')) {
      box.innerHTML = `${pasteForm()}<button type="button" class="ghost sm fpAny">${Brand.icon('podcast')} Clip a podcast by name</button>`;
      wirePaste(box);
      box.querySelector('.fpAny').addEventListener('click', async () => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (t) { feedAsked.add(t.id); refresh(); }
      });
    }
  }
  $('#emptyTitle').textContent = title || 'Open something to annotate';
  for (const [id, q] of panels) q.el.hidden = id !== tid;
  $('#videoMode').hidden = !p || p.kind !== 'video';
  $('#articleMode').hidden = !p || p.kind !== 'article';
  $('#postMode').hidden = !p || p.kind !== 'post';
  $('#podcastMode').hidden = !p || p.kind !== 'audio';
  $('#annMode').hidden = true;
  $('#empty').hidden = !!p;
  if (!p) $('#emptyMsg').textContent = msg || 'Open a YouTube video, a news article, a podcast episode, or a post on X in this tab.';
}
function drop(tid) { const p = panels.get(tid); if (p) { p.el.remove(); panels.delete(tid); } }

// Who is signed in, remembered for a minute. The annotation panel redraws whenever a tab or a saved annotation
// changes, and each redraw used to ask the database again.
let profileCache = { at: 0, who: null };
async function cachedProfile() {
  if (Date.now() - profileCache.at < 60000) return profileCache.who;
  const who = await Backend.profile().catch(() => null);
  profileCache = { at: Date.now(), who };
  return who;
}

async function inject(tid, files, ping) {
  try { await sendTo(tid, { type: ping }); }
  catch { await chrome.scripting.executeScript({ target: { tabId: tid }, files }); log('Injected ' + files.join(', ')); }
}

let busyRefresh = false;
async function refresh() {
  // While the panel is showing Home or your profile it stays on them. Back puts the page you are on back.
  if (browsing) return;
  if (busyRefresh) return;
  busyRefresh = true;
  try {
    // Test hook: sidepanel.html?tab=<id> pins the panel to one tab.
    const pinned = Number(new URLSearchParams(location.search).get('tab'));
    const [tab] = pinned ? [await chrome.tabs.get(pinned).catch(() => null)] : await chrome.tabs.query({ active: true, currentWindow: true });
    const cur = activeTab != null && panels.get(activeTab);
    if (cur && cur.kind === 'video' && cur.api.capturing && tab?.id !== activeTab) return;
    if (!tab) return show(null);
    activeTab = tab.id;
    let p = panels.get(tab.id);
    if (isWatch(tab.url)) {
      if (p && p.kind !== 'video') { drop(tab.id); p = null; }
      try { await inject(tab.id, ['capture-engine.js', 'content.js'], 'ping'); }
      catch { return show(null, 'Reload the YouTube tab, then open this panel again.'); }
      const info = await sendTo(tab.id, { type: 'info' }).catch(() => null);
      if (!info || !info.ok) return show(null, (info && info.error) || 'Waiting for the video to load.');
      if (!isFinite(info.duration) || info.duration <= 0) return show(null, info.duration === Infinity ? 'Live streams cannot be clipped yet.' : 'Waiting for the video to load.');
      if (!p) { p = makeVideo(tab.id); panels.set(tab.id, p); }
      show(tab.id);
      p.api.update(info);
      return;
    }
    if (isPost(tab.url)) {
      const url = tab.url.split('?')[0];
      if (p && (p.kind !== 'post' || p.url !== url)) { drop(tab.id); p = null; }
      if (p) return show(tab.id);
      try { await inject(tab.id, ['post-core.js', 'article-core.js', 'capture-engine.js', 'article.js'], 'aping'); }
      catch { return show(null, 'Reload the X tab, then open this panel again.'); }
      p = makePost(tab.id, url); panels.set(tab.id, p);
      show(tab.id);
      await p.api.refresh();
      // Opened by the page's Annotate button: capture straight away, with the selected words.
      const ai = await sendTo(tab.id, { type: 'a-info' }).catch(() => null);
      if (ai && ai.autoCapture) p.api.captureNow();
      return;
    }
    // A service that encrypts its audio can never be recorded, whoever is asking, so those go straight to the
    // show's public feed. Every other podcast app gets its own player tried first, because most of them play
    // an ordinary audio file and clipping what you are listening to beats searching for it again.
    const feedPanel = () => {
      const url = tab.url.split('#')[0];
      if (p && (!p.feed || p.url !== url)) { drop(tab.id); p = null; }
      if (!p) { p = makeFeedPod(tab.id, url, feedAsked.has(tab.id) && !isPodcastApp(tab.url) ? '' : tab.title); panels.set(tab.id, p); }
      show(tab.id);
    };
    if ((isPodcastApp(tab.url) && protectedService(tab.url)) || feedAsked.has(tab.id)) return feedPanel();
    const service = protectedService(tab.url);
    if (service) { if (p) { drop(tab.id); p = null; } return showProtected(tab, service); }
    if (isWeb(tab.url)) {
      const url = tab.url.split('#')[0];
      try { await inject(tab.id, ['post-core.js', 'article-core.js', 'capture-engine.js', 'article.js'], 'aping'); }
      catch { return show(null, 'Chrome does not allow extensions on this page.'); }
      // A page with an audio player opens as a podcast when it looks like one. Either way the other mode is one click away.
      const pod = await sendTo(tab.id, { type: 'pod-info' }).catch(() => null);
      const hasAudio = !!(pod && pod.found && pod.route !== 'protected');
      // A podcast app whose player turns out to be unreadable falls back to the show's public feed.
      if (!hasAudio && isPodcastApp(tab.url)) return feedPanel();
      const want = modeOverride.get(tab.id + ' ' + url) || (hasAudio && pod.likely ? 'audio' : 'article');
      if (p && (p.kind !== want || p.url !== url)) { drop(tab.id); p = null; }
      if (want === 'audio') {
        if (!pod.ok || !isFinite(pod.duration) || pod.duration <= 0) {
          if (p) { drop(tab.id); p = null; }
          return show(null, pod.duration === Infinity ? 'Live audio cannot be clipped yet.' : 'Press play on the episode once so it loads, then this panel will be ready.');
        }
        if (!p) { p = makePodcast(tab.id, url, pod.src); panels.set(tab.id, p); }
        if (pod.route && pod.route !== 'unknown' && pod.route !== 'checking') p.route = pod.route;
        p.meta = { url: pod.url, title: pod.title, show: pod.show, artwork: pod.artwork };
        show(tab.id);
        p.api.update(pod);
        return;
      }
      if (p) return show(tab.id);
      p = makeArticle(tab.id, url, hasAudio); panels.set(tab.id, p);
      show(tab.id);
      await p.api.refresh();
      return;
    }
    drop(tab.id);
    const base = chrome.runtime.getURL('');
    if (tab.url && (tab.url.startsWith(base + 'annotation.html') || tab.url.startsWith(base + 'feed.html'))) {
      // Only reread saved annotations when something changed (the stamp) or the page did.
      const key = tab.url + ' ' + (await Store.stamp());
      show(null); $('#empty').hidden = true; $('#annMode').hidden = false;
      if (key === annKey) return;
      annKey = key;
      const records = await Store.allMeta().catch(() => []);
      const curId = tab.url.includes('annotation.html#') ? decodeURIComponent(tab.url.split('#')[1]) : null;
      const who = await cachedProfile();
      AnnotationPage.renderSide($('#annMode'), {
        current: records.find((r) => r.id === curId) || null, records,
        permalinkOf: (id) => { const r = records.find((x) => x.id === id); return Backend.permalink(id, r && r.author && r.author.handle); },
        localAware: true,
        onOpen: (id) => openExtPage('annotation.html#' + id),
        onFeed: () => openExtPage('feed.html#profile'),
        onDelete: (id) => deleteAnnotation(id),
        // Publishing without leaving the panel. The annotation page offers the same thing.
        onPublishNow: who ? async (id) => {
          const full = await Store.get(id);
          if (!full) throw new Error('That annotation is no longer saved here.');
          const author = await Cloud.publish(id, full.item, full.take);
          if (!author) throw new Error('Sign in first.');
          await Store.update(id, { cloud: true, author });
          await Cloud.carryOver(id, author.id, full.comments || [], full.reactions || [])
            .catch((e) => log('The annotation is shared, but its earlier comments did not copy over. ' + e.message));
          annKey = null;
          refresh();
        } : null,
      });
      return;
    }
    annKey = null;
    show(null);
  } finally { busyRefresh = false; }
}

chrome.runtime.onMessage.addListener((m, sender) => {
  if (browsing && m.type === 'annotate-request' && sender.tab) { annotateNow(sender.tab.id); return; }
  const p = sender.tab && panels.get(sender.tab.id);
  if (!p) return;
  if (m.type === 'sel-update' && p.kind === 'article') return p.selCb(m.sel);
  if (m.type === 'annotate-request' && p.kind === 'article') return p.api.captureNow();
  // On a post page, the Annotate button captures the post with the selected words as its quote.
  if (m.type === 'sel-update' && p.kind === 'post') return p.api.onSelection(m.sel);
  if (m.type === 'annotate-request' && p.kind === 'post') return p.api.captureNow();
  if (p.kind !== 'video' && p.kind !== 'audio') return;
  if (m.type === 'pod-range-done') { if (p.tabRec) p.tabRec.finish(); return; }
  if (m.type === 'capture-done') {
    const type = m.audioOnly ? 'audio/webm' : 'video/webm';
    fetch(m.dataUrl).then((res) => res.blob())
      .then((b) => p.api.engine({ ...m, blob: new Blob([b], { type }) }))
      .catch(() => p.api.engine({ type: 'capture-error', error: 'The recording could not be read.' }));
  } else if (m.type === 'capture-progress' || m.type === 'capture-error') p.api.engine(m);
});
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url) refresh(); });
chrome.tabs.onRemoved.addListener((id) => {
  drop(id);
  feedAsked.delete(id);
  for (const k of [...modeOverride.keys()]) if (k.startsWith(id + ' ')) modeOverride.delete(k);
});
// The panel polls for the tab it should follow. A hidden panel has nobody watching it, so it rests until it
// comes back, which it does immediately rather than on the next tick.
OURS.then((ok) => {
  if (!ok) return;
  setInterval(() => { if (document.visibilityState !== 'hidden') refresh(); }, 400);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
});
