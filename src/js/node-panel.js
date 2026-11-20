/**
 * The Node tab of the side panel: the selected node with its path, line, namespace and
 * content, the attributes of an element as fields to edit, and buttons to add, move and
 * remove. Without a selection it sums up the document: elements, attributes, depth, root
 * element and namespaces.
 */

import { state, elements, translate } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=6';
import { getPath } from './xml-paths.js?v=2';
import { getNodeText, getShownChildren } from './nodes.js?v=3';
import { getLineIndex } from './code-view.js?v=3';
import { getTreeEdit } from './tree-edit-changes.js?v=3';
import { applyEdits } from './history.js?v=3';
import { removeNode, runTreeAction } from './tree-actions.js?v=3';

const KIND_TITLES = { el: 'Element', text: 'Text', comment: 'Comment', cdata: 'CDATA section', pi: 'Processing instruction', doctype: 'DOCTYPE' };

/**
 * Listens for changes of the attribute fields and clicks on the buttons.
 * @returns {void}
 */
export function startNodePanel() {
    const panel = elements.nodePanel;
    panel.addEventListener('change', setAttributeFromField);
    panel.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.matches('[data-attr]')) event.target.dispatchEvent(new Event('change', { bubbles: true })); });
    panel.addEventListener('click', handlePanelClick);
}

/**
 * Returns the element of the selection (an attribute's element).
 * @returns {?Object} the selected element, or the selected node when it is no attribute.
 */
function getSelectedElement() {
    return state.selected && (state.selected.attr ? state.selected.el : state.selected);
}

/**
 * Draws the Node tab, unless it is hidden or a field in it is being typed into.
 * @returns {void}
 */
export function renderNodePanel() {
    const panel = elements.nodePanel;
    if (panel.hidden) return;
    if (panel.contains(document.activeElement) && document.activeElement.matches('input')) return;   // keep what is being typed
    if (!state.model) return;
    panel.innerHTML = state.selected ? renderNodeInfo(state.selected) : renderDocumentInfo(state.model);
}

/**
 * Returns the summary of the document shown without a selection.
 * @param {Object} model - the scanned nodes.
 * @returns {string} the HTML.
 */
function renderDocumentInfo(model) {
    const attributeCount = model.els.reduce((count, element) => count + element.attrs.length, 0);
    const depth = model.els.reduce((deepest, element) => Math.max(deepest, element.depth + 1), 0);
    const namespaces = Object.entries(state.namespaces.map).filter(([prefix]) => prefix !== '_');
    const root = model.els[0];
    return `<p class="hint">${escapeHtml(translate('Click a node in the tree (or put the cursor in the code) to see it here.'))}</p>
            <div class="doc-info"><b>${model.els.length}</b> <span>${model.els.length === 1 ? 'element' : 'elements'}</span> · <b>${attributeCount}</b> <span>${attributeCount === 1 ? 'attribute' : 'attributes'}</span> · <span>depth</span> <b>${depth}</b>${root ? `<br><span>Root element</span>: <code data-no-i18n>&lt;${escapeHtml(root.name)}&gt;</code>` : ''}${root && root.uri ? `<br><span>Default namespace</span>: <code data-no-i18n>${escapeHtml(root.uri)}</code>` : ''}</div>
            ${namespaces.length ? `<h3>${escapeHtml(translate('Namespaces'))}</h3><ul class="ns-list" data-no-i18n>${namespaces.map(([prefix, uri]) => `<li><code>${escapeHtml(prefix)}</code> <span>${escapeHtml(uri)}</span></li>`).join('')}</ul>` : ''}`;
}

/**
 * Returns the information about the selected node.
 * @param {Object} node - the selected node, or {attr, el}.
 * @returns {string} the HTML.
 */
function renderNodeInfo(node) {
    const element = node.attr ? node.el : node.type === 'el' ? node : null;
    const line = getLineIndex(node.attr ? node.attr.start : node.start) + 1;
    const kind = node.attr ? 'Attribute' : KIND_TITLES[node.type];
    const name = node.attr ? ` <code data-no-i18n>@${escapeHtml(node.attr.name)}</code>` : element ? ` <code data-no-i18n>&lt;${escapeHtml(element.name)}&gt;</code>` : '';
    const head = `<h3>${escapeHtml(translate(kind))}${name}</h3>
        <dl class="node-info"><dt>${escapeHtml(translate('Path'))}</dt><dd><code data-no-i18n>${escapeHtml(getPath(node, true))}</code></dd><dt>${escapeHtml(translate('Line'))}</dt><dd>${line}</dd>`;
    return head + (element ? renderElementInfo(element) : renderContentInfo(node));
}

/**
 * Returns the namespace, content and attributes of an element, and its buttons.
 * @param {Object} element - the scanned element.
 * @returns {string} the HTML after the path and line.
 */
function renderElementInfo(element) {
    const childCount = getShownChildren(element).filter(child => child.type === 'el').length;
    const attributes = element.attrs.map((attribute, index) => `<label class="attr"><span data-no-i18n title="${escapeHtml(attribute.name)}">${escapeHtml(attribute.name)}</span><input data-attr="${index}" value="${escapeHtml(attribute.value)}" spellcheck="false" aria-label="${escapeHtml(attribute.name)}"><button type="button" class="remove" data-attr-del="${index}" title="${escapeHtml(translate('Remove the attribute'))}" aria-label="${escapeHtml(translate('Remove the attribute'))}">✕</button></label>`).join('');
    return `<dt>${escapeHtml(translate('Namespace'))}</dt><dd>${element.uri ? `<code data-no-i18n>${escapeHtml(element.uri)}</code>` : escapeHtml(translate('none'))}</dd><dt>${escapeHtml(translate('Content'))}</dt><dd>${childCount} ${childCount === 1 ? 'child element' : 'child elements'}</dd></dl>`
        + `<h3>${escapeHtml(translate('Attributes'))}</h3><div class="attr-list">${attributes || `<p class="hint">${escapeHtml(translate('No attributes.'))}</p>`}</div>
            <div class="button-row two">
                <button type="button" class="button small" data-node-act="attr">${escapeHtml(translate('Add attribute'))}</button>
                <button type="button" class="button small" data-node-act="child">${escapeHtml(translate('Add child element'))}</button>
                <button type="button" class="button small" data-node-act="up">${escapeHtml(translate('Move up'))}</button>
                <button type="button" class="button small" data-node-act="down">${escapeHtml(translate('Move down'))}</button>
                <button type="button" class="button small danger" data-node-act="del">${escapeHtml(translate('Remove the element'))}</button>
            </div>`;
}

/**
 * Returns the length of a text, comment, CDATA section or declaration, and its Remove button.
 * @param {Object} node - the scanned node.
 * @returns {string} the HTML after the path and line.
 */
function renderContentInfo(node) {
    const length = node.type === 'text' ? getNodeText(node).length : state.code.slice(node.inner[0], node.inner[1]).length;
    const info = `<dt>${escapeHtml(translate('Length'))}</dt><dd>${length} ${length === 1 ? 'character' : 'characters'}</dd></dl>`;
    return info + (node.type !== 'doctype' ? `<div class="button-row"><button type="button" class="button small danger" data-node-act="del">${escapeHtml(translate('Remove'))}</button></div>` : '');
}

/**
 * Writes a changed attribute field into the code (one undo step).
 * @param {Event} event - the change of a field.
 * @returns {void}
 */
function setAttributeFromField(event) {
    const field = event.target.closest('[data-attr]');
    const element = getSelectedElement();
    if (!field || !element || element.type !== 'el') return;
    const attribute = element.attrs[+field.dataset.attr];
    if (!attribute || attribute.value === field.value) return;
    const change = getTreeEdit({ kind: 'aval', node: element, ai: +field.dataset.attr }, field.value);
    field.blur();
    applyEdits(change.edits, change.cursor);
}

/**
 * Handles the buttons of the panel: remove an attribute, or an action on the selection.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handlePanelClick(event) {
    const element = getSelectedElement();
    const removeButton = event.target.closest('[data-attr-del]');
    if (removeButton && element) { removeNode({ attr: element.attrs[+removeButton.dataset.attrDel], el: element }); return; }
    const actionButton = event.target.closest('[data-node-act]');
    if (actionButton && state.selected) runTreeAction(actionButton.dataset.nodeAct, actionButton.dataset.nodeAct === 'del' ? state.selected : element);
}
