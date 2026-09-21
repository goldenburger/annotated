"""Copies the code the website shares with the extension into website/public.
The website draws annotation pages, feeds and profiles with the extension's own page code, so after changing any of
these files in extension/, run this before deploying the website.
Run: python scripts/sync_website.py
"""
import pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHARED = ['annotation-page.js', 'gifmaker.js', 'cloud.js', 'ui.css', 'brand.js', 'prefs.js', 'emoji-data.js', 'emojikit.js', 'waveform.js',
          'compose.js', 'panel-kit.js', 'fonts.css']
pub = ROOT / 'website' / 'public'
for f in SHARED:
    shutil.copy(ROOT / 'extension' / f, pub / f)
shutil.copytree(ROOT / 'extension' / 'fonts', pub / 'fonts', dirs_exist_ok=True)
shutil.copy(ROOT / 'extension' / 'vendor' / 'supabase.js', pub / 'vendor' / 'supabase.js')
print('synced', len(SHARED), 'files, fonts and the Supabase library into', pub)
