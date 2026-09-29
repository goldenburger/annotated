// Extension side panel shell. Keeps one panel per tab, so switching tabs never loses a capture or a draft.
const $ = (s) => document.querySelector(s);
const log = PanelKit.makeLog($('#log'));
PanelKit.initDebug();
PanelKit.compactOnScroll();

// Display: side panel or floating over the page. Inside the floating frame this page runs with ?embed=float.
// Any copy of the panel inside a frame counts as floating, whatever its address says. Only ours carries the key, so a
// site that framed this page without "embed=float" used to get the whole signed-in panel with every button live
// (security audit of 2026-09-29). The native side panel is never in a frame.
const FRAMED = (() => { try { return window.top !== window; } catch { return true; } })();
const EMBED = new URLSearchParams(location.search).get('embed') === 'float' || FRAMED;
// Floating over a page, the panel is inside that page's document, which could make it transparent, move it or lay
// something over it to lead clicks onto it. While the browser says the panel is not plainly visible, the buttons
// that publish, undo or delete ask to be pressed a second time, saying so on the button (security audit of
// 2026-09-24). They used to stand down entirely, but the browser also reports a plainly visible frame as hidden
// in some cases (headless Edge always did), and a Publish that never works is worse than one that asks twice.
// A single click led onto the panel is what this stops. IntersectionObserver v2 is Chrome's.
if (EMBED && typeof IntersectionObserver !== 'undefined') {
  try {
    const seen = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      document.body.classList.toggle('occluded', e.isVisible === false);
    }, { trackVisibility: true, delay: 100, threshold: [0, 1] });
    addEventListener('DOMContentLoaded', () => seen.observe(document.body));
    if (document.body) seen.observe(document.body);
  } catch { /* an older browser: nothing to watch with */ }
  const WEIGHTY = '.publish, .pubUndo, .pubLater, .delYes, .delAllYes, .sdYes';
  const label = new WeakMap();
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest(WEIGHTY);
    if (!b) return;
    // The second press: the button's own words come back and it does what it does.
    if (b.dataset.armed) { delete b.dataset.armed; if (label.has(b)) b.innerHTML = label.get(b); return; }
    if (!document.body.classList.contains('occluded')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    label.set(b, b.innerHTML);
    b.dataset.armed = '1'; b.textContent = 'Press again to confirm';
    setTimeout(() => { if (b.dataset.armed) { delete b.dataset.armed; b.innerHTML = label.get(b); } }, 4000);
  }, true);
}
const PINNED = Number(new URLSearchParams(location.search).get('tab')) || null;
// Left by versions that offered to publish a take from the front page's try-it, which are demonstrations.
try { chrome.storage.local.remove(['annotatedTryit', 'annotatedTryitPublished']); } catch { /* not in the extension */ }
if (EMBED) document.body.classList.add('embedded');
// Any page is allowed to load an extension page it can reach, so a hostile site could put this panel in a
// frame of its own and lay itself over the buttons. The frame the extension makes carries a key only the
// extension could have written. Nothing is drawn and nothing is started until that key matches, so a page
// that framed the panel is left with one sentence and no buttons to lay anything over.
const OURS = (async () => {
  if (!EMBED) return true;
  document.documentElement.style.visibility = 'hidden';
  const name = 'floatKey' + PINNED;
  // The page's own script hands the key over by message, from the page that holds this frame. The page itself
  // shares that window and can post as well, so a wrong key does not end the wait, or a hostile page could
  // turn the real panel away by sending one first. Every key offered is kept, and only the right one counts.
  // A key in the address is still accepted, which only a test does now, because our own code no longer puts
  // it there. The listener goes on before anything is awaited, so a key that arrives early is not missed.
  const offered = [];
  let wake = null;
  const on = (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== 'annotated-key') return;
    offered.push(String(e.data.k || '')); if (wake) wake();
  };
  addEventListener('message', on);
  const fromUrl = new URLSearchParams(location.search).get('k') || '';
  let want = '';
  try { want = (await chrome.storage.local.get(name))[name] || ''; } catch {}
  let ok = !!want && fromUrl === want;
  if (!ok && want) {
    const until = Date.now() + 4000;
    while (!(ok = offered.includes(want)) && Date.now() < until) {
      await new Promise((r) => { wake = r; setTimeout(r, Math.max(0, until - Date.now())); });
    }
  }
  removeEventListener('message', on);
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
    sendTo(tid, { type: 'set-pen', pen: v.pen, ink: Prefs.inkOf(v.tint) }).catch(() => {});
  }
  document.querySelectorAll('#emptyAction, .startBlock').forEach((box) => { if (box.querySelector('.suggest')) showSuggest(box); });
});
Prefs.init(Prefs.chromeBackend()).then(async () => {
  if (!(await OURS)) return;
  PanelKit.topLinks(document.body, {
    onHome: () => homeOrPage('home'),
    onProfile: () => homeOrPage('profile'),
  });
  displayApi = PanelKit.displayMenu(document.body, { onDisplay, sideHint: EMBED ? '' : "Drag the side panel's edge to resize it. Chrome can also show it on the left, in Settings under Appearance." });
  Account.mount(document.body);
  Account.setActions({
    onProfile: () => openBrowse('profile'),
    hasAny: async () => {
      const [local, me] = await Promise.all([Store.allMeta().catch(() => []), cachedProfile()]);
      return local.some((r) => !r.author || (me && r.author.id === me.id));
    },
    onDeleteAll: async () => {
      await openBrowse('profile');
      const b = $('#browseMode .delAllOpen');
      if (b) b.click();
      else {
        // Nothing to delete. The empty list used to say only "Capture something and it shows up", which
        // said nothing about the button that had just been pressed.
        // The profile's own empty text stands, which says how to make one.
      }
    },
  });
  // Beside a new tab there is nothing to try, so the welcome ends on the places to start instead.
  const bareNow = activeTabNow().then((t) => !t || bareTab(t.url)).catch(() => false);
  Promise.all([chrome.commands.getAll().catch(() => []), bareNow]).then(([cmds, bare]) => {
    const c = cmds.find((x) => x.name === '_execute_action');
    shortcutText = (c && c.shortcut) || '';
    PanelKit.welcome(document.body, { shortcut: shortcutText, onDisplayChoice: onDisplay, bare });
  });
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
  const saved = { tag: take.tag, text: take.text, voice: take.voice ? { blob: take.voice.blob } : null, poll: take.poll || null, gif: take.gif || null,
    upload: take.upload ? { blob: take.upload.blob, kind: take.upload.kind, type: take.upload.type, w: take.upload.w, h: take.upload.h, alt: take.upload.alt } : null };
  await Store.put(id, { item, take: saved, reactions: [], sourceTabId: tid, created: Date.now() });
  // Signed in: share it, files and all, so it has a public page. Signed out, or if sharing fails, it stays on this computer.
  let author = null, note = '', local = false, offline = false;
  // Uploads take longer than a row, so the limit grows with the files: a minute, and ten seconds a megabyte.
  const bytes = [item.blob, saved.voice && saved.voice.blob, saved.upload && saved.upload.blob].reduce((n, b) => n + ((b && b.size) || 0), 0);
  // A test can shorten the minute through window.__publishLimit, because waiting a real minute is no test.
  const limit = (Number(window.__publishLimit) || 60000) + Math.ceil(bytes / 1048576) * 10000;
  // The browser can think it is online while nothing gets through, on a captive wifi or a dropped link, and
  // the database client then retries for about seven seconds before giving up. One quick knock first says
  // whether annotated can be reached at all. Any answer counts, even a refusal. Only no answer means offline.
  const reachable = () => inTime(fetch(Backend.url + '/auth/v1/health', { method: 'GET', cache: 'no-store', headers: Backend.key ? { apikey: Backend.key } : {} }).then(() => true, () => false), 3000).catch(() => false);
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !(await reachable())) {
    local = true; offline = true; note = 'You are offline, so it is saved on this computer.';
  } else {
    const going = Cloud.publish(id, item, saved);
    try {
      author = await inTime(going, limit);
      if (author) await Store.update(id, { cloud: true, author });
      else { local = true; note = 'Saved on this computer. Sign in to publish it for everyone.'; }
    } catch (e) {
      local = true;
      if (e && e.message === 'timeout') {
        note = 'annotated did not answer in time, so it is saved on this computer. If it gets through, the page will say so.';
        // It may still land. If it does, the copy here learns it is shared, so nothing is published twice.
        going.then((a) => {
          if (!a) return;
          if (Store.wasDeleted(id)) { Cloud.remove(id, a.id).then(() => log('Landed after it was undone, so taken down ' + id)).catch(() => {}); return; }
          Store.update(id, { cloud: true, author: a }).then(() => log('Shared after all ' + id));
        }).catch(() => {});
      } else {
        console.warn('publish', e);
        note = /lot of annotations/i.test((e && e.message) || '') ? `Saved on this computer. ${e.message}`
          : 'Saved on this computer. It could not be shared just now, so try Publish it now from its page.';
      }
      log('Sharing failed: ' + (e && e.message));
    }
  }
  // Publishing leaves you where you are. Being thrown onto a page after every annotation lost your place in
  // whatever you were reading, and the panel already holds the link, the page and a fresh start.
  const after = Prefs.get().afterPublish;
  // Straight after publishing, the page behind you really is the one you were annotating, so Back can mean
  // that. Any other way into an annotation, you came from a list and Back has to go there instead.
  const t = after === 'page' ? await openExtPage('annotation.html#' + id, () => chrome.storage.session.set({ annFrom: 'publish' }).catch(() => {})) : null;
  log((author ? 'Published ' : 'Saved locally ') + id);
  return { tabId: t && t.id, id, permalink: Backend.permalink(id, author && author.handle), note, local, offline };
}
// An annotation saved on this computer, published from the card that said it was saved. Signed out, this
// signs in first. The card used to lead with View page and leave signing in to a line of small print.
async function publishSaved(id) {
  let who = await cachedProfile();
  if (!who && typeof Account !== 'undefined') {
    await Account.signIn();
    profileCache = { at: 0, who: null };
    who = await cachedProfile();
  }
  if (!who) throw new Error('Sign-in did not finish, so it is still saved on this computer.');
  const full = await Store.get(id);
  if (!full) throw new Error('That annotation is no longer saved here.');
  const author = await Cloud.publish(id, full.item, full.take);
  if (!author) throw new Error('Sign in first.');
  await Store.update(id, { cloud: true, author });
  await Cloud.carryOver(id, author.id, full.comments || [], full.reactions || []).catch(() => {});
  return Backend.permalink(id, author.handle);
}
PanelKit.setPublishLater(publishSaved);
// annotated's own reading pages live in one tab. Home, a profile and every annotation move that tab rather
// than each taking one of their own, which left a strip of identical tabs behind after a few captures. A tab
// already showing the exact page is simply brought forward. Anywhere that is not annotated, a source or a
// post on X, still opens a tab of its own, because that is leaving rather than moving around.
const OWN_PAGE = /\/(annotation|feed)\.html/;
// beforeLoad runs only when a page is really about to load, which is what a mark for that load needs. A tab
// already showing the page is only brought forward, nothing loads, and a mark set then waited for some later
// load that had nothing to do with it.
// The full page of Home or your profile goes to one already open, on the website or here, before it opens another.
// Beside the website's profile it opened the extension's as a new tab (recording of 2026-09-25 at 14:08, 2:32).
async function openFull(kind, me) {
  const tabs = await chrome.tabs.query({ url: 'https://annotated-app.netlify.app/*' }).catch(() => []);
  const want = (u) => { try { const x = new URL(u); return kind === 'home' ? x.pathname === '/' && x.searchParams.has('feed') : !!(me && me.handle) && x.pathname === '/@' + me.handle; } catch { return false; } };
  // One in this window first, so a second copy is not opened beside the first (recording of 2026-09-25 at 19:26).
  const front = await activeTabNow().catch(() => null);
  const open = tabs.find((x) => want(x.url) && front && x.windowId === front.windowId) || tabs.find((x) => want(x.url));
  // Beside our website, that tab goes to the website's own full page, rather than the extension opening its copy
  // in a new tab (recording of 2026-09-25 at 15:38, 3:44).
  const here = front;
  if (!open && here && /^https:\/\/annotated-app\.netlify\.app\//.test(here.url || '') && (kind === 'home' || (me && me.handle))) {
    return chrome.tabs.update(here.id, { url: 'https://annotated-app.netlify.app/' + (kind === 'home' ? '?feed' : '@' + me.handle) });
  }
  if (open) {
    await chrome.tabs.update(open.id, { active: true }).catch(() => {});
    if (open.windowId != null) chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
    return open;
  }
  return openExtPage(kind === 'home' ? 'feed.html' : 'feed.html#profile');
}
// Our pages open in the window you are looking at. A tab of ours in another window is reused only to switch to a
// page it already shows, and then that window comes forward. View page used to move the Feed tab in a second
// window to the new annotation and leave that window behind, so every press seemed to do nothing (recording of
// 2026-09-25 at 19:26, 3:51 to 4:29).
async function openExtPage(path, beforeLoad = null) {
  const url = chrome.runtime.getURL(path);
  const tabs = await chrome.tabs.query({});
  const front = await activeTabNow().catch(() => null);
  const winId = front ? front.windowId : (await chrome.windows.getCurrent().catch(() => null) || {}).id;
  const show = async (t, props = {}) => {
    const done = await chrome.tabs.update(t.id, { ...props, active: true });
    if (t.windowId != null && t.windowId !== winId) chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
    return done;
  };
  const same = tabs.find((t) => t.url === url && t.windowId === winId) || tabs.find((t) => t.url === url);
  if (same) return show(same);
  if (beforeLoad) await beforeLoad();
  if (OWN_PAGE.test(url)) {
    const base = chrome.runtime.getURL('');
    const reuse = tabs.find((t) => t.windowId === winId && t.url && t.url.startsWith(base) && OWN_PAGE.test(t.url));
    if (reuse) return show(reuse, { url });
  }
  return chrome.tabs.create(winId != null ? { url, windowId: winId } : { url });
}
// From the published card the page behind you is the one you annotated, so the page is told so. From the
// duplicate warning ("View it") you published nothing just now, and the page is told nothing.
const viewPublished = (ref, { justPublished = true } = {}) => {
  if (!ref) return;
  const mark = justPublished ? () => chrome.storage.session.set({ annFrom: 'publish' }).catch(() => {}) : null;
  if (ref.tabId) chrome.tabs.update(ref.tabId, { active: true }).catch(() => openExtPage('annotation.html#' + ref.id, mark));
  else openExtPage('annotation.html#' + ref.id, mark);
};
// Only your own count. Someone else signed in on this computer annotating the same passage is not you
// repeating yourself. Whether it was published or only saved here changes what the warning can say.
const findDuplicate = async (item) => {
  const who = await inTime(cachedProfile(), 1500).catch(() => profileCache.who || null);
  const hit = (await Store.allMeta().catch(() => [])).find((r) => AnnotationPage.sameSource(r.item, item)
    && (!r.author || (who && r.author.id === who.id)));
  return hit ? { id: hit.id, published: !!hit.cloud, permalink: Backend.permalink(hit.id, hit.author && hit.author.handle) } : null;
};
async function deleteAnnotation(id) {
  const rec = await Store.get(id).catch(() => null);
  if (rec && rec.cloud) {
    // A shared annotation can only be deleted everywhere while signed in. Otherwise it would reappear from the shared copy.
    const me = await Backend.profile().catch(() => null);
    if (!me) { alert('This annotation is shared. Sign in from the panel first, so it is deleted everywhere.'); return false; }
    try { await Cloud.remove(id, me.id); } catch (e) { alert('It could not be deleted online, so it was kept. ' + e.message); return false; }
  } else if (rec && navigator.onLine !== false) {
    const me = await inTime(Backend.profile(), 3000).catch(() => null);
    if (me) await inTime(Cloud.remove(id, me.id), 5000).catch(() => {});
  }
  await Store.del(id);
  const url = chrome.runtime.getURL('annotation.html') + '#' + id;
  for (const t of await chrome.tabs.query({})) if (t.url === url) chrome.tabs.remove(t.id).catch(() => {});
  annKey = null;
  log('Deleted ' + id);
  refresh();
}
// Undo right after publishing: deleted online (it is the signed-in person's own, just made) and on this computer.
async function unpublish(ref) {
  if (!ref || !ref.id) throw new Error('There is nothing to undo.');
  const rec = await Store.get(ref.id).catch(() => null);
  if (rec && rec.cloud) {
    const me = await Backend.profile().catch(() => null);
    if (!me) throw new Error('Sign in again to undo it, since it is published.');
    await Cloud.remove(ref.id, me.id);
  } else if (!ref.offline && navigator.onLine !== false) {
    // Not marked shared, but a publish that timed out may still have landed: take that copy down too, if it exists.
    const me = await inTime(Backend.profile(), 3000).catch(() => null);
    if (me) await inTime(Cloud.remove(ref.id, me.id), 5000).catch(() => {});
  }
  await Store.del(ref.id);
  const url = chrome.runtime.getURL('annotation.html') + '#' + ref.id;
  for (const t of await chrome.tabs.query({})) if (t.url === url) chrome.tabs.remove(t.id).catch(() => {});
  annKey = null;
  log('Undone ' + ref.id);
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
    transcript: (v) => sendTo(tid, { type: 'transcript', v }).catch(() => null),
    capture: (start, end) => sendTo(tid, { type: 'capture', start, end }),
    abort: () => sendTo(tid, { type: 'abort' }).catch(() => {}),
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked });
  return { kind: 'video', el, api };
}

// The video in a post on X, with the same trimmer as YouTube. X has no storyboard, so the trimmer is plain.
function makeXVideo(tid, url) {
  const el = document.createElement('div');
  $('#videoMode').appendChild(el);
  const api = VideoPanel.create(el, {
    seek: (t) => sendTo(tid, { type: 'xv-seek', t }).catch(() => {}),
    preview: (start, end) => sendTo(tid, { type: 'xv-preview', start, end }).catch(() => {}),
    pause: () => sendTo(tid, { type: 'xv-pause' }).catch(() => {}),
    capture: (start, end) => sendTo(tid, { type: 'xv-capture', start, end }),
    abort: () => sendTo(tid, { type: 'xv-abort' }).catch(() => {}),
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked,
    switchTo: { current: 'video', modes: [['video', 'clip', 'Clip the video'], ['post', 'post', 'Quote the post']], onClick: (v) => switchMode(tid, url, v) } });
  return { kind: 'video', x: true, url, el, api };
}

// Which mode a page with audio is shown in, when someone switches it by hand.
const modeOverride = new Map(), autoMode = new Set();
const switchMode = (tid, url, mode) => { modeOverride.set(tid + ' ' + url, mode); autoMode.delete(tid + ' ' + url); drop(tid); refresh(); };

// Records the tab's own sound while the page plays the chosen range. Used when the episode is streamed from
// another site that does not allow direct recording. The listener still hears it through the panel.
async function tabAudioCapture(p, tid, start, end) {
  let id;
  try { id = await chrome.tabCapture.getMediaStreamId({ targetTabId: tid }); }
  catch (e) { log('Tab sound not available. ' + e.message); return { ok: false, error: 'This episode streams from another site. Click the annotated button in the toolbar while on this tab, then Capture clip again.' }; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } }, video: false });
  const ac = new AudioContext();
  let rec;
  const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  try {
    ac.createMediaStreamSource(stream).connect(ac.destination);
    rec = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 64000 });
  } catch (e) { stream.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}); return { ok: false, error: 'The tab sound could not be recorded. ' + e.message }; }
  let cancelled = false, wall = null;
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const cleanup = () => { clearInterval(wall); stream.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}); p.tabRec = null; };
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
    abort(reason) { cancelled = true; rec.onstop = () => { cleanup(); p.api.engine({ type: 'capture-error', error: reason }); }; if (rec.state !== 'inactive') rec.stop(); else { cleanup(); } },
  };
  const t0 = performance.now();
  const r = await sendTo(tid, { type: 'pod-play-range', start, end }).catch((e) => ({ ok: false, error: e.message }));
  if (cancelled) { cleanup(); return { ok: false, error: 'Capture cancelled.' }; }
  if (!r || !r.ok) { cleanup(); return { ok: false, error: (r && r.error) || 'The episode could not be played.' }; }
  rec.start(1000);
  // The tab's sound is recorded as long as it plays; a player that never reaches the end cannot keep it going for good.
  let played = 0, lastTick = performance.now();
  wall = setInterval(() => {
    const now = performance.now(); if (rec.state === 'recording') played += now - lastTick; lastTick = now;
    if (played > (end - start) * 1000 + 30000 && p.tabRec === mine) mine.abort('The episode did not finish playing, so the capture was cancelled. Capture again.');
  }, 1000);
  const mine = p.tabRec;
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
// An episode named in quotes, "This Is The Culmination Of Everything I Know" - Dr Andrew Huberman, kept its
// opening quote in the search box and got a second pair round it in "Opening". Double quotes do nothing for a
// search, so the suggestion drops them.
const unquote = (t) => String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
// Whether two names are the same episode: the words of the shorter one are all at the start of the longer.
// A tab title carries the show after the episode, "Our Big Fat Dream Episode · Stuff You Should Know".
const sameEpisode = (a, b) => {
  const n = (t) => unquote(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const x = n(a), y = n(b);
  if (!x || !y) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  // The shorter one has to end on a whole word, or "Episode 1" matched "Episode 12". Past forty characters a
  // title is taken as its own, since tabs cut long ones short.
  const head = s.length > 40 ? s.slice(0, 40) : s;
  return l === s || (l.startsWith(head) && (s.length > 40 || l.length === head.length || l[head.length] === ' '));
};
// A tab still loading is titled with its address, "open.spotify.com/episode/2RtdyPV…", which the finder
// searched in the recording of 2026-09-23 at 03:16 and found nothing.
const LOOKS_LIKE_ADDRESS = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/|$)/i;
const episodeGuess = (title) => {
  const t = unquote((title || '').replace(/^\(\d+\+?\)\s*/, '').replace(APP_TAIL, '').replace(APP_HEAD, '').trim());
  return APP_CHROME.test(t) || LOOKS_LIKE_ADDRESS.test(t) ? '' : t;
};
// The name of what a Most talked about row opened, kept for its tab. Spotify can take twenty seconds and more
// to put an episode's name in its title, and the panel already knew it. It lasts while the tab stays on the
// address the row opened and the page has not named anything itself.
const rowNames = new Map();
const tabName = (tab) => {
  const h = rowNames.get(tab.id);
  if (h && tab.url && sameAddress(h.url, tab.url) && !episodeGuess(tab.title)) return h.title;
  return tab.title;
};

function makeFeedPod(tid, url, pageTitle, why = 'protected') {
  const el = document.createElement('div');
  $('#podcastMode').appendChild(el);
  // Why you are looking at a search box rather than a trimmer. Saying a player cannot be recorded when it
  // simply has not started is both untrue and unhelpful, because starting it is the thing you can do.
  const WHY = {
    protected: 'This player cannot be recorded, but most shows publish their episodes openly. annotated finds that original audio.',
    quiet: 'Nothing is playing on this page yet. Open an episode and press play and annotated clips what you hear. Or find it below and clip it from the show\'s own feed.',
    asked: 'Most shows publish their episodes openly. Name the episode and annotated finds that original audio.',
  };
  el.innerHTML = `<section class="fpPick">
      <div class="fpHead"><span class="fpKind">${Brand.icon('podcast')}</span><div><b class="fpTitle">Find the episode</b>
        <p class="note fpNote">${WHY[why] || WHY.protected}</p></div></div>
      <form class="fpSearch" role="search"><input class="fpQ" type="search" placeholder="Episode or show name" aria-label="Search for an episode"><button class="strong sm">Search</button></form>
      <p class="note fpStatus" role="status"></p>
      <ul class="fpList"></ul>
      <button type="button" class="link fpChange" hidden>Choose a different episode</button>
      <p class="note fpNow" hidden>Now on this tab: <span class="fpNowName"></span>. <button type="button" class="link fpNowGo">Clip this one instead</button></p>
    </section>
    <div class="fpClip" hidden></div>`;
  const q = (s) => el.querySelector(s);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  let probe = null, ep = null, api = null, stopAt = null, startAt = null, cutting = null, pickGen = 0;
  audio.addEventListener('timeupdate', () => { if (stopAt !== null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; } });
  const info = () => ({
    ok: !!probe, duration: probe ? probe.duration : NaN, currentTime: startAt != null ? startAt : audio.currentTime, paused: audio.paused,
    title: ep ? ep.title : '', show: ep ? ep.show : '', url: ep ? episodeLink() : url, artwork: ep ? ep.artwork : '',
  });
  const p = { kind: 'audio', url, el, feed: true, api: null, pages: [],
    stop: () => { audio.pause(); audio.removeAttribute('src'); audio.load(); if (cutting) cutting.abort(); },
    busy: () => !!cutting };
  // Where "Listen to the episode" goes. The app's own page for the episode when the tab showed one whose
  // title matches the chosen episode, otherwise the episode's page in Apple's directory. It used to be the
  // tab's address as it was when you clipped, which on Spotify was the show page you had moved on to.
  const norm = (t) => unquote(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function episodeLink(e = ep) {
    const want = norm(e.title);
    const seen = p.pages.slice().reverse().find((x) => /\/episode\//.test(x.url) && want && norm(x.title).includes(want.slice(0, 40)));
    return (seen && seen.url) || e.link || url;
  }
  p._linkFor = episodeLink;
  api = VideoPanel.create(q('.fpClip'), {
    seek: (t) => { audio.currentTime = t; },
    preview: (s, e) => { audio.currentTime = s; stopAt = e; audio.play().catch(() => {}); },
    pause: () => { audio.pause(); stopAt = null; },
    // The clip is cut straight from the episode's file: only those bytes are downloaded.
    async capture(start, end) {
      const t0 = performance.now();
      cutting = new AbortController();
      try {
        const cut = await FeedPod.slice(probe, start, end, cutting.signal);
        const i = info();
        api.engine({ type: 'capture-done', blob: cut.blob, size: cut.blob.size, recorderMime: 'audio/mpeg (cut from the original file, not re-recorded)',
          start, end, audioOnly: true, elapsedMs: Math.round(performance.now() - t0), url: i.url, title: i.title, show: i.show, artwork: i.artwork });
        log(`Cut ${cut.seconds.toFixed(2)}s from the episode file. Downloaded ${(cut.downloaded / 1024).toFixed(0)} KB of ${(probe.total / 1048576).toFixed(0)} MB.`);
        return { ok: true };
      } catch (e) { return { ok: false, error: e.message }; }
      finally { cutting = null; }
    },
    abort: () => { if (cutting) cutting.abort(); },
    peaks: async () => (probe ? FeedPod.waveform(probe, 10) : null),
  }, { kind: 'audio', log, onPublish: (i, t) => publish(tid, { ...i, feedUrl: ep && ep.feedUrl, audioUrl: ep && ep.audioUrl }, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked });
  p.api = { update: () => probe && api.update(info()), engine: (m) => api.engine(m) };
  const tick = setInterval(() => { if (!el.isConnected) return clearInterval(tick); if (probe && !q('.fpClip').hidden) api.update(info()); }, 400);

  async function choose(e) {
    const my = ++pickGen;
    ep = e; probe = null;
    q('.fpStatus').textContent = /["“”]/.test(e.title) ? `Opening ${e.title}…` : `Opening "${e.title}"…`;
    q('.fpList').innerHTML = '';
    try {
      const got = await FeedPod.probe(e.audioUrl);
      if (my !== pickGen) return;
      probe = got;
      audio.src = probe.url;
      q('.fpTitle').textContent = e.title;
      q('.fpNote').textContent = `${e.show}. From the show's public feed.`;
      q('.fpSearch').hidden = true; q('.fpStatus').textContent = ''; q('.fpChange').hidden = false; q('.fpHead').hidden = true;
      q('.fpClip').hidden = false;
      // The clip starts where the app's own player is, when the tab is on this same episode, rather than at
      // nought, which is where the recording of 02:22 dragged it from each time.
      startAt = null;
      const tabPage = p.pages[p.pages.length - 1];
      if (tabPage && sameEpisode(tabPage.title, e.title)) {
        const pos = await sendTo(tid, { type: 'app-pos' }).catch(() => null);
        if (my !== pickGen) return;
        if (pos && Number.isFinite(pos.secs) && pos.secs > 0 && pos.secs < probe.duration - 3) { startAt = Math.floor(pos.secs); try { audio.currentTime = startAt; } catch { /* not loaded yet */ } }
      }
      q('.fpNow').hidden = true;
      // "Choose a different episode" sits right under the episode's name.
      const ph = q('.fpClip .phead'); if (ph && q('.fpChange').parentElement !== q('.fpClip')) { ph.after(q('.fpChange')); q('.fpChange').after(q('.fpNow')); }
      api.update(info());
      startAt = null;
      log(`Episode file: ${(probe.total / 1048576).toFixed(1)} MB, ${probe.kbps} kbps${probe.vbr ? ' variable' : ''}, ${Math.round(probe.duration)}s`);
    } catch (err) {
      if (my !== pickGen) return;
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
    const my = ++pickGen;
    let res = [];
    try { res = await FeedPod.search(term); } catch (err) { if (my === pickGen) q('.fpStatus').textContent = err.message; return; }
    if (my !== pickGen) return;
    if (!res.length) { q('.fpStatus').textContent = term ? 'No episodes found. Try the show name and a few words of the title.' : ''; return; }
    q('.fpStatus').textContent = res.length === 1 ? '1 episode found.' : `${res.length} episodes found. Pick the right one.`;
    q('.fpList').innerHTML = res.map((r, i) => `<li><button type="button" data-i="${i}">
        ${/^https:\/\//.test(r.thumb) ? `<img src="${PanelKit.esc(r.thumb)}" alt="" loading="lazy">` : `<span class="fpNoArt">${Brand.icon('podcast')}</span>`}
        <span class="fpText"><b>${PanelKit.esc(r.title)}</b><span class="note">${PanelKit.esc(r.show)}${r.released ? '. ' + new Date(r.released).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}${r.duration ? '. ' + PanelKit.fmt(r.duration) : ''}</span></span></button></li>`).join('');
    q('.fpList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => choose(res[Number(b.dataset.i)])));
    return res;
  }
  q('.fpSearch').addEventListener('submit', (e) => { e.preventDefault(); run(q('.fpQ').value); });
  // One press: let go of this episode, search for the one on the tab, and open it if it is the first result.
  q('.fpNowGo').addEventListener('click', async () => {
    const g = q('.fpNow').dataset.g || '';
    // The change link would search once from the tab and this searches again, which is two calls to Apple's
    // directory for one press.
    quietChange = true; q('.fpChange').click(); quietChange = false;
    if (!g) return;
    q('.fpQ').value = g; lastGuess = g;
    const res = await run(g);
    if (res && res[0] && sameEpisode(res[0].title, g)) choose(res[0]);
  });
  const noteFor = () => (isPodcastApp(url) ? (WHY[why] || WHY.protected) : 'Search for any podcast episode by name. annotated clips it from the show\'s public feed.');
  let quietChange = false;
  q('.fpChange').addEventListener('click', () => {
    pickGen++; audio.pause(); q('.fpClip').hidden = true; q('.fpChange').hidden = true; q('.fpSearch').hidden = false; q('.fpHead').hidden = false;
    q('.fpTitle').textContent = 'Find the episode'; q('.fpQ').focus();
    // The episode that was open is let go of entirely. Keeping it made the panel go on ignoring the tab, so
    // the box kept the old episode, and the note under the heading kept its show's name.
    ep = null; probe = null; typed = false; lastGuess = ''; q('.fpNow').hidden = true;
    q('.fpNote').textContent = noteFor();
    const tabPage = p.pages[p.pages.length - 1];
    const g = tabPage ? episodeGuess(tabPage.title) : '';
    q('.fpQ').value = g; q('.fpList').innerHTML = '';
    if (quietChange) return;
    if (g) { lastGuess = g; run(g); } else q('.fpStatus').textContent = 'Type the show and a few words of the episode title.';
  });
  // 4. A box emptied by hand says what to type again.
  q('.fpQ').addEventListener('input', () => { if (!q('.fpQ').value.trim()) { q('.fpList').innerHTML = ''; q('.fpStatus').textContent = 'Type the show and a few words of the episode title.'; } });
  let typed = false, lastGuess = '';
  q('.fpQ').addEventListener('input', () => { typed = true; });
  // Called on every refresh with the tab's title and address. A new guess replaces the old one only while
  // you have not typed and no episode is open, and it searches again, so starting a different episode on the
  // show page no longer leaves the one you looked at first in the box.
  p.hint = (title, pageUrl) => {
    if (pageUrl) { const last = p.pages[p.pages.length - 1]; if (!last || last.url !== pageUrl || last.title !== title) p.pages.push({ url: pageUrl, title }); if (p.pages.length > 20) p.pages.shift(); }
    const g = episodeGuess(title);
    if (ep && g && isPodcastApp(url)) {
      const other = !sameEpisode(g, ep.title) && /\/episode\//.test(pageUrl || '');
      if (q('.fpNow').hidden === other) q('.fpNow').hidden = !other;
      if (other && q('.fpNow').dataset.g !== g) { q('.fpNowName').textContent = g; q('.fpNow').dataset.g = g; }
      return;
    }
    if (!g || g === lastGuess || typed || ep || !isPodcastApp(url)) return;
    lastGuess = g; q('.fpQ').value = g; run(g);
  };
  const guess = episodeGuess(pageTitle);
  lastGuess = guess;
  q('.fpQ').value = guess;
  // On an app's episode page the name is coming, so the panel says it is waiting rather than asking you to
  // type what the page will say in a moment.
  const app = (() => { try { const h = new URL(url).hostname; return /spotify/.test(h) ? 'Spotify' : /music\.amazon/.test(h) ? 'Amazon Music' : /audible/.test(h) ? 'Audible' : 'the app'; } catch { return 'the app'; } })();
  if (!guess) q('.fpStatus').textContent = isPodcastApp(url) && /\/episode\//.test(url)
    ? `Waiting for ${app} to show the episode's name. Or type it here.` : 'Type the show and a few words of the episode title.';
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
      if (!/^https?:/.test(src || '') || !FeedPod.publicAddress(src)) return null;
      try { const pr = await FeedPod.probe(src); return FeedPod.waveform(pr, 10); } catch { /* not an MP3 with partial downloads */ }
      const head = await fetch(src, { method: 'HEAD' }).catch(() => null);
      const len = head && Number(head.headers.get('content-length'));
      if (len && len > 60 * 1048576) return null;
      const res = await fetch(src);
      if (!res.ok) return null;
      return Waveform.fromArrayBuffer(await res.arrayBuffer(), 10);
    },
  }, { kind: 'audio', log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked,
    switchTo: { label: 'Highlight text on this page instead', onClick: () => switchMode(tid, url, 'article') } });
  p.api = api;
  return p;
}

// A post on X is not a story, and the timeline is not one post, so the panel says what works there instead.
// YouTube anywhere but a video: its home page, a channel, search results.
const onYtHost = (u) => { try { return /(^|\.)youtube\.com$/.test(new URL(u).hostname); } catch { return false; } };
const onXHost = (u) => { try { return /(^|\.)(x|twitter)\.com$/.test(new URL(u).hostname); } catch { return false; } };
function makeArticle(tid, url, hasAudio = false) {
  const el = document.createElement('div');
  $('#articleMode').appendChild(el);
  const p = { kind: 'article', url, el, hasAudio, selCb: () => {} };
  // The page keeps its own copy of the capture preference, so tell it as soon as the panel exists.
  sendTo(tid, { type: 'set-snap', exact: Prefs.get().snap === 'exact' }).catch(() => {});
  sendTo(tid, { type: 'set-pen', pen: Prefs.get().pen, ink: Prefs.inkOf(Prefs.get().tint) }).catch(() => {});
  p.api = ArticlePanel.create(el, {
    onSelection(cb) { p.selCb = cb; },
    info: () => sendTo(tid, { type: 'a-info' }).catch(() => null),
    setExact: (v) => sendTo(tid, { type: 'set-exact', exact: v }).catch(() => {}),
    widen: (peek) => sendTo(tid, { type: 'widen-quote', peek }).then((r) => r || { ok: false }).catch(() => ({ ok: false })),
    clear: () => sendTo(tid, { type: 'clear-selection' }).catch(() => {}),
    clearCaptured: () => sendTo(tid, { type: 'clear-captured' }).catch(() => {}),
    async capture() {
      const r = await sendTo(tid, { type: 'capture-passage' });
      if (!r || !r.ok) return r || { ok: false };
      try { await tabShot(tid, r); } catch (e) { r.shotError = 'No picture this time. ' + e.message; }
      return r;
    },
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked,
    switchTo: hasAudio ? { label: "Clip this page's audio instead", onClick: () => switchMode(tid, url, 'audio') } : null,
    // Only a page with audio of its own offers it. On every news page it was clutter, and Home has it.
    onFindPodcast: hasAudio ? () => { feedAsked.set(tid, null); drop(tid); refresh(); } : null,
    xHost: onXHost(url), ytHost: onYtHost(url), pasteForm, wirePaste, draftKey: 'a:' + url, keep: keepFor('a:' + url) });
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
  // Checked again once taken, since a tab switch can land while the frame
  // is being hidden or the picture made.
  const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (!after || after.id !== tid) throw new Error('Another tab was in front, so the picture would have been of that page. Go back to the page and capture again.');
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
    widen: (peek) => sendTo(tid, { type: 'widen-quote', peek }).then((r) => r || { ok: false }).catch(() => ({ ok: false })),
    clearCaptured: () => sendTo(tid, { type: 'clear-captured' }).catch(() => {}),
    async capture() {
      const r = await sendTo(tid, { type: 'capture-post' });
      if (!r || !r.ok) return r || { ok: false };
      try { await tabShot(tid, r); } catch (e) { r.shotError = 'No picture this time. ' + e.message; }
      return r;
    },
  }, { log, onPublish: (i, t) => publish(tid, i, t), onView: viewPublished, onUndo: unpublish, findDuplicate, onMicBlocked, draftKey: 'p:' + url, keep: keepFor('p:' + url) });
  return { kind: 'post', url, el, api };
}

// Where a capture waits out a reload of the panel: this browser session, one per page. The screenshot is a
// few hundred kilobytes, well inside what the session store holds.
const keepFor = (key) => {
  const k = 'annotated-cap:' + key;
  const s = chrome.storage && chrome.storage.session;
  // The session store holds ten megabytes in all and other things live there too, such as where Back goes
  // after publishing, so only the five newest captures are kept and older ones make room.
  const save = async (v) => {
    const all = await s.get(null);
    const caps = Object.keys(all).filter((x) => x.startsWith('annotated-cap:') && x !== k).sort((a, b) => ((all[b] && all[b].at) || 0) - ((all[a] && all[a].at) || 0));
    if (caps.length > 4) await s.remove(caps.slice(4));
    await s.set({ [k]: { ...v, at: Date.now() } });
  };
  return s ? { load: () => s.get(k).then((o) => o[k] || null), save, clear: () => s.remove(k) } : null;
};
// Services that encrypt their audio. annotated never records encrypted audio, so these get a clear message
// and a way to find the same episode somewhere it can be clipped.
const PROTECTED = [[/(^|\.)spotify\.com$/, 'Spotify'], [/^music\.apple\.com$/, 'Apple Music'], [/(^|\.)tidal\.com$/, 'Tidal'],
  [/^music\.amazon\./, 'Amazon Music'], [/(^|\.)audible\./, 'Audible'], [/(^|\.)pandora\.com$/, 'Pandora'], [/(^|\.)deezer\.com$/, 'Deezer']];
const protectedService = (url) => { try { const h = new URL(url).hostname; const hit = PROTECTED.find(([re]) => re.test(h)); return hit ? hit[1] : null; } catch { return null; } };
let lastProtected = '';
// Tabs where someone chose "Clip a podcast by name" from the empty panel.
// Tab id to the site it was asked on (null until the next look notes it). The finder used to stay for good, so a news
// story opened in that tab afterwards could not be annotated until the tab was closed (audit of 2026-09-29).
const feedAsked = new Map();
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
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
// Places worth starting from, for a panel beside a page with nothing on it. Spotify encrypts its audio, so a
// Spotify episode goes to the podcast finder, which is where the panel takes it anyway.
const GO_SITES = [
  ['YouTube', 'https://www.youtube.com/', 'clip'],
  ['X', 'https://x.com/home', 'x'],
  ['Spotify', 'https://open.spotify.com/genre/podcasts-web', 'podcast'],
  ['Apple Podcasts', 'https://podcasts.apple.com/', 'podcast'],
  ['Google News', 'https://news.google.com/', 'article'],
];
// X's logo is its name, so that button shows the logo alone, and says X to a screen reader and in its tip.
const goSites = () => `<p class="goLabel">Start somewhere</p><div class="goSites">${GO_SITES.map(([name, url, icon]) =>
  icon === 'x' ? `<button type="button" class="ghost sm goSite" data-url="${url}" aria-label="${name}" title="${name}">${Brand.icon(icon)}</button>`
  : `<button type="button" class="ghost sm goSite" data-url="${url}">${Brand.icon(icon)} ${name}</button>`).join('')}</div>`;
// What people are talking about on annotated, above the places to start. It is asked for once and again
// after ten minutes at most, because the empty panel is drawn by the refresh loop and the list changes
// slowly. Three rows, one line of name and one of why, and nothing at all when there is nothing to say,
// so a quiet week reads as a quiet panel rather than as an empty box with a heading. Every word comes
// from other people's annotations, so it is written with textContent.
const TALK_ICON = { post: 'x', video: 'clip', audio: 'podcast', article: 'article' };
let talkAt = 0, talkRows = null;
function talkWhy(r) {
  const n = Number(r.annotations) || 0, ppl = Number(r.people) || 0, rep = Number(r.replies) || 0;
  const bits = [ppl > 1 ? `${ppl} people annotating` : `${n} annotation${n === 1 ? '' : 's'}`];
  if (rep) bits.push(`${rep} repl${rep === 1 ? 'y' : 'ies'}`);
  return bits.join(' · ');
}
let talkAsk = null;
async function drawTalked(box) {
  const el = box.querySelector('.talked');
  if (!el || typeof Cloud === 'undefined') return;
  if (!talkRows || Date.now() - talkAt > 60000) {
    if (!talkAsk) {
      talkAt = Date.now();
      talkAsk = inTime(Cloud.talkedAbout(3), 6000).then((r) => { talkRows = r; }, () => { talkRows = talkRows || []; }).finally(() => { talkAsk = null; });
    }
    await talkAsk;
  }
  const list = el.querySelector('.talkList');
  list.textContent = '';
  for (const r of talkRows) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'talkRow'; b.dataset.url = r.url;
    b.innerHTML = `<span class="talkIcon" aria-hidden="true">${Brand.icon(TALK_ICON[r.kind] || 'article')}</span><span class="talkText"><span class="talkName"></span><span class="talkWhy"></span></span>`;
    b.querySelector('.talkName').textContent = r.title;
    b.querySelector('.talkWhy').textContent = talkWhy(r);
    b.addEventListener('click', () => goTo(r.url, r.title));
    list.appendChild(b);
  }
  // The full title as a tooltip only where the row cuts it short. On a whole title it repeated the words
  // already on screen.
  requestAnimationFrame(() => list.querySelectorAll('.talkRow').forEach((b) => {
    const nm = b.querySelector('.talkName');
    if (nm.scrollWidth > nm.clientWidth + 1) b.title = nm.textContent; else b.removeAttribute('title');
  }));
  el.hidden = !talkRows.length;
}
// A deletion or another account makes the list out of date at once. It went on offering the sources of five
// deleted annotations for two minutes, through a change of account, in the recording of 2026-09-23 at 03:16.
function staleTalk() {
  talkRows = null; talkAt = 0;
  document.querySelectorAll('.talked').forEach((el) => { const box = el.closest('.esAction, .startBlock'); if (box && !el.closest('.suggest[hidden]') && box.getClientRects().length) drawTalked(box); });
}
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.annotatedStamp || ch.annotatedFollows)) staleTalk(); });
// Anyone who wants a clean slate turns the suggestions off in Display settings, which takes the talked
// about list and the places to start. Pasting a link and clipping a podcast by name stay, being tools.
function showSuggest(box) {
  const on = Prefs.get().suggest !== false;
  box.querySelectorAll('.suggest').forEach((s) => { s.hidden = !on; });
  if (on) drawTalked(box);
}
// A new tab, a blank page or a browser page has nothing to lose, so the site opens right there. Anything
// else opens beside it, because a settings page or a PDF you were reading should still be where you left it.
const isBlankTab = (t) => !!t && (!t.url || /^(about:blank|chrome:\/\/newtab|edge:\/\/newtab|chrome:\/\/new-tab-page)/.test(t.url));
// Two addresses for the same page: the same place, ignoring the fragment, tracking tags and a trailing slash,
// and on YouTube the same video whatever else the address carries.
function sameAddress(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    const host = (u) => u.hostname.replace(/^(www|m)\./, '');
    if (host(x) !== host(y)) return false;
    if (/youtube\.com$/.test(host(x)) && x.searchParams.get('v')) return x.searchParams.get('v') === y.searchParams.get('v');
    // The query counts, because Apple names an episode in it (?i=1000…), apart from tracking and sharing tags.
    const q = (u) => [...u.searchParams].filter(([k]) => !/^(utm_|si$|fbclid$|gclid$|ref$|feature$|t$)/.test(k)).sort().join('&');
    return x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && q(x) === q(y);
  } catch { return false; }
}
// Opening a page that is already open in a tab goes to that tab. By the end of the recording of 2026-09-23 at
// 03:16 there were ten tabs, three of them the same video. A name, when the caller knows one, is kept for the
// tab so the podcast finder can use it before the page says it.
async function goTo(url, name = '') {
  const open = (await chrome.tabs.query({}).catch(() => [])).find((x) => x.url && sameAddress(x.url, url));
  if (open) {
    await chrome.tabs.update(open.id, { active: true }).catch(() => {});
    if (open.windowId != null) chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
    if (name) rowNames.set(open.id, { url, title: name });
    return;
  }
  const t = await activeTabNow();
  const done = isBlankTab(t) ? await chrome.tabs.update(t.id, { url }).catch(() => null) : await chrome.tabs.create({ url }).catch(() => null);
  if (done && name) rowNames.set(done.id, { url, title: name });
}
// The help screen's link to annotated's home page goes to a tab already on it, whatever its address asks
// (?installed, ?planes), rather than opening another copy (recording of 2026-09-24 at 23:56, 2:22).
document.addEventListener('click', async (e) => {
  const a = e.target.closest && e.target.closest('a.wSite');
  if (!a) return;
  e.preventDefault();
  leaveHelp();
  const home = new URL(a.href);
  const tabs = await chrome.tabs.query({ url: home.origin + '/*' }).catch(() => []);
  const open = tabs.find((x) => { try { return new URL(x.url).pathname === '/'; } catch { return false; } });
  if (!open) { chrome.tabs.create({ url: a.href }).catch(() => {}); return; }
  await chrome.tabs.update(open.id, { active: true }).catch(() => {});
  if (open.windowId != null) chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
  chrome.scripting.executeScript({ target: { tabId: open.id }, func: () => scrollTo({ top: 0, behavior: 'instant' }) }).catch(() => {});
});
// The start page: what people are talking about, places to start, a link to paste and a podcast to find by
// name. It used to be drawn only beside a page with nothing to annotate, so once the tab went to a video
// there was no way back to it (the recording of 2026-09-23 at 02:48). It is now also the top of Home and what
// the panel shows beside the feed and your profile. Away from the empty panel (beside), nothing it opens
// replaces the page you are on, because that page may be a clip or a take in progress.
const startHtml = () => `<div class="suggest"><section class="talked" hidden><p class="goLabel">Most talked about lately</p><div class="talkList"></div></section>${goSites()}</div>${pasteForm()}<button type="button" class="ghost sm fpAny">${Brand.icon('podcast')} Clip a podcast by name</button>`;
function wireStart(box, beside = false) {
  wirePaste(box, beside);
  box.querySelectorAll('.goSite').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.url)));
  box.querySelector('.fpAny').addEventListener('click', async () => {
    const t = await activeTabNow();
    if (!t) return;
    if (!beside || isBlankTab(t)) { feedAsked.set(t.id, null); if (browsing) closeBrowse(); else refresh(); return; }
    const n = await chrome.tabs.create({}).catch(() => null);
    if (n) { feedAsked.set(n.id, null); refresh(); }
  });
  showSuggest(box);
}
// Each box has its own id: the panel holds several at once (one per tab and one on Home), and a shared id pointed the
// label at a hidden box (exploration of 2026-09-26).
let pasteN = 0;
const pasteForm = () => { const id = 'pasteUrl' + (++pasteN); return `<form class="pasteForm" role="search" novalidate><label for="${id}">Paste a link to annotate</label>
  <div class="row"><input id="${id}" class="pasteUrl" type="url" inputmode="url" placeholder="https://" autocomplete="off" spellcheck="false"><button class="strong sm">Open</button></div>
  <p class="note pasteMsg" role="status"></p></form>`; };
function wirePaste(root, beside = false) {
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
    if (t && (!beside || isBlankTab(t))) { chrome.tabs.update(t.id, { url: u.href }); f.querySelector('.pasteMsg').textContent = 'Opening it here.'; }
    else { chrome.tabs.create({ url: u.href }); f.querySelector('.pasteMsg').textContent = 'Opening it beside this.'; }
  });
}
// Home and your profile read inside the panel. A menu shows its contents where you are, and opening a tab
// for one was both a lost place and a tab to close afterwards. An annotation is still a page, because its
// comments, its source and the conversation live there, and that page shares the one annotated tab.
let browsing = null, browseTab = 'foryou', browsePressed = false, browseFrom = null, lastHome = null;
// What a list row needs of a record, so the kept lists stay small.
const slim = (r) => ({ id: r.id, created: r.created, why: r.why || '', cloud: !!r.cloud, mine: !!r.mine,
  author: r.author ? { id: r.author.id, name: r.author.name, handle: r.author.handle } : null,
  take: { text: (r.take && r.take.text) || '', poll: r.take && r.take.poll ? { question: r.take.poll.question } : null, voice: !!(r.take && r.take.voice), gif: r.take && r.take.gif ? { url: '' } : null },
  item: { kind: r.item && r.item.kind, title: r.item && r.item.title, author: r.item && r.item.author, handle: r.item && r.item.handle, meta: { title: (r.item && r.item.meta && r.item.meta.title) || '' } } });
const lastHomeP = chrome.storage.session.get('annotated-lastHome').then((o) => { if (!lastHome && o && o['annotated-lastHome']) lastHome = o['annotated-lastHome']; }).catch(() => {});
// Beside annotated's own page, Home and Your profile move that page, which is already the full version of
// them. Drawing the list in the panel first showed it for a second before the panel put back its line about
// the page beside it, and offered "Back to annotated" from annotated (recording of 2026-09-24 at 19:34).
// The help screen goes when you move on: Home, Your profile, the home page link or another tab. It used to
// stay over everything, and in the recording of 2026-09-25 at 01:15 it sat there for a minute and a half.
function leaveHelp() {
  if (!document.body.classList.contains('welcoming')) return;
  try { localStorage.setItem('annotated-welcome-seen', '1'); } catch { /* nowhere to keep it */ }
  PanelKit.closeWelcome();
}
async function homeOrPage(kind) {
  leaveHelp();
  const t = await activeTabNow().catch(() => null);
  if (t && t.url && t.url.startsWith(chrome.runtime.getURL('')) && OWN_PAGE.test(t.url)) {
    // Already that page: the panel shows its own list, since moving the page to where it already is changed
    // nothing, and Home was pressed four times in the recording of 2026-09-25 at 15:38 (3:47 to 3:52).
    // Any feed page counts, whatever follows in its address: Home did nothing five more times in the recording
    // of 2026-09-25 at 16:02 (2:05 to 2:07), with a feed address the exact match did not know.
    const u = new URL(t.url), h = u.hash.replace(/^#/, '');
    const onFeed = u.pathname.endsWith('/feed.html');
    const same = onFeed && (kind === 'profile' ? h === 'profile' : !/^(profile|user=)/.test(h));
    if (same) return openBrowse(kind);
    // The page is moved to the other list. Chrome hands the tab back before it has moved, still showing its old
    // address, so that is not taken as nothing having happened (it drew the panel's list beside the page too).
    return openExtPage(kind === 'profile' ? 'feed.html#profile' : 'feed.html');
  }
  return openBrowse(kind);
}
async function openBrowse(kind, { byHand = true } = {}) {
  browsing = kind;
  // Pressing Home or Your profile while the welcome is up means you are done with it. Home used to open
  // behind it, where nothing on screen changed.
  if (byHand && document.body.classList.contains('welcoming')) {
    try { localStorage.setItem('annotated-welcome-seen', '1'); } catch { /* nowhere to keep it */ }
    PanelKit.closeWelcome();
  }
  browseTab = Cloud.savedTab(); browsePressed = false;
  // Where you were when you opened it. Moving off that page is what puts the panel back.
  browseFrom = await activeTabNow().then((t) => (t ? { id: t.id, url: t.url, title: t.title } : null)).catch(() => null);
  // The list is drawn while it is still out of sight, and only then does the panel change over. Hiding
  // everything first and fetching afterwards left the panel empty for about a second every time Home or
  // your profile was pressed.
  // Home first drawn from this computer alone, the start tools and a line saying the lists are coming, since
  // it waited on two requests to the database and the panel sat blank for two seconds as it opened beside our
  // website (recording of 2026-09-25 at 06:58, 2:02 to 2:04). The full lists follow.
  const quick = kind === 'home' && $('#browseMode').hidden;
  await drawBrowse({ quick });
  if (browsing !== kind) return;
  for (const [, q] of panels) q.el.hidden = true;
  ['#videoMode', '#articleMode', '#postMode', '#podcastMode', '#annMode', '#empty'].forEach((s) => { $(s).hidden = true; });
  $('#browseMode').hidden = false;
  if (quick) drawBrowse();
}
function closeBrowse() {
  browsing = null; browseFrom = null;
  $('#browseMode').hidden = true;
  return refresh();
}
// The tab the panel should be following. Pinned by ?tab= in the tests, otherwise whatever is in front.
async function activeTabNow() {
  const pinned = Number(new URLSearchParams(location.search).get('tab'));
  if (pinned) return chrome.tabs.get(pinned).catch(() => null);
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t || null;
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
let browseGen = 0;
async function drawBrowse({ quick = false } = {}) {
  const kind = browsing, gen = ++browseGen;
  const all = await Store.allMeta().catch(() => []);
  const pruned = quick ? { records: all, dropped: 0 } : await Store.pruneGone(all);
  const local = pruned.records;
  const me = quick ? await Promise.race([cachedProfile(), new Promise((r) => setTimeout(() => r(profileCache.who || null), 300))]) : await cachedProfile();
  // Yours, not this computer's. Another account's annotations share the store, and the list used to show
  // them, and offer to delete them, to whoever was signed in or to nobody at all.
  const yours = local.filter((r) => !r.author || (me && r.author.id === me.id));
  let records = kind === 'profile' ? yours : local, title = 'Your profile', note = '', emptyNote = '', tabs = null;
  if (kind === 'profile' && me) {
    // Anything published from another computer belongs here too, and to whatever is deleted from here.
    let mine = [];
    try { mine = await Cloud.list({ authorId: me.id, limit: 100 }); } catch { /* signed out, or no connection */ }
    const here = new Set(local.map((r) => r.id));
    records = [...yours, ...mine.filter((r) => !here.has(r.id))];
  }
  if (kind === 'home') {
    title = 'Home';
    // The list and the rails are asked for together (performance audit), where one waited for the other.
    const [shared, socAsked] = quick ? [[], null] : await Promise.all([
      Cloud.list({ limit: 60 }).catch(() => []), Cloud.discovery(me, {}).catch(() => null)]);
    const seen = new Set(shared.map((r) => r.id));
    const merged = [...shared.map((r) => ({ ...r, mine: !!(me && r.author && r.author.id === me.id) })),
      ...local.filter((r) => !seen.has(r.id))];
    const soc = socAsked || { followed: new Set(), people: [], trending: { sources: [], tags: [] } };
    const t = Cloud.homeTabs(merged, soc, me, merged.filter((r) => r.mine || !r.author));
    const cur = Cloud.startTab(t, browseTab, browsePressed);
    records = t[cur].records; note = t[cur].note || ''; emptyNote = t[cur].empty || '';
    // The first quick draw shows the lists it last showed, tab and all, where it said "Loading annotations…" and
    // then jumped from For you to Everyone each time the tab beside it changed (recording of 2026-09-25 at 14:08,
    // 1:56 to 2:04, 2:21, 3:07). Only with nothing kept does it say it is loading.
    tabs = { current: cur, options: [['foryou', 'For you'], ['following', 'Following'], ['everyone', 'Everyone']],
      onTab: (k) => { browseTab = k; browsePressed = true; Cloud.saveTab(k); drawBrowse(); } };
    if (quick) await lastHomeP;
    const kept = lastHome && lastHome.who === (me && me.id) ? lastHome : null;
    if (quick && kept) { records = kept.records; note = kept.note; emptyNote = kept.emptyNote; tabs = { ...tabs, current: kept.current }; }
    // With nothing kept, the tabs wait too, since For you shown while loading gave way to Everyone a moment later
    // (recording of 2026-09-25 at 16:02, 0:05).
    else if (quick) { records = []; note = ''; emptyNote = 'Loading annotations…'; tabs = null; }
    else {
      if (gen !== browseGen) return;
      lastHome = { who: me && me.id, records: records.map(slim), note, emptyNote, current: cur };
      // Kept for the next time the panel opens too, where the first Home said "Loading annotations…" under For you
      // and then jumped to Everyone (recording of 2026-09-25 at 15:38, 0:17.75 to 0:18.25).
      chrome.storage.session.set({ 'annotated-lastHome': lastHome }).catch(() => {});
    }
  }
  if (browsing !== kind || gen !== browseGen) return;
  // Where Back goes, by name. Beside a bare tab Home has nowhere to go back to, and Your profile goes to Home.
  const bare = bareTab(browseFrom && browseFrom.url) || /^https:\/\/annotated-app\.netlify\.app\//.test((browseFrom && browseFrom.url) || '');
  const backTo = bare ? (kind === 'home' ? '' : 'Back to Home') : `Back to ${cleanTitle(browseFrom && browseFrom.title) || 'this page'}`;
  const signIn = typeof Account !== 'undefined' ? () => Account.signIn() : null;
  let action = null;
  if (!me && signIn && kind === 'profile') {
    note = records.length ? 'Signed out, these are saved only on this computer. Sign in to publish them under your name.' : '';
    emptyNote = 'Your profile is everything you publish, under your name, with a link people can follow. Sign in to start one. Anything you save before then shows here too.';
    action = { label: 'Sign in', onClick: signIn };
  }
  if (!me && signIn && kind === 'home' && tabs && tabs.current === 'following') action = { label: 'Sign in', onClick: signIn };
  // Said once, when copies of annotations deleted online have just been taken off this computer.
  if (pruned.dropped) note = `${pruned.dropped === 1 ? 'One annotation was' : pruned.dropped + ' annotations were'} deleted online, so ${pruned.dropped === 1 ? 'it is' : 'they are'} gone from here too.${note ? ' ' + note : ''}`;
  AnnotationPage.renderBrowse($('#browseMode'), {
    title, records, note, emptyNote, tabs, localAware: true, backTo, action,
    onOpen: (id) => openExtPage('annotation.html#' + id),
    onBack: backTo ? closeBrowse : null,
    onFull: () => openFull(kind, me),
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
  // The list is kept when nothing on it changed (renderBrowse's dataset.sig), and so are the start tools under its
  // heading, which were otherwise added a second time.
  if (kind === 'home' && $('#browseMode .startBlock')) return;
  if (kind === 'home') {
    const st = document.createElement('div');
    st.className = 'startBlock esAction';
    st.innerHTML = (bare ? '<p class="startHint">Open a YouTube video, an article, a podcast episode or a post on X in this tab to annotate it, or start here.</p>' : '') + startHtml();
    $('#browseMode .browseHead').after(st);
    wireStart(st, true);
  }
}
// The last tab that had something to annotate, so the panel beside annotated's own pages can offer the
// way back to what you were reading.
let lastSourceTab = null, openingHost = '';
// Our own site's pages carry long titles made for search results, "annotated: say what you think about anything on
// the web", which the way back used to show word for word (recording of 2026-09-25 at 04:27).
const cleanTitle = (t) => {
  const s = String(t || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s+[-|·–]\s+(YouTube|X|annotated)$/, '').replace(/\s+\/\s+X$/, '').trim();
  if (/^annotated\s*:/i.test(s)) return "annotated's home page";
  // A post on X is titled with its whole text ("Sawyer Merritt on X: "Motortrend after…"), which the way back cut
  // off mid word (recording of 2026-09-25 at 15:38, 3:47). It is called what it is.
  if (/^.{1,80}? on X: [“"]/.test(s)) return 'the post on X';
  // Our own full pages are named as pages: "Back to Your profile" under the heading Your profile read as a loop
  // (recording of 2026-09-26 at 04:06, 1:46).
  if (/^your profile$/i.test(s)) return 'your profile page';
  if (/^feed$/i.test(s)) return 'the feed page';
  // A page's own title usually ends with its site ("Can overnight buses work? - The Transit Hour"), which made the
  // way back run to two lines (UX pass of 2026-09-29). A short tail after a dash or bar is the site, so it goes.
  const m = s.match(/^(.{3,}?)\s+[-|–—]\s+([^-|–—]{2,32})$/);
  if (m) return m[1];
  return s;
};
// A tab with nothing to annotate and no page of ours: a new tab, a blank page, a browser page.
const bareTab = (url) => !isWeb(url) && !String(url || '').startsWith(chrome.runtime.getURL(''));
function show(tid, msg, title) {
  if (browsing) return;
  // Nothing to show yet because the page is still arriving. For two seconds after each new tab the panel used
  // to show the whole empty start page and then the trimmer.
  const opening = tid == null && !title && !!openingHost;
  $('#esIcons').hidden = opening;
  if (opening) {
    $('#emptyAction').hidden = true;
    $('#emptyTitle').textContent = `Opening ${openingHost}…`;
    for (const [, q] of panels) q.el.hidden = true;
    ['#videoMode', '#articleMode', '#postMode', '#podcastMode', '#annMode'].forEach((s) => { $(s).hidden = true; });
    $('#empty').hidden = false; $('#emptyMsg').textContent = '';
    return;
  }
  const p = tid != null ? panels.get(tid) : null;
  if (p) lastSourceTab = tid;
  if (!title) {
    // Nothing on this page to annotate: podcasts can still be clipped by name.
    const box = $('#emptyAction');
    box.hidden = false;
    if (!box.querySelector('.fpAny')) { box.innerHTML = startHtml(); wireStart(box); }
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
// A dropped panel gives back the recordings it was showing. An address made for a clip, a voice note or a
// photo keeps the whole file in memory until it is released, and moving from one video to the next used to
// leave the last capture held for as long as the panel stayed open.
function drop(tid) {
  const p = panels.get(tid);
  if (!p) return;
  // Anything still listening stops first. A voice note or a tab's audio being recorded when its panel went
  // away used to keep the microphone or the tab's sound running, with nothing on screen, until its time ran out.
  p.el.querySelectorAll('[data-compose]').forEach((r) => { try { r.__stopRec && r.__stopRec(); } catch { /* already stopped */ } });
  if (p.tabRec) { try { p.tabRec.abort('The panel for this tab closed.'); } catch { /* already stopped */ } }
  if (p.stop) { try { p.stop(); } catch { /* already stopped */ } }
  if (p.api && p.api.capturing && (p.kind === 'video' || p.kind === 'audio')) sendTo(tid, { type: p.x ? 'xv-abort' : p.kind === 'audio' ? 'pod-abort' : 'abort' }).catch(() => {});
  p.el.querySelectorAll('video, audio, img, source').forEach((m) => {
    const s = m.currentSrc || m.src || '';
    if (m.pause) { try { m.pause(); } catch { /* not playing */ } }
    if (s.startsWith('blob:')) URL.revokeObjectURL(s);
  });
  p.el.remove(); panels.delete(tid);
}

// Who is signed in, remembered for a minute. The annotation panel redraws whenever a tab or a saved annotation
// changes, and each redraw used to ask the database again.
// Held so the refresh loop does not ask the session for a profile two and a half times a second. Signing in
// or out throws it away at once, because a minute of the wrong account is a minute of the wrong answers.
let profileCache = { at: 0, who: null };
if (typeof Backend !== 'undefined' && Backend.onChange) Backend.onChange(() => { profileCache = { at: 0, who: null }; annKey = null; staleTalk(); if (browsing) drawBrowse(); });
// A question that may never be answered, given a time limit. Offline, the session and the profile each wait
// on the network, and Publish sat on nothing and then on "Publishing" with no end.
const inTime = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
async function cachedProfile() {
  if (Date.now() - profileCache.at < 60000) return profileCache.who;
  const who = await inTime(Backend.profile(), 5000).catch(() => (profileCache.who || null));
  profileCache = { at: Date.now(), who };
  return who;
}

async function inject(tid, files, ping) {
  try { await sendTo(tid, { type: ping }); }
  catch { await chrome.scripting.executeScript({ target: { tabId: tid }, files }); log('Injected ' + files.join(', ')); }
}

let busyRefresh = false, refreshAgain = false;
async function refresh() {
  // A panel turned away by the key check has no panel to draw into. Other things, a change of settings for
  // one, still ask for a refresh, and it used to throw on the parts that were never drawn.
  if (!(await OURS)) return;
  if (busyRefresh) { refreshAgain = true; return; }
  busyRefresh = true; refreshAgain = false;
  try {
    // Test hook: sidepanel.html?tab=<id> pins the panel to one tab.
    const pinned = Number(new URLSearchParams(location.search).get('tab'));
    const [tab] = pinned ? [await chrome.tabs.get(pinned).catch(() => null)] : await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && feedAsked.has(tab.id) && isWeb(tab.url)) {
      const was = feedAsked.get(tab.id);
      if (was === null) feedAsked.set(tab.id, hostOf(tab.url));
      else if (was !== hostOf(tab.url)) {
        // A clip being cut keeps the finder until it is done; the next look after that lets it go.
        const fp = panels.get(tab.id);
        if (!(fp && fp.feed && fp.busy && fp.busy())) { feedAsked.delete(tab.id); if (fp && fp.feed) drop(tab.id); }
      }
    }
    // Beside annotated's home page, help does not offer to open it. Pressed there it only closed help, and it
    // was pressed twice in the recording of 2026-09-25 at 14:08 (2:55, 2:59).
    const wSite = document.querySelector('.welcome .wSite');
    if (wSite) { let onHome = false; try { const u = new URL(tab && tab.url); onHome = u.origin === 'https://annotated-app.netlify.app' && u.pathname === '/' && !new URLSearchParams(u.search).has('feed'); } catch { /* no address */ } wSite.hidden = onHome; }
    // Home and your profile hold while you are still on the page you opened them from, so a take you are
    // part way through is never pulled out from under you. Go to another tab, or let this one go somewhere
    // else, and the panel comes back to what you are looking at instead of waiting to be sent back.
    if (browsing) {
      // Still opening: Home has not yet noted the tab it opened beside, and a look now would close it at once.
      if (!browseFrom) return;
      // Home beside a bare tab gives way as soon as that tab starts loading a page, so it can say what is opening.
      const leaving = bareTab(browseFrom && browseFrom.url) && tab && tab.status === 'loading' && isWeb(tab.pendingUrl || '');
      if (browseFrom && tab && tab.id === browseFrom.id && tab.url === browseFrom.url && !leaving && !feedAsked.has(tab.id)) return;
      browsing = null; browseFrom = null;
      $('#browseMode').hidden = true;
    }
    const cur = activeTab != null && panels.get(activeTab);
    if (cur && cur.kind === 'video' && cur.api.capturing && tab?.id !== activeTab) return;
    if (!tab) return show(null);
    activeTab = tab.id;
    try { openingHost = tab.status === 'loading' && isWeb(tab.pendingUrl || tab.url) ? new URL(tab.pendingUrl || tab.url).hostname.replace(/^www\./, '') : ''; } catch { openingHost = ''; }
    let p = panels.get(tab.id);
    if (isWatch(tab.url)) {
      if (p && p.kind !== 'video') { drop(tab.id); p = null; }
      try { await inject(tab.id, ['capture-engine.js', 'content.js'], 'ping'); }
      catch { return show(null, 'Reload the YouTube tab, then open this panel again.'); }
      const info = await sendTo(tab.id, { type: 'info' }).catch(() => null);
      // A video still arriving reads "Opening the video…", as a tab still loading does. It fell back to the whole
      // start page, "Open something to annotate" and every site, for a second and a half each time a video opened
      // from YouTube's own pages (recording of 2026-09-25 at 23:23, 2:08).
      // YouTube puts its player on the page a moment after the address changes, so no player yet is the same wait.
      const waiting = !info || !info.ok || (info.duration !== Infinity && !(isFinite(info.duration) && info.duration > 0));
      if (waiting) { openingHost = 'the video'; return show(null); }
      if (!isFinite(info.duration) || info.duration <= 0) return show(null, 'Live streams cannot be clipped yet.');
      if (!p) { p = makeVideo(tab.id); panels.set(tab.id, p); }
      show(tab.id);
      p.api.update(info);
      return;
    }
    // annotated's own website: its brief, its demo clip and its demo episode are there to try annotated on,
    // with nothing sent. The panel beside it is Home, which also offers to publish a take made there. It used to
    // read the demo episode as a podcast and offer to clip it (recording of 2026-09-24 at 20:19).
    if (/^https:\/\/annotated-app\.netlify\.app\//.test(tab.url || '')) {
      if (p) { drop(tab.id); p = null; }
      busyRefresh = false; return openBrowse('home', { byHand: false });
    }
    if (isPost(tab.url)) {
      // One panel per post: X's own views of it (/video/1, /photo/1, /quotes) used to drop the clip and the take.
      const url = (tab.url.split(/[?#]/)[0].match(/^.*?\/status\/\d+/) || [tab.url.split('?')[0]])[0], key = tab.id + ' ' + url;
      if (p && (!(p.kind === 'post' || p.x) || p.url !== url)) { drop(tab.id); p = null; }
      // A post with a video is clipped like a YouTube video (2.36.0), unless words in it were chosen with the
      // Annotate button or the person picked Quote the post. It is decided once, when the video can say how long it is.
      let mode = modeOverride.get(key);
      if (!mode && (!p || p.kind === 'post')) {
        if (!p) {
          try { await inject(tab.id, ['post-core.js', 'article-core.js', 'capture-engine.js', 'article.js'], 'aping'); }
          catch { return show(null, 'Reload the X tab, then open this panel again.'); }
        }
        const pi = await sendTo(tab.id, { type: 'p-info' }).catch(() => null);
        if (pi && pi.ok && !pi.hasVideo) mode = 'post';
        else if (pi && pi.ok) {
          const xi = await sendTo(tab.id, { type: 'xv-info' }).catch(() => null);
          const ai = !p && await sendTo(tab.id, { type: 'a-info' }).catch(() => null);
          if (ai && ai.autoCapture) mode = 'post';
          else if (xi && xi.ok && xi.blocked) mode = 'post';
          else if (xi && xi.ok && xi.blocked === null) mode = null;   // no frame yet: whether it can be recorded is not known
          else if (xi && xi.ok && isFinite(xi.duration) && xi.duration > 0) mode = 'video';
          else if (xi && xi.ok && xi.duration === Infinity) mode = 'post';
        }
        if (mode) { modeOverride.set(key, mode); autoMode.add(key); }
      }
      if (mode === 'video') {
        if (p && !p.x) { drop(tab.id); p = null; }
        const info = await sendTo(tab.id, { type: 'xv-info' }).catch(() => null);
        if ((!info || !info.ok) && p && p.x) return show(tab.id);
        // Chosen by the panel, then found to be a video whose frames cannot be read (a GIF): quoted as a post instead.
        if (info && info.ok && info.blocked && autoMode.has(key) && !(p && p.api && p.api.capturing)) { modeOverride.set(key, 'post'); if (p) { drop(tab.id); p = null; } return refresh(); }
        if (!info || !info.ok) { modeOverride.set(key, 'post'); if (p) { drop(tab.id); p = null; } }
        else {
          if (!p) { p = makeXVideo(tab.id, url); panels.set(tab.id, p); }
          show(tab.id);
          if (isFinite(info.duration) && info.duration > 0) p.api.update(info);
          return;
        }
      }
      if (p) return show(tab.id);
      try { await inject(tab.id, ['post-core.js', 'article-core.js', 'capture-engine.js', 'article.js'], 'aping'); }
      catch { return show(null, 'Reload the X tab, then open this panel again.'); }
      p = makePost(tab.id, url); panels.set(tab.id, p);
      // Typing or pressing anything in the post panel settles it as a post, so it never turns into the trimmer under
      // a take in progress. Choosing Clip the video overrides this, since that switch comes after its click.
      { const settle = () => { if (!modeOverride.has(key)) modeOverride.set(key, 'post'); };
        p.el.addEventListener('input', settle); p.el.addEventListener('click', settle); }
      // The post has a video: say so, and offer to clip it instead.
      sendTo(tab.id, { type: 'p-info' }).then((pi) => {
        if (pi && pi.ok && pi.hasVideo && !pi.blocked && panels.get(tab.id) === p && !p.el.querySelector('.modeSeg'))
          PanelKit.modeSwitch(p.el, 'post', (v) => switchMode(tab.id, url, v), [['video', 'clip', 'Clip the video'], ['post', 'post', 'Quote the post']]);
      }).catch(() => {});
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
    const feedPanel = (why) => {
      const url = tab.url.split('#')[0];
      // Moving about inside one app keeps the same finder, so what you searched stays and the suggestion can
      // follow the page. Leaving the app starts again.
      const sameApp = (a, b) => { try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; } };
      if (p && (!p.feed || !sameApp(p.url, url))) { drop(tab.id); p = null; }
      if (!p) { p = makeFeedPod(tab.id, url, feedAsked.has(tab.id) && !isPodcastApp(tab.url) ? '' : tabName(tab), why); panels.set(tab.id, p); }
      if (p.hint) p.hint(tabName(tab), url);
      show(tab.id);
    };
    if (isPodcastApp(tab.url) && protectedService(tab.url)) return feedPanel('protected');
    if (feedAsked.has(tab.id)) return feedPanel('asked');
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
      if (!hasAudio && isPodcastApp(tab.url)) return feedPanel(protectedService(tab.url) ? 'protected' : 'quiet');
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
      // The feed and your profile are lists, and the tab is already showing one. The panel says so rather
      // than putting the same list beside it with a link to the page you are on.
      const mirrors = !tab.url.startsWith(base + 'feed.html') ? ''
        : tab.url.includes('#profile') ? 'Your profile'
        : tab.url.includes('#user=') ? 'A profile'
        : tab.url.includes('#tag=') ? 'A tag' : 'The feed';
      const srcTab = lastSourceTab != null ? await chrome.tabs.get(lastSourceTab).catch(() => null) : null;
      const back = !!srcTab;
      // The way back names where it goes. A tab title carries YouTube's unread count and the site's name.
      const sourceName = srcTab ? cleanTitle(srcTab.title) : '';
      // Drawn again only when something on it would change. A redraw replaces the buttons, and one landing
      // while a button is held down loses the click.
      const sig = mirrors ? [mirrors, srcTab && srcTab.id, sourceName, AnnotationPage.mineCount(records, who && who.id) === 0].join('|') : '';
      const drawn = $('#annMode .annside.mirror');
      if (sig && drawn && drawn.dataset.sig === sig) return;
      // A shared annotation's reactions, comments and votes live in the database. The copy here never learns
      // about them, so the card beside the page used to say only "Poll" under a vote, a reaction and a comment.
      let current = records.find((r) => r.id === curId) || null;
      if (current && (current.cloud || current.author)) {
        const s = await inTime(Cloud.social(current.id, who && who.id), 3000).catch(() => null);
        if (s) current = { ...current, comments: s.comments, reactions: s.reactions,
          take: { ...current.take, poll: current.take.poll ? { ...current.take.poll, counts: s.poll.counts, vote: s.poll.vote } : null } };
      }
      AnnotationPage.renderSide($('#annMode'), {
        current, records,
        // The store belongs to this computer, and two accounts can share one. Who you are decides which of
        // them are yours to list under your name and yours to delete.
        youId: who && who.id,
        mirrors, sourceName,
        // The tab is looked up again at the press, since it may have closed, and may be in another window,
        // which then has to come to the front as well. A tab that is gone says so rather than nothing.
        onSource: back ? async () => {
          const t = await chrome.tabs.get(srcTab.id).catch(() => null);
          const said = $('#annMode .sideBackNote');
          if (!t) { if (said) said.textContent = 'That tab has been closed.'; return; }
          await chrome.tabs.update(t.id, { active: true }).catch(() => {});
          if (t.windowId != null) chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
        } : null,
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
      const ms = $('#annMode .mirrorStart');
      // With a way back to what you were reading, the line and that button are enough: the page beside already
      // shows the feed. With nowhere to go back to, the start page stays, so the panel is never a dead end.
      // An empty page beside it (nothing of yours yet, or all deleted) keeps the start page too, since the page
      // then has nothing to offer (recording of 2026-09-24 at 20:19, a panel with one line in it).
      // The start tools stay in every case now: with only the way back and a line, the panel beside the full
      // Home or profile was mostly white space, with no next step (recording of 2026-09-25 at 01:15).
      if (ms) { ms.className = 'mirrorStart startBlock esAction'; ms.innerHTML = startHtml(); wireStart(ms, true); }
      const mirror = $('#annMode .annside.mirror');
      if (mirror) {
        mirror.dataset.sig = sig;
        const b = mirror.querySelector('.sideBack');
        if (b) { const n = document.createElement('p'); n.className = 'note sideBackNote'; n.setAttribute('role', 'status'); b.after(n); }
      }
      return;
    }
    annKey = null;
    // Nothing here to annotate, so the panel is Home: the places to start and what people are annotating.
    // It used to be a screen of its own, "Open something to annotate", that looked like Home and was not,
    // which is how "I can't get back to the start page" happened in the recording of 2026-09-23 at 02:48.
    if (!openingHost && bareTab(tab.url)) { busyRefresh = false; return openBrowse('home', { byHand: false }); }
    show(null);
  } finally { busyRefresh = false; if (refreshAgain) { refreshAgain = false; setTimeout(refresh, 0); } }
}

let myWindow = null;
chrome.windows.getCurrent().then((w) => { myWindow = w.id; }).catch(() => {});
chrome.tabs.onDetached.addListener((id) => { if (!PINNED) drop(id); });
chrome.runtime.onMessage.addListener((m, sender) => {
  // Every panel in every window hears every page; only the one beside that page answers (audit of 2026-09-29).
  if (sender.tab && myWindow != null && !PINNED && sender.tab.windowId !== myWindow) return;
  if (PINNED && sender.tab && sender.tab.id !== PINNED) return;
  if (browsing && m.type === 'annotate-request' && sender.tab) { annotateNow(sender.tab.id); return; }
  const p = sender.tab && panels.get(sender.tab.id);
  if (!p) return;
  if (m.type === 'sel-update' && p.kind === 'article') return p.selCb(m.sel);
  if (m.type === 'annotate-request' && p.kind === 'article') return p.api.captureNow();
  // On a post page, the Annotate button captures the post with the selected words as its quote.
  if (m.type === 'sel-update' && p.kind === 'post') {
    if (m.sel && m.sel.text && !modeOverride.has(sender.tab.id + ' ' + p.url)) modeOverride.set(sender.tab.id + ' ' + p.url, 'post');
    return p.api.onSelection(m.sel);
  }
  if (m.type === 'annotate-request' && p.kind === 'post') { modeOverride.set(sender.tab.id + ' ' + p.url, 'post'); return p.api.captureNow(); }
  if (m.type === 'annotate-request' && p.x) { switchMode(sender.tab.id, p.url, 'post'); return; }
  if (p.kind !== 'video' && p.kind !== 'audio') return;
  if (m.type === 'pod-range-done') { if (p.tabRec) p.tabRec.finish(); return; }
  if (m.type === 'capture-done') {
    const type = m.audioOnly ? 'audio/webm' : 'video/webm';
    fetch(m.dataUrl).then((res) => res.blob())
      .then((b) => p.api.engine({ ...m, blob: new Blob([b], { type }) }))
      .catch(() => p.api.engine({ type: 'capture-error', error: 'The recording could not be read.' }));
  } else if (m.type === 'capture-progress' || m.type === 'capture-error') {
    // A stalled page ends the tab's recording too, or it would go on and its timer could cancel the next capture.
    if (m.type === 'capture-error' && p.tabRec) { p.tabRec.abort(m.error); return; }
    p.api.engine(m);
  }
});
chrome.tabs.onActivated.addListener(() => {
  // Another tab closes help that was opened by hand. The first welcome stays until it is answered.
  let seen = false; try { seen = localStorage.getItem('annotated-welcome-seen') === '1'; } catch { /* no storage */ }
  if (seen) leaveHelp();
  // The refresh itself comes from the listener at the foot of this file (performance audit: it ran twice).
});
chrome.tabs.onRemoved.addListener((id) => {
  drop(id);
  rowNames.delete(id);
  feedAsked.delete(id);
  for (const k of [...modeOverride.keys()]) if (k.startsWith(id + ' ')) modeOverride.delete(k);
  for (const k of [...autoMode]) if (k.startsWith(id + ' ')) autoMode.delete(k);
});
// The panel polls for the tab it should follow. A hidden panel has nobody watching it, so it rests until it
// comes back, which it does immediately rather than on the next tick.
OURS.then((ok) => {
  if (!ok) return;
  // Every 400 ms only while a clip or a podcast moment is open, whose trimmer follows the player, or while a tab
  // is opening. Otherwise every two seconds, with the tab's own events calling at once: switching tabs, a page
  // loading or changing its address or title, a window coming forward, annotations changing. Checking every
  // 400 ms on every page redrew beside pages that had not changed, which is where pressed buttons went missing.
  let ticks = 0;
  const fast = () => { const q = activeTab != null && panels.get(activeTab); return !!openingHost || !!(q && (q.kind === 'video' || q.kind === 'audio' || q.feed)); };
  setInterval(() => { if (document.visibilityState === 'hidden') return; ticks++; if (fast() || ticks % 5 === 0) refresh(); }, 400);
  const now = () => { if (document.visibilityState !== 'hidden') refresh(); };
  chrome.tabs.onActivated.addListener(now);
  chrome.tabs.onUpdated.addListener((id, ch, t) => { if (t && t.active && (ch.url || ch.status || ch.title)) now(); });
  if (chrome.windows && chrome.windows.onFocusChanged) chrome.windows.onFocusChanged.addListener(now);
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.annotatedStamp) now(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  // Help opened or Home pressed: what they show depends on the tab, so the panel looks again at once.
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.helpBtn, .homeBtn, .youBtn')) setTimeout(now, 0); });
  refresh();
});
