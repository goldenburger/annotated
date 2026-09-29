"""Copies the code the website shares with the extension into website/public.
The website draws annotation pages, feeds and profiles with the extension's own page code, so after changing any of
these files in extension/, run this before deploying the website.
Run: python scripts/sync_website.py
"""
import pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHARED = ['annotation-page.js', 'gifmaker.js', 'giphy.js', 'cloud.js', 'ui.css', 'brand.js', 'prefs.js', 'emoji-data.js', 'emojikit.js', 'waveform.js',
          'compose.js', 'panel-kit.js', 'fonts.css', 'article-core.js', 'fold.js', 'fold.css', 'paperdeco.js']
pub = ROOT / 'website' / 'public'
for f in SHARED:
    shutil.copy(ROOT / 'extension' / f, pub / f)
shutil.copytree(ROOT / 'extension' / 'fonts', pub / 'fonts', dirs_exist_ok=True)
shutil.copytree(ROOT / 'extension' / 'paper', pub / 'paper', dirs_exist_ok=True)
shutil.copytree(ROOT / 'extension' / 'doodles', pub / 'doodles', dirs_exist_ok=True)
shutil.copy(ROOT / 'extension' / 'vendor' / 'supabase.js', pub / 'vendor' / 'supabase.js')

# A browser that has been here before keeps the old scripts and stylesheets, so after a deploy it runs last
# week's code against this week's page. Every local script and stylesheet carries the extension's version,
# which changes whenever the code does.
import json, re
ver = json.loads((ROOT / 'extension' / 'manifest.json').read_text(encoding='utf-8'))['version']
stamped = 0
for html in sorted(pub.glob('*.html')):
    t = html.read_text(encoding='utf-8')
    out = re.sub(r'(<(?:script src|link rel="stylesheet" href)="/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"',
                 lambda m: f'{m.group(1)}?v={ver}"', t)
    if out != t:
        html.write_text(out, encoding='utf-8', newline='')
        stamped += 1
print('synced', len(SHARED), 'files, fonts and the Supabase library into', pub)
print('stamped', stamped, 'pages with version', ver)
