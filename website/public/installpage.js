// /install: the front page's three steps under its header. A file of its own, since pages here carry no inline script.
(() => { Prefs.init(Prefs.localBackend()); Landing.mountInstall(document.getElementById('page')); })();
