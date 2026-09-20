"""Zips the extension into dist/annotated-extension.zip and copies it to the website for download.
Run: python scripts/package_extension.py
"""
import pathlib, shutil, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / 'extension'
out = ROOT / 'dist' / 'annotated-extension.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob('*')):
        if f.is_file() and '__pycache__' not in f.parts:
            z.write(f, pathlib.Path('annotated-extension') / f.relative_to(src))
shutil.copy(out, ROOT / 'website' / 'public' / 'annotated-extension.zip')
print('packaged', out)
