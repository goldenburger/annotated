/* ================= preview shell ================= */
const $ = (s) => document.querySelector(s);
const log = PanelKit.makeLog($('#log'));
PanelKit.initDebug();
PanelKit.compactOnScroll();
Prefs.ready = Prefs.init(Prefs.localBackend());

/* ---------- display: side panel or floating over the page ---------- */
const aside = document.querySelector('aside.panel');
let floatApi = null, displayApi = null, autoShrunk = false;
const darkNow = () => { const t = Prefs.get().theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
function setDisplay(mode) {
  if (mode === 'float' && !floatApi) {
    let rect = null; try { rect = JSON.parse(localStorage.getItem('floatRect') || 'null'); } catch {}
    $('#stage').classList.remove('closed');
    $('#stage').classList.add('floating');
    floatApi = FloatFrame.mount(document.body, aside, {
      rect, zIndex: 40,
      buttons: [{ icon: 'gear', label: 'Display and preferences', onClick: (r) => displayApi && displayApi.toggle(r) },
        { icon: 'help', label: 'How annotated works', onClick: () => PanelKit.welcome(aside, { shortcut: 'Alt+Shift+K', force: true, onDisplayChoice: setDisplay }) }],
      bounds: () => { const r = $('#stage').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; },
      onRect: (r) => { try { localStorage.setItem('floatRect', JSON.stringify(r)); } catch {} },
    });
    floatApi.setDark(darkNow());
    PanelKit.reportHeight(aside, (h) => { if (floatApi) floatApi.setContentHeight(h); });
  } else if (mode !== 'float' && floatApi) {
    floatApi.destroy(); floatApi = null;
    $('#stage').classList.remove('floating');
  }
}
Prefs.onChange(() => { if (floatApi) floatApi.setDark(darkNow()); });
Prefs.ready.then(() => {
  setDisplay(Prefs.get().display);
  displayApi = PanelKit.displayMenu(aside, { onDisplay: setDisplay, sideHint: "In Chrome, drag the side panel's edge to resize it. Chrome can also show it on the left, in Settings under Appearance." });
  PanelKit.welcome(aside, { shortcut: 'Alt+Shift+K', onDisplayChoice: setDisplay });
});
// Open and close: the toolbar button and Alt+Shift+K toggle the side panel, or shrink and restore the floating one.
function togglePanel() {
  if (floatApi) { if (floatApi.collapsed) floatApi.expand(); else floatApi.collapse(); return; }
  setPanel($('#stage').classList.contains('closed'));
}
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && (e.code === 'KeyK')) { e.preventDefault(); togglePanel(); }
});
const pane = $('#pane');
const storyEl = () => document.querySelector('#newsPage .story');
const NEWS_LOC = { href: 'https://harborline.example/2026/09/17/overnight-buses-trial', hostname: 'harborline.example' };
const slug = (s) => (s || 'annotation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'annotation';

/* ---------- tabs ---------- */
const tabs = [
  { id: 'video', kind: 'video', title: 'Spike test pattern - YouTube', url: 'youtube.com/watch?v=spikeDemo01', el: $('#ytPage') },
  { id: 'article', kind: 'article', title: 'Overnight buses trial - Harborline News', url: NEWS_LOC.href.replace('https://', ''), el: $('#newsPage') },
  { id: 'post', kind: 'post', title: 'Harborline News on X', url: 'x.com/harborlinenews/status/1836000000000000001', el: $('#postPage') },
  { id: 'podcast', kind: 'podcast', title: 'Can overnight buses work? - The Transit Hour', url: 'thetransithour.example/episodes/41', el: $('#podPage') },
];
const POST_LOC = { href: 'https://x.com/harborlinenews/status/1836000000000000001', hostname: 'x.com' };
let active = 'video', capturing = false;
const records = [];   // published annotations, newest last
const permalinkOf = (id) => `https://annotated.com/@you/${id}`;
const tabById = (id) => tabs.find((t) => t.id === id);

function drawTabs() {
  $('#tabs').innerHTML = '';
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === active));
    b.textContent = t.title; b.title = t.title;
    b.disabled = capturing && t.id !== active;
    b.addEventListener('click', () => activate(t.id));
    $('#tabs').appendChild(b);
  }
}
function activate(id) {
  if (capturing && id !== active) return;
  const prev = tabById(active);
  if (prev) prev.scroll = pane.scrollTop;
  // The Published banner is for the first visit only.
  if (prev && prev.kind === 'ann' && prev.id !== id) { const r = records.find((x) => x.id === prev.recId); if (r && r.api) r.api.hideBanner(); }
  active = id;
  const t = tabById(id);
  for (const x of tabs) x.el.hidden = x.id !== id;
  $('#urlbar').textContent = t.url;
  if (id !== 'video') $('#vid').pause();
  if (id !== 'podcast') $('#podAudio').pause();
  // The podcast panel appears once the episode has loaded, never as an empty shell.
  $('#podcastMode').hidden = true;
  if (t.kind === 'podcast') setTimeout(pollPodcast, 0);
  $('#videoMode').hidden = t.kind !== 'video';
  $('#articleMode').hidden = t.kind !== 'article';
  $('#postMode').hidden = t.kind !== 'post';
  if (t.kind === 'post' && !postLoaded) { postLoaded = true; post.refresh(); }
  $('#empty').hidden = true;
  $('#annMode').hidden = !(t.kind === 'ann' || t.kind === 'feed');
  // Floating mode: annotated.com pages open in their own tab in the real extension, without the frame.
  // Here the frame shrinks on those pages and comes back on the source pages.
  if (floatApi) {
    const onSite = t.kind === 'ann' || t.kind === 'feed';
    if (onSite && !floatApi.collapsed) { floatApi.collapse(); autoShrunk = true; }
    else if (!onSite && autoShrunk) { floatApi.expand(); autoShrunk = false; }
  }
  pane.classList.toggle('paperbg', t.kind === 'ann' || t.kind === 'feed');
  if (t.kind === 'ann' || t.kind === 'feed') drawSide(t);
  if (t.kind === 'feed') drawFeed();
  if (t.kind === 'article' && !articleLoaded) { articleLoaded = true; article.refresh(); }
  pane.scrollTop = t.scroll || 0;
  drawTabs();
  pollVideo();
}

/* ---------- publishing opens a new tab ---------- */
async function publish(sourceId, item, take) {
  const title = AnnotationPage.titleOf(item);
  const id = `${slug(take.text || title)}-${Math.random().toString(36).slice(2, 6)}`;
  const permalink = permalinkOf(id);
  const el = document.createElement('div');
  el.className = 'annpage';
  pane.appendChild(el);
  const t = { id: 'ann-' + id, kind: 'ann', recId: id, title: `${take.text || title} | annotated`, url: permalink.replace('https://', ''), el };
  const rec = { id, item, take: { tag: take.tag, text: take.text, voice: take.voice ? { blob: take.voice.blob } : null, poll: take.poll || null }, created: Date.now(), comments: [], reactions: [], tabId: t.id, api: null };
  records.push(rec);
  tabs.push(t);
  activate(t.id);
  const main = document.createElement('div');
  el.appendChild(main);
  rec.api = await AnnotationPage.render(main, {
    item, take: rec.take, permalink,
    backLabel: { video: 'Back to the video', post: 'Back to the post', audio: 'Back to the episode' }[item.kind] || 'Back to the article',
    stats: { annotations: records.length, followers: 0 },
    id, created: rec.created, records, reactions: rec.reactions,
  }, {
    onHome: () => openFeed(null, 'home'),
    onOpen: (oid) => { const r = records.find((x) => x.id === oid); if (r) openAtTop(r.tabId); },
    onBack: () => activate(sourceId),
    onProfile: () => openFeed(null, 'profile'),
    onTag: (tag) => openFeed(tag),
    onComments: (list) => { rec.comments = list; },
    onReactions: (list) => { rec.reactions = list; },
    onPollVote: () => {},
    onOpenSource: (it) => openSource(it),
    onDelete: () => deleteRecord(id),
    onEdit: ({ text }) => {
      t.title = `${text || title} | annotated`;
      drawTabs();
      if (tabById(active) && tabById(active).kind === 'ann') drawSide(tabById(active));
    },
  });
  // Everyone's count goes up, as it would on a real profile.
  for (const r of records) if (r.api) r.api.setStats({ annotations: records.length, followers: 0 });
  if (tabById(active).kind === 'ann') drawSide(tabById(active));
  log('Published ' + permalink);
  if (Prefs.get().afterPublish === 'close') { if (floatApi) floatApi.collapse(); else setPanel(false); }
  return { tabId: t.id, id, permalink };
}
// Links to an annotation open it from the top, not wherever it was last scrolled.
function openAtTop(tabId) { const t = tabById(tabId); if (t) t.scroll = 0; activate(tabId); }
const viewPublished = (ref) => { if (ref && tabById(ref.tabId)) activate(ref.tabId); };
const findDuplicate = (item) => { const r = records.find((x) => AnnotationPage.sameSource(x.item, item)); return r ? { tabId: r.tabId, id: r.id, permalink: permalinkOf(r.id) } : null; };

function deleteRecord(recId) {
  const i = records.findIndex((r) => r.id === recId);
  if (i < 0) return;
  const rec = records[i];
  records.splice(i, 1);
  const ti = tabs.findIndex((t) => t.id === rec.tabId);
  if (ti >= 0) { tabs[ti].el.remove(); tabs.splice(ti, 1); }
  for (const r of records) if (r.api) r.api.setStats({ annotations: records.length, followers: 0 });
  log('Deleted ' + recId);
  if (active === rec.tabId || !tabById(active)) activate(rec.item.kind === 'video' ? 'video' : 'article');
  else activate(active);
}

// Source links in the preview jump back to the stand-in tabs, since the stand-in sites do not exist.
function openSource(item) {
  if (item.kind === 'audio') { activate('podcast'); $('#podAudio').currentTime = item.start; return; }
  if (item.kind === 'post') {
    activate('post');
    const el = document.querySelector('#postPage .xpost');
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2500);
    return;
  }
  if (item.kind === 'video') {
    activate('video');
    $('#vid').currentTime = item.start;
    return;
  }
  activate('article');
  const range = ArticleCore.findText(storyEl(), item.text);
  if (!range) return;
  const r = range.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  pane.scrollTop += (r.top + r.height / 2) - (pr.top + pr.height / 2);
  if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
    CSS.highlights.set('annotated-flash', new Highlight(range));
    setTimeout(() => CSS.highlights.delete('annotated-flash'), 2500);
  }
}

/* ---------- side panel on annotation and feed tabs ---------- */
function drawSide(t) {
  AnnotationPage.renderSide($('#annMode'), {
    current: t.kind === 'ann' ? records.find((r) => r.id === t.recId) : null,
    records, permalinkOf,
    onOpen: (id) => { const r = records.find((x) => x.id === id); if (r) openAtTop(r.tabId); },
    onFeed: () => openFeed(null),
    onDelete: (id) => deleteRecord(id),
  });
}

/* ---------- feed tab ---------- */
let feedTag = null, feedMode = 'home';
function openFeed(tag, mode = 'profile') {
  feedTag = tag; feedMode = tag ? 'home' : mode;
  let t = tabById('feed');
  if (!t) {
    const el = document.createElement('div'); el.className = 'annpage';
    pane.appendChild(el);
    t = { id: 'feed', kind: 'feed', title: '', url: '', el };
    tabs.push(t);
  }
  t.title = tag ? `${tag} | annotated` : feedMode === 'profile' ? 'You | annotated' : 'annotated';
  t.url = tag ? `annotated.com/tag/${slug(tag)}` : feedMode === 'profile' ? 'annotated.com/@you' : 'annotated.com';
  t.scroll = 0;
  activate('feed');
}
function drawFeed() {
  const t = tabById('feed');
  t.el.innerHTML = '';
  const main = document.createElement('div');
  t.el.appendChild(main);
  AnnotationPage.renderFeed(main, {
    records, tag: feedTag, mode: feedMode,
    onOpen: (id) => { const r = records.find((x) => x.id === id); if (r) openAtTop(r.tabId); },
    onTag: (tag) => openFeed(tag),
    onAll: () => openFeed(null, 'home'),
    onHome: () => openFeed(null, 'home'),
    onProfile: () => openFeed(null, 'profile'),
  });
}

/* ---------- video ---------- */
const engine = ClipEngine.create({
  getVideo: () => $('#vid'),
  adShowing: () => $('#movie_player').classList.contains('ad-showing'),
  meta: () => ({ videoId: 'spikeDemo01', url: 'https://www.youtube.com/watch?v=spikeDemo01', title: $('#vtitle').textContent, channel: $('#vchannel').textContent, thumb: '' }),
  send: (m) => setTimeout(() => video.engine(m), 0),
});
const video = VideoPanel.create($('#videoMode'), {
  seek: (t) => engine.seek(t),
  preview: (s, e) => engine.preview(s, e),
  pause: () => engine.pause(),
  // The stand-in video is part of this page, so its frames come straight from a hidden copy.
  frames: async (info) => Filmstrip.fromVideo($('#vid').getAttribute('src'), info.duration),
  capture: async (s, e) => { await engine.capture(s, e); return { ok: true }; },
  abort: () => engine.abort(),
}, {
  log, onPublish: (i, t) => publish('video', i, t), onView: viewPublished, findDuplicate,
  onCapturing: (on) => { capturing = on; drawTabs(); },
});
function pollVideo() {
  if (tabById(active).kind !== 'video') return;
  const info = engine.info();
  if (!isFinite(info.duration) || info.duration <= 0) { $('#videoMode').hidden = true; $('#empty').hidden = false; $('#emptyMsg').textContent = 'Waiting for the video to load.'; return; }
  $('#videoMode').hidden = false; $('#empty').hidden = true;
  video.update(info);
}
setInterval(pollVideo, 400);

/* ---------- podcast ---------- */
const POD_URL = 'https://thetransithour.example/episodes/41';
const podEngine = ClipEngine.create({
  getVideo: () => $('#podAudio'),
  meta: () => ({ url: POD_URL, title: $('#podtitle').textContent, show: 'The Transit Hour', artwork: $('.podart').src }),
  send: (m) => setTimeout(() => podcast.engine(m), 0),
  audioOnly: true,
});
const podcast = VideoPanel.create($('#podcastMode'), {
  seek: (t) => podEngine.seek(t),
  preview: (s, e) => podEngine.preview(s, e),
  pause: () => podEngine.pause(),
  capture: async (s, e) => { await podEngine.capture(s, e); return { ok: true }; },
  abort: () => podEngine.abort(),
  // The stand-in episode is part of this page, so its waveform comes straight from its own data.
  async peaks() {
    const src = $('#podAudio').getAttribute('src'), i = src.indexOf(',');
    const bin = atob(src.slice(i + 1)), arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return Waveform.fromArrayBuffer(arr.buffer, 10);
  },
}, {
  kind: 'audio', log, onPublish: (i, t) => publish('podcast', i, t), onView: viewPublished, findDuplicate,
  onCapturing: (on) => { capturing = on; drawTabs(); },
});
function pollPodcast() {
  if (tabById(active).kind !== 'podcast') return;
  const info = podEngine.info();
  if (!isFinite(info.duration) || info.duration <= 0) { $('#podcastMode').hidden = true; $('#empty').hidden = false; $('#emptyMsg').textContent = 'Waiting for the episode to load.'; return; }
  podcast.update(info);
  $('#podcastMode').hidden = false; $('#empty').hidden = true;
}
setInterval(pollPodcast, 400);
$('#podAudio').addEventListener('loadedmetadata', pollPodcast);
$('#vid').addEventListener('loadedmetadata', pollVideo);

/* ---------- article ---------- */
let articleLoaded = false, selCb = () => {};
const page = ArticlePage.create({
  root: storyEl, metaRoot: storyEl, loc: () => NEWS_LOC,
  send: (m) => {
    if (m.type === 'sel-update') selCb(m.sel);
    if (m.type === 'annotate-request') {
      if (!articleLoaded) { articleLoaded = true; }
      // The Annotate button opens the panel, as it does in the extension.
      if (floatApi) floatApi.expand(); else setPanel(true);
      article.captureNow();
    }
  },
  scrollBy: (dy) => { pane.scrollTop += dy; },
  viewport: () => { const r = pane.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; },
  buttonEnabled: () => Prefs.get().pageButton !== false,
});
const shotScale = 2; // sharp text even on 1x screens
const article = ArticlePanel.create($('#articleMode'), {
  onSelection(cb) { selCb = cb; },
  info: async () => page.info(),
  setExact: (v) => page.setExact(v),
  clear: () => page.clear(),
  clearCaptured: () => ArticleCore.clearHighlights(storyEl()),
  async capture() {
    const r = await page.capture();
    if (!r.ok) return r;
    try {
      if (!window.html2canvas) throw new Error('The screenshot library did not load.');
      const root = storyEl();
      // html2canvas paints inline highlights badly, so render without them and draw the boxes from the real layout.
      const canvas = await html2canvas(root, {
        backgroundColor: getComputedStyle(pane).backgroundColor, scale: shotScale, logging: false,
        onclone: (doc) => doc.querySelectorAll('mark.annotated-hl').forEach((m) => { m.style.background = 'transparent'; m.style.boxShadow = 'none'; m.style.color = 'inherit'; }),
      });
      const sr = root.getBoundingClientRect();
      const g = canvas.getContext('2d');
      const bg = getComputedStyle(pane).backgroundColor.match(/\d+/g).map(Number);
      const dark = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 < 128;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#FFE14A';
      if (dark) g.globalAlpha = 0.45; else g.globalCompositeOperation = 'multiply';
      for (const m of r.marks) for (const cr of m.getClientRects()) g.fillRect((cr.left - sr.left - 2) * shotScale, (cr.top - sr.top) * shotScale, (cr.width + 4) * shotScale, cr.height * shotScale);
      g.restore();
      const vp = r.viewport;
      r.image = canvas;
      r.clip = { x: (r.clip.x - sr.left) * shotScale, y: (r.clip.y - sr.top) * shotScale, w: r.clip.w * shotScale, h: r.clip.h * shotScale };
      const vy1 = Math.max(vp.top, sr.top) - sr.top, vy2 = Math.min(vp.bottom, sr.bottom) - sr.top;
      r.bounds = { x: 0, y: vy1 * shotScale, w: canvas.width, h: (vy2 - vy1) * shotScale };
    } catch (e) { r.shotError = 'Could not take a screenshot. ' + e.message; }
    return r;
  },
}, { log, onPublish: (i, t) => publish('article', i, t), onView: viewPublished, findDuplicate });

/* ---------- X post ---------- */
let postLoaded = false;
const postRoot = () => $('#postPage');
const post = PostPanel.create($('#postMode'), {
  info: async () => {
    const r = PostCore.extract(postRoot(), POST_LOC);
    if (!r) return { ok: false };
    const { el, ...rest } = r; return { ok: true, ...rest };
  },
  async capture() {
    const r = PostCore.extract(postRoot(), POST_LOC);
    if (!r) return { ok: false, error: 'Could not find the post on this page.' };
    const { el, ...rest } = r;
    const out = { ok: true, ...rest };
    const b = el.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    pane.scrollTop += (b.top + b.height / 2) - (pr.top + pr.height / 2);
    try {
      if (!window.html2canvas) throw new Error('The screenshot library did not load.');
      const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(el).backgroundColor, scale: 2, logging: false });
      out.image = canvas;
      out.clip = { x: 0, y: 0, w: canvas.width, h: canvas.height };
      out.bounds = { ...out.clip };
    } catch (e) { out.shotError = 'Could not take a screenshot. ' + e.message; }
    return out;
  },
}, { log, onPublish: (i, t) => publish('post', i, t), onView: viewPublished, findDuplicate });

/* ---------- right-click item (mimics the extension's context menu) ---------- */
const menu = $('#ctxmenu');
storyEl().addEventListener('contextmenu', (e) => {
  const s = ArticleCore.readSelection(storyEl());
  if (!s || s.state !== 'ok') return;
  e.preventDefault();
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - 120) + 'px';
  $('#ctxAnnotate').focus();
});
const hideMenu = () => { menu.hidden = true; };
document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) hideMenu(); });
pane.addEventListener('scroll', hideMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
$('#ctxAnnotate').addEventListener('click', () => { hideMenu(); page.requestAnnotate(); });
$('#ctxCopy').addEventListener('click', async () => { hideMenu(); try { await navigator.clipboard.writeText(getSelection().toString()); } catch {} });

/* ---------- preview controls ---------- */
function setPanel(open) { $('#stage').classList.toggle('closed', !open); $('#toggle').setAttribute('aria-pressed', open); }

/* ---------- resizable side panel, like Chrome's ---------- */
// Drag the panel's left border. Narrower stops at a minimum width, and past that a "Release to hide" cue appears.
// Letting go there hides the panel. The toolbar button brings it back at its last width.
const PW_KEY = 'annotatedPanelWidth', PW_DEFAULT = 380, PW_MIN = 320, HIDE_AT = 200;
const stageEl = $('#stage'), resizer = $('#pResizer');
const maxW = () => Math.max(PW_MIN, Math.min(760, stageEl.clientWidth * 0.6));
let panelW = Number(localStorage.getItem(PW_KEY)) || PW_DEFAULT;
function applyW(w) {
  panelW = Math.round(Math.max(PW_MIN, Math.min(maxW(), w)));
  stageEl.style.setProperty('--pw', panelW + 'px');
  resizer.setAttribute('aria-valuenow', panelW); resizer.setAttribute('aria-valuemin', PW_MIN); resizer.setAttribute('aria-valuemax', Math.round(maxW()));
}
const saveW = () => { try { localStorage.setItem(PW_KEY, String(panelW)); } catch {} };
applyW(panelW);
window.addEventListener('resize', () => applyW(panelW));
let rz = null;
resizer.addEventListener('pointerdown', (e) => {
  rz = { id: e.pointerId, startW: panelW }; resizer.setPointerCapture(e.pointerId);
  stageEl.classList.add('resizing'); e.preventDefault();
});
resizer.addEventListener('pointermove', (e) => {
  if (!rz) return;
  const want = stageEl.getBoundingClientRect().right - e.clientX;
  stageEl.classList.toggle('willHide', want < HIDE_AT);
  applyW(want);
});
const endResize = (e) => {
  if (!rz) return;
  const hide = stageEl.classList.contains('willHide'), startW = rz.startW;
  rz = null; stageEl.classList.remove('resizing', 'willHide');
  // Hiding keeps the width you had before the drag, so the panel comes back the same size.
  if (hide) { applyW(startW); setPanel(false); log('Panel hidden by dragging its border'); }
  saveW();
};
resizer.addEventListener('pointerup', endResize);
resizer.addEventListener('pointercancel', endResize);
resizer.addEventListener('dblclick', () => { applyW(PW_DEFAULT); saveW(); });
// Keyboard: arrows resize, and Right at the minimum hides the panel.
resizer.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 60 : 20;
  if (e.key === 'ArrowLeft') { e.preventDefault(); applyW(panelW + step); saveW(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (panelW <= PW_MIN) setPanel(false); else { applyW(panelW - step); saveW(); } }
  else if (e.key === 'Home') { e.preventDefault(); applyW(PW_DEFAULT); saveW(); }
});
$('#toggle').addEventListener('click', togglePanel);
$('#close').addEventListener('click', () => { if (floatApi) floatApi.collapse(); else setPanel(false); });
$('#file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f || capturing) return;
  $('#vid').src = URL.createObjectURL(f);
  $('#vtitle').textContent = f.name.replace(/\.[^.]+$/, '');
  tabById('video').title = `${$('#vtitle').textContent} - YouTube`; drawTabs();
});
$('#adBtn').addEventListener('click', () => {
  const p = $('#movie_player'); p.classList.add('ad-showing'); $('#adflag').hidden = false;
  setTimeout(() => { p.classList.remove('ad-showing'); $('#adflag').hidden = true; }, 5000);
});
$('#close').innerHTML = Brand.icon('close', 'lg');
$('#esIcons').innerHTML = ['clip', 'article', 'post'].map((n) => Brand.icon(n, 'lg')).join('');
activate('video');
