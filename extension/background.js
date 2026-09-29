// Display mode decides what the toolbar button, the page's Annotate button, the right-click item and the
// shortcuts do: open the side panel, or show the floating panel on the page.
let P = { display: 'side' };
const sync = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: P.display !== 'float' }).catch(() => {});
// The worker sleeps when idle, and wakes with P at its default. The event that woke it arrives before the saved
// setting is read, so choosing waits for that read (audit of 2026-09-29: floating mode opened the side panel on the
// first click after a pause).
let loaded = false;
const ready = chrome.storage.local.get('annotatedPrefs').then((o) => { P = { ...P, ...(o.annotatedPrefs || {}) }; loaded = true; sync(); }).catch(() => { loaded = true; });
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== 'local' || !ch.annotatedPrefs) return;
  const was = P.display;
  P = { display: 'side', ...(ch.annotatedPrefs.newValue || {}) };
  sync();
  // Switching to floating shows it straight away on the tab you are looking at.
  if (was !== 'float' && P.display === 'float') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && !restricted(tab.url)) showFloat(tab, 'float-open');
  }
});
// Installed from the front page: that tab is still open, still showing the install steps, and a page loaded
// before the extension existed cannot know it is here now. It moves to its installed state and comes to the
// front, so the next step is on screen. Installed any other way, nothing opens. tests/installed.py calls it.
function showInstalled() {
  return chrome.tabs.query({ url: 'https://annotated-app.netlify.app/*' }).then((tabs) => {
    // Only a tab left behind: when you install, the extensions page is in front. A front page that is itself in
    // front is someone reading it, and must not be moved under them.
    const front = (u) => { try { const p = new URL(u).pathname; return p === '/' || p === '/install'; } catch { return false; } };
    const t = tabs.filter((x) => !x.active && front(x.url)).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (!t) return;
    chrome.tabs.update(t.id, { url: 'https://annotated-app.netlify.app/?installed', active: true });
    chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
  }).catch(() => {});
}
chrome.runtime.onInstalled.addListener((details) => {
  sync();
  if (details && details.reason === 'install') showInstalled();
  chrome.contextMenus.create({ id: 'annotate', title: 'Annotate this passage', contexts: ['selection'] }, () => void chrome.runtime.lastError);
});
chrome.runtime.onStartup.addListener(sync);
// A floating panel's key is kept only while its tab is open.
chrome.tabs.onRemoved.addListener((id) => { chrome.storage.local.remove('floatKey' + id).catch(() => {}); });

// Chrome does not let extensions draw on its own pages, so those always use the side panel.
const restricted = (u) => !/^https?:/.test(u || '') || /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(u);
async function showFloat(tab, type) {
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['floatframe.js', 'float.js'] }); }
  catch { return false; }
  await chrome.tabs.sendMessage(tab.id, { type, tabId: tab.id }).catch(() => {});
  return true;
}
function openFor(tab, type = 'float-open') {
  if (!loaded) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    return ready.then(() => {
      if (P.display === 'float' && !restricted(tab.url)) {
        // Chrome before 141 has no close; turning the panel off for the tab closes it, and it is turned back on.
        if (chrome.sidePanel.close) chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
        else chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false })
          .then(() => chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true, path: 'sidepanel.html' })).catch(() => {});
        return showFloat(tab, type);
      }
    });
  }
  if (P.display === 'float' && !restricted(tab.url)) return showFloat(tab, type);
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
}

// Toolbar button and Alt+Shift+K. In side panel mode Chrome opens the panel itself and this never fires.
// It fires only when the panel is not opened by Chrome itself, which is floating mode, so it needs no wait.
chrome.action.onClicked.addListener((tab) => ((restricted(tab.url) || (loaded && P.display !== 'float')) ? chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}) : showFloat(tab, 'float-toggle')));

// Right-click "Annotate this passage".
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'annotate' || !tab) return;
  openFor(tab);
  chrome.tabs.sendMessage(tab.id, { type: 'pin-and-annotate' }).catch(() => {});
});

// The floating Annotate button on the page asks for the panel.
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m && m.type === 'annotate-request' && sender.tab) openFor(sender.tab);
});

// Alt+Shift+S: open the panel and hand it the passage you have selected.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'annotate-selection' || !tab) return;
  openFor(tab);
  chrome.tabs.sendMessage(tab.id, { type: 'pin-and-annotate' }).catch(() => {});
});
