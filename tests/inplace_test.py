"""Editing in the tree: a click on a text, an attribute value, an element or
attribute name makes it editable; Enter writes the change into the code
(special characters escaped, the rest of the formatting kept, one undo
step), Escape cancels. The row buttons add, move and remove.

Start the editor first (php -S 127.0.0.1:8103 -t src src/php/router.php), then run this file."""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8103/')
CODE = ('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!-- keep   this   comment -->\n'
        '<catalog  updated = "2026">\n'
        '    <product sku="A-1">\n'
        '        <name>Lamp &amp; shade</name>\n'
        '        <price currency=\'CHF\'>49.00</price>\n'
        '    </product>\n'
        '    <product sku="A-2">\n'
        '        <name>Chair</name>\n'
        '        <empty/>\n'
        '    </product>\n'
        '</catalog>\n')
failed = []


def check_that(ok, text):
    """Print one result line and remember a failure.

    Args:
        ok (bool): whether the check passed.
        text (str): what was checked.

    Returns:
        None: the result is printed, a failure is added to the list.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='load')
    page.wait_for_timeout(1000)
    page.evaluate('c => xmlEditor.setCode(c)', CODE)
    page.wait_for_timeout(300)
    code = lambda: page.evaluate('xmlEditor.state.code')
    hist = lambda: page.evaluate('xmlEditor.state.history.length')
    row = lambda name, k=0: page.locator('#tree li.el').filter(has=page.locator(f':scope > .row .k.ed:text-is("{name}")')).nth(k)
    editing = lambda: page.locator('#tree .edit')

    # Text of an element shown in one line
    span = row('name').locator(':scope > .row .tx.ed')
    check_that(span.inner_text() == 'Lamp & shade', 'the tree shows the text with entities resolved: ' + span.inner_text())
    span.click()
    page.wait_for_timeout(150)
    check_that(editing().count() == 1, 'a click makes the text editable')
    caret = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart - 5, t.selectionStart + 6); }')
    check_that('Lamp' in caret or '<name>' in caret, 'the code goes to the node: ' + repr(caret))
    n0 = hist()
    page.keyboard.press('Control+a')
    page.keyboard.type('Lamp <big> & "bright"')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<name>Lamp &lt;big&gt; &amp; "bright"</name>' in code(), 'Enter writes the text, < > & escaped: ' + code().split('\n')[4])
    check_that(code().startswith('<?xml version="1.0" encoding="UTF-8"?>\n<!-- keep   this   comment -->\n<catalog  updated = "2026">\n    <product'), 'the rest of the code keeps its formatting')
    check_that(hist() == n0 + 1, 'one undo step')
    page.evaluate('xmlEditor.undo()')
    page.wait_for_timeout(300)
    check_that('<name>Lamp &amp; shade</name>' in code(), 'one Undo brings the old text back')

    # Only the changed part is written: the entity outside it stays
    row('name').locator(':scope > .row .tx.ed').click()
    page.keyboard.press('End')
    page.keyboard.type(' set')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<name>Lamp &amp; shade set</name>' in code(), 'a small edit keeps the entity that was there')

    # Attribute value with single quotes
    v = row('price').locator(':scope > .row .s.ed')
    v.click()
    page.keyboard.press('Control+a')
    page.keyboard.type("EUR's & co")
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that("currency='EUR&apos;s &amp; co'" in code(), 'an attribute value is escaped for its quotes: ' + code().split('\n')[5])

    # Escape cancels
    row('price').locator(':scope > .row .tx.ed').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('no')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    check_that('>49.00</price>' in code() and editing().count() == 0, 'Escape cancels')

    # Rename an element: start and end tag
    row('product', 1).locator(':scope > .row .k.ed').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('item')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<item sku="A-2">' in code() and '</item>' in code() and code().count('</product>') == 1, 'renaming changes the start and the end tag')
    row('item').locator(':scope > .row .k.ed').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('bad name')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<item sku="A-2">' in code() and 'not a valid XML name' in page.inner_text('#toast'), 'an invalid name is refused')

    # Rename an attribute
    page.locator('#tree .k.ed:text-is("catalog") ~ .at .a.ed').first.click()
    page.keyboard.press('Control+a')
    page.keyboard.type('changed')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<catalog  changed = "2026">' in code(), 'renaming an attribute keeps its spacing')

    # Text into an empty element
    row('empty').click()
    page.wait_for_timeout(100)
    row('empty').locator(':scope > .row .tx.ed').click()
    page.keyboard.type('now <full>')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<empty>now &lt;full&gt;</empty>' in code(), 'text typed into an empty element: ' + [l for l in code().split('\n') if 'empty' in l][0])

    # Comment
    page.locator('#tree li.comment .c.ed').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('a -- b')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<!-- a - - b -->' in code(), 'a comment is edited, "--" made safe')

    # Add a child element: it opens for its name
    n0 = hist()
    row('item').locator(':scope > .row').hover()
    row('item').locator(':scope > .row [data-act=child]').click()
    page.wait_for_timeout(300)
    check_that(editing().count() == 1 and editing().inner_text() == 'empty', 'a new child element is added and its name is editable')
    page.keyboard.type('note')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<empty>now &lt;full&gt;</empty>\n        <note></note>\n    </item>' in code(), 'the new child is indented like its siblings: ' + repr(code()[code().find('<empty>'):code().find('</item>') + 7]))
    page.evaluate('xmlEditor.undo()')
    page.wait_for_timeout(300)
    check_that('<note>' not in code() and code().count('<empty') == 2, 'Undo takes the new name back (renaming is its own step)')
    page.evaluate('xmlEditor.undo()')
    page.wait_for_timeout(300)
    check_that(code().count('<empty') == 1 and '<empty>now' in code(), 'a second Undo removes the added element')

    # Add an attribute: name, then value
    row('item').locator(':scope > .row').hover()
    row('item').locator(':scope > .row [data-act=attr]').click()
    page.wait_for_timeout(300)
    page.keyboard.type('color')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that(editing().count() == 1, 'after the name, the value is editable')
    page.keyboard.type('red & blue')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    check_that('<item sku="A-2" color="red &amp; blue">' in code(), 'a new attribute with its value: ' + [l for l in code().split('\n') if '<item' in l][0])

    # Move and remove
    row('item').locator(':scope > .row').hover()
    row('item').locator(':scope > .row [data-act=up]').click()
    page.wait_for_timeout(300)
    c = code()
    check_that(c.index('<item') < c.index('<product') and '    </item>\n    <product sku="A-1">' in c, 'Move up swaps it with the element before, formatting kept')
    n0 = hist()
    row('item').locator(':scope > .row').hover()
    row('item').locator(':scope > .row [data-act=del]').click()
    page.wait_for_timeout(300)
    check_that('<item' not in code() and '<catalog  changed = "2026">\n    <product sku="A-1">' in code(), 'Remove takes the element and its line away')
    check_that(hist() == n0 + 1, 'removing is one undo step')
    page.evaluate('xmlEditor.undo()')
    page.wait_for_timeout(300)
    check_that('<item sku="A-2" color' in code(), 'Undo brings it back')

    # German interface: user content is not translated
    page.goto(EDITOR + '?lang=de', wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate('c => xmlEditor.setCode(c)', '<root><Name>Delete</Name><Text>Remove</Text></root>')
    page.wait_for_timeout(400)
    check_that(page.locator('#tree .tx.ed').first.inner_text() == 'Delete' and page.locator('#tree .k.ed:text-is("Name")').count() == 1, 'in German the names and texts of the document stay as they are')
    page.goto(EDITOR + '?lang=en', wait_until='load')
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
