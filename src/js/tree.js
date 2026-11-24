/**
 * The element tree: drawing it, marking the selected node and the XPath matches, the path
 * above it, folding, and the link between tree and code. A click on a row selects its
 * node and frames it in the code; the cursor in the code selects its node in the tree,
 * opening folded parents.
 */

import { state, elements, findElements, isNarrow, translate } from './state.js?v=2';
import { escapeHtml, findNodeAt } from './xml.js?v=7';
import { getPath } from './xml-paths.js?v=2';
import { renderRow } from './tree-rows.js?v=4';
import { getNodeText, isLeaf, isOpen, getRowNode } from './nodes.js?v=4';
import { renderMarks, showInCode, getSelectedRange } from './code-view.js?v=5';
import { renderNodePanel } from './node-panel.js?v=5';
import { isEditing, startTreeEdit } from './tree-edit.js?v=5';
import { runTreeAction } from './tree-actions.js?v=5';
import { findByXpath } from './search.js?v=5';
import { showPane } from './layout.js?v=5';
import { showToast } from './toast.js?v=2';
import { getTreeModel } from './tree-views.js?v=1';

const SCROLL_MARGIN = 4;                // pixels a selected row keeps from the edges of the tree
const SCROLL_TARGET_SHARE = 1 / 3;      // share of the tree's height above a row scrolled to
const MARK_CLASSES = ['active', 'hit', 'current-turn'];

/**
 * Listens for clicks in the tree and in the path above it.
 * @returns {void}
 */
export function createTreeArea() {
    elements.tree.addEventListener('click', handleTreeClick);
    elements.tree.addEventListener('dblclick', handleFoldDoubleClick);
    elements.path.addEventListener('click', handlePathClick);
}

/**
 * Draws the tree from the scanned nodes (in the example view of a template those of the filled
 * document) and marks the selection and the matches.
 * @returns {void}
 */
export function renderTree() {
    const html = getTreeModel().doc.children.map(renderRow).join('');
    elements.tree.innerHTML = html || `<li class="empty-hint">${escapeHtml(translate('The document is empty - type some XML on the left, or choose a template under "New".'))}</li>`;
    showTreeMarks();
}

/**
 * Returns the row of a node in the tree.
 * @param {?Object} node - a scanned node, or {attr, el}.
 * @returns {?HTMLLIElement} the row, or null when it is not drawn.
 */
function findRow(node) {
    return node ? elements.tree.querySelector(`li[data-n="${getRowNode(node).id}"]`) : null;
}

/**
 * Returns the attribute part of an element's row.
 * @param {HTMLLIElement} row - the element's row.
 * @param {Object} node - the attribute and its element, as {attr, el}.
 * @returns {?Element} the attribute's span, or null.
 */
function findAttributeInRow(row, node) {
    return row.querySelector(`:scope > .row .at[data-a="${node.el.attrs.indexOf(node.attr)}"]`);
}

/**
 * Marks the selected node and the XPath matches in the tree and shows the path above it.
 * @param {boolean} [scrollToSelected] - also scroll the selected row into view.
 * @returns {void}
 */
export function showTreeMarks(scrollToSelected = false) {
    findElements('.active, .hit, .current-turn', elements.tree).forEach(marked => marked.classList.remove(...MARK_CLASSES));
    for (const hit of state.hits) {
        const row = findRow(hit);
        if (!row) continue;
        if (hit.attr) findAttributeInRow(row, hit)?.classList.add('hit');
        else row.classList.add('hit');
    }
    const currentHit = state.hits[state.hitIndex];
    if (currentHit) findRow(currentHit)?.classList.add('current-turn');
    const row = findRow(state.selected);
    if (row) {
        row.classList.add('active');
        if (state.selected.attr) findAttributeInRow(row, state.selected)?.classList.add('active');
        if (scrollToSelected) showRowInView(row);
    }
    renderPath();
}

/**
 * Scrolls the tree so a row is in view, a third from the top, when it is not.
 * @param {HTMLLIElement} row - the row.
 * @returns {void}
 */
function showRowInView(row) {
    const rowBox = row.querySelector('.row').getBoundingClientRect(), view = elements.scroller.getBoundingClientRect();
    if (rowBox.top < view.top + SCROLL_MARGIN || rowBox.bottom > view.bottom - SCROLL_MARGIN) elements.scroller.scrollTop += rowBox.top - view.top - view.height * SCROLL_TARGET_SHARE;
}

/**
 * Shows the path of the selected node above the tree, each step a button that selects it.
 * @returns {void}
 */
function renderPath() {
    const node = state.selected;
    if (!node) { elements.path.innerHTML = `<span class="muted">${escapeHtml(translate('Click a node to see its path'))}</span>`; return; }
    const chain = [];
    for (let step = node.attr ? node.el : node; step && step.type !== 'doc'; step = step.parent) chain.unshift(step);
    const steps = chain.map((step, index) => (index === chain.length - 1 && !node.attr ? `<b>${escapeHtml(step.step)}</b>` : `<button type="button" data-goto="${step.id}">${escapeHtml(step.step)}</button>`));
    if (node.attr) steps.push(`<b>@${escapeHtml(node.attr.name)}</b>`);
    elements.path.innerHTML = `<span class="path-parts" data-no-i18n>/${steps.join('/')}</span><button type="button" class="button small" id="path-query" title="${escapeHtml(translate('Put this path into the XPath field'))}">${escapeHtml(translate('As query'))}</button><button type="button" class="button small" id="path-copy" title="${escapeHtml(translate('Copy the XPath of the selected node'))}">${escapeHtml(translate('Copy path'))}</button>`;
}

/**
 * Handles a click in the path: a step selects its element, the buttons put the path into
 * the XPath field or copy it.
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} resolves when the path is copied.
 */
async function handlePathClick(event) {
    const step = event.target.closest('[data-goto]');
    if (step) { selectNode(state.model.all[+step.dataset.goto], { reveal: true, scroll: true }); return; }
    if (event.target.closest('#path-query')) {
        elements.xpath.value = getPath(state.selected, true);
        findByXpath(elements.xpath.value);
        return;
    }
    if (!event.target.closest('#path-copy')) return;
    try {
        await navigator.clipboard.writeText(getPath(state.selected, true));
        showToast('Path copied');
    } catch (error) { showToast('This browser does not allow copying this'); }
}

/**
 * Tells whether an element around a node is folded, so its row is not in the tree.
 * @param {Object} node - a scanned node, or {attr, el}.
 * @returns {boolean} true when a parent element is folded.
 */
function hasFoldedParent(node) {
    for (let parent = (node.attr ? node.el : node).parent; parent && parent.type === 'el'; parent = parent.parent) {
        if (!isOpen(parent)) return true;
    }
    return false;
}

/**
 * Opens the elements around a node, so its row is in the tree.
 * @param {?Object} node - a scanned node, or {attr, el}.
 * @returns {void}
 */
export function openParents(node) {
    if (!node) return;
    for (let parent = (node.attr ? node.el : node).parent; parent && parent.type === 'el'; parent = parent.parent) {
        if (!isOpen(parent)) state.folds.set(parent.path, true);
    }
}

/**
 * Shows a node as selected: opens its parents (drawing the tree anew) or marks it.
 * @param {?Object} node - the selected node.
 * @param {boolean} scrollToSelected - scroll its row into view when only marking.
 * @returns {void}
 */
function showSelection(node, scrollToSelected) {
    if (node && hasFoldedParent(node)) {
        openParents(node);
        renderTree();
    } else showTreeMarks(scrollToSelected);
}

/**
 * How selectNode() shows the selection.
 * @typedef {Object} SelectOptions
 * @property {boolean} [reveal] - put the cursor of the code on the node.
 * @property {boolean} [scroll] - scroll the tree to the node's row.
 */

/**
 * Selects a node: marks it in the tree and the code.
 * @param {?Object} node - a scanned node, {attr, el}, or null for none.
 * @param {SelectOptions} [options] - reveal: the code goes there;
 *   scroll: the tree scrolls to its row.
 * @returns {void}
 */
export function selectNode(node, { reveal = false, scroll = false } = {}) {
    state.selected = node || null;
    state.selectedPath = node ? getPath(node) : '';
    showSelection(node, false);
    if (scroll) showTreeMarks(true);
    renderMarks();
    renderNodePanel();
    if (reveal && node) showInCode(getSelectedRange()[0], false);
}

/**
 * Selects the node at the cursor in the code, unless the tree is still being read or edited.
 * @param {boolean} [scroll] - scroll the tree to its row.
 * @returns {void}
 */
export function selectFromCursor(scroll = true) {
    if (!state.model || state.model.src !== state.code || isEditing()) return;
    const node = getNodeAtCursor(elements.codeArea.selectionStart);
    if ((node && getPath(node)) === state.selectedPath) return;
    state.selected = node;
    state.selectedPath = node ? getPath(node) : '';
    showSelection(node, scroll);
    if (scroll) showTreeMarks(true);
    renderMarks();
    renderNodePanel();
}

/**
 * Returns the node the tree shows for a position in the code: an attribute inside a start
 * tag, the element of a text shown in its row, the parent element of a blank text.
 * @param {number} pos - an offset in the code.
 * @returns {?Object} the node, {attr, el}, or null.
 */
function getNodeAtCursor(pos) {
    let node = findNodeAt(state.model, pos);
    if (node && node.type === 'el') {
        const attribute = node.attrs.find(candidate => pos >= candidate.start && pos <= candidate.end);
        if (attribute && pos < node.tagEnd) node = { attr: attribute, el: node };
    }
    if (node && node.type === 'text' && !getNodeText(node)) node = node.parent.type === 'el' ? node.parent : null;
    if (node && node.type === 'text' && node.parent.type === 'el' && isLeaf(node.parent)) node = node.parent;
    return node;
}

/**
 * Folds or unfolds an element.
 * @param {Object} element - a scanned element.
 * @param {boolean} [open] - unfold (true) or fold (false); switches by default.
 * @returns {void}
 */
export function applyFoldSwitch(element, open = !isOpen(element)) {
    state.folds.set(element.path, open);
    renderTree();
}

/**
 * Handles a click in the tree: a fold button folds, a row button runs its action, a click
 * on a row selects its node and, on an editable part, starts editing it.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleTreeClick(event) {
    // A click that ended an edit drew the tree anew: the row under the pointer is a new element.
    const target = elements.tree.contains(event.target) ? event.target : document.elementFromPoint(event.clientX, event.clientY);
    if (!target || !elements.tree.contains(target)) return;
    const row = target.closest('li[data-n]');
    const node = row && state.model.all[+row.dataset.n];
    if (!node) return;
    if (target.closest('[data-fold]')) { applyFoldSwitch(node); return; }
    const actionButton = target.closest('[data-act]');
    if (actionButton) { runTreeAction(actionButton.dataset.act, node); return; }
    if (target.closest('[contenteditable]')) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && elements.tree.contains(selection.anchorNode) && !target.closest('.ed')) return;   // the user selects text
    const editable = target.closest('.ed');
    const attributePart = target.closest('.at[data-a]');
    const selected = attributePart && node.type === 'el' ? { attr: node.attrs[+attributePart.dataset.a], el: node } : node;
    if (isNarrow() && !editable) showPane('code');
    selectNode(selected, { reveal: true });
    if (editable) startTreeEdit(editable, node, event.clientX, event.clientY);
}

/**
 * Folds or unfolds an element on a double click on its row (not on its editable parts or buttons).
 * @param {MouseEvent} event - the double click.
 * @returns {void}
 */
function handleFoldDoubleClick(event) {
    if (event.target.closest('.ed, [data-act], [data-fold]')) return;
    const row = event.target.closest('li[data-n]');
    const node = row && state.model.all[+row.dataset.n];
    if (node && node.type === 'el' && !isLeaf(node)) applyFoldSwitch(node);
}
