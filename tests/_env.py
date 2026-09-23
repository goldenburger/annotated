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
# An invite opens the computer's mail program, which puts a window on the screen of whoever is running the tests.
# Tests add this so the invite is recorded on window.__mailto and nothing opens.
NO_MAILTO = '''document.addEventListener("click", (e) => {
  const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
  if (a) { e.preventDefault(); window.__mailto = a.getAttribute("href"); }
}, true);'''
def prof(name):
    # A fresh browser profile folder for one test.
    import shutil
    p = os.path.join(TMP, 'annotated-test-' + name)
    shutil.rmtree(p, ignore_errors=True)
    return p


# Presses Publish. Publishing used to ask about a quote that starts or ends mid sentence, and this answered
# it. Nothing is asked now, because any words may be annotated, and the tests still call it by this name.
async def publish_now(pg, sel):
    await pg.click(sel)


# Tests that watch a panel in a window of its own must stop the page's Annotate button from opening the real
# side panel as well. Clicking Annotate asks the background to open annotated's panel, and in a test that is a
# second panel. Both then capture, the first succeeds, the second finds the selection used up, and whichever
# the test is watching decides whether it passes. In real use the panel it opens is the one you are looking at.
async def one_panel(sw):
    await sw.evaluate("chrome.sidePanel.open = async () => {}")
