# Paths and settings for the tests, relative to the project, so they run on any computer.
# Tests run with this folder as the working directory (scripts/run_tests.py does that).
import os, tempfile, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = str(ROOT / 'extension')
PREVIEW_FILE = ROOT / 'preview' / 'dist' / 'annotated-preview.html'
PREVIEW = PREVIEW_FILE.as_uri()
SITE_PUBLIC = str(ROOT / 'website' / 'public')
PODCAST = str(ROOT / 'preview' / 'assets' / 'episode.webm')
TMP = tempfile.gettempdir()
# Unset: Playwright's own Chromium (install with "python -m playwright install chromium").
CHROME = os.environ.get('ANNOTATED_CHROME') or None
def prof(name):
    # A fresh browser profile folder for one test.
    import shutil
    p = os.path.join(TMP, 'annotated-test-' + name)
    shutil.rmtree(p, ignore_errors=True)
    return p
