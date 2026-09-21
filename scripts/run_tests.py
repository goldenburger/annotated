"""Runs the test suite and prints one line per test and a summary.

Groups: preview (the single-file preview), extension (the real extension in Chromium), online (tests that reach the
real Supabase database, Apple's podcast directory or the network). "all" runs preview and extension.
Run: python scripts/run_tests.py [preview|extension|online|all] [name ...]
Needs: pip install playwright pillow, then python -m playwright install chromium
The preview tests need the built preview: python scripts/build_preview.py
"""
import os, pathlib, subprocess, sys, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
# Test output carries emoji and check marks, which a default Windows console cannot encode.
CHILD_ENV = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
TESTS = ROOT / 'tests'
GROUPS = {
    'preview': ['pa', 'pb', 'pc', 'pd', 'pe', 'emo', 'fix6', 'prev3b', 'prev4', 'prev5', 'prev6', 'p2shots', 'r7', 'r8', 'r9', 'r10',
                'r11', 'r11c', 'shot1', 'pod', 'verify12', 'rz', 'disp', 'disp2'],
    'extension': ['ext_all', 'ext_post', 'e_p3', 'narrow', 'ext_pod', 'ext_welcome', 'ext_float', 'ext_r9', 'ext_x', 'ext_r12',
                  'ext_r13', 'hl', 'store_up', 'fp_unwrap', 'x_quote', 'x_fold', 'x_emoji', 'reinject', 'feedtabs', 'podguess', 'snappref', 'penpref', 'follows', 'stroke'],
    'online': ['ext_feed', 'ext_fpart', 'ext_disc', 'ext_auth', 'web'],
}
# Not in any group: matrix (every width and theme, slow), gallery (screenshots of every screen), fphosts (tries six real
# podcasts), idcheck (prints the extension's ID), xss and ext_cloud (need a test row put into the database first).
args = sys.argv[1:] or ['all']
names = []
for a in args:
    if a == 'all': names += GROUPS['preview'] + GROUPS['extension']
    elif a in GROUPS: names += GROUPS[a]
    else: names.append(a)
passed, failed = [], []
for n in names:
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, f'{n}.py'], cwd=TESTS, capture_output=True, text=True, encoding='utf-8', errors='replace', env=CHILD_ENV, timeout=300)
        out = r.stdout + r.stderr
        ok = r.returncode == 0 and 'Traceback' not in out and ('errors: []' in out or 'errors []' in out)
    except subprocess.TimeoutExpired:
        out, ok = 'timed out after 300 s', False
    (passed if ok else failed).append(n)
    tail = [l for l in out.strip().splitlines() if l.strip()][-1:] or ['']
    print(f"{'PASS' if ok else 'FAIL'}  {n:<12} {time.time() - t0:5.1f}s  {'' if ok else tail[0][:150]}", flush=True)
print(f'\n{len(passed)} passed, {len(failed)} failed' + (f": {', '.join(failed)}" if failed else ''))
sys.exit(1 if failed else 0)
