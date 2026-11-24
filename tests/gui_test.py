"""Browser test of the XML editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8103 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks the tree, code <-> tree, problems, search and XPath, typing help,
format, minify, JSON and YAML, My documents, AI links, export and the
phone layout."""

import base64
import json
import os
import sys
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
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


def set_code(page, code):
    """Set the code of the editor through its test hook and wait for the tree.

    Args:
        page (Page): the editor page.
        code (str): the new code.

    Returns:
        None: the editor holds the code.
    """
    page.evaluate('c => xmlEditor.setCode(c)', code)
    page.wait_for_timeout(250)


def get_state(page, expr):
    """Return a value read from the editor's state (S in the expression).

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the state of the test hook.

    Returns:
        object: the value of the expression.
    """
    return page.evaluate(f'() => {{ const S = xmlEditor.state; return {expr}; }}')


def get_caret_text(page, n=12):
    """Return the code right after the cursor.

    Args:
        page (Page): the editor page.
        n (int): how many characters.

    Returns:
        str: the characters after the cursor of the code.
    """
    return page.evaluate(f'() => {{ const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + {n}); }}')


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(page.get_attribute('#btn-panel', 'aria-expanded') == 'false' and not page.is_visible('#side-panel'), 'the side panel is closed at the start')
    page.click('#btn-panel')
    check_that(page.is_visible('#side-panel'), 'the side panel opens with its button')

    # --- First visit: the welcome example ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.result.problems.length') == 0 and get_state(page, '!!S.result.doc'), 'the example is well-formed')
    tree = page.inner_text('#tree')
    check_that('library' in tree and 'dc:title' in tree and 'The Pragmatic Programmer' in tree, 'the tree shows elements and text')
    check_that(page.locator('#tree li.comment').count() == 1 and page.locator('#tree li.cdata').count() == 1 and page.locator('#tree li.pi').count() == 2, 'comments, CDATA and processing instructions are in the tree')
    check_that(page.locator('#tree .at.ns-decl').count() == 1, 'the namespace declaration is shown')
    check_that(page.get_attribute('#tree .k.ed:text-is("dc:title") >> nth=0', 'title') == 'http://purl.org/dc/elements/1.1/', 'a prefixed element shows its namespace URI')
    check_that('13 elements' in page.inner_text('#code-status'), 'the status line counts the elements')

    # --- Tree -> code, code -> tree ---
    page.locator('#tree li.el:has(> .row .k.ed:text-is("year")) >> nth=1').locator(':scope > .row .p').first.click()
    check_that(get_caret_text(page, 6) == '<year>' and get_state(page, 'S.result.problems.length') == 0, 'a click in the tree puts the code cursor on the element')
    check_that(page.inner_text('#path').startswith('/library/book[2]/year'), 'the path of the selected node: ' + page.inner_text('#path').split('\n')[0])
    check_that(page.locator('#marks mark.sel').count() == 1, 'the selected node is framed in the code')
    page.evaluate('() => { const t = document.querySelector("#code"); const i = t.value.indexOf("Andrew"); t.focus(); t.setSelectionRange(i, i); t.dispatchEvent(new Event("click")); }')
    page.wait_for_timeout(200)
    check_that(page.locator('#tree li.active .k.ed').first.inner_text() == 'dc:creator', 'the code cursor shows its node in the tree')
    check_that('element' in page.inner_text('#node-wrap').lower() and '/library/book[1]/dc:creator[1]' in page.inner_text('#node-wrap'), 'the Node tab shows the selected element and its path')

    # --- Folding ---
    book = page.locator('#tree li.el:has(> .row .k.ed:text-is("book"))').first
    book.locator(':scope > .row [data-fold]').click()
    check_that(page.locator('#tree li.el:has(> .row .k.ed:text-is("book"))').first.locator(':scope > ul').count() == 0 and '5 children' in page.locator('#tree li.el:has(> .row .k.ed:text-is("book"))').first.inner_text(), 'an element folds and shows how many children it has')
    page.click('#unfold-all')
    check_that(page.locator('#tree .k.ed:text-is("dc:title")').count() == 2, 'Unfold all opens everything again')

    # --- Search and XPath ---
    page.fill('#tree-search', 'hofstadter')
    page.wait_for_timeout(400)
    check_that(page.locator('#tree li.found').count() == 1 and '1 found' in page.inner_text('#hit-info'), 'the search marks the node with that text')
    page.fill('#tree-search', '')
    page.wait_for_timeout(300)
    page.fill('#xpath', '//book[price > 30]/dc:title')
    page.wait_for_timeout(600)
    check_that(page.locator('#tree li.hit').count() == 1 and page.locator('#tree li.hit .tx').inner_text() == 'The Pragmatic Programmer', 'XPath with a namespace prefix marks the match')
    check_that(get_caret_text(page, 10) == '<dc:title>', 'the first match is selected in the code')
    page.fill('#xpath', '//@currency')
    page.wait_for_timeout(600)
    check_that(page.locator('#tree .at.hit').count() == 2 and page.inner_text('#hit-info') == '1 / 2', 'attributes match too: ' + page.inner_text('#hit-info'))
    page.click('#hit-next')
    check_that('2 / 2' in page.inner_text('#hit-info'), 'the arrows go from match to match')
    page.fill('#xpath', 'sum(//price)')
    page.wait_for_timeout(600)
    check_that(page.inner_text('#hit-info') == '= 72.4', 'a number result is shown: ' + page.inner_text('#hit-info'))
    page.fill('#xpath', '//book[')
    page.wait_for_timeout(600)
    check_that('Not a valid XPath' in page.inner_text('#hit-info'), 'an invalid expression says so')
    set_code(page, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>a</loc></url><url><loc>b</loc></url></urlset>')
    page.fill('#xpath', '//_:loc')
    page.wait_for_timeout(600)
    check_that(page.locator('#tree li.hit').count() == 2, '_: stands for the default namespace')
    page.locator('#tree .k.ed:text-is("loc") >> nth=1').evaluate('e => e.closest(".row").querySelector(".p").click()')
    page.click('#path-query')
    page.wait_for_timeout(400)
    check_that(page.input_value('#xpath') == '/_:urlset/_:url[2]/_:loc' and page.locator('#tree li.hit').count() == 1, '"As query" puts a working path into the XPath field')
    page.fill('#xpath', '')
    page.wait_for_timeout(500)

    # --- Problems ---
    set_code(page, '<?xml version="1.0"?>\n<a>\n  <b>text</c>\n</a>\n')
    probs = get_state(page, 'S.result.problems.map(p => p.kind + ":" + p.msg)')
    check_that(probs and probs[0].startswith('error:Not well-formed:'), 'a tag mismatch is reported: ' + str(probs[:1]))
    first = page.inner_text('#code-error li >> nth=0')
    check_that('Line 3:' in first, 'with its line and column: ' + first.replace('\n', ' '))
    page.locator('#code-error [data-prob]').first.click()
    check_that(page.evaluate('document.activeElement.id') == 'code' and get_state(page, 'S.code.split("\\n").length') == 5, 'clicking a problem goes to the code')
    set_code(page, '<a xmlns:x="urn:x"><y:b/><c id="k"/><d id="k" z:q="1"/></a>')
    probs = get_state(page, 'S.result.problems.map(p => p.msg)')
    check_that(any('prefix "y" is not declared' in p for p in probs) and any('prefix "z" is not declared' in p for p in probs), 'undeclared namespace prefixes are reported')
    check_that(any('id "k" is used twice' in p for p in probs), 'duplicate ids are reported')
    check_that(page.locator('#tree li.el').count() == 4, 'the tree is still shown from the code')

    # --- Typing help ---
    set_code(page, '<root>\n</root>\n')
    page.evaluate('() => { const t = document.querySelector("#code"); t.focus(); t.setSelectionRange(6, 6); }')
    page.keyboard.press('Enter')
    page.keyboard.type('<item id="1">')
    check_that('<item id="1"></item>' in get_state(page, 'S.code'), '">" adds the end tag')
    page.keyboard.type('x</')
    check_that('<item id="1">x</item></item>' not in get_state(page, 'S.code'), 'the end tag is not doubled')
    page.keyboard.press('End')
    page.keyboard.press('Enter')
    page.keyboard.type('<note>a')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(50)
    page.evaluate('() => { const t = document.querySelector("#code"); const i = t.value.indexOf("</note>"); t.setSelectionRange(i + 7, i + 7); }')
    page.keyboard.type('<open>t</')
    check_that('<open>t</open>' in get_state(page, 'S.code'), '"</" completes the end tag of the open element')

    # --- Format, minify, convert ---
    messy = '<?xml version="1.0"?>\n<shop><item  sku="1"><name>A &amp; B</name><!-- note --><tags><tag>x</tag><tag>y</tag></tags></item><p>Mixed <b>text</b> stays</p></shop>'
    set_code(page, messy)
    n0 = get_state(page, 'S.history.length')
    page.click('#btn-format')
    page.wait_for_timeout(300)
    code = get_state(page, 'S.code')
    check_that('<shop>\n  <item sku="1">\n    <name>A &amp; B</name>\n    <!-- note -->\n    <tags>\n      <tag>x</tag>' in code, 'Format indents the elements, entities kept')
    check_that('<p>Mixed <b>text</b> stays</p>' in code, 'mixed content stays as it is')
    check_that(get_state(page, 'S.history.length') == n0 + 1, 'Format is one undo step')
    page.click('[data-itab=convert]')
    page.click('#cv-minify')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == '<?xml version="1.0"?><shop><item sku="1"><name>A &amp; B</name><tags><tag>x</tag><tag>y</tag></tags></item><p>Mixed <b>text</b> stays</p></shop>', 'Minify removes comments and white space between elements')
    page.click('#cv-json')
    j = json.loads(page.input_value('#cv-text'))
    check_that(j == {'shop': {'item': {'@sku': '1', 'name': 'A & B', 'tags': {'tag': ['x', 'y']}}, 'p': {'b': 'text', '#text': 'Mixed  stays'}}}, 'JSON: attributes as @, repeated elements as lists: ' + json.dumps(j))
    page.click('#cv-yaml')
    y = page.input_value('#cv-text')
    check_that('shop:\n  item:\n    "@sku": "1"\n    name: A & B\n    tags:\n      tag:\n      - x\n      - \"y\"' in y, 'YAML of the same: ' + repr(y[:90]))
    page.click('[data-itab=node]')

    # --- Insert ---
    set_code(page, '<root>\n  <a/>\n</root>\n')
    page.click('[data-itab=insert]')
    page.evaluate('() => document.querySelector("#code").blur()')
    page.evaluate('() => document.querySelector("#code").setSelectionRange(0, 0)')
    page.click('[data-ins=comment]')
    check_that('  <a/>\n  <!--  -->\n</root>' in get_state(page, 'S.code'), 'Insert without a cursor goes to the end of the root element')
    page.click('[data-ins=decl]')
    check_that(get_state(page, 'S.code').startswith('<?xml version="1.0" encoding="UTF-8"?>\n<root>'), 'Insert > XML declaration goes to the top')
    page.click('[data-itab=node]')

    # --- My documents, templates ---
    page.click('#btn-new')
    page.click('[data-new=rss]')
    check_that(get_state(page, 'S.name') == 'RSS feed' and 'channel' in page.inner_text('#tree'), 'New > RSS feed')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 2, 'My documents lists the documents')
    page.locator('#files-grid .file-card:not(.current)', has_text='Welcome').locator('.file-open').click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- AI link to a new document, and a pasted terminal answer ---
    xml = '<?xml version="1.0"?>\n<report>\n  <title>From the AI</title>\n</report>\n'
    z = base64.urlsafe_b64encode(zlib.compress(xml.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20report', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI report' and 'From the AI' in page.inner_text('#tree'), 'an AI link makes a new document')
    link = 'https://xml.giit.ch/#b64=' + base64.urlsafe_b64encode('<section>Pasted</section>'.encode()).decode() + '&mode=add'
    answer = 'Here is the link:\n' + link[:30] + '\n' + link[30:] + '\nClick it.'
    page.click('#btn-ai')
    page.fill('#ai-paste', answer)
    page.wait_for_timeout(400)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that('  <title>From the AI</title>\n  <section>Pasted</section>\n</report>' in get_state(page, 'S.code'), 'mode=add appends to the root element, broken link joined')
    page.click('#btn-ai')
    page.click('#ai-copy')
    page.wait_for_timeout(300)
    prompt = page.evaluate('navigator.clipboard.readText()')
    check_that('xml.giit.ch/#b64=' in prompt and '```xml\n<?xml version="1.0"?>' in prompt and 'well-formed' in prompt, 'the prompt describes XML links and carries the document')

    # --- Export ---
    page.click('#btn-export')
    page.select_option('#ex-format', 'json')
    check_that(json.loads(page.input_value('#ex-text'))['report']['title'] == 'From the AI', 'export: JSON preview')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename == 'AI report.json', 'export: JSON file')
    page.select_option('#ex-format', 'min')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename == 'AI report.min.xml', 'export: minified XML')
    with page.expect_download() as d:
        page.click('#ex-zip')
    check_that(d.value.suggested_filename == 'AI report-all.zip', 'export: all formats as ZIP')
    page.keyboard.press('Escape')
    with page.expect_download() as d:
        page.click('#btn-download')
    check_that(d.value.suggested_filename == 'AI report.xml', 'Download .xml')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Tree / Node tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
