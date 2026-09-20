"""Builds the single-file preview (preview/dist/annotated-preview.html) from the extension's code.

The preview is a browser-in-a-page demo of the extension. It inlines the extension's shared scripts and styles,
a stand-in article, and the stand-in video and podcast, so it works as one file with no install.
Run: python scripts/build_preview.py
"""
import base64, pathlib, re, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parent.parent
E = ROOT / 'extension'
P = ROOT / 'preview'
SHARED = ['prefs.js', 'floatframe.js', 'brand.js', 'waveform.js', 'filmstrip.js', 'emoji-data.js', 'emojikit.js', 'panel-kit.js',
          'compose.js', 'capture-engine.js', 'post-core.js', 'article-core.js', 'videopanel.js', 'articlepanel.js', 'postpanel.js', 'annotation-page.js']
shared = ''.join((E / f).read_text(encoding='utf-8') + '\n' for f in SHARED)
body = (P / 'assets' / 'article_body.html').read_text(encoding='utf-8')
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#14213d"/><circle cx="980" cy="120" r="46" fill="#f4f1de"/><g fill="#f4f1de" opacity=".7"><circle cx="120" cy="80" r="3"/><circle cx="300" cy="150" r="2"/><circle cx="520" cy="60" r="3"/><circle cx="760" cy="170" r="2"/><circle cx="1100" cy="260" r="2"/></g><rect y="470" width="1200" height="160" fill="#0b132b"/><rect x="0" y="545" width="1200" height="8" fill="#3a506b"/><g transform="translate(330 330)"><rect width="540" height="190" rx="26" fill="#fca311"/><rect x="30" y="30" width="90" height="70" rx="8" fill="#e5f4ff"/><rect x="140" y="30" width="90" height="70" rx="8" fill="#e5f4ff"/><rect x="250" y="30" width="90" height="70" rx="8" fill="#e5f4ff"/><rect x="360" y="30" width="90" height="70" rx="8" fill="#e5f4ff"/><rect x="470" y="30" width="50" height="120" rx="8" fill="#e5f4ff"/><circle cx="110" cy="195" r="36" fill="#1d1d1d"/><circle cx="430" cy="195" r="36" fill="#1d1d1d"/><rect x="520" y="120" width="26" height="22" rx="4" fill="#fff6c2"/></g><path d="M866 460 L1200 380 L1200 540 Z" fill="#fff6c2" opacity=".18"/></svg>'''
img = 'data:image/svg+xml,' + urllib.parse.quote(svg)
body = body.replace('<link rel="canonical"', f'<meta property="og:image" content="{img}">\n<link rel="canonical"')
body = body.replace('<p>The city council', f'<img class="hero" src="{img}" alt="A city bus at night">\n<p>The city council', 1)
t = (P / 'shell.html').read_text(encoding='utf-8')
t = (t.replace('/*UI_CSS*/', (E / 'ui.css').read_text(encoding='utf-8')).replace('/*ARTICLE*/', body)
      .replace('/*SHARED_JS*/', shared).replace('/*PREVIEW_JS*/', (P / 'preview.js').read_text(encoding='utf-8')))
t = t.replace('__HERO__', img)
t = t.replace('__EPISODE__', 'data:audio/webm;base64,' + base64.b64encode((P / 'assets' / 'episode.webm').read_bytes()).decode())
t = t.replace('__VIDEO__', 'data:video/webm;base64,' + base64.b64encode((P / 'assets' / 'demo.webm').read_bytes()).decode())
out = P / 'dist' / 'annotated-preview.html'
out.parent.mkdir(exist_ok=True)
out.write_text(t, encoding='utf-8')
(P / 'dist' / 'preview-scripts.js').write_text('\n'.join(re.findall(r'<script>(.*?)</script>', t, re.S)), encoding='utf-8')
print('built', out, f'{len(t) / 1048576:.1f} MB')
