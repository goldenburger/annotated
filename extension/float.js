// Floating mode: shows the annotated panel over the page in a movable, resizable frame.
// The frame holds an iframe of the same panel page the side panel uses, so every feature carries over.
(() => {
  if (window.__annotatedFloat) return;
  window.__annotatedFloat = true;
  let api = null, host = null, creating = null, myTab = null, onHeight = null, removedGen = 0;
  const darkNow = (theme) => theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

  async function ensure(tabId) {
    if (api) return api;
    if (creating) return creating;
    myTab = tabId;
    const gen = removedGen;
    creating = (async () => {
      const { floatRect, annotatedPrefs } = await chrome.storage.local.get(['floatRect', 'annotatedPrefs']);
      if (removedGen !== gen) return null;
      host = document.createElement('div');
      host.id = 'annotated-float-host';
      host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;';
      const sh = host.attachShadow({ mode: 'open' });
      const base = document.createElement('style');
      base.textContent = ':host { all: initial; } .ff, .ffPill { pointer-events: auto; }';
      sh.appendChild(base);
      document.documentElement.appendChild(host);
      const key = [...crypto.getRandomValues(new Uint8Array(16))].map((n) => n.toString(16).padStart(2, '0')).join('');
      await chrome.storage.local.set({ ['floatKey' + tabId]: key });
      if (removedGen !== gen) { host.remove(); host = null; chrome.storage.local.remove('floatKey' + tabId).catch(() => {}); return null; }
      const frame = document.createElement('iframe');
      // The key is handed over by message once the frame has loaded, and never written into its address. The
      // frame sits in an open shadow root, so the page can read its address, and a key read from there let any
      // page build its own copy of the panel, which is the one thing the key is for.
      frame.src = chrome.runtime.getURL('sidepanel.html') + '?tab=' + tabId + '&embed=float';
      const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
      frame.addEventListener('load', () => { try { frame.contentWindow.postMessage({ type: 'annotated-key', k: key }, EXT_ORIGIN); } catch { /* the frame went away */ } });
      frame.title = 'annotated';
      frame.allow = 'clipboard-write; microphone';
      const cmd = (c) => frame.contentWindow && frame.contentWindow.postMessage({ type: 'annotated-cmd', cmd: c }, '*');
      onHeight = (e) => {
        if (api && e.source === frame.contentWindow && e.data && e.data.type === 'annotated-height') api.setContentHeight(e.data.h);
      };
      window.addEventListener('message', onHeight);
      api = FloatFrame.mount(sh, frame, {
        rect: floatRect,
        zIndex: 2147483646,
        buttons: [{ icon: 'gear', label: 'Display and preferences', onClick: () => cmd('display') }, { icon: 'help', label: 'How annotated works', onClick: () => cmd('help') }],
        onRect: (r) => chrome.storage.local.set({ floatRect: r }),
        onClose: () => remove(),
      });
      api.setDark(darkNow(annotatedPrefs && annotatedPrefs.theme));
      creating = null;
      return api;
    })();
    return creating;
  }
  function remove() {
    removedGen++; creating = null;
    if (onHeight) { window.removeEventListener('message', onHeight); onHeight = null; }
    if (api) { api.destroy(); api = null; }
    if (host) { host.remove(); host = null; }
    chrome.storage.local.remove('floatKey' + myTab).catch(() => {});
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.annotatedPrefs) return;
    const p = ch.annotatedPrefs.newValue || {};
    if (p.display !== 'float') remove();
    else if (api) api.setDark(darkNow(p.theme));
  });

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    switch (msg && msg.type) {
      case 'float-open': ensure(msg.tabId).then((a) => { if (a) a.expand(); reply({ ok: !!a }); }); return true;
      case 'float-toggle':
        if (api && !api.collapsed) { api.collapse(); reply({ ok: true }); return; }
        ensure(msg.tabId).then((a) => { if (a) a.expand(); reply({ ok: !!a }); }); return true;
      case 'float-collapse': if (api) api.collapse(); reply({ ok: true }); return;
      case 'float-remove': remove(); reply({ ok: true }); return;
      // The panel hides the frame while it screenshots the page, so the frame never appears in the screenshot.
      case 'float-hide': if (api) api.setHidden(true); requestAnimationFrame(() => requestAnimationFrame(() => reply({ ok: true }))); return true;
      case 'float-show': if (api) api.setHidden(false); reply({ ok: true }); return;
      case 'float-ping': reply({ ok: true, open: !!api && !api.collapsed }); return;
    }
  });
})();
