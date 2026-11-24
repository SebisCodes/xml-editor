/**
 * The open document among "My documents" (files.js): opening one (each keeps its own undo
 * history while the page is open), making a new one from "New" or a template, starting the
 * open one over, renaming and deleting.
 *
 * openDocument() runs these steps:
 *   1. save what typing left waiting and keep the undo history of the document that closes;
 *   2. take the code, name and undo history of the document that opens;
 *   3. forget the selection and the folds, put the code at its start;
 *   4. draw it and show its name, in the dialog and to the page around the editor.
 */

import { state, elements, services, findElement } from './state.js?v=2';
import { store } from './files.js?v=8';
import { START, TEMPLATES } from './samples.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { setCode, addHistoryStep, updateHistoryButtons, applyEdits } from './history.js?v=4';
import { saveWaiting, setSavedCode } from './autosave.js?v=4';
import { showToast } from './toast.js?v=2';

const DEFAULT_NAME = 'Document';
const EMPTY_ROOT_CONTENT = '\n  \n';  // a root element started over: one empty, indented line
const BLANK_DOCUMENT = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  \n</root>\n';
const STORAGE_FULL = 'The browser storage is full - delete or download documents under "My documents" first';

/** Document id -> its undo history while the page is open. */
const documentHistories = new Map();

/**
 * Returns the code of a new empty document: the XML declaration and an empty root element.
 * @returns {string} the code.
 */
export function getBlankDocument() {
    return BLANK_DOCUMENT;
}

/**
 * Shows the name of the open document in the bar, the tooltip of "My documents" and the "New" menu.
 * @returns {void}
 */
export function showFileName() {
    findElement('#file-name').textContent = state.name;
    findElement('#btn-files').title = `"${state.name}" is open. My documents: open, rename, duplicate or delete your documents (Ctrl+O)`;
    findElement('#new-restart b').textContent = `Start "${state.name}" over`;
}

/**
 * Opens a document from "My documents".
 * @param {string} id - the document's id.
 * @param {string} [code] - its code, read from the store when omitted.
 * @returns {void}
 */
export function openDocument(id, code) {
    saveClosingDocument();
    const openedCode = code ?? store.code(id) ?? BLANK_DOCUMENT;
    state.fileId = id;
    state.name = store.getMeta(id)?.name || DEFAULT_NAME;
    setSavedCode(openedCode);
    const history = documentHistories.get(id);
    state.history = history ? history.history : [];
    state.future = history ? history.future : [];
    resetView(openedCode);
    setCode(openedCode, { history: false });
    addHistoryStep();
    updateHistoryButtons();
    showFileName();
    services.files.render();
    services.sync?.updateUi();
}

/**
 * Saves what the document that closes still waits for and keeps its undo history.
 * @returns {void}
 */
function saveClosingDocument() {
    clearTimeout(state.historyTimer);
    saveWaiting();
    if (!state.fileId) return;
    addHistoryStep();
    documentHistories.set(state.fileId, { history: state.history, future: state.future });
}

/**
 * Forgets the selection and the folds and puts the code, the cursor and the tree at their start.
 * @param {string} code - the code of the document that opens.
 * @returns {void}
 */
function resetView(code) {
    state.selected = null;
    state.selectedPath = '';
    state.folds = new Map();
    state.openDepth = Infinity;
    state.isFoldDepthSet = false;
    elements.codeArea.value = code;
    elements.codeArea.scrollTop = 0;
    elements.codeArea.setSelectionRange(0, 0);
    elements.scroller.scrollTop = 0;
}

/**
 * Creates a document in "My documents" and opens it right away. Returns the new id, null
 * when it did not take place, so the caller can go on with that document.
 * @param {string} name - the name wanted (made unique).
 * @param {string} code - its code.
 * @param {boolean} [inMemory] - keep it in memory only (a page's document), never stored.
 * @returns {?string} the new document's id, or null when the storage is full (with a message).
 */
export function createDocument(name, code, inMemory = false) {
    let id;
    try { id = store.create(name, code, inMemory); } catch (error) {
        showToast(STORAGE_FULL);
        return null;
    }
    openDocument(id, code);
    return id;
}

/**
 * Makes a new document from the "New" menu: the example, a template or an empty one;
 * "restart" starts the open document over.
 * @param {string} kind - "restart", "example", a template key or "blank".
 * @returns {void}
 */
export function createFromMenu(kind) {
    if (kind === 'restart') { startOver(); return; }
    const template = kind === 'example' ? START : TEMPLATES[kind];
    if (createDocument(template ? template.name : DEFAULT_NAME, template ? template.code : BLANK_DOCUMENT)) showToast(`New document "${state.name}" - your other documents are under "My documents"`);
}

/**
 * Empties the root element of the open document after asking; the declaration, the DOCTYPE
 * and the root's start tag stay. One undo step.
 * @returns {Promise<void>} resolves when the question is answered.
 */
async function startOver() {
    const root = state.model && state.model.els[0];
    const emptied = root && !root.selfClose ? state.code.slice(0, root.tagEnd) + EMPTY_ROOT_CONTENT + `</${root.name}>\n` : '';
    if (state.code === emptied) { showToast('This document is empty already'); return; }
    const documentId = state.fileId;
    const confirmed = await openConfirmation({
        title: `Start "${state.name}" over?`,
        text: root ? 'Everything inside the root element is removed; the declaration and the root element stay. "Undo" brings it back as long as the page is open.' : 'Everything is removed. "Undo" brings it back as long as the page is open.',
        ok: 'Start over',
    });
    if (!confirmed || state.fileId !== documentId) return;    // another document was opened while the question was open
    applyEdits([[0, state.code.length, emptied]], root ? root.tagEnd + EMPTY_ROOT_CONTENT.length - 1 : 0);
    showToast(`"${state.name}" is empty now - "Undo" brings it back`);
}

/**
 * Opens a document chosen in "My documents" and says so.
 * @param {string} id - the document's id.
 * @returns {void}
 */
export function openChosenDocument(id) {
    openDocument(id);
    showToast(`"${state.name}" opened`);
}

/**
 * Renames a document; the open one shows its new name at once.
 * @param {string} id - the document's id.
 * @param {string} name - the new name (unique already).
 * @returns {void}
 */
export function renameDocument(id, name) {
    try { store.write(id, { name }); } catch (error) { showToast('The browser storage is full'); return; }
    if (id !== state.fileId) return;
    state.name = name;
    showFileName();
    services.sync?.handleChange();
}

/**
 * Forgets a deleted document's undo history; when it was open, the newest other document
 * opens (or a new empty one).
 * @param {string} id - the deleted document's id.
 * @returns {void}
 */
export function closeDeletedDocument(id) {
    documentHistories.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const newest = store.getSorted()[0];
    if (newest) openDocument(newest.id);
    else createDocument(DEFAULT_NAME, BLANK_DOCUMENT);
}
