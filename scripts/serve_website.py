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

    # Byte ranges, as Netlify answers them. A browser can only seek in audio or video whose server answers a
    # range with 206, so without this the front page's clips all started from the beginning.
    def send_head(self):
        rng = self.headers.get('Range', '')
        path = pathlib.Path(self.translate_path(self.path))
        if not rng.startswith('bytes=') or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        first, _, last = rng[6:].split(',')[0].partition('-')
        try:
            if first:
                start, end = int(first), int(last) if last else size - 1
            else:
                start, end = max(0, size - int(last)), size - 1
        except ValueError:
            return super().send_head()
        end = min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        f = open(path, 'rb'); f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, '_left', None)
        if left is None:
            return super().copyfile(source, outputfile)
        self._left = None
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

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
