// X (Twitter) posts: finds the main post on a status page and reads it. Page side, no extension APIs.
// Shared by the extension content script and the preview, which uses the same data-testid markers.
var PostCore = (() => {
  const isStatusUrl = (u) => { try { const x = new URL(u); return /(^|\.)(x|twitter)\.com$/.test(x.hostname) && /\/status\/\d+/.test(x.pathname); } catch { return false; } };
  const statusId = (u) => { const m = String(u).match(/\/status\/(\d+)/); return m ? m[1] : null; };

  // The main post is the one whose timestamp links to this page's status id.
  function findMain(root, loc) {
    const id = statusId(loc.href);
    const posts = [...root.querySelectorAll('article[data-testid="tweet"]')];
    return posts.find((a) => [...a.querySelectorAll('a[href*="/status/"]')].some((l) => statusId(l.getAttribute('href')) === id && l.querySelector('time'))) || posts[0] || null;
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
    const textEl = el.querySelector('[data-testid="tweetText"]');
    const nameBox = el.querySelector('[data-testid="User-Name"]');
    const spans = nameBox ? [...nameBox.querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean) : [];
    const handle = spans.find((t) => /^@\w+$/.test(t)) || '';
    const author = spans.find((t) => t && !t.startsWith('@') && t !== '·') || handle;
    const time = el.querySelector('time');
    const link = time && time.closest('a');
    let url = link ? new URL(link.getAttribute('href'), loc.href).href : loc.href.split('?')[0];
    url = url.replace('://twitter.com/', '://x.com/');
    return {
      el,
      text: textEl ? tidy(textOf(textEl)) : '',
      author, handle,
      posted: time ? time.getAttribute('datetime') : '',
      url, id: statusId(url),
    };
  }

  const isXHost = (h) => /(^|\.)(x|twitter)\.com$/.test(h);
  return { isStatusUrl, statusId, extract, read, isXHost, textOf, rangeText, tidy };
})();
