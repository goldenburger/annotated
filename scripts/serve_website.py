"""Serves website/public the way Netlify does, for trying the site on this computer.
It routes /@handle and /@handle/id to index.html (netlify.toml), serves /install as install.html (Netlify's
pretty URLs), sends the security headers in _headers so a script the live site would refuse is refused here
too, and tells the browser to keep nothing, so what you see is always the code on disk.
Run: python scripts/serve_website.py [port]      then open http://127.0.0.1:8812/
"""
import http.server, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'website' / 'public'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8812

def site_headers():
    out, inside = [], False
    for line in (ROOT / '_headers').read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line.startswith((' ', '\t')):
            inside = line.strip() == '/*'
            continue
        if inside and ':' in line:
            k, v = line.strip().split(':', 1)
            out.append((k.strip(), v.strip()))
    return out
HEADERS = site_headers()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def translate_path(self, path):
        clean = path.split('?', 1)[0].split('#', 1)[0]
        if clean.startswith('/@'):
            clean = '/index.html'
        elif clean != '/' and '.' not in clean.rsplit('/', 1)[-1] and (ROOT / (clean.strip('/') + '.html')).is_file():
            clean = clean.rstrip('/') + '.html'
        return super().translate_path(clean)

    def end_headers(self):
        for k, v in HEADERS:
            self.send_header(k, v)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

if __name__ == '__main__':
    print(f'Serving {ROOT} at http://127.0.0.1:{PORT}/')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
