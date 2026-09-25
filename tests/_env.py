import asyncio
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
# A floating panel the browser reports as not plainly visible (headless Edge always does) asks for a second
# press on Publish and the other weighty buttons (sidepanel.js). Returns whether it asked.
async def publish_now(pg, sel):
    await pg.click(sel)
    await asyncio.sleep(.15)
    try: armed = await pg.eval_on_selector(sel, "(b) => b.dataset.armed === '1' && b.textContent")
    except Exception: armed = False
    if armed: await pg.click(sel)
    return armed


# Tests that watch a panel in a window of its own must stop the page's Annotate button from opening the real
# side panel as well. Clicking Annotate asks the background to open annotated's panel, and in a test that is a
# second panel. Both then capture, the first succeeds, the second finds the selection used up, and whichever
# the test is watching decides whether it passes. In real use the panel it opens is the one you are looking at.
async def one_panel(sw):
    await sw.evaluate("chrome.sidePanel.open = async () => {}")

# A real mouse press on the page's own Annotate button (it sits in a shadow root). The button only answers presses
# the browser marks as coming from a person, so a script's .click() no longer works (security audit of 2026-09-24).
async def press_annotate(pg):
  r = await pg.evaluate("""() => { const h = [...document.querySelectorAll('.annotated-ui')].find((x) => x.style.display === 'block');
    const b = h && h.shadowRoot && h.shadowRoot.querySelector('button'); if (!b) return null; const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }""")
  if not r: raise RuntimeError('no Annotate button showing')
  await pg.mouse.click(r['x'], r['y'])


# A stand-in database that holds every annotation asked about. Cloud.gone asks which published ids still exist
# (select=id&id=in.(...)), and a test that serves an empty database would otherwise have its published records
# taken for deleted online and removed. Returns the reply body, or None when the request is something else.
def exists_reply(url):
  import json as _json
  from urllib.parse import urlparse, parse_qs
  if '/rest/v1/annotations' not in url: return None
  q = parse_qs(urlparse(url).query)
  if q.get('select') != ['id'] or not q.get('id'): return None
  inner = q['id'][0]
  if not inner.startswith('in.('): return None
  ids = [x.strip().strip('"') for x in inner[4:-1].split(',') if x.strip()]
  return _json.dumps([{'id': i} for i in ids])
