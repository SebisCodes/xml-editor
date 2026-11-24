/**
 * The controls of template placeholders (?template=) in the XML editor: the switch between the
 * example view and the template view in the tree's bar, the note when the example view could not
 * be made, and the "Placeholders" box at the bottom of the code (template-controls.js).
 * Without a template syntax none of them is there.
 */

import { state, elements, findElement } from './state.js?v=2';
import { TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { editRange } from './typing.js?v=5';
import { addHistoryStep } from './history.js?v=5';
import { renderPreview } from './preview.js?v=5';
import { startViewSwitch, showViewSwitch, showViewNote, createPlaceholderBox, getListedPlaceholders } from './template-controls.js?v=2';
import { getViewMode, setViewMode, isExampleViewFailed, getTemplateExamples } from './tree-views.js?v=1';

/** The box, once connected. */
let placeholderBox = null;
/** What the box lists: the examples it was drawn for, or the document's tags. */
let listedKey = null;

/**
 * Connects the switch of the views and the box; without a template syntax nothing.
 * @returns {void}
 */
export function startTemplateControls() {
    if (!TEMPLATE_SYNTAX) return;
    startViewSwitch(findElement('#view-switch'), mode => { setViewMode(mode); renderPreview(); });
    placeholderBox = createPlaceholderBox(findElement('#placeholder-box'), { syntax: TEMPLATE_SYNTAX, textarea: elements.codeArea, insertText: editCodeText });
}

/**
 * Replaces a range of the code as one undo step and selects a range afterwards; typing that
 * waits for its undo step gets it first.
 * @param {number} start - the start of the range.
 * @param {number} end - the end of the range.
 * @param {string} text - the new text.
 * @param {number} selectionStart - where the selection starts afterwards.
 * @param {number} selectionEnd - where it ends.
 * @returns {void}
 */
function editCodeText(start, end, text, selectionStart, selectionEnd) {
    clearTimeout(state.historyTimer);
    addHistoryStep();
    editRange(start, end, text, selectionStart, selectionEnd);
    clearTimeout(state.historyTimer);
    addHistoryStep();
}

/**
 * Shows the view chosen, the note when the example view could not be made, and the
 * placeholders in the box: the page's list, else the tags of the document.
 * @returns {void}
 */
export function renderTemplateControls() {
    if (!placeholderBox) return;
    showViewSwitch(findElement('#view-switch'), getViewMode());
    showViewNote(findElement('#view-note'), isExampleViewFailed());
    const listed = getListedPlaceholders(getTemplateExamples(), state.code, TEMPLATE_SYNTAX);
    if (listed.key === listedKey) return;
    listedKey = listed.key;
    placeholderBox.render(listed.placeholders);
}
