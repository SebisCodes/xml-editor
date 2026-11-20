/**
 * Search and XPath above the tree. The search marks the rows whose names, attribute names
 * and values or text contain the search text; the XPath field (XPath 1.0, with the prefixes
 * of the document and "_" for the default namespace of the root) marks the matching nodes
 * or shows the value of the expression. The arrows and Enter step through the matches.
 */

import { state, elements, findElement, translate } from './state.js?v=2';
import { getNodeText, getRowNode } from './nodes.js?v=3';
import { renderTree, showTreeMarks, selectNode, openParents } from './tree.js?v=3';

const SEARCH_DELAY = 200;               // milliseconds after the last key stroke
const QUERY_DELAY = 350;
const VALUE_SHOWN = 60;                 // characters shown of a string result
const FIND_MARGIN = 40;                 // pixels above the first found row after scrolling
const INVALID_XPATH = 'Not a valid XPath expression';

let searchTimer = 0;
let queryTimer = 0;

/**
 * Listens for the search field, the XPath field, the arrows and the fold buttons.
 * @returns {void}
 */
export function startSearch() {
    elements.search.addEventListener('input', startSearchSoon);
    elements.xpath.addEventListener('input', startQuerySoon);
    for (const field of [elements.search, elements.xpath]) field.addEventListener('keydown', event => handleFieldEnter(event, field));
    findElement('#hit-next').addEventListener('click', () => selectNextHit(1));
    findElement('#hit-prev').addEventListener('click', () => selectNextHit(-1));
    findElement('#fold-all').addEventListener('click', closeAllElements);
    findElement('#unfold-all').addEventListener('click', openAllElements);
}

/**
 * Searches a short while after the last key stroke in the search field.
 * @returns {void}
 */
function startSearchSoon() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        state.search = elements.search.value.trim().toLowerCase();
        state.hitIndex = -1;
        findInTree();
    }, SEARCH_DELAY);
}

/**
 * Evaluates the XPath field a short while after the last key stroke.
 * @returns {void}
 */
function startQuerySoon() {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => findByXpath(elements.xpath.value), QUERY_DELAY);
}

/**
 * Handles Enter in the search and XPath fields: a changed XPath is evaluated at once,
 * otherwise Enter goes to the next match (Shift+Enter to the previous one).
 * @param {KeyboardEvent} event - the key.
 * @param {HTMLInputElement} field - the field.
 * @returns {void}
 */
function handleFieldEnter(event, field) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (field === elements.xpath && state.query !== field.value) {
        clearTimeout(queryTimer);
        findByXpath(field.value);
    } else selectNextHit(event.shiftKey ? -1 : 1);
}

/**
 * Folds every element below the root.
 * @returns {void}
 */
function closeAllElements() {
    state.folds = new Map();
    state.openDepth = 1;
    renderTree();
}

/**
 * Unfolds every element and scrolls to the selected one.
 * @returns {void}
 */
function openAllElements() {
    state.folds = new Map();
    state.openDepth = Infinity;
    renderTree();
    showTreeMarks(true);
}

/**
 * Tells whether a node contains the search text.
 * @param {Object} node - a scanned node.
 * @param {string} search - the search text, lower case.
 * @returns {boolean} true when its name, an attribute or its text contains it.
 */
function isFound(node, search) {
    /**
     * Tells whether a text contains the search text, ignoring case.
     * @param {string} text - the text.
     * @returns {boolean} true when it does.
     */
    const hasSearchText = text => text.toLowerCase().includes(search);
    if (node.type === 'el') return hasSearchText(node.name) || node.attrs.some(attribute => hasSearchText(attribute.name) || hasSearchText(attribute.value));
    if (node.type === 'text') return hasSearchText(getNodeText(node));
    return node.type !== 'doctype' && hasSearchText(state.code.slice(node.inner[0], node.inner[1]));
}

/**
 * Finds the rows that contain the search text, without drawing.
 * @returns {void}
 */
export function updateSearchFound() {
    state.found = new Set();
    if (!state.search || !state.model) return;
    for (const node of state.model.all) {
        if (isFound(node, state.search)) state.found.add(getRowNode(node).id);
    }
}

/**
 * Finds the rows that contain the search text, opens them in the tree and scrolls to the first.
 * @returns {void}
 */
function findInTree() {
    updateSearchFound();
    for (const id of state.found) openParents(state.model.all[id]);
    renderTree();
    showHitInfo();
    const first = elements.tree.querySelector('.found');
    if (!first) return;
    const rowBox = first.getBoundingClientRect(), view = elements.scroller.getBoundingClientRect();
    if (rowBox.top < view.top || rowBox.bottom > view.bottom) elements.scroller.scrollTop += rowBox.top - view.top - FIND_MARGIN;
}

/**
 * Evaluates the XPath field again (after the code changed), without drawing the tree.
 * @returns {void}
 */
export function updateQueryHits() {
    setQueryHits();
    showHitInfo();
}

/**
 * Evaluates an XPath expression, marks its matches in the tree and selects the first one.
 * @param {string} query - the expression.
 * @returns {void}
 */
export function findByXpath(query) {
    state.query = query;
    setQueryHits();
    state.hitIndex = state.hits.length ? 0 : -1;
    state.hits.forEach(openParents);
    renderTree();
    if (state.hits[0]) selectNode(state.hits[0], { reveal: true, scroll: true });
    showHitInfo();
}

/**
 * Evaluates the XPath field into the matching nodes or a value.
 * @returns {void}
 */
function setQueryHits() {
    const query = state.query.trim();
    const result = query && state.model ? getQueryResult(query) : { hits: [], info: '' };
    state.hits = result.hits;
    state.hitInfo = result.info;
    if (state.hitIndex >= state.hits.length) state.hitIndex = -1;
}

/**
 * Evaluates an XPath expression on the parsed document.
 * @param {string} query - the expression.
 * @returns {{hits: Object[], info: string}} the matching nodes, and what the expression
 *   gave: a value, the number of matches, or why it gave nothing.
 */
function getQueryResult(query) {
    const hits = [];
    const parsed = state.result.doc;
    if (!parsed) return { hits, info: translate('Fix the errors first') };
    try {
        const result = parsed.evaluate(query, parsed, state.namespaces.fn, XPathResult.ANY_TYPE, null);
        if (result.resultType === XPathResult.NUMBER_TYPE) return { hits, info: '= ' + result.numberValue };
        if (result.resultType === XPathResult.STRING_TYPE) return { hits, info: '= "' + result.stringValue.slice(0, VALUE_SHOWN) + (result.stringValue.length > VALUE_SHOWN ? '…' : '') + '"' };
        if (result.resultType === XPathResult.BOOLEAN_TYPE) return { hits, info: '= ' + result.booleanValue };
        for (let domNode = result.iterateNext(); domNode; domNode = result.iterateNext()) {
            const hit = getHitNode(state.linker.findModelNode(domNode));
            if (hit) hits.push(hit);
        }
        return { hits, info: hits.length ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}` : translate('No match') };
    } catch (error) {
        return { hits, info: translate(INVALID_XPATH) };
    }
}

/**
 * Returns the node a match marks: a blank text counts as its parent element.
 * @param {?Object} node - the scanned node of a match.
 * @returns {?Object} the node to mark, or null for none (and for the document).
 */
function getHitNode(node) {
    if (!node || node.type === 'doc') return null;
    return node.type === 'text' && !getNodeText(node) ? node.parent : node;
}

/**
 * Shows the number of matches or found rows (or the XPath's value) and enables the arrows.
 * @returns {void}
 */
function showHitInfo() {
    const parts = [];
    if (state.query.trim()) parts.push(state.hitIndex >= 0 && state.hits.length > 1 ? `${state.hitIndex + 1} / ${state.hits.length}` : state.hitInfo);
    else if (state.search) parts.push(state.found.size ? `${state.found.size} found` : translate('Nothing found'));
    elements.hitInfo.textContent = parts.join(' ');
    elements.xpath.classList.toggle('invalid', state.hitInfo === translate(INVALID_XPATH));
    const count = state.query.trim() ? state.hits.length : state.found.size;
    findElement('#hit-prev').disabled = findElement('#hit-next').disabled = !count;
}

/**
 * Selects the next (or previous) XPath match or found row.
 * @param {number} direction - 1 for the next, -1 for the previous.
 * @returns {void}
 */
function selectNextHit(direction) {
    const list = state.query.trim() ? state.hits : [...state.found].map(id => state.model.all[id]);
    if (!list.length) return;
    state.hitIndex = (Math.max(state.hitIndex, direction > 0 ? -1 : 0) + direction + list.length) % list.length;
    selectNode(list[state.hitIndex], { reveal: true, scroll: true });
    showHitInfo();
}
