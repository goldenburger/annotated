# Sign in with X (2.34.0). Jason's brief asks for "sign in with X or Google".
#   1. Signed out, the panel's Sign in opens a card with both ways in, Continue with Google and Continue with X,
#      and the X button asks Supabase for its X sign-in (provider=x), not Google.
#   2. The shared sign-in prompt (for follow, comment, react, vote) offers both.
#   3. Signed in, the account menu offers Connect X when the account has only Google, and says X is connected
#      once it has both.
#   4. On the website, the header's Sign in opens the same choice, and Continue with X goes to Supabase's X
#      sign-in with the page to come back to.
import asyncio, pathlib, mimetypes, json, time
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
from _env import *
SUPA = 'https://efuotxdeifqzdfsavekb.supabase.co'
PUB = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
UID = '11111111-1111-4111-8111-111111111111'
SESSION = {'access_token': 'header.e30.sig', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 360000,
           'expires_at': int(time.time()) + 360000,
           'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'robo@example.test',
                    'app_metadata': {}, 'user_metadata': {'full_name': 'Robo Taxi'}, 'created_at': '2026-09-01T00:00:00Z'}}
PROFILE = [{'id': UID, 'handle': 'robotaxi', 'display_name': 'Robo Taxi', 'avatar_url': ''}]

def site(route):
  path = urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f = PUB / path
  if not f.is_file(): f = PUB / 'index.html'
  return route.fulfill(status=200, body=f.read_bytes(), headers={'Content-Type': mimetypes.guess_type(str(f))[0] or 'application/octet-stream'})

async def panel_part(p, errs):
  ctx = await p.chromium.launch_persistent_context(prof('profXSIGN'), headless=True, executable_path=CHROME,
    args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
  await ctx.add_init_script("try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}")
  identities = {'list': [{'provider': 'google', 'identity_id': 'g1', 'id': 'g1', 'user_id': UID}]}
  async def auth(route):
    u = route.request.url
    if '/auth/v1/user/identities' in u or u.endswith('/auth/v1/user'):
      user = dict(SESSION['user']); user['identities'] = identities['list']
      return await route.fulfill(status=200, content_type='application/json', body=json.dumps(user))
    return await route.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION['user']))
  await ctx.route(SUPA + '/rest/v1/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
  await ctx.route(SUPA + '/rest/v1/profiles*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PROFILE)))
  await ctx.route(SUPA + '/auth/v1/**', auth)
  sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
  extid = sw.url.split('/')[2]
  blank = await ctx.new_page(); await blank.goto('about:blank')
  tid = await sw.evaluate("chrome.tabs.query({}).then(t=>Math.max(...t.map(x=>x.id)))")
  pg = await ctx.new_page(); await pg.set_viewport_size({'width': 420, 'height': 900})
  pg.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
  await pg.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(2.5)

  # 1. Signed out: both ways in, and X asks Supabase for X.
  await pg.click('.acctBtn'); await asyncio.sleep(.5)
  ways = await pg.evaluate("[...document.querySelectorAll('.acctPop .acctIn')].map(b => [b.dataset.provider, b.textContent.trim()])")
  print('signed out, the account card offers:', ways)
  if ways != [['google', 'Continue with Google'], ['x', 'Continue with X']]: errs.append(f'the two ways in are not offered: {ways}')
  # The trip itself is Chrome's own window, so it is stood in for, and the address it would open is kept.
  await pg.evaluate("""() => { window.__went = []; chrome.identity.launchWebAuthFlow = async ({ url }) => { window.__went.push(url); throw new Error('The user did not approve access.'); }; }""")
  await pg.click('.acctPop .acctIn[data-provider="x"]'); await asyncio.sleep(1)
  went = await pg.evaluate('window.__went')
  q = parse_qs(urlparse(went[0]).query) if went else {}
  print('Continue with X opened:', (went[0][:90] + '…') if went else None)
  if not went or q.get('provider') != ['x']: errs.append(f'Continue with X did not ask Supabase for X: {went}')
  if went and 'chromiumapp.org' not in (q.get('redirect_to') or [''])[0]: errs.append('X does not come back to the extension')
  cancelled = await pg.evaluate("(document.querySelector('.acctPop .err') || {}).textContent || ''")
  print('after cancelling, the card says:', cancelled)
  if 'cancelled' not in cancelled.lower(): errs.append(f'a cancelled X sign-in said nothing: {cancelled!r}')

  # 2. The shared prompt offers both.
  await pg.evaluate("AnnotationPage.signInPrompt({ text: 'Sign in to follow people.', onSignIn: (p) => { window.__chose = p; } })")
  prompt = await pg.evaluate("[...document.querySelectorAll('.signAsk .saYes')].map(b => b.textContent.trim())")
  print('the prompt offers:', prompt)
  if prompt != ['Continue with Google', 'Continue with X']: errs.append(f'the prompt does not offer both: {prompt}')
  await pg.click('.signAsk .saYes[data-provider="x"]'); await asyncio.sleep(.2)
  if await pg.evaluate('window.__chose') != 'x': errs.append('the prompt did not pass on the choice of X')

  # 3. Signed in with Google only: Connect X. With both: X is connected.
  await sw.evaluate("(s)=>chrome.storage.local.set({'annotated-auth': JSON.stringify(s)})", SESSION)
  await pg.reload(); await asyncio.sleep(2.5)
  await pg.click('.acctBtn'); await asyncio.sleep(1.2)
  line = await pg.evaluate("(document.querySelector('.acctPop .acctX') || {}).textContent || ''")
  print('Google only, the menu says:', ' '.join(line.split()))
  if 'Connect X' not in line: errs.append(f'Connect X is not offered: {line!r}')
  await pg.keyboard.press('Escape'); await asyncio.sleep(.3)
  identities['list'] = identities['list'] + [{'provider': 'x', 'identity_id': 'x1', 'id': 'x1', 'user_id': UID}]
  await pg.click('.acctBtn'); await asyncio.sleep(1.2)
  line = await pg.evaluate("(document.querySelector('.acctPop .acctX') || {}).textContent || ''")
  print('with both, the menu says:', ' '.join(line.split()))
  if 'X is connected' not in line: errs.append(f'a connected X is not said: {line!r}')
  await pg.screenshot(path='xsignin_panel.png')
  await ctx.close()

async def site_part(p, errs):
  b = await p.chromium.launch(executable_path=CHROME, headless=True)
  c = await b.new_context(viewport={'width': 1280, 'height': 900})
  await c.add_init_script("try{localStorage.setItem('annotated-planes-off','1')}catch(e){}")
  went = []
  async def supa(route):
    if '/auth/v1/authorize' in route.request.url:
      went.append(route.request.url)
      return await route.fulfill(status=200, content_type='text/html', body='<p>X sign-in stand-in</p>')
    return await route.fulfill(status=200, content_type='application/json', body='[]')
  await c.route('https://annotated-app.netlify.app/**', site)
  await c.route(SUPA + '/**', supa)
  pg = await c.new_page(); pg.on('pageerror', lambda e: errs.append('SITE ' + str(e)))
  await pg.goto('https://annotated-app.netlify.app/?feed&noplanes'); await asyncio.sleep(2.5)
  await pg.click('.sitenav .webSignIn'); await asyncio.sleep(.5)
  prompt = await pg.evaluate("[...document.querySelectorAll('.signAsk .saYes')].map(b => b.textContent.trim())")
  print('website, Sign in offers:', prompt)
  if prompt != ['Continue with Google', 'Continue with X']: errs.append(f'the website does not offer both: {prompt}')
  await pg.screenshot(path='xsignin_site.png')
  await pg.click('.signAsk .saYes[data-provider="x"]'); await asyncio.sleep(1.5)
  q = parse_qs(urlparse(went[0]).query) if went else {}
  print('website, Continue with X went to:', (went[0][:90] + '…') if went else None)
  if not went or q.get('provider') != ['x']: errs.append(f'the website did not ask Supabase for X: {went}')
  if went and 'annotated-app.netlify.app' not in (q.get('redirect_to') or [''])[0]: errs.append('the website does not come back to itself')
  await b.close()

async def main():
  errs = []
  async with async_playwright() as p:
    await panel_part(p, errs)
    await site_part(p, errs)
  print('errors:', errs)

asyncio.run(main())
