  document.getElementById('wm').innerHTML = Brand.wordmark();
  const tokens = ['ink', 'ink-2', 'ink-3', 'paper', 'sheet', 'newsprint', 'rule', 'hi', 'hi-edge', 'red', 'ok', 'focus'];
  document.getElementById('sw').innerHTML = tokens.map((t) => `<div><i style="background: var(--${t})"></i><span>--${t}</span></div>`).join('');
  const set = (id, icon, text) => { document.getElementById(id).innerHTML = `${Brand.icon(icon)} ${text}`; };
  set('bmic', 'mic', 'Record a voice note'); set('blink', 'link', 'Copy link'); set('bedit', 'edit', 'Edit'); set('bdel', 'trash', 'Delete'); set('bclaim', 'flag', 'File a claim');
  const names = ['link', 'share', 'x', 'edit', 'trash', 'flag', 'play', 'mic', 'stop', 'close', 'check', 'clip', 'article', 'post', 'highlighter', 'external', 'arrowLeft', 'image'];
  document.getElementById('icons').innerHTML = names.map((n) => `<span>${Brand.icon(n, 'lg')}${n}</span>`).join('');
