/**
 * The state of the editor that every area shares: the open document with its tree, the
 * selection, search and undo history (state), the elements of the page the areas draw
 * into (elements), and the services app.js sets up at the start (services).
 * The test hook window.xmlEditor hands out `state`; the tests read code, name, fileId,
 * history and result from it.
 */

const NARROW_SCREEN = '(max-width: 860px)';

/**
 * The open document and what is shown of it.
 * @typedef {Object} EditorState
 * @property {string} code - the code of the open document, the single source of truth.
 * @property {?Object} model - the scanned nodes of the code (xml.js), null before the first read.
 * @property {{doc: ?XMLDocument, problems: Object[]}} result - the parsed document and the problems.
 * @property {?Object} linker - maps nodes of the parsed document to scanned nodes (xml-paths.js).
 * @property {{map: Object<string, string>, fn: function(string): ?string}} namespaces - the prefixes for XPath.
 * @property {?Object} selected - the selected node, {attr, el} for an attribute, or null.
 * @property {string} selectedPath - the XPath of the selected node, to find it again after a change.
 * @property {Map<string, boolean>} folds - element path -> open (true) or folded (false), as the user set it.
 * @property {number} openDepth - elements shallower than this are open unless the user folded them.
 * @property {boolean} isFoldDepthSet - the open depth of a large document was set for this document.
 * @property {string} search - the search text, lower case.
 * @property {Set<number>} found - the ids of the rows the search found.
 * @property {string} query - the text of the XPath field.
 * @property {Object[]} hits - the nodes the XPath selects.
 * @property {string} hitInfo - what the XPath gave: the number of matches, a value or an error.
 * @property {number} hitIndex - the match the arrows are on, -1 for none.
 * @property {number} split - the share of the width the code takes beside the tree.
 * @property {string} name - the name of the open document.
 * @property {string} fileId - the id of the open document in "My documents", "" when it is not stored.
 * @property {{code: string, sel: number}[]} history - the undo steps, the last one is the current code.
 * @property {{code: string, sel: number}[]} future - the redo steps.
 * @property {number} historyTimer - the timer that makes typing an undo step after a pause.
 * @property {boolean} showProblems - whether the list of problems is open.
 */

/** @type {EditorState} */
export const state = {
    code: '', model: null, result: { doc: null, problems: [] }, linker: null, namespaces: { map: {}, fn: () => null },
    selected: null, selectedPath: '', folds: new Map(), openDepth: Infinity, isFoldDepthSet: false,
    search: '', found: new Set(), query: '', hits: [], hitInfo: '', hitIndex: -1,
    split: 0.45,
    name: 'Document', fileId: '',
    history: [], future: [], historyTimer: 0,
    showProblems: true,
};

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {?Element} the element, or null.
 */
export function findElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {Element[]} the elements in document order.
 */
export function findElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/** The elements of the page the editor draws into. */
export const elements = {
    codeArea: findElement('#code'), highlight: findElement('#hl'), marks: findElement('#marks'), gutter: findElement('#gutter'),
    status: findElement('#code-status'), problems: findElement('#code-error'),
    stage: findElement('#stage'), scroller: findElement('#scroller'), tree: findElement('#tree'), path: findElement('#path'),
    nodePanel: findElement('#node-wrap'), insertPanel: findElement('#insert-wrap'), convertPanel: findElement('#convert-wrap'),
    search: findElement('#tree-search'), xpath: findElement('#xpath'), hitInfo: findElement('#hit-info'),
    work: findElement('#work'), toast: findElement('#toast'),
};

/**
 * The services app.js sets up at the start; null until then.
 * @typedef {Object} EditorServices
 * @property {?Object} i18n - the interface language (i18n.js).
 * @property {?Object} lineWrap - the wrapped rows of the code view (wrap.js).
 * @property {?Object} sync - webhook and embedding (sync.js).
 * @property {?Object} files - the "My documents" dialog (files.js).
 */

/** @type {EditorServices} */
export const services = { i18n: null, lineWrap: null, sync: null, files: null };

const narrowScreen = matchMedia(NARROW_SCREEN);

/**
 * Tells whether the screen is narrow: code, tree and panel are then shown one at a time.
 * @returns {boolean} true on a narrow screen.
 */
export function isNarrow() {
    return narrowScreen.matches;
}

/**
 * Returns an on-screen text in the page's language.
 * @param {string} text - the English text.
 * @returns {string} the text from the language pack, or the English text.
 */
export function translate(text) {
    return services.i18n ? services.i18n.translate(text) : text;
}

/**
 * Tells whether the tree is read from the code as it is now (typing reads it after a pause).
 * @returns {boolean} true when the scanned nodes belong to the current code.
 */
export function isTreeCurrent() {
    return !!state.model && state.model.src === state.code;
}
