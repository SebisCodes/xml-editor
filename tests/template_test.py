"""Template placeholders (?template=mustache, ?template=angle): how the XML editor reads them.

    python3 tests/template_test.py

Node part (always):
  order     an order template with {{name}} in text, comments and attribute values, sections around
            the root element and inside it and an inverted section (tests/order-template.xml) has
            0 problems with the syntax "mustache"; the browser reads each tag as a marker that
            carries its number (a tag in a comment in brace form) and the section tags around the
            root as spaces, at the same places; the parsed document gets the tags back as written
  tree      the nodes carry the code as written: attribute values and texts show every tag as the
            syntax writes it
  off       with the option off the code is scanned and handed to the browser as it is
  angle     the order template in the syntax "angle" (tests/order-template-angle.xml) has 0 problems
  errors    a section left open and a stray end tag are errors at the tag
  ids       an id or a namespace prefix that holds a placeholder counts as filled later
  view      the code view shows every tag as written, without a color of its own; option off: the
            plain highlighting
  format    Format keeps every tag byte for byte (both syntaxes) and is the same when run twice;
            Minify keeps the sections around the root and comments with tags
  edit      a tag typed into the tree stays a tag; the rest of a tag cut by an edit is escaped
  examples  the tree of the example view: examples as text in text, attribute values, comments and
            CDATA with XML's escapes and their closing marks split, list rows repeated, sections
            by example state, the label in brackets without an example; every node leads to its
            node of the code (a list row to the element it repeats, a filled text to its text)
Browser part (with a server at EDITOR_URL, default http://127.0.0.1:8103/):
  the browser's own check of the same cases: 0 errors for both templates, the old errors with the
  option off, a placeholder name with "--" in a comment reported, the Format button keeping tags.
Needs Node; the browser part needs Playwright and Google Chrome."""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
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


def run_report(cases):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str), `template` (str or None) and optionally `edit`.

    Returns:
        list[dict]: one result per case, in order.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump(cases, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_messages(result):
    """Returns the messages of the problems of a result.

    Args:
        result (dict): one case result of report.mjs, or the problems read in the browser.

    Returns:
        list[str]: the messages of every problem.
    """
    return [problem['msg'] for problem in result['problems']]


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


def read_fixture(name):
    """Reads a fixture file of the tests folder.

    Args:
        name (str): the file name.

    Returns:
        str: its text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as fixture:
        return fixture.read()


ORDER = read_fixture('order-template.xml')
ANGLE = read_fixture('order-template-angle.xml')
BROKEN = '<order>\n  {{#items}}<item>{{title}}</item>\n  {{/total}}\n</order>\n'
IDS = '<order xmlns:a="urn:example:a">\n  <item id="item-{{id}}"/>\n  <item id="item-{{id}}"/>\n  <{{prefix}}:item/>\n</order>\n'
COMMENT = '<order>\n  <!-- {{a--b}} -->\n</order>\n'
EXAMPLE_MESSAGE = {'placeholders': [
    {'name': 'name', 'example': 'John Doe & Co <Ltd>'}, {'name': 'orderId', 'example': 'A "17"'},
    {'name': 'hasOrder', 'kind': 'section', 'shown': True}, {'name': 'total', 'label': 'Total'},
    {'name': 'hasNote', 'kind': 'section', 'label': 'Note', 'shown': False},
    {'name': 'items', 'kind': 'list', 'fields': [{'name': 'title'}, {'name': 'quantity'}],
     'rows': [{'title': 'Chair', 'quantity': '2'}, {'title': 'Table', 'quantity': '1'}]}]}


def run_node_part():
    """Runs the checks of the Node part and prints their results.

    Returns:
        None: the results are printed and failures noted.
    """
    order, order_off, angle, broken, ids, ids_off, typed, cut, commented, filled, crossed, bounded = run_report([
        {'code': ORDER, 'template': 'mustache'}, {'code': ORDER, 'template': None}, {'code': ANGLE, 'template': 'angle'},
        {'code': BROKEN, 'template': 'mustache'}, {'code': IDS, 'template': 'mustache'}, {'code': IDS, 'template': None},
        {'code': ANGLE, 'template': 'angle', 'edit': {'oldText': 'Dear ', 'newText': 'Dear <<name>>'}},
        {'code': ANGLE, 'template': 'angle', 'edit': {'oldText': 'Dear <<name>>', 'newText': 'Dear <<nam'}},
        {'code': '<order>\n  <!-- {{#total}} -->\n  <total/>\n  <!-- note -->\n  <!-- {{/total}} -->\n</order>\n', 'template': 'mustache'},
        {'code': ORDER, 'template': 'mustache', 'examples': EXAMPLE_MESSAGE},
        {'code': '<root><a>{{#s}}</a><b>{{/s}}</b></root>\n', 'template': 'mustache', 'examples': {'placeholders': [{'name': 's', 'kind': 'section', 'shown': False}]}},
        {'code': '<r><!-- -{{x}} --><![CDATA[a]{{y}}]]></r>\n', 'template': 'mustache', 'examples': {'placeholders': [{'name': 'x', 'example': '-X'}, {'name': 'y', 'example': ']>b'}]}}])

    print('-- the order template (mustache)')
    check_that(get_messages(order) == [], f'mustache: 0 problems (got {get_messages(order)})')
    check_that(len(order['tags']) == 22, f'mustache: every tag of the template is found ({len(order["tags"])})')
    browser = order['browserText']
    check_that(len(browser) == len(ORDER), 'the browser reads a text as long as the code')
    outer = [ORDER.index('{{#hasOrder}}'), ORDER.index('{{/hasOrder}}')]
    check_that(all(browser[at:at + 13].strip() == '' for at in outer), 'the section tags around the root read as spaces')
    inner, comment = ORDER.index('{{#items}}'), ORDER.index('{{name}}')
    check_that(browser[inner] == '\ue000' and '{{_items}}' not in browser, 'the tags inside the root read as markers that carry their number')
    check_that(browser[comment:comment + 8] == '{{name}}', 'a tag inside a comment reads in brace form')

    print('-- tree')
    check_that(order['source'] == ORDER, 'the nodes carry the code as written')
    check_that(['order', 'id', 'order-{{orderId}}'] in order['attributes'], 'an attribute value shows its tag as written')
    angle_values = [value for _, _, value in angle['attributes']]
    check_that('order-<<orderId>>' in angle_values and '<<quantity>>' in angle_values, 'angle: attribute values show <<name>> as written')
    check_that('<<?hasOrder>>' in angle['texts'] and '<<name>>' in angle['texts'], 'angle: texts show their tags as written')

    print('-- option off')
    check_that(order_off['browserText'] == ORDER and order_off['source'] == ORDER, 'option off: the browser reads the code as it is')
    check_that(order_off['tags'] == [], 'option off: no tags are read')

    print('-- angle')
    check_that(get_messages(angle) == [], f'angle: 0 problems (got {get_messages(angle)})')
    check_that('<<' not in angle['browserText'] and len(angle['browserText']) == len(ANGLE), 'angle: the browser reads no "<<" and a text as long as the code')

    print('-- placeholder errors')
    messages = [(problem['pos'], problem['msg']) for problem in broken['problems']]
    expected = [(BROKEN.index('{{#items}}'), 'The section {{#items}} stays open - add {{/items}}'),
                (BROKEN.index('{{/total}}'), '{{/total}} is a stray end tag - remove it or add {{#total}} before it')]
    check_that(messages == expected, f'a section left open and a stray end tag at their tags: {messages}')

    print('-- ids and namespaces')
    check_that(get_messages(ids) == [], f'with the option an id and a prefix holding a placeholder count as filled later ({get_messages(ids)})')
    off_messages = get_messages(ids_off)
    check_that('The id "item-{{id}}" is used twice' in off_messages and any('prefix "{{prefix}}"' in message for message in off_messages),
               'option off: both are reported')

    print('-- code view')
    check_that(get_plain_text(order['highlighted']) == ORDER, 'mustache: the highlighted text is the code')
    check_that('class="tp"' not in order['highlighted'], 'mustache: the tags have no color of their own')
    check_that(get_plain_text(angle['highlighted']) == ANGLE and 'class="tp"' not in angle['highlighted'],
               'angle: the code view shows every tag as written, without a color of its own')
    check_that(order_off['highlighted'] == order_off['plainHighlighted'], 'option off: the plain XML highlighting')

    print('-- format and minify')
    check_that(order['formattedTags'] == order['tags'], 'mustache: Format keeps every tag byte for byte')
    check_that(angle['formattedTags'] == angle['tags'], 'angle: Format keeps every tag byte for byte')
    check_that(order['formattedTwice'] == order['formatted'] and angle['formattedTwice'] == angle['formatted'], 'Format twice is the same')
    check_that('{{#hasOrder}}' in order['minified'] and '{{/hasOrder}}' in order['minified'], 'Minify keeps the sections around the root')
    check_that('<!-- {{#total}} -->' in commented['minified'] and '<!-- note -->' not in commented['minified'], 'Minify keeps a comment that holds a tag and drops the others')
    check_that(order_off['minified'].startswith('<?xml') and '{{#hasOrder}}' not in order_off['minified'], 'option off: Minify gives the old result')

    print('-- tree edits')
    check_that(typed['edit']['inserted'] == '<<name>>', f'a tag typed into the tree stays a tag ({typed["edit"]})')
    check_that(cut['edit']['inserted'] == '&lt;&lt;nam', f'the rest of a cut tag is escaped as text ({cut["edit"]})')

    print('-- example view')
    text = filled['exampleTree']['text']
    nodes = filled['exampleTree']['nodes']
    check_that('{{' not in text and '<name>John Doe &amp; Co &lt;Ltd&gt;</name>' in text, 'an example in text gets XML\'s escapes')
    check_that('id="order-A &quot;17&quot;"' in text and '<!-- Order confirmation for John Doe & Co <Ltd> -->' in text, 'attribute values get the escapes of their quote, a comment the example as it is')
    check_that(text.count('<item ') == 2 and 'quantity="2">Chair</item>' in text and 'quantity="1">Table</item>' in text, 'a list repeats its body per example row')
    check_that('Thank you for your order.' in text and '[Note]' not in text and '<pay:total currency="[currency]">[Total]</pay:total>' in text,
               'sections by example state, the label in brackets without an example')
    items = [start for kind, name, start in nodes if kind == 'el' and name == 'item']
    check_that(items == [ORDER.index('<item ')] * 2, f'every list row leads to the element of the code it repeats {items}')
    chair = next((start for kind, name, start in nodes if kind == 'text' and name == 'Chair'), None)
    check_that(chair == ORDER.index('{{title}}'), f'a filled text leads to its text in the code ({chair})')
    check_that('error' in crossed['exampleTree'], f'a section that crosses elements ends the example view ({crossed["exampleTree"]})')
    text = bounded['exampleTree'].get('text', '')
    comment = text[text.index('<!--') + 4:text.index('-->')]
    cdata = [kind for kind, name, start in bounded['exampleTree'].get('nodes', []) if kind == 'cdata']
    check_that('--' not in comment and len(cdata) == 2, f'a closing mark never forms across a fill and its neighbors ({text.strip()})')


def is_server_up():
    """Tells whether the editor answers at EDITOR_URL.

    Returns:
        bool: True when the page loads.
    """
    try:
        with urllib.request.urlopen(URL, timeout=3) as response:
            return response.status == 200
    except OSError:
        return False


def read_problems(page, code):
    """Sets the code in the editor and returns its problems.

    Args:
        page (Page): the editor page.
        code (str): the code.

    Returns:
        list[dict]: the problems of the editor's check.
    """
    page.evaluate('c => xmlEditor.setCode(c)', code)
    page.wait_for_timeout(300)
    return page.evaluate('() => xmlEditor.state.result.problems')


def run_browser_part():
    """Runs the checks of the browser part and prints their results.

    Returns:
        None: the results are printed and failures noted.
    """
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page()
        page.goto(URL + '?lang=en&template=mustache', wait_until='networkidle')
        check_that(read_problems(page, ORDER) == [], 'browser, mustache: 0 problems')
        comment = [problem['msg'] for problem in read_problems(page, COMMENT)]
        check_that(any('Not well-formed' in message for message in comment), f'browser: a name with "--" in a comment is reported ({comment})')
        page.evaluate('c => xmlEditor.setCode(c)', ORDER)
        page.wait_for_timeout(300)
        page.click('#btn-format')
        page.wait_for_timeout(300)
        formatted = page.evaluate('() => xmlEditor.state.code')
        check_that(re.findall(r'\{\{[^}]*\}\}', formatted) == re.findall(r'\{\{[^}]*\}\}', ORDER), 'browser: the Format button keeps every tag')
        page.goto(URL + '?lang=en&template=angle', wait_until='networkidle')
        check_that(read_problems(page, ANGLE) == [], 'browser, angle: 0 problems')
        values = page.evaluate('''() => { const doc = xmlEditor.state.result.doc; return [doc.documentElement.getAttribute('id'),
            doc.getElementsByTagName('name')[0].textContent, doc.getElementsByTagName('items')[0].textContent.trim()]; }''')
        check_that(values[:2] == ['order-<<orderId>>', '<<name>>'] and values[2].startswith('<<?items>>'),
                   f'browser, angle: the parsed document behind XPath, JSON and YAML holds the tags as written ({values})')
        page.goto(URL + '?lang=en', wait_until='networkidle')
        plain = read_problems(page, ORDER)
        page.goto(URL + '?lang=en&template=other', wait_until='networkidle')
        other = read_problems(page, ORDER)
        check_that(any(problem['kind'] == 'error' for problem in plain) and other == plain,
                   'browser, option off or another value: the old errors for text around the root')
        browser.close()


run_node_part()
print('-- browser')
if is_server_up():
    run_browser_part()
else:
    print(f'not run: no editor at {URL}')

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
