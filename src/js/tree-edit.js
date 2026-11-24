/**
 * Editing in the tree: a click on a name, an attribute value, a text, a comment or a CDATA
 * section makes it editable; Enter, Tab or leaving it writes the change into the code (one
 * undo step, special characters escaped for their place), Escape cancels. In the example view of
 * a template a part is edited in place only when it shows the text of the code itself; a part
 * with an example is edited in the code or in the template view.
 *
 * stopTreeEdit(true) runs these steps:
 *   1. read the edited text and make the part plain again;
 *   2. keep the old text when nothing changed or the code changed meanwhile;
 *   3. tell why a refused value (a name that is no XML name) is not used, else work out the
 *      edit of the code (tree-edit-changes.js);
 *   4. apply it as one undo step and go on with the next edit, if one follows.
 */

import { state, elements, isTreeCurrent } from './state.js?v=2';
import { getTreeEdit, getTreeEditRefusal } from './tree-edit-changes.js?v=4';
import { applyEdits } from './history.js?v=5';
import { selectNode } from './tree.js?v=5';
import { showToast } from './toast.js?v=2';
import { isCopiedTreePart, EXAMPLE_PART_NOTE } from './tree-views.js?v=1';

const MULTILINE_KINDS = ['text', 'comment', 'cdata'];
const SPELLCHECKED_KINDS = ['text', 'comment'];
const NO_BREAK_SPACE = / /g;

/**
 * The edit that is open in the tree.
 * @typedef {Object} TreeEdit
 * @property {HTMLElement} span - the part of the row being edited.
 * @property {Object} node - the node of the row.
 * @property {string} kind - what is edited: name, aname, aval, text, comment or cdata.
 * @property {number} ai - the place of the attribute in the element, -1 for others.
 * @property {string} before - the text shown before the edit.
 * @property {?function(): void} next - what to do after the edit was kept (the next edit).
 */

/** @type {?TreeEdit} */
let openEdit = null;
let isEditHintShown = false;

/**
 * Listens for the keys, leaving and pasting of an edit in the tree.
 * @returns {void}
 */
export function startTreeEditing() {
    elements.tree.addEventListener('keydown', handleEditKey);
    elements.tree.addEventListener('focusout', event => { if (openEdit && event.target === openEdit.span) stopTreeEdit(true); });
    elements.tree.addEventListener('paste', addPastedText, true);
}

/**
 * Tells whether an edit is open in the tree.
 * @returns {boolean} true while a part of the tree is being edited.
 */
export function isEditing() {
    return !!openEdit;
}

/**
 * Returns the text position under a point inside an element, from the boxes of its
 * characters. Unlike caretPositionFromPoint this also holds in pages shown with CSS zoom.
 * Beside the characters (right of a line's end, in the space between lines) the nearest
 * character within about a line counts, so a click right of a line's end lands at its end.
 * @param {HTMLElement} element - the element.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {?{node: Text, offset: number}} the place before the character under the point,
 *   or after it on its right half; null when no character of the element is that near.
 */
function findCharacterAt(element, x, y) {
    const ownerDocument = element.ownerDocument;
    const walker = ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = ownerDocument.createRange();
    let best = null, bestDistanceY = Infinity, bestDistanceX = Infinity;
    for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
        for (let index = 0; index < textNode.length; index++) {
            range.setStart(textNode, index);
            range.setEnd(textNode, index + 1);
            for (const box of range.getClientRects()) {
                const distanceY = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
                if (distanceY > box.height) continue;                                   // another line
                const place = { node: textNode, offset: x < box.left + box.width / 2 ? index : index + 1 };
                if (!distanceY && x >= box.left && x <= box.right) return place;
                const distanceX = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
                if (distanceY < bestDistanceY || (distanceY === bestDistanceY && distanceX < bestDistanceX)) {
                    bestDistanceY = distanceY;
                    bestDistanceX = distanceX;
                    best = place;
                }
            }
        }
    }
    return best;
}

/**
 * Returns a collapsed range at a text position.
 * @param {Node} node - the node.
 * @param {number} offset - the offset in it.
 * @returns {Range} the range.
 */
function createCaretRange(node, offset) {
    const range = document.createRange();
    range.setStart(node, offset);
    return range;
}

/**
 * Returns the caret position at a point: from the character boxes, else from the browser.
 * @param {HTMLElement} span - the part being edited.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {?Range} a range at the position, or null.
 */
function getCaretRangeAt(span, x, y) {
    const character = findCharacterAt(span, x, y);
    if (character) return createCaretRange(character.node, character.offset);
    const position = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
    if (position) return createCaretRange(position.offsetNode, position.offset);
    return document.caretRangeFromPoint?.(x, y);
}

/**
 * Makes a part of a row editable and puts the cursor at the clicked point.
 * @param {HTMLElement} span - the part (class "ed", with data-ed and data-a).
 * @param {Object} node - the node of the row.
 * @param {?number} x - the click's x, null to select the whole text.
 * @param {?number} y - the click's y.
 * @param {boolean} [selectAll] - select the whole text.
 * @param {?function(): void} [next] - what to do after the edit was kept.
 * @returns {void}
 */
export function startTreeEdit(span, node, x, y, selectAll = false, next = null) {
    if (openEdit) return;
    if (!isTreeCurrent()) { showToast('This changed in the code - wait for the tree, then try again'); return; }
    const kind = span.dataset.ed;
    if (!isCopiedTreePart(node, kind, span.dataset.a != null ? +span.dataset.a : -1, span.textContent)) { showToast(EXAMPLE_PART_NOTE); return; }
    openEdit = { span, node, kind, ai: span.dataset.a != null ? +span.dataset.a : -1, before: span.textContent, next };
    span.contentEditable = 'plaintext-only';
    if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
    span.spellcheck = SPELLCHECKED_KINDS.includes(kind);
    span.classList.add('edit');
    span.focus({ preventScroll: true });
    setCaret(span, selectAll || x == null ? null : getCaretRangeAt(span, x, y));
    if (!isEditHintShown) {
        isEditHintShown = true;
        showToast('Editing in the tree - Enter keeps it, Escape cancels');
    }
}

/**
 * Puts the cursor into the edited part, or selects all of it.
 * @param {HTMLElement} span - the part being edited.
 * @param {?Range} caret - the cursor's place, null to select everything.
 * @returns {void}
 */
function setCaret(span, caret) {
    const range = document.createRange();
    if (caret && span.contains(caret.startContainer)) {
        range.setStart(caret.startContainer, caret.startOffset);
        range.collapse(true);
    } else range.selectNodeContents(span);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Ends the open edit in the tree.
 * @param {boolean} keep - write the change into the code (false: cancel).
 * @returns {void}
 */
export function stopTreeEdit(keep) {
    const edit = openEdit;
    if (!edit) return;
    openEdit = null;
    const { span, before } = edit;
    const value = span.textContent.replace(NO_BREAK_SPACE, ' ');
    span.removeAttribute('contenteditable');
    span.classList.remove('edit');
    if (!keep || value === before) {
        span.textContent = before;
        if (keep && edit.next) edit.next();
        return;
    }
    if (!isTreeCurrent()) { span.textContent = before; showToast('The code changed meanwhile - the edit was not used'); return; }
    const refusal = getTreeEditRefusal(edit, value);
    if (refusal) { span.textContent = before; showToast(refusal); return; }
    const change = getTreeEdit(edit, value);
    if (!change) { span.textContent = before; return; }
    applyEdits(change.edits, change.cursor);
    if (edit.next) edit.next();
}

/**
 * Handles the keys of an open edit: Enter keeps it (Shift+Enter is a line break in texts,
 * comments and CDATA), Tab keeps it, Escape cancels it.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleEditKey(event) {
    if (!openEdit || event.target !== openEdit.span) return;
    const isMultiline = MULTILINE_KINDS.includes(openEdit.kind);
    if (event.key === 'Enter' && !(event.shiftKey && isMultiline)) { event.preventDefault(); stopTreeEdit(true); } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        stopTreeEdit(false);
    } else if (event.key === 'Tab') { event.preventDefault(); stopTreeEdit(true); }
}

/**
 * Pastes only the plain text of the clipboard into an open edit.
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function addPastedText(event) {
    if (!openEdit || !openEdit.span.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
}

/**
 * Opens the editable part of an element row after the tree was drawn anew.
 * @param {number} elementIndex - the element's place among all elements.
 * @param {string} kind - the part: name, aname or aval.
 * @param {number} [attributeIndex] - the attribute's place, -1 for the element's name.
 * @param {?function(): void} [next] - what to do after the edit was kept.
 * @returns {void}
 */
export function startEditAfterRender(elementIndex, kind, attributeIndex = -1, next = null) {
    const element = state.model.els[elementIndex];
    if (!element) return;
    selectNode(element, { scroll: true });
    const row = elements.tree.querySelector(`li[data-n="${element.id}"]`);
    const span = row && row.querySelector(`:scope > .row .ed[data-ed="${kind}"]${attributeIndex >= 0 ? `[data-a="${attributeIndex}"]` : ''}`);
    if (span) startTreeEdit(span, element, null, null, true, next);
}
