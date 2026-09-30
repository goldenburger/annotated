# The website's read queries, run as they are against the live database (read only). Every other test answers the
# database with a stand-in that ignores what was asked, so a query the real API refuses passed them all: 2.40.0's
# embed of the annotation a quote answers named a constraint PostgREST cannot use on a table pointing at itself, and
# every annotation page read "This did not load".
import asyncio, json
from playwright.async_api import async_playwright
from _env import CHROME
import _world as W

async def main():
  errs = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=CHROME, headless=True)
    c = await b.new_context(viewport={'width': 1200, 'height': 800})
    await c.route('https://annotated-app.netlify.app/**', W.site)
    pg = await c.new_page()
    await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await asyncio.sleep(4)
    out = await pg.evaluate("""async () => {
      const r = {};
      const tryIt = async (k, f) => { try { r[k] = await f(); } catch (e) { r[k] = 'ERROR ' + ((e && e.message) || e); } };
      await tryIt('list', async () => { const l = await Cloud.list({ limit: 5 }); return l.length; });
      const first = await Cloud.list({ limit: 1 }).catch(() => []);
      const id = first[0] && first[0].id;
      await tryIt('get', async () => { const g = await Cloud.get(id); return g ? g.id === id : 'none'; });
      await tryIt('missing', async () => String(await Cloud.get('no-such-annotation-zz99')));
      await tryIt('social', async () => { const s = await Cloud.social(id, null); return Array.isArray(s.comments); });
      await tryIt('pinnedOf', async () => String(await Cloud.pinnedOf(first[0].author.id)));
      await tryIt('countBy', async () => typeof (await Cloud.countBy(first[0].author.id)));
      await tryIt('discovery', async () => { const d = await Cloud.discovery(null, {}); return Array.isArray(d.people); });
      return r; }""")
    print('live queries:', json.dumps(out))
    for k, v in out.items():
      if isinstance(v, str) and v.startswith('ERROR'): errs.append(f'{k}: {v}')
    if out.get('missing') != 'null': errs.append(f'a missing annotation did not read as none: {out.get("missing")}')
    await b.close()
  print('errors:', errs)

if __name__ == '__main__':
  asyncio.run(main())
