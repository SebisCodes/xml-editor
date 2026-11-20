"""Embedding (iframe + postMessage) and the webhook.

    php -S 127.0.0.1:8103 -t src src/php/router.php          (in the project folder)
    python tests/embed_test.py

A host page on another port embeds the editor, loads a document and gets
"change" and "save" messages; a small PHP webhook on the same port records
what the editor sends. The XML editor has no files of a document: no
message and no webhook body carries assets fields."""

import json
import os
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


def read_catalog():
    """Return the document the tests load.

    Returns:
        bytes: the content of tests/catalog.xml.
    """
    with open(os.path.join(HERE, 'catalog.xml'), 'rb') as f:
        return f.read()


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


HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1" style="width:1300px;height:820px;border:0"></iframe>
<script>
window.log = [];
const frame = document.getElementById('f');
addEventListener('message', async e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === 'xmleditor:ready') {
    const xml = await (await fetch('catalog.xml')).text();
    frame.contentWindow.postMessage({ type: 'xmleditor:load', name: 'Dossier 17', content: xml,
      assets: { 'x.png': 'data:image/png;base64,AAAA' } }, new URL(frame.src).origin);
  }
});
</script>"""

HOOK = """<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
// Chrome asks before a public page (the live editor) talks to this local test server.
header('Access-Control-Allow-Private-Network: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
file_put_contents(__DIR__ . '/hook.json', json_encode(['auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? '', 'body' => json_decode(file_get_contents('php://input'), true)]));
echo '{"ok":true}';
"""

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'host.html'), 'w') as f:
        f.write(HOST.replace('EDITOR', EDITOR))
    with open(os.path.join(d, 'hook.php'), 'w') as f:
        f.write(HOOK)
    for n in ('catalog.xml',):
        with open(os.path.join(HERE, n), 'rb') as a, open(os.path.join(d, n), 'wb') as b:
            b.write(a.read())
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8096', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            # The live editor (a public page) may not talk to a local test server without these flags.
            browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'])
            ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:8096/host.html', wait_until='networkidle')
            page.wait_for_timeout(2500)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            types = lambda: page.evaluate('log.map(m => m.type)')
            check_that(types()[:2] == ['xmleditor:ready', 'xmleditor:loaded'], 'ready, then loaded')
            check_that(frame.evaluate('xmlEditor.state.name') == 'Dossier 17', 'the document from the page is open')
            check_that(frame.evaluate('xmlEditor.state.code') == read_catalog().decode(), 'its content is in the code')
            check_that('Desk lamp' in frame.inner_text('#tree'), 'the tree shows it')
            check_that('xmleditor:change' not in types(), 'loading is not reported as a change')
            check_that(frame.evaluate('document.documentElement.classList.contains("embedded")'), 'embedded mode')
            check_that(frame.locator('#btn-save').is_visible() and not frame.locator('.page-text').is_visible(), 'Save button, no page text')
            # AI Assistant in the frame: the page did not allow the clipboard API
            frame.click('#btn-ai')
            check_that('paste its whole answer below' in frame.inner_text('#ai-step-link'), 'AI: the dialog says to paste the answer (links do not reach a frame)')
            frame.click('#ai-copy')
            page.wait_for_timeout(300)
            clip = page.evaluate('navigator.clipboard.readText()')
            check_that('inside another website' in clip and 'Dossier 17' in clip, 'AI: the prompt is copied anyway and tells the AI not to rely on clicked links')
            frame.click('#btn-ai')
            frame.evaluate('() => { window._ec = document.execCommand; navigator.clipboard.writeText = () => Promise.reject(new Error("no")); document.execCommand = () => false; }')
            frame.click('#ai-copy')
            check_that(frame.locator('#ai-prompt-text').is_visible() and 'inside another website' in frame.input_value('#ai-prompt-text'), 'AI: without any clipboard the prompt is shown to copy by hand')
            frame.evaluate('() => { document.execCommand = window._ec; }')
            import base64
            link = EDITOR + '#b64=' + base64.urlsafe_b64encode(read_catalog().replace(b'Desk lamp', b'From the AI.')).decode()
            frame.fill('#ai-paste', 'Here is the link:\n' + link)
            page.wait_for_timeout(500)
            check_that(not frame.locator('#ask').is_visible(), 'AI: the link replaces the document without a question')
            page.wait_for_timeout(500)
            check_that('From the AI.' in frame.evaluate('xmlEditor.state.code'), 'AI: the pasted answer arrives in the framed editor')
            frame.evaluate('() => xmlEditor.undo()')
            page.wait_for_timeout(300)
            frame.evaluate('() => document.querySelector("#ai").open && document.querySelector("#ai").close()')

            frame.evaluate('() => { const t = document.querySelector("#code"); t.focus(); t.setSelectionRange(0, 0); document.execCommand("insertText", false, "<!-- edited -->\\n"); }')
            page.wait_for_timeout(700)
            check_that('xmleditor:change' in types(), 'an edit is reported')
            change = [m for m in page.evaluate('log') if m['type'] == 'xmleditor:change'][-1]
            check_that(not ({'assets', 'assetsChanged', 'assetsRemoved'} & set(change)), 'change carries no assets fields')
            frame.click('#btn-save')
            page.wait_for_timeout(400)
            last = page.evaluate('log[log.length - 1]')
            check_that(last['type'] == 'xmleditor:save' and last['content'].startswith('<!-- edited -->') and last['editor'] == 'xml', 'Save hands the document to the page')
            check_that(not ({'assets', 'assetsChanged', 'assetsRemoved'} & set(last)), 'save carries no assets fields')

            # Webhook
            frame.click('#btn-sync')
            frame.fill('#sync-url', 'http://127.0.0.1:8096/hook.php')
            frame.fill('#sync-token', 'secret')
            frame.click('#sync-test')
            page.wait_for_timeout(1500)
            status = frame.inner_text('#sync-status')
            try:
                with open(os.path.join(d, 'hook.json')) as f:
                    got = json.load(f)
            except FileNotFoundError:
                got = {'auth': '', 'body': {}}
                print('      webhook not reached: ' + status)
            check_that(got['auth'] == 'Bearer secret', 'webhook: token as Bearer')
            check_that(got['body'].get('editor') == 'xml' and got['body']['name'] == 'Dossier 17' and got['body']['content'].startswith('<!-- edited -->'), 'webhook: the document as JSON')
            check_that('assets' not in got['body'], 'webhook: no assets in the body')
            check_that('Saved on' in status, 'webhook: status shows it was saved')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
