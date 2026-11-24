/**
 * Changes of the code and their undo history. Every change from the tree, the panel or a
 * tool is one edit of the code and one undo step; typing becomes an undo step after a pause.
 *
 * setCode() runs these steps:
 *   1. give typing that waits for its undo step that step first;
 *   2. put the code into the textarea, keeping its scroll position and selection;
 *   3. read the tree again and draw everything (preview.js);
 *   4. add the undo step, save, and tell the page around the editor (sync.js).
 */

import { state, elements, services, findElement } from './state.js?v=2';
import { showToast } from './toast.js?v=2';
import { renderPreview } from './preview.js?v=5';
import { showInCode } from './code-view.js?v=5';
import { saveDocument } from './autosave.js?v=5';

const HISTORY_LIMIT = 300;              // undo steps kept per document

/**
 * One change of the code: replace the text from `from` to `to` by `text`.
 * @typedef {Array} CodeEdit
 * @property {number} 0 - from, an offset in the code.
 * @property {number} 1 - to, an offset in the code.
 * @property {string} 2 - the new text.
 */

/**
 * How setCode() treats the undo history.
 * @typedef {Object} SetCodeOptions
 * @property {boolean} [history] - add an undo step (true by default).
 */

/**
 * Sets the code of the open document and draws it.
 * @param {string} code - the new code.
 * @param {SetCodeOptions} [options] - history: false for undo and redo, which move in the history themselves.
 * @returns {void}
 */
export function setCode(code, { history = true } = {}) {
    const codeArea = elements.codeArea;
    const scrollTop = codeArea.scrollTop, scrollLeft = codeArea.scrollLeft;
    const selectionStart = codeArea.selectionStart, selectionEnd = codeArea.selectionEnd;
    // Typing still waiting for its undo step gets it first, so Undo after this change goes back to that text.
    if (history && state.historyTimer) { clearTimeout(state.historyTimer); state.historyTimer = 0; addHistoryStep(); }
    state.code = code;
    if (codeArea.value !== code) {
        codeArea.value = code;
        codeArea.scrollTop = scrollTop;
        codeArea.scrollLeft = scrollLeft;
        if (document.activeElement === codeArea) codeArea.setSelectionRange(Math.min(selectionStart, code.length), Math.min(selectionEnd, code.length));
    }
    renderPreview();
    if (history) addHistoryStep();
    saveDocument();
    services.sync?.handleChange();
}

/**
 * Applies edits to the code as one undo step. Returns whether the code changed, so the
 * caller can go on with the changed tree (CQS exception: a command that reports whether it
 * took place).
 * @param {CodeEdit[]} edits - the edits, not overlapping, in any order.
 * @param {number} [cursor] - where the cursor goes afterwards; left as it is when omitted.
 * @returns {boolean} true when the code changed.
 */
export function applyEdits(edits, cursor) {
    let code = state.code;
    for (const [from, to, text] of [...edits].sort((first, second) => second[0] - first[0])) code = code.slice(0, from) + text + code.slice(to);
    if (code === state.code) return false;
    clearTimeout(state.historyTimer);
    if (getLastStep()?.code !== state.code) addHistoryStep();
    setCode(code);
    if (cursor != null) {
        elements.codeArea.setSelectionRange(cursor, cursor);
        showInCode(cursor, false);
    }
    return true;
}

/**
 * Returns the last undo step.
 * @returns {{code: string, sel: number}|undefined} the step, or undefined when there is none.
 */
function getLastStep() {
    return state.history[state.history.length - 1];
}

/**
 * Enables the Undo and Redo buttons when there is something to undo or redo.
 * @returns {void}
 */
export function updateHistoryButtons() {
    const lastStep = getLastStep();
    findElement('#btn-undo').disabled = !(state.history.length > 1 || (lastStep && lastStep.code !== state.code));
    findElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Adds the current code as an undo step; the same code only moves the step's cursor.
 * @returns {void}
 */
export function addHistoryStep() {
    const lastStep = getLastStep();
    const cursor = elements.codeArea.selectionStart;
    if (lastStep && lastStep.code === state.code) { lastStep.sel = cursor; return; }
    state.history.push({ code: state.code, sel: cursor });
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.future = [];
    updateHistoryButtons();
}

/**
 * Goes back one undo step.
 * @returns {void}
 */
export function undo() {
    clearTimeout(state.historyTimer);
    if (getLastStep()?.code !== state.code) addHistoryStep();
    if (state.history.length < 2) { showToast('Nothing to undo'); return; }
    state.future.push(state.history.pop());
    const step = getLastStep();
    setCode(step.code, { history: false });
    if (step.sel != null) elements.codeArea.setSelectionRange(Math.min(step.sel, state.code.length), Math.min(step.sel, state.code.length));
}

/**
 * Goes forward one undone step.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast('Nothing to redo'); return; }
    state.history.push(step);
    setCode(step.code, { history: false });
}

/**
 * Makes the typing of the last moments an undo step after a pause.
 * @param {number} delay - milliseconds to wait.
 * @returns {void}
 */
export function startHistoryStep(delay) {
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(addHistoryStep, delay);
}
