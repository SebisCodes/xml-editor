/**
 * Reading the code into the tree and drawing everything that depends on it.
 *
 * renderPreview() runs these steps:
 *   1. end an edit in the tree that is still open (the tree is drawn anew);
 *   2. read the code: nodes, problems, the parsed document, its links and namespaces;
 *   3. find the selected node again by its path;
 *   4. evaluate the XPath field and the search again;
 *   5. draw the tree, the problems, the code and the side panel.
 * Typing reads the tree after a pause (startRenderSoon); commands that work on the tree
 * call readTreeNow() first.
 */

import { state, elements } from './state.js?v=2';
import { parseNodes } from './xml.js?v=6';
import { checkDocument } from './xml-check.js?v=3';
import { createLinker, createNamespaceResolver } from './xml-paths.js?v=2';
import { renderTree } from './tree.js?v=3';
import { isEditing, stopTreeEdit } from './tree-edit.js?v=3';
import { updateQueryHits, updateSearchFound } from './search.js?v=3';
import { renderProblems } from './problems.js?v=3';
import { renderCode } from './code-view.js?v=3';
import { renderNodePanel } from './node-panel.js?v=3';
import { renderConvertPanel } from './conversion-panel.js?v=3';

const LARGE_DOCUMENT = 1500;            // more elements than this: the tree opens folded below the second level
const LARGE_DOCUMENT_DEPTH = 2;
const COMPUTING_CLASS = 'computing';

let renderTimer = 0;

/**
 * Reads the tree and draws it after a pause in typing; the tree shows that it is waiting.
 * @param {number} delay - milliseconds to wait.
 * @returns {void}
 */
export function startRenderSoon(delay) {
    clearTimeout(renderTimer);
    elements.stage.classList.add(COMPUTING_CLASS);
    renderTimer = setTimeout(renderPreview, delay);
}

/**
 * Reads the code into the tree and draws the tree, the problems, the code and the side panel.
 * @returns {void}
 */
export function renderPreview() {
    clearTimeout(renderTimer);
    elements.stage.classList.remove(COMPUTING_CLASS);
    if (isEditing()) stopTreeEdit(false);
    readTree();
    state.selected = findNodeByPath(state.selectedPath);
    updateQueryHits();
    updateSearchFound();
    renderTree();
    renderProblems();
    renderCode();
    renderNodePanel();
    if (!elements.convertPanel.hidden) renderConvertPanel();
}

/**
 * Reads the code into nodes, problems, the parsed document, its links and namespaces. A
 * large document opens folded below the second level, decided once per document.
 * @returns {void}
 */
function readTree() {
    state.model = parseNodes(state.code);
    state.result = checkDocument(state.model);
    state.linker = createLinker(state.model, state.result.doc);
    state.namespaces = createNamespaceResolver(state.model);
    if (state.model.els.length > LARGE_DOCUMENT && state.openDepth === Infinity && !state.isFoldDepthSet) state.openDepth = LARGE_DOCUMENT_DEPTH;
    state.isFoldDepthSet = true;
}

/**
 * Reads the tree from the code as it is now, when typing has not let it be read yet.
 * @returns {void}
 */
export function readTreeNow() {
    if (!state.model || state.model.src !== state.code) renderPreview();
}

/**
 * Returns the node with a path in the current tree (after a change the same place, as far
 * as it still exists).
 * @param {string} path - an XPath from getPath(), with "/@name" for an attribute.
 * @returns {?Object} the node, {attr, el} for an attribute, or null.
 */
export function findNodeByPath(path) {
    if (!path || !state.model) return null;
    const attributeAt = path.indexOf('/@');
    const elementPath = attributeAt >= 0 ? path.slice(0, attributeAt) : path;
    const node = state.model.all.find(candidate => candidate.path === elementPath) || null;
    if (!node || attributeAt < 0) return node;
    const attribute = node.type === 'el' && node.attrs.find(candidate => candidate.name === path.slice(attributeAt + 2));
    return attribute ? { attr: attribute, el: node } : node;
}
