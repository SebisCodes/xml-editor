/**
 * Questions about the scanned nodes of the open document that the tree, the panel and the
 * edits share: what a node shows, whether an element is open, where things are in the code
 * and how the document is indented.
 */

import { state } from './state.js?v=2';
import { expandEntities } from './xml.js?v=6';

const DEFAULT_UNIT = '  ';
const TAB_UNIT = '\t';
const FOUR_SPACES = '    ';

/**
 * Returns the text of a node with its entities resolved and its white space trimmed.
 * @param {Object} node - a scanned text node.
 * @returns {string} the text.
 */
export function getNodeText(node) {
    return expandEntities(state.code.slice(node.start, node.end)).text.trim();
}

/**
 * Returns the children of an element that the tree shows (all but blank texts).
 * @param {Object} element - a scanned element or the document.
 * @returns {Object[]} the children.
 */
export function getShownChildren(element) {
    return element.children.filter(child => !(child.type === 'text' && !state.code.slice(child.start, child.end).trim()));
}

/**
 * Tells whether an element is shown in one row: it has no children, or only one text.
 * @param {Object} element - a scanned element.
 * @returns {boolean} true for a leaf.
 */
export function isLeaf(element) {
    const children = getShownChildren(element);
    return !children.length || (children.length === 1 && children[0].type === 'text');
}

/**
 * Tells whether an element is unfolded in the tree: as the user set it, else by its depth.
 * @param {Object} element - a scanned element.
 * @returns {boolean} true when its children are shown.
 */
export function isOpen(element) {
    return state.folds.get(element.path) ?? element.depth < state.openDepth;
}

/**
 * Returns the node whose row shows a node: an attribute and the text of an element shown
 * in one line are in the element's row.
 * @param {Object} node - a scanned node, or {attr, el}.
 * @returns {Object} the node that has the row.
 */
export function getRowNode(node) {
    if (node.attr) return node.el;
    return node.type === 'text' && node.parent.type === 'el' && isLeaf(node.parent) ? node.parent : node;
}

/**
 * Returns where a new attribute of an element goes: after its last attribute, else after its name.
 * @param {Object} element - a scanned element.
 * @returns {number} an offset in the code.
 */
export function getAttributesEnd(element) {
    return element.attrs.length ? element.attrs[element.attrs.length - 1].end : element.nameEnd;
}

/**
 * Returns the indentation unit of the document: a tab, four or two spaces, or what the
 * first indented tag uses; two spaces when it has none.
 * @returns {string} one level of indentation.
 */
export function getIndentUnit() {
    const match = /\n([ \t]+)</.exec(state.code);
    if (!match) return DEFAULT_UNIT;
    const indent = match[1];
    if (indent[0] === '\t') return TAB_UNIT;
    if (indent.length >= 4 && indent.length % 4 === 0) return FOUR_SPACES;
    return indent.length % 2 === 0 ? DEFAULT_UNIT : indent;
}

/**
 * Returns the white space at the start of the line a position is on.
 * @param {number} pos - an offset in the code.
 * @returns {string} the white space before the position when only white space is before it,
 *   else the white space at the start of the line.
 */
export function getIndentAt(pos) {
    const lineStart = state.code.lastIndexOf('\n', pos - 1) + 1;
    const before = state.code.slice(lineStart, pos);
    return /^[ \t]*$/.test(before) ? before : (/^[ \t]*/.exec(before) || [''])[0];
}

/**
 * Returns how many elements start before a position (the place of an element that starts there).
 * @param {number} pos - an offset in the code.
 * @returns {number} the number of elements.
 */
export function getElementCountBefore(pos) {
    return state.model.els.filter(element => element.start < pos).length;
}

/**
 * Returns the range of a node with its own line, when it stands on a line by itself.
 * @param {Object} node - a scanned node.
 * @returns {number[]} [from, to] of the whole line with its line break, or of the node.
 */
export function getLineRange(node) {
    const code = state.code;
    const lineStart = code.lastIndexOf('\n', node.start - 1) + 1;
    let lineEnd = code.indexOf('\n', node.end);
    if (lineEnd < 0) lineEnd = code.length;
    if (!code.slice(lineStart, node.start).trim() && !code.slice(node.end, lineEnd).trim()) return [lineStart, Math.min(lineEnd + 1, code.length)];
    return [node.start, node.end];
}
