/**
 * XML editor: code on the left, the element tree in the middle, the selected node,
 * ready-made pieces and conversions on the right.
 *
 * The code is the single source of truth: the tree is made from it (xml.js), and every
 * change in the tree is written into the code as a small edit that keeps the rest of its
 * formatting - one undo step each. Every row of the tree knows its node's place in the
 * code, so a click in the tree leads to the code and the cursor in the code to the tree.
 *
 * This file starts the editor and wires its areas:
 *   1. the interface language (i18n.js) and the wrapped rows of the code view (wrap.js);
 *   2. the areas: saving, code view, tree, editing in the tree, search, problems, typing,
 *      side panel, bar, files, keyboard, layout, export, the controls of template
 *      placeholders, and "My documents";
 *   3. the document that was open last (the first visit gets the example);
 *   4. AI Assistant, WebMCP, AI status, other editors and sync.js (assistants.js);
 *   5. the hook window.xmlEditor for the automated tests.
 */

import { createI18n } from './i18n.js?v=23';
import { createWrap } from './wrap.js?v=5';
import './export-menu.js?v=6';
import { state, elements, services } from './state.js?v=2';
import { store, createFiles } from './files.js?v=8';
import { START } from './samples.js?v=3';
import { startAutosave, getStoredSettings, setSavedCode } from './autosave.js?v=4';
import { startCodeView, renderCode, syncLayerScroll, showInCode } from './code-view.js?v=4';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=4';
import { renderPreview, findNodeByPath } from './preview.js?v=4';
import { createTreeArea, renderTree, selectNode } from './tree.js?v=4';
import { startTreeEditing } from './tree-edit.js?v=4';
import { startSearch, findByXpath } from './search.js?v=4';
import { startProblems } from './problems.js?v=4';
import { startTyping } from './typing.js?v=4';
import { startNodePanel } from './node-panel.js?v=4';
import { startInsertPanel } from './insert-panel.js?v=4';
import { startConvertPanel } from './conversion-panel.js?v=4';
import { startToolbar } from './toolbar.js?v=4';
import { startFileInput, openFileDialog } from './file-input.js?v=4';
import { startKeyboard } from './keyboard.js?v=4';
import { startLayout, showSplit } from './layout.js?v=4';
import { startExport } from './export-dialog.js?v=4';
import { showFileName, openChosenDocument, createFromMenu, renameDocument, closeDeletedDocument } from './documents.js?v=4';
import { receiveDocument } from './incoming.js?v=4';
import { startAssistants } from './assistants.js?v=4';
import { showToast } from './toast.js?v=2';
import { startTemplateControls } from './template-panel.js?v=1';

const PREFIX = 'xmleditor';
const GERMAN = 'de';

/* The interface in the page's language (i18n.js); the AI prompt stays English. The call is
   written out in full: the language page builder reads it from this file. */
const i18n = createI18n({
    prefix: 'xmleditor',
    roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog',
    skip: '',
});
services.i18n = i18n;
startEditor();

/**
 * Starts the editor: its areas, the last open document, the assistants and the test hook.
 * @returns {void}
 */
function startEditor() {
    services.lineWrap = createWrap({ prefix: PREFIX, ta: elements.codeArea, layers: [elements.highlight, elements.marks], gutter: elements.gutter, button: document.getElementById('btn-wrap'), onChange: updateCodeView });
    startAreas();
    services.files = createFiles({
        current: () => ({ id: state.fileId, name: state.name, code: state.code }),
        open: openChosenDocument, create: createFromMenu, rename: renameDocument, removed: closeDeletedDocument,
        importFile: openFileDialog, toast: showToast,
    });
    showStartDocument();
    startAssistants();
    // The placeholders of the tree come from the dictionary once it is there.
    i18n.ready.then(() => { if (i18n.lang === GERMAN) renderTree(); });
    window.xmlEditor = { state, store, setCode, undo, redo, receive: receiveDocument, showInCode, sync: getSync, select: selectByPath, query: findByXpath };
}

/**
 * Sets up the areas of the editor; each listens for its own elements.
 * @returns {void}
 */
function startAreas() {
    startAutosave();
    startCodeView();
    createTreeArea();
    startTreeEditing();
    startSearch();
    startProblems();
    startTyping();
    startNodePanel();
    startConvertPanel();
    startToolbar();
    startFileInput();
    startKeyboard();
    startLayout();
    startExport();
    startTemplateControls();
}

/**
 * Draws the code again when wrapping is switched or the code view gets a new width.
 * @returns {void}
 */
function updateCodeView() {
    renderCode();
    syncLayerScroll();
}

/**
 * Shows the document that was open last, with the remembered split; the first visit gets
 * the example. With storage blocked, the example opens without being saved.
 * @returns {void}
 */
function showStartDocument() {
    const settings = getStoredSettings();
    if (settings && settings.split) state.split = settings.split;
    showSplit();
    saveExampleOnFirstVisit();
    const start = getStartDocument(settings);
    if (start) {
        state.fileId = start.entry.id;
        state.name = start.entry.name;
        setSavedCode(start.code);
    } else state.name = START.name;
    state.code = start ? start.code : START.code;
    elements.codeArea.value = state.code;
    showFileName();
    startInsertPanel();
    renderPreview();
    addHistoryStep();
    syncLayerScroll();
}

/**
 * Stores the example as the first document when there are no documents yet.
 * @returns {void}
 */
function saveExampleOnFirstVisit() {
    try {
        if (!store.list().length) store.create(START.name, START.code);
    } catch (error) { /* Storage blocked: the example opens without being saved */ }
}

/**
 * Returns the document that was open last, or the newest one.
 * @param {?Object} settings - the stored settings.
 * @returns {?{entry: Object, code: string}} the document, or null when storage is blocked or there is none.
 */
function getStartDocument(settings) {
    try {
        const entry = store.getMeta(settings?.file) || store.getSorted()[0];
        const code = store.code(entry.id);
        return code == null ? null : { entry, code };
    } catch (error) { return null; }   // Storage blocked: one document without saving
}

/**
 * Returns sync.js's interface, for the tests.
 * @returns {?Object} the interface, null before it is set up.
 */
function getSync() {
    return services.sync;
}

/**
 * Selects the node with a path and shows it in the tree and the code, for the tests.
 * @param {string} path - the node's XPath.
 * @returns {void}
 */
function selectByPath(path) {
    selectNode(findNodeByPath(path), { reveal: true, scroll: true });
}
