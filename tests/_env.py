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
# Chromium 137 and later ignore --load-extension until this feature is turned off, so every test that loads the
# extension passes this as well.
LOADEXT = '--disable-features=DisableLoadExtensionCommandLineSwitch'
# Some podcast hosts refuse the HeadlessChrome user agent, so tests that reach real hosts pretend to be Chrome.
REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
def prof(name):
    # A fresh browser profile folder for one test.
    import shutil
    p = os.path.join(TMP, 'annotated-test-' + name)
    shutil.rmtree(p, ignore_errors=True)
    return p
