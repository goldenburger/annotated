# The link-preview edge function, run in Node against the real index.html (audit of 2026-09-29, seventh pass).
# It replaced a fixed "<title>annotated</title>", which stopped matching when the page's title changed on
# 2026-09-23, so every shared annotation link showed the home page's card. Needs Node 22 or later.
import json, os, subprocess, tempfile
from _env import ROOT

errs = []
fn = os.path.join(ROOT, 'website', 'netlify', 'edge-functions', 'preview-card.ts').replace('\\', '/')
page = open(os.path.join(ROOT, 'website', 'public', 'index.html'), encoding='utf-8').read()
row = [{'take_text': 'Pacing is a choice $& $\' <b>', 'kind': 'post', 'source': {'author': 'Dario Amodei'},
        'shot_path': 'u1/a/shot.png', 'poster_path': None, 'author': {'display_name': 'Robo Taxi', 'handle': 'robotaxi'}}]
harness = """
globalThis.Netlify = { env: { get: (k) => ({ SUPABASE_URL: 'https://db.example', SUPABASE_PUBLISHABLE_KEY: 'k' })[k] } };
globalThis.fetch = async () => new Response(JSON.stringify(ROW), { status: 200 });
const { default: fn } = await import('file:///FN');
const next = async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', etag: 'x' } });
const res = await fn(new Request('https://annotated-app.netlify.app/@robotaxi/pacing-ab12'), { next });
const other = await fn(new Request('https://annotated-app.netlify.app/?feed'), { next });
console.log(JSON.stringify({ html: await res.text(), etag: res.headers.get('etag'), other: await other.text() }));
""".replace('ROW', json.dumps(row)).replace('PAGE', json.dumps(page)).replace('FN', fn)
d = tempfile.mkdtemp()
h = os.path.join(d, 'h.mjs'); open(h, 'w', encoding='utf-8').write(harness)
p = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', h], capture_output=True, text=True, encoding='utf-8')
if p.returncode:
    print(p.stderr[-2000:]); errs.append('the edge function did not run')
else:
    out = json.loads(p.stdout.strip().splitlines()[-1])
    html = out['html']
    import re
    titles = re.findall(r'<title>([^<]*)</title>', html)
    ogt = re.findall(r'property="og:title" content="([^"]*)"', html)
    twt = re.findall(r'name="twitter:title" content="([^"]*)"', html)
    img = re.findall(r'property="og:image" content="([^"]*)"', html)
    desc = re.findall(r'name="description"', html)
    print('title:', titles, '| og:title:', ogt, '| twitter:title:', twt, '| og:image:', img, '| description tags:', len(desc), '| etag:', out['etag'])
    if len(titles) != 1 or not titles[0].startswith('Pacing is a choice'): errs.append('the page title is not the take')
    if ogt != ['Pacing is a choice $&amp; $&#39; &lt;b&gt;']: errs.append('og:title is not the escaped take, once')
    if len(twt) != 1: errs.append('twitter:title is not there once')
    if img != ['https://db.example/storage/v1/object/public/media/u1/a/shot.png']: errs.append('og:image is not the screenshot')
    if desc: errs.append("the home page's description was left in")
    if out['etag']: errs.append('the static etag was kept')
    if '<script' not in html or html.count('<script') != page.count('<script'): errs.append('the scripts were changed')
    if out['other'] != page: errs.append('a page other than an annotation was changed')
print('errors:', errs)
