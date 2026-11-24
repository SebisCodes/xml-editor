"""The example view and the template view of template placeholders in the tree, through the real
postMessage path of a page around the editor.

Start the editor first (php -S 127.0.0.1:8103), then:
    python3 tests/template_view_test.py

A page on its own port embeds the editor with ?embed=1&template=mustache and loads an order with
`template` (placeholders and examples):
  - the example view is the default: the tree of the filled document, no tag shown, examples in
    text, attribute values, comments and CDATA, sections and list rows applied, the label in
    brackets for a placeholder without an example;
  - the switch (two buttons of one width, the focus kept) shows the template view: the tree with
    the tags as their text;
  - a click on a row of the example view selects its node of the code, also for a list row; a part
    with an example is edited in the code, a part of the code in the tree, and the edit changes
    only that text of the code;
  - "get" and "change" carry the template as written;
  - the "Placeholders" box is closed at the start, opens over the code without moving it, and puts
    a tag at the cursor (a section around the selection) as one undo step;
  - the side panel is closed at the start and its button stays in its place;
  - "xmleditor:template" from a window other than the page is ignored, a later message replaces the
    list, clear ends it; without ?template= nothing of this is there;
  - a document whose processing instructions, DTD, entities, XHTML and SVG elements and CSS (with
    escapes) name addresses with a placeholder requests nothing in either view.
Needs Playwright for Python and Google Chrome.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

EDITOR_URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
HOST_PORT = 8203
CODE = """<?xml version="1.0" encoding="UTF-8"?>
<order id="{{orderNumber}}">
  <!-- Order for {{name}} -->
  <customer>
    <name>{{name}}</name>
    <street>1 Main Street</street>
    <city>{{city}}</city>
  </customer>
  <items>
    {{#items}}
    <item quantity="{{quantity}}">{{label}}</item>
    {{/items}}
  </items>
  {{#hasNote}}<note>{{note}}</note>{{/hasNote}}
  {{^hasNote}}<thanks>Thank you</thanks>{{/hasNote}}
  <total>{{total}}</total>
  <plain>Plain words here</plain>
  <data><![CDATA[{{name}}]]></data>
</order>
"""
HOSTILE = """<?xml version="1.0"?>
<?xml-stylesheet type="text/css" href="https://x.invalid/css/{{id}}"?>
<?xml-stylesheet type="text/xsl" href="https://x.invalid/xsl/{{id}}"?>
<!DOCTYPE order SYSTEM "https://x.invalid/dtd/{{id}}" [
  <!ENTITY remote SYSTEM "https://x.invalid/entity/{{id}}">
  <!ENTITY % parameter SYSTEM "https://x.invalid/parameter/{{id}}">
]>
<order xmlns:xi="http://www.w3.org/2001/XInclude">
  <name>{{name}} &remote;</name>
  <xi:include href="https://x.invalid/include/{{id}}"/>
  <img xmlns="http://www.w3.org/1999/xhtml" src="https://x.invalid/img/{{id}}"/>
  <svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.invalid/svg/{{id}}"/></svg>
  <box style="background:u\\72l(https://x.invalid/style/{{id}})"/>
  <link xmlns="http://www.w3.org/1999/xhtml" rel="stylesheet" href="https://x.invalid/link/{{id}}"/>
</order>
"""
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


TEMPLATE = {
    'placeholders': [
        {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'John Doe'},
        {'name': 'orderNumber', 'kind': 'value', 'label': 'Order number', 'example': 'A-17'},
        {'name': 'city', 'kind': 'value', 'label': 'City', 'example': 'Springfield & Co <8000> "x"'},
        {'name': 'total', 'kind': 'value', 'label': 'Total'},
        {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': False},
        {'name': 'items', 'kind': 'list', 'label': 'Items',
         'fields': [{'name': 'label', 'label': 'Item'}, {'name': 'quantity', 'label': 'Quantity'}],
         'rows': [{'label': 'Chair', 'quantity': '2'}, {'label': 'Table', 'quantity': '1'}]},
    ],
}
HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1QUERY" style="width:1300px;height:820px;border:0"></iframe>
<iframe id="other" srcdoc="<p>other</p>" style="width:10px;height:10px"></iframe>
<script>
window.log = [];
window.pageTemplate = TEMPLATE;
const frame = document.getElementById('f');
const target = new URL(frame.src).origin;
window.sendToEditor = message => frame.contentWindow.postMessage(message, target);
addEventListener('message', event => {
  if (event.source !== frame.contentWindow) return;
  log.push(event.data);
  if (event.data.type === 'xmleditor:ready') sendToEditor({ type: 'xmleditor:load', name: 'Order', content: CODE, template: TEMPLATE });
});
</script>"""


def get_tree_text(frame):
    """Returns the text the tree shows.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        str: the text of the rows of the tree.
    """
    return frame.evaluate("() => document.querySelector('#tree').textContent")


def wait_for_render(page):
    """Waits until the tree is drawn again.

    Args:
        page (Page): the host page.

    Returns:
        None: the time has passed.
    """
    page.wait_for_timeout(700)


def check_views(page, frame):
    """Checks the example view and the template view.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    text = get_tree_text(frame)
    check_that('{{' not in text and 'John Doe' in text and 'A-17' in text, 'the example view is the default, no tag shown')
    names = frame.evaluate("() => [...document.querySelectorAll('#tree li.el > .row .k.ed')].map(k => k.textContent)")
    check_that(names.count('item') == 2 and 'Chair' in text and 'Table' in text and 'thanks' in names and 'note' not in names,
               f'list rows and sections by example state {names}')
    rows = frame.evaluate("() => [...document.querySelectorAll('#tree li.el')].filter(r => r.querySelector('.k').textContent === 'item').map(r => r.querySelector('.s').textContent)")
    check_that(rows == ['2', '1'], f'a list row fills its attribute values {rows}')
    check_that('[Total]' in text and 'Springfield & Co <8000> "x"' in text, 'a placeholder without an example shows its label in brackets, special characters as text')
    check_that('Order for John Doe' in text and text.count('John Doe') == 3, 'examples fill comments and CDATA as well')
    switch = frame.locator('#view-switch')
    widths = frame.evaluate("() => [...document.querySelectorAll('#view-switch [data-view-set]')].map(b => b.getBoundingClientRect().width)")
    box_before = switch.bounding_box()
    frame.locator('[data-view-set="template"]').click()
    wait_for_render(page)
    text = get_tree_text(frame)
    check_that('{{name}}' in text and '{{#items}}' in text and 'John Doe' not in text, 'the template view shows the tags as their text')
    check_that(len(set(round(width) for width in widths)) == 1 and switch.bounding_box() == box_before, f'the switch keeps one width and its place {widths}')
    state = frame.evaluate("() => [document.activeElement.dataset.viewSet, document.querySelector('[data-view-set=template]').getAttribute('aria-checked')]")
    check_that(state == ['template', 'true'], f'the focus stays on the switch, its state is announced {state}')
    frame.locator('[data-view-set="example"]').click()
    wait_for_render(page)


def check_hostile_references(page, frame, requests):
    """Checks that a document full of addresses with a placeholder requests nothing in either view.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.
        requests (list[str]): the addresses requested so far.

    Returns:
        None: the results are printed.
    """
    page.evaluate("code => sendToEditor({ type: 'xmleditor:load', name: 'Order', content: code, template: window.pageTemplate })", HOSTILE)
    wait_for_render(page)
    shown = get_tree_text(frame)
    frame.locator('[data-view-set="template"]').click()
    wait_for_render(page)
    frame.locator('[data-view-set="example"]').click()
    wait_for_render(page)
    leaked = [url for url in requests if 'x.invalid' in url]
    check_that('John Doe' in shown and leaked == [], f'processing instructions, DTD, entities, XHTML, SVG and CSS escapes request nothing {leaked}')


def get_selected_start(frame):
    """Returns where the selected node starts in the code.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        int: the offset of the node (of its element for an attribute), -1 without a selection.
    """
    return frame.evaluate("() => { const node = window.xmlEditor.state.selected; return node ? (node.attr ? node.el : node).start : -1; }")


def check_map(page, frame):
    """Checks that a click in the tree selects the node of the code and edits follow the map.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    frame.locator('#tree li.el .k', has_text='street').first.click()
    page.wait_for_timeout(200)
    check_that(get_selected_start(frame) == CODE.index('<street>'), 'a click on a row selects its node of the code')
    frame.locator('#tree .tx', has_text='Table').click()
    page.wait_for_timeout(300)
    editing = frame.evaluate("() => !!document.querySelector('#tree [contenteditable]')")
    check_that(get_selected_start(frame) == CODE.index('<item ') and not editing, 'a list row selects the node of the code it repeats; its filled text is edited in the code')
    frame.locator('#tree .s', has_text='2').first.click()
    page.wait_for_timeout(300)
    check_that(not frame.evaluate("() => !!document.querySelector('#tree [contenteditable]')"), 'a filled attribute value is edited in the code')
    frame.locator('#tree .tx', has_text='Plain words here').click()
    page.wait_for_timeout(300)
    check_that(frame.evaluate("() => !!document.querySelector('#tree [contenteditable]')"), 'a text of the code is edited in the tree')
    page.keyboard.press('End')
    page.keyboard.type(' too')
    page.keyboard.press('Enter')
    page.wait_for_timeout(600)
    code = frame.evaluate('() => window.xmlEditor.state.code')
    check_that(code == CODE.replace('Plain words here', 'Plain words here too'), 'the edit changes only that text of the code')
    frame.evaluate('() => window.xmlEditor.undo()')
    wait_for_render(page)


def check_messages_out(page, frame):
    """Checks that get and change carry the template as written.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    page.evaluate("() => sendToEditor({ type: 'xmleditor:get' })")
    page.wait_for_timeout(500)
    saves = page.evaluate("() => log.filter(m => m.type === 'xmleditor:save')")
    check_that(saves and saves[-1]['content'] == CODE, '"get" answers with the template as written')
    frame.locator('#code').click()
    frame.locator('#code').press('Control+End')
    frame.locator('#code').type(' ')
    page.wait_for_timeout(1200)
    changes = page.evaluate("() => log.filter(m => m.type === 'xmleditor:change')")
    check_that(changes and '{{name}}' in changes[-1]['content'] and 'John Doe' not in changes[-1]['content'], '"change" carries the template')
    frame.locator('#code').press('Backspace')
    page.wait_for_timeout(800)


def check_box(page, frame):
    """Checks the "Placeholders" box: closed at the start, opens without moving the code, inserts as one undo step.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    check_that(frame.evaluate("() => document.querySelector('[data-placeholder-list]').hidden"), 'the box is closed at the start')
    code_box = frame.locator('#code').bounding_box()
    header_box = frame.locator('[data-placeholder-toggle]').bounding_box()
    frame.locator('[data-placeholder-toggle]').click()
    page.wait_for_timeout(200)
    check_that(frame.locator('#code').bounding_box() == code_box and frame.locator('[data-placeholder-toggle]').bounding_box() == header_box,
               'the box opens over the code without moving it')
    entries = frame.evaluate("() => [...document.querySelectorAll('.placeholder-entry')].map(e => [e.querySelector('.placeholder-label').textContent, e.querySelector('.placeholder-tag').textContent, e.getBoundingClientRect().height])")
    check_that(entries[0][:2] == ['Name', '{{name}}'] and len({round(entry[2]) for entry in entries}) == 1, f'label, tag and example, one height {entries[:2]}')
    before = frame.evaluate('() => document.querySelector("#code").value')
    word_start = before.index('Plain words')
    frame.evaluate(f"() => {{ const t = document.querySelector('#code'); t.focus(); t.setSelectionRange({word_start}, {word_start + 5}); }}")
    frame.locator('.placeholder-entry', has_text='{{#hasNote}}').click()
    page.wait_for_timeout(500)
    after = frame.evaluate('() => document.querySelector("#code").value')
    selection = frame.evaluate("() => { const t = document.querySelector('#code'); return t.value.slice(t.selectionStart, t.selectionEnd); }")
    check_that('{{#hasNote}}Plain{{/hasNote}} words' in after and selection == 'Plain', 'a section goes around the selection, which stays selected')
    frame.evaluate('() => window.xmlEditor.undo()')
    page.wait_for_timeout(400)
    check_that(frame.evaluate('() => document.querySelector("#code").value') == before, 'one undo step takes it back')
    frame.locator('[data-placeholder-toggle]').click()


def check_panel(frame):
    """Checks that the side panel is closed at the start, that it opens as a column right of the
    tree and that its button keeps its place.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    shown = frame.evaluate("() => getComputedStyle(document.querySelector('#side-panel')).display")
    button = frame.locator('#btn-panel')
    place = button.bounding_box()
    tree_box = frame.locator('.draw-pane').bounding_box()
    button.click()
    opened = frame.evaluate("() => getComputedStyle(document.querySelector('#side-panel')).display")
    check_that(shown == 'none' and opened != 'none', f'the side panel is closed at the start and opens ({shown} -> {opened})')
    narrowed, panel = frame.locator('.draw-pane').bounding_box(), frame.locator('#side-panel').bounding_box()
    check_that(button.bounding_box() == place and narrowed['width'] < tree_box['width']
               and abs(narrowed['x'] + narrowed['width'] - panel['x']) <= 1, 'the open panel is a column right of the tree, which gets narrower; its button stays in its place')
    button.click()


def check_messages_in(page, frame):
    """Checks the template messages: another window ignored, a later list replaces, clear ends it.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    other = {'type': 'xmleditor:template', 'placeholders': [{'name': 'name', 'kind': 'value', 'example': 'Mallory'}]}
    page.evaluate("message => document.getElementById('other').contentWindow.eval(`parent.frames[0].postMessage(${JSON.stringify(message)}, '*')`)", other)
    wait_for_render(page)
    check_that('Mallory' not in get_tree_text(frame), 'a template message from another window is ignored')
    page.evaluate("message => sendToEditor(message)", {'type': 'xmleditor:template', 'placeholders': [{'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'Jane Roe'}]})
    wait_for_render(page)
    text = get_tree_text(frame)
    check_that('Jane Roe' in text and 'A-17' not in text and '[orderNumber]' in text, 'a later message replaces the list')
    page.evaluate("message => sendToEditor(message)", {'type': 'xmleditor:template', 'clear': True})
    wait_for_render(page)
    text = get_tree_text(frame)
    check_that('Jane Roe' not in text and '[name]' in text, 'clear ends the examples; the tags of the document stay as labels')


def check_option_off(page):
    """Checks that without ?template= the controls are missing and the tree shows the code as written.

    Args:
        page (Page): the host page.

    Returns:
        None: the results are printed.
    """
    page.goto(f'http://127.0.0.1:{HOST_PORT}/xml-off.html')
    page.wait_for_timeout(3000)
    frame = page.frames[1]
    visible = frame.evaluate("() => ['#view-switch', '#placeholder-box', '#view-note'].map(s => getComputedStyle(document.querySelector(s)).display)")
    check_that(visible == ['none', 'none', 'none'], f'option off: no switch, no box, no note {visible}')
    check_that('{{name}}' in get_tree_text(frame), 'option off: the tree as before')


def main():
    """Runs the checks.

    Returns:
        None: the process ends with 1 when a check failed.
    """
    with tempfile.TemporaryDirectory() as folder:
        for query, name in (('&template=mustache', 'xml.html'), ('', 'xml-off.html')):
            html = HOST.replace('EDITOR', EDITOR_URL).replace('QUERY', query)
            html = html.replace('CODE', json.dumps(CODE).replace('</', '<\\/')).replace('TEMPLATE', json.dumps(TEMPLATE))
            Path(folder, name).write_text(html, encoding='utf-8')
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(HOST_PORT), '--bind', '127.0.0.1', '-d', folder],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), headless=True)
                context = browser.new_context(viewport={'width': 1400, 'height': 900})
                requests = []
                context.on('request', lambda request: requests.append(request.url))
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{HOST_PORT}/xml.html')
                page.wait_for_timeout(3500)
                frame = page.frames[1]
                check_views(page, frame)
                check_map(page, frame)
                check_box(page, frame)
                check_panel(frame)
                check_messages_out(page, frame)
                check_messages_in(page, frame)
                check_hostile_references(page, frame, requests)
                check_that(errors == [], f'no script errors {errors}')
                check_option_off(page)
                browser.close()
        finally:
            server.terminate()
    print('FAILED: ' + str(len(failed)) if failed else 'all passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
