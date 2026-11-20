/**
 * The connections of the editor to the outside, set up once the document is shown:
 *   1. the AI Assistant: prompt and links (ai.js);
 *   2. WebMCP tools for a browser agent (mcp.js, mcp-actions.js);
 *   3. the AI status at the AI button (aistatus.js);
 *   4. "Open in another editor" (convert-to.js);
 *   5. webhook, embedding and ?src= (sync.js), last, as it may load a document at once.
 */

import { state, elements, services, translate } from './state.js?v=2';
import { createAi } from './ai.js?v=8';
import { createMcp } from './mcp.js?v=4';
import { createAiStatus } from './aistatus.js?v=8';
import { startConvert } from './convert-to.js?v=14';
import { createSync } from './sync.js?v=23';
import { store } from './files.js?v=8';
import { parseNodes } from './xml.js?v=6';
import { checkDocument } from './xml-check.js?v=3';
import { formatXml } from './xml-format.js?v=3';
import { getLineIndex, getColumnIndex } from './code-view.js?v=3';
import { readTreeNow } from './preview.js?v=3';
import { undo } from './history.js?v=3';
import { openDocument } from './documents.js?v=3';
import { receiveDocument, importExternalDocument } from './incoming.js?v=3';
import { runQueryTool, setTextByXpath, setAttributeByXpath, updateCodeText, showLine, getFileList, openFileByName, createFile } from './mcp-actions.js?v=3';
import { showToast } from './toast.js?v=2';

const PREFIX = 'xmleditor';

let aiStatus = null;
let aiAssistant = null;

/**
 * Sets up the AI Assistant, WebMCP, the AI status, the conversion to other editors and sync.js.
 * @returns {void}
 */
export function startAssistants() {
    aiAssistant = createAi({
        getState: getPromptState,
        receive: receiveLinkDocument,
        open: openStoredDocument,
        toast: showToast,
        remote: () => services.sync?.getAiSettings() || null,
        fetchKey: () => (services.sync ? services.sync.fetchKey() : Promise.resolve(null)),
        keyValid: () => !!services.sync?.hasValidKey(),
    });
    const agent = createMcp({
        onUse: addAgentUse, getState: getPromptState, problems: getProblemList,
        query: runQueryTool, setText: setTextByXpath, setAttribute: setAttributeByXpath,
        files: getFileList, openFile: openFileByName, newFile: createFile,
        receive: receiveDocument, replace: updateCodeText, showLine, undo,
    });
    aiStatus = createAiStatus({
        prefix: PREFIX, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => services.sync?.getAiSettings() || null, agent: () => agent,
    });
    startConvert({ editor: 'xml', code: () => state.code, name: () => state.name, toast: showToast, t: translate });
    services.sync = createSync({
        viewerAllow: '[data-fold]',
        onAiResult: () => aiStatus.addDelivery('page'),
        onAiEnd: () => aiStatus.resetDelivery(),
        prefix: PREFIX, editor: 'xml', word: 'document',
        tidy: formatCodeAsStep,
        current: () => ({ id: state.fileId, name: state.name, content: state.code, assets: {} }),
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getMeta(id)?.hook || null,
        setHookFor: setDocumentHook,
        onAi: () => aiAssistant?.refresh(),
    });
}

/**
 * Returns the problems with their line and column, for the prompt and WebMCP.
 * @returns {Object[]} the problems with line and col, 1-based.
 */
function getProblemList() {
    return state.result.problems.map(problem => ({ ...problem, line: getLineIndex(problem.pos) + 1, col: getColumnIndex(problem.pos) + 1 }));
}

/**
 * Returns what the prompt and the agent's get_document are made from.
 * @returns {Object} the code, name, documents, selected text, problems and the page's context.
 */
function getPromptState() {
    return {
        code: state.code, name: state.name, files: store.getSorted().map(entry => entry.name),
        sel: state.code.slice(elements.codeArea.selectionStart, elements.codeArea.selectionEnd),
        problems: getProblemList().map(problem => `line ${problem.line}, column ${problem.col}: ${problem.msg}`),
        context: services.sync?.getContext() || null,
    };
}

/**
 * Takes the document of an AI link and marks the delivery in the AI status. Resolves with
 * the id the document went into, which ai-tabs.js reports to the tab that sent it
 * (a command that returns a Promise).
 * @param {string} code - the document.
 * @param {string} mode - "add" or "set".
 * @param {Object} target - where it goes (incoming.js).
 * @returns {Promise<string>} the id of the document it went into.
 */
async function receiveLinkDocument(code, mode, target) {
    setTimeout(() => aiStatus.addDelivery('link'));
    await receiveDocument(code, mode, target);
    return state.fileId;
}

/**
 * Opens a stored document for "Open it here" of a link another tab took.
 * @param {string} id - the document's id.
 * @returns {boolean} true when it exists and was opened (a command that reports whether it took place).
 */
function openStoredDocument(id) {
    if (!store.getMeta(id)) return false;
    openDocument(id);
    return true;
}

/**
 * Marks an agent's tool call in the AI status and reads the tree of the current code.
 * @returns {void}
 */
function addAgentUse() {
    aiStatus.addDelivery('agent');
    readTreeNow();
}

/**
 * Returns the code tidied for ?tidy=1 and tidy: true in load; code that is not well-formed stays as it is.
 * @param {string} code - the code.
 * @returns {string} the formatted or unchanged code.
 */
function formatCodeAsStep(code) {
    const model = parseNodes(code);
    return checkDocument(model).doc ? formatXml(model) : code;
}

/**
 * Stores the webhook of a document (sync.js); a full storage is reported.
 * @param {string} id - the document's id.
 * @param {?Object} hook - the webhook, null to remove it.
 * @returns {void}
 */
function setDocumentHook(id, hook) {
    try { store.setFields(id, { hook }); } catch (error) { showToast('The browser storage is full'); }
}
