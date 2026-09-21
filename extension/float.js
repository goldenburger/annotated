// Floating mode: shows the annotated panel over the page in a movable, resizable frame.
// The frame holds an iframe of the same panel page the side panel uses, so every feature carries over.
(() => {
  if (window.__annotatedFloat) return;
  window.__annotatedFloat = true;
  let api = null, host = null, creating = null, myTab = null;
  const darkNow = (theme) => theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

  async function ensure(tabId) {
    if (api) return api;
    if (creating) return creating;
    myTab = tabId;
    creating = (async () => {
      const { floatRect, annotatedPrefs } = await chrome.storage.local.get(['floatRect', 'annotatedPrefs']);
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
      const frame = document.createElement('iframe');
      frame.src = chrome.runtime.getURL('sidepanel.html') + '?tab=' + tabId + '&embed=float&k=' + key;
      frame.title = 'annotated';
      frame.allow = 'clipboard-write; microphone';
      const cmd = (c) => frame.contentWindow && frame.contentWindow.postMessage({ type: 'annotated-cmd', cmd: c }, '*');
      window.addEventListener('message', (e) => {
        if (api && e.source === frame.contentWindow && e.data && e.data.type === 'annotated-height') api.setContentHeight(e.data.h);
      });
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
      case 'float-open': ensure(msg.tabId).then((a) => { a.expand(); reply({ ok: true }); }); return true;
      case 'float-toggle':
        if (api && !api.collapsed) { api.collapse(); reply({ ok: true }); return; }
        ensure(msg.tabId).then((a) => { a.expand(); reply({ ok: true }); }); return true;
      case 'float-collapse': if (api) api.collapse(); reply({ ok: true }); return;
      case 'float-remove': remove(); reply({ ok: true }); return;
      // The panel hides the frame while it screenshots the page, so the frame never appears in the screenshot.
      case 'float-hide': if (api) api.setHidden(true); requestAnimationFrame(() => requestAnimationFrame(() => reply({ ok: true }))); return true;
      case 'float-show': if (api) api.setHidden(false); reply({ ok: true }); return;
      case 'float-ping': reply({ ok: true, open: !!api && !api.collapsed }); return;
    }
  });
})();
