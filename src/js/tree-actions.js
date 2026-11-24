/**
 * The actions of the row buttons and the Node panel: add a child element (indented like
 * its siblings, its name opens for editing), add an attribute (name, then value), move an
 * element before or after its neighbor element, remove a node with its line. Each one is
 * one edit of the code and one undo step.
 */

import { state, isTreeCurrent } from './state.js?v=2';
import { getPath } from './xml-paths.js?v=2';
import { getShownChildren, getAttributesEnd, getIndentUnit, getIndentAt, getElementCountBefore, getLineRange } from './nodes.js?v=4';
import { applyEdits } from './history.js?v=5';
import { selectNode } from './tree.js?v=5';
import { startEditAfterRender } from './tree-edit.js?v=5';
import { showToast } from './toast.js?v=2';
import { isWholeTreeNode, EXAMPLE_PART_NOTE } from './tree-views.js?v=1';

const DEFAULT_CHILD_NAME = 'item';
const DEFAULT_ATTRIBUTE_NAME = 'name';

/** The actions that move or remove a node of the code. */
const STRUCTURE_ACTIONS = new Set(['up', 'down', 'del']);

/**
 * Runs the action of a row button on a node, when the tree is read from the current code; in
 * the example view a node is moved or removed only as a whole (tree-views.js).
 * @param {string} action - child, attr, up, down or del.
 * @param {Object} node - the node of the row, {attr, el} for an attribute.
 * @returns {void}
 */
export function runTreeAction(action, node) {
    if (!isTreeCurrent()) return;
    if (STRUCTURE_ACTIONS.has(action) && !isWholeTreeNode(node)) { showToast(EXAMPLE_PART_NOTE); return; }
    if (action === 'child') addChild(node);
    else if (action === 'attr') addAttribute(node);
    else if (action === 'up') moveElement(node, -1);
    else if (action === 'down') moveElement(node, 1);
    else if (action === 'del') removeNode(node);
}

/**
 * Returns the edit that adds an empty child element after the element's last child.
 * @param {Object} element - the scanned element.
 * @param {string} child - the child element's code.
 * @returns {Array} the edit [from, to, text].
 */
function getAddChildEdit(element, child) {
    const indent = getIndentAt(element.start), unit = getIndentUnit();
    const children = getShownChildren(element);
    if (element.selfClose) return [getAttributesEnd(element), element.tagEnd, `>\n${indent}${unit}${child}\n${indent}</${element.name}>`];
    if (!children.length) return [element.tagEnd, element.closeStart >= 0 ? element.closeStart : element.tagEnd, `\n${indent}${unit}${child}\n${indent}`];
    const lastChild = children[children.length - 1];
    return [lastChild.end, lastChild.end, `\n${indent}${unit}${child}`];
}

/**
 * Adds a child element named like the last child element (else "item") and opens its name for editing.
 * @param {Object} element - the scanned element.
 * @returns {void}
 */
function addChild(element) {
    const lastElement = [...getShownChildren(element)].reverse().find(child => child.type === 'el');
    const name = lastElement ? lastElement.name : DEFAULT_CHILD_NAME;
    const edit = getAddChildEdit(element, `<${name}></${name}>`);
    const at = edit[0] + edit[2].indexOf('<' + name);
    const elementIndex = getElementCountBefore(at);
    if (applyEdits([edit], at)) startEditAfterRender(elementIndex, 'name');
}

/**
 * Adds an attribute with a free name and an empty value, and opens its name, then its value, for editing.
 * @param {Object} element - the scanned element.
 * @returns {void}
 */
function addAttribute(element) {
    let name = DEFAULT_ATTRIBUTE_NAME;
    for (let number = 2; element.attrs.some(attribute => attribute.name === name); number++) name = DEFAULT_ATTRIBUTE_NAME + number;
    const at = getAttributesEnd(element);
    const elementIndex = element.index, attributeIndex = element.attrs.length;
    if (applyEdits([[at, at, ` ${name}=""`]], at + 1)) {
        startEditAfterRender(elementIndex, 'aname', attributeIndex, () => startEditAfterRender(elementIndex, 'aval', attributeIndex));
    }
}

/**
 * Removes a node with its line (an attribute with the space before it); the root element stays.
 * @param {Object} node - the scanned node, or {attr, el}.
 * @returns {void}
 */
export function removeNode(node) {
    if (node.attr) {
        applyEdits([[node.attr.wsStart, node.attr.end, '']], node.attr.wsStart);
        showToast(`Attribute "${node.attr.name}" removed - "Undo" brings it back`);
        return;
    }
    if (node.type === 'el' && node.parent.type === 'doc') { showToast('The root element cannot be removed here - edit the code instead'); return; }
    const [from, to] = getLineRange(node);
    state.selectedPath = node.parent.type === 'el' ? getPath(node.parent) : '';
    applyEdits([[from, to, '']], from);
    showToast(node.type === 'el' ? `<${node.name}> removed - "Undo" brings it back` : 'Removed - "Undo" brings it back');
}

/**
 * Swaps an element with its neighbor element and selects it at its new place.
 * @param {Object} element - the scanned element.
 * @param {number} direction - -1 before the previous element, 1 after the next one.
 * @returns {void}
 */
function moveElement(element, direction) {
    const siblings = element.parent.children.filter(child => child.type === 'el');
    const neighbor = siblings[siblings.indexOf(element) + direction];
    if (!neighbor) { showToast(direction < 0 ? 'It is the first element already' : 'It is the last element already'); return; }
    const [first, second] = direction < 0 ? [neighbor, element] : [element, neighbor];
    const firstCode = state.code.slice(first.start, first.end), secondCode = state.code.slice(second.start, second.end);
    const between = state.code.slice(first.end, second.start);
    const firstIndex = first.index;
    const movedStart = first.start + secondCode.length + between.length;
    if (!applyEdits([[first.start, second.end, secondCode + between + firstCode]], direction < 0 ? first.start : movedStart)) return;
    const moved = direction < 0 ? state.model.els[firstIndex] : state.model.all.find(node => node.type === 'el' && node.start === movedStart);
    if (moved) selectNode(moved, { scroll: true });
}
