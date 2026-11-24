/**
 * The Insert tab of the side panel: ready-made pieces of XML (elements, attributes,
 * comments, CDATA, declarations, namespaces) and characters as entity references, put in
 * at the cursor of the code. The XML declaration goes at the very start, once.
 */

import { state, elements } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=7';
import { addSnippet } from './typing.js?v=5';
import { applyEdits } from './history.js?v=5';
import { showToast } from './toast.js?v=2';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
/** The pieces: "|" marks where the cursor goes, "§" stands for the selected text. */
const SNIPPETS = {
    element: '<element>§|</element>', empty: '<element/>|', comment: '<!-- §| -->', cdata: '<![CDATA[§|]]>',
    pi: '<?target data?>|', ns: ' xmlns:ns="urn:example:ns"|', attr: ' name="§|"', xsi: ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"|',
};
/** The characters: the entity reference written and the character shown on the button. */
const CHARACTERS = [['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&apos;', "'"], ['&#160;', '␣'], ['&#169;', '©'], ['&#174;', '®'], ['&#8364;', '€'],
    ['&#8211;', '–'], ['&#8212;', '—'], ['&#8230;', '…'], ['&#171;', '«'], ['&#187;', '»'], ['&#176;', '°'], ['&#215;', '×']];

/**
 * Draws the Insert tab and listens for its buttons; the code keeps its cursor when one is pressed.
 * @returns {void}
 */
export function startInsertPanel() {
    renderInsertPanel();
    elements.insertPanel.addEventListener('mousedown', event => { if (event.target.closest('[data-ins], [data-sym]')) event.preventDefault(); });
    elements.insertPanel.addEventListener('click', addFromButton);
}

/**
 * Returns the HTML of one button of the Structure group.
 * @param {string} key - the piece (data-ins).
 * @param {string} label - the text on the button.
 * @param {string} [title] - the tooltip, the label by default.
 * @returns {string} the button.
 */
function renderInsertButton(key, label, title) {
    return `<button type="button" class="button" data-ins="${key}" title="${escapeHtml(title || label)}">${label}</button>`;
}

/**
 * Draws the buttons of the Insert tab.
 * @returns {void}
 */
function renderInsertPanel() {
    const button = renderInsertButton;
    elements.insertPanel.innerHTML = `
        <div class="insert-group"><h3>Structure</h3><div class="insert-grid">
            ${button('element', 'Start and end tag', 'An element at the cursor, around the selected text')}${button('empty', 'Empty element', 'A self-closing element')}
            ${button('attr', 'Attribute', 'An attribute (put the cursor inside a start tag)')}${button('comment', 'Comment')}
            ${button('cdata', 'CDATA section', 'Text that is not parsed as markup')}${button('pi', 'Processing instruction')}
            ${button('decl', 'XML declaration', 'The first line: version and encoding')}${button('ns', 'Namespace', 'A namespace declaration (inside a start tag)')}
            ${button('xsi', 'Schema instance', 'xmlns:xsi for xsi:schemaLocation (inside a start tag)')}
        </div></div>
        <div class="insert-group"><h3>Characters</h3><p class="hint">As entity references, so they stay readable in any encoding.</p>
            <div class="symbol-grid">${CHARACTERS.map(([reference, character]) => `<button type="button" data-sym="${escapeHtml(reference)}" title="${escapeHtml(reference)}">${escapeHtml(character)}</button>`).join('')}</div></div>`;
}

/**
 * Inserts the piece or character of the pressed button.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function addFromButton(event) {
    const pieceButton = event.target.closest('[data-ins]');
    if (pieceButton) {
        if (pieceButton.dataset.ins === 'decl') addDeclaration();
        else addSnippet(SNIPPETS[pieceButton.dataset.ins]);
        return;
    }
    const characterButton = event.target.closest('[data-sym]');
    if (characterButton) addSnippet(characterButton.dataset.sym);
}

/**
 * Puts the XML declaration at the start of the code, unless it has one.
 * @returns {void}
 */
function addDeclaration() {
    if (/^\s*<\?xml\b/.test(state.code)) { showToast('The document has an XML declaration already'); return; }
    applyEdits([[0, 0, XML_DECLARATION]], 0);
}
