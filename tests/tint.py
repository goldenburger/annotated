# The colour is a choice now. Display settings offers six, and picking one has to reach three different places
# at once: the panel and every page of ours through a variable, and the page you are reading through a message,
# because that page has no stylesheet of ours and the stroke is injected into it. A colour also has to stay
# readable, so the words on a highlighter are measured against it rather than eyeballed.
import asyncio
from playwright.async_api import async_playwright
from _env import *
EXT = EXT
INIT = "try{localStorage.setItem('annotated-welcome-seen','1')}catch(e){}"
BODY = ('<!doctype html><html><head><meta charset="utf-8"><title>Harbor story</title></head><body><article><h1>Harbor story</h1>'
        '<p>The council met on a Tuesday to talk about the overnight buses. '
        '<mark class="annotated-hl hl-a hl-z">Every member arrived on time for once.</mark></p>'
        '</article></body></html>')
PAGE_INK = ("()=>getComputedStyle(document.querySelector('mark.annotated-hl'),'::before').backgroundImage")
# Read the real colours off a real button, drawn by the real stylesheet, and say how far apart they are.
PROBE = """() => {
  let b = document.getElementById('tintProbe');
  if (!b) { b = document.createElement('button'); b.id = 'tintProbe'; b.className = 'primary'; b.textContent = 'Publish';
            document.body.appendChild(b); }
  const c = getComputedStyle(b), root = getComputedStyle(document.documentElement);
  const rgb = (s) => (s.match(/\\d+/g) || []).slice(0, 3).map(Number);
  const lum = (p) => { const f = p.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
                       return .2126 * f[0] + .7152 * f[1] + .0722 * f[2]; };
  const a = lum(rgb(c.backgroundColor)), z = lum(rgb(c.color));
  return { tint: document.documentElement.getAttribute('data-tint'),
           hi: root.getPropertyValue('--hi').trim(),
           // The resolved colour of the page, not the token, because a token is whatever was written down.
           paper: getComputedStyle(document.body).backgroundColor,
           button: c.backgroundColor, ink: c.color,
           contrast: Math.round(((Math.max(a, z) + .05) / (Math.min(a, z) + .05)) * 10) / 10 };
}"""

async def main():
  errs = []
  async with async_playwright() as p:
    ctx = await p.chromium.launch_persistent_context(prof('profTINT'), headless=True, executable_path=CHROME,
      args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', LOADEXT, '--headless=new'], no_viewport=True)
    await ctx.add_init_script(INIT)
    await ctx.route('https://harborline.example/**', lambda r: r.fulfill(status=200, body=BODY, headers={'Content-Type': 'text/html; charset=utf-8'}))
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    extid = sw.url.split('/')[2]
    pg = await ctx.new_page(); await pg.set_viewport_size({'width': 900, 'height': 700})
    await pg.goto('https://harborline.example/story'); await asyncio.sleep(1.2)
    tid = await sw.evaluate("chrome.tabs.query({}).then(t=>t.find(x=>x.url.includes('harborline')).id)")
    pan = await ctx.new_page(); await pan.set_viewport_size({'width': 400, 'height': 900})
    pan.on('pageerror', lambda e: errs.append('PANEL ' + str(e)))
    await pan.goto(f'chrome-extension://{extid}/sidepanel.html?tab={tid}'); await asyncio.sleep(1.8)

    # 1. The picker sits under the gear, with the one in use already chosen.
    await pan.click('.gearBtn'); await asyncio.sleep(.5)
    tints = await pan.eval_on_selector_all('.tintBtn', 'bs=>bs.map(b=>[b.dataset.tint,b.getAttribute("aria-pressed"),b.getAttribute("aria-label")])')
    print('colours offered:', [t[0] for t in tints])
    if len(tints) != 6: errs.append(f'{len(tints)} colours were offered, wanted six')
    if dict((t[0], t[1]) for t in tints).get('highlighter') != 'true': errs.append('the yellow was not the one already chosen')
    if any(not t[2] for t in tints): errs.append('a swatch had no name for anyone who cannot see it')
    # Each swatch shows its own colour, not the one in use, or they would all look the same.
    inks = await pan.eval_on_selector_all('.tintBtn .tintInk', 'es=>es.map(e=>getComputedStyle(e).backgroundImage)')
    print('different swatches drawn:', len(set(inks)))
    if len(set(inks)) != 6: errs.append(f'{len(set(inks))} of the six swatches were drawn differently')

    start = await pan.evaluate(PROBE)
    page_start = await pg.evaluate(PAGE_INK)
    print('to begin with:', start)
    if start['tint'] != 'highlighter': errs.append(f"it started on {start['tint']!r}")

    # 2. Pick one and it reaches the panel, and the page you are reading.
    await pan.click('.tintBtn[data-tint="mint"]'); await asyncio.sleep(1.2)
    mint = await pan.evaluate(PROBE)
    page_mint = await pg.evaluate(PAGE_INK)
    print('after mint:', mint)
    if mint['tint'] != 'mint': errs.append(f"the panel recorded {mint['tint']!r}")
    if mint['button'] == start['button']: errs.append('the button kept its old colour')
    if mint['paper'] == start['paper']: errs.append('the paper kept its old colour')
    print('the stroke on the page:', page_mint[:60])
    if page_mint == page_start: errs.append('the page being read kept the old stroke')
    if 'rgb(63, 201, 148)' not in page_mint: errs.append('the stroke on the page is not the colour that was picked')

    # 3. Every colour keeps its words readable, in both themes. 4.5 is the ordinary bar for body text.
    worst = []
    for name, _ok, _l in tints:
      for theme in ('light', 'dark'):
        await pan.evaluate("([t,th])=>Promise.all([Prefs.set('tint',t),Prefs.set('theme',th)])", [name, theme])
        await asyncio.sleep(.25)
        r = await pan.evaluate(PROBE)
        worst.append((r['contrast'], name, theme))
        if r['contrast'] < 4.5: errs.append(f'{name} on {theme} reads at {r["contrast"]} to one')
    worst.sort()
    print('closest three:', worst[:3])
    await pan.evaluate("()=>Prefs.set('theme','system')")

    # 4. The choice is still there after a reload, and reaches an annotation page.
    await pan.evaluate("()=>Prefs.set('tint','lilac')"); await asyncio.sleep(.4)
    await pan.reload(); await asyncio.sleep(1.6)
    kept = await pan.evaluate(PROBE)
    print('after a reload:', kept['tint'], kept['hi'])
    if kept['tint'] != 'lilac': errs.append(f"a reload lost it and came back on {kept['tint']!r}")
    ann = await ctx.new_page(); await ann.goto(f'chrome-extension://{extid}/feed.html'); await asyncio.sleep(2)
    on_page = await ann.evaluate("document.documentElement.getAttribute('data-tint')")
    print('an annotation page sees:', on_page)
    if on_page != 'lilac': errs.append(f'an annotation page saw {on_page!r}')

    # 5. A colour we no longer have is read as the one we start with, rather than leaving no colour at all.
    await sw.evaluate("chrome.storage.local.get('annotatedPrefs').then(o=>chrome.storage.local.set({annotatedPrefs:{...o.annotatedPrefs,tint:'chartreuse'}}))")
    await asyncio.sleep(.5)
    await pan.reload(); await asyncio.sleep(1.6)
    back = await pan.evaluate(PROBE)
    print('a colour we do not have becomes:', back['tint'])
    if back['tint'] != 'highlighter': errs.append(f"an unknown colour came back as {back['tint']!r}")

    print('errors:', errs)
    await ctx.close()

asyncio.run(main())
