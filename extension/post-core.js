// X (Twitter) posts: finds the main post on a status page and reads it. Page side, no extension APIs.
// Shared by the extension content script and the preview, which uses the same data-testid markers.
var PostCore = (() => {
  const isStatusUrl = (u) => { try { const x = new URL(u); return /(^|\.)(x|twitter)\.com$/.test(x.hostname) && /\/status\/\d+/.test(x.pathname); } catch { return false; } };
  const statusId = (u) => { const m = String(u).match(/\/status\/(\d+)/); return m ? m[1] : null; };

  // X signed out serves other markup: no data-testid, the words in a div[dir=auto], no <time>, the date as the text
  // of the status link ("7:01 AM · Sep 12, 2026"). Both are read (2026-09-26, found recording the demo signed out).
  const POST = 'article[data-testid="tweet"], article';
  const TEXT = '[data-testid="tweetText"], div[dir="auto"]';
  const postOf = (node) => { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el ? el.closest(POST) : null; };
  const DATE = /[A-Z][a-z]{2} \d{1,2}, \d{4}/;
  const timeLink = (a, id) => [...a.querySelectorAll('a[href*="/status/"]')].find((l) => (!id || statusId(l.getAttribute('href')) === id) && (l.querySelector('time') || DATE.test(l.textContent)));
  // The main post is the one whose timestamp links to this page's status id.
  function findMain(root, loc) {
    const id = statusId(loc.href);
    const posts = [...root.querySelectorAll(POST)].filter((a) => a.querySelector(TEXT));
    return posts.find((a) => timeLink(a, id)) || posts[0] || null;
  }

  // Text with the emoji kept. X draws emoji as an image with the character in its alt, and both innerText and
  // Range.toString skip those, so a quote came out missing the emoji the person actually wrote.
  const BLOCKY = /^(DIV|P|LI|BR|SECTION|ARTICLE|BLOCKQUOTE|H[1-6])$/;
  function textOf(node) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'IMG') { out += n.getAttribute('alt') || ''; continue; }
      if (n.tagName === 'BR') { out += '\n'; continue; }
      out += textOf(n);
      if (BLOCKY.test(n.tagName) && out && !out.endsWith('\n')) out += '\n';
    }
    return out;
  }
  const tidy = (t) => t.replace(/\n{3,}/g, '\n\n').trim();
  const rangeText = (range) => textOf(range.cloneContents());

  function extract(root, loc) {
    const el = findMain(root, loc);
    return el ? read(el, loc) : null;
  }
  // Reads one post element, wherever it appears (a status page, the home timeline, a profile).
  function read(el, loc) {
    const textEl = el.querySelector(TEXT);
    const nameBox = el.querySelector('[data-testid="User-Name"]');
    let spans = nameBox ? [...nameBox.querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean) : [];
    let handle = spans.find((t) => /^@\w+$/.test(t)) || '';
    let author = spans.find((t) => t && !t.startsWith('@') && t !== '·') || handle;
    if (!nameBox) {
      // Signed out: the handle is a span reading @name, and the name is the text of the link to that profile.
      const hs = [...el.querySelectorAll('a[href^="/"] span')].find((s) => /^@\w+$/.test(s.textContent.trim()));
      handle = hs ? hs.textContent.trim() : '';
      const prof = handle && [...el.querySelectorAll(`a[href="/${handle.slice(1)}"]`)].map((a) => a.textContent.trim()).find((t) => t && !t.startsWith('@'));
      author = prof || handle;
    }
    const time = el.querySelector('time');
    const link = time ? time.closest('a') : timeLink(el);
    let url = link ? new URL(link.getAttribute('href'), loc.href).href : loc.href.split('?')[0];
    url = url.replace('://twitter.com/', '://x.com/');
    const dm = !time && link && link.textContent.match(DATE);
    const posted = time ? time.getAttribute('datetime') : dm ? (() => { const d = new Date(dm[0] + ' 12:00 UTC'); return isNaN(d) ? '' : d.toISOString(); })() : '';
    return {
      el,
      text: textEl ? tidy(textOf(textEl)) : '',
      author, handle,
      posted,
      url, id: statusId(url),
    };
  }

  const isXHost = (h) => /(^|\.)(x|twitter)\.com$/.test(h);
  return { isStatusUrl, statusId, extract, read, isXHost, textOf, rangeText, tidy, postOf, POST, TEXT };
})();
