/**
 * Documents that arrive from outside: AI links and pasted AI answers (ai.js), WebMCP
 * (mcp.js), the page around the editor and ?src= (sync.js). An AI's document goes into the
 * document its link names, a new one or the open one; "add" appends its elements to the
 * root element. A page's document replaces only the document of that name that came from
 * the same page, never the user's own.
 */

import { state, elements } from './state.js?v=2';
import { VIEWER } from './sync.js?v=25';
import { parseCodeNodes, TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { store } from './files.js?v=8';
import { applyEdits } from './history.js?v=5';
import { openDocument, createDocument, getBlankDocument } from './documents.js?v=5';
import { showToast } from './toast.js?v=2';

const AI_DOCUMENT_NAME = 'AI document';
const DEFAULT_UNIT = '  ';

/**
 * Where an AI's document goes.
 * @typedef {Object} DocumentTarget
 * @property {string} [file] - "new" for a new document, a name for that document, empty for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * A document from the page around the editor or from ?src= (sync.js).
 * @typedef {Object} ExternalDocument
 * @property {string} name - its name.
 * @property {string} content - its code.
 * @property {string} [into] - the id of the page's document to replace.
 * @property {boolean} [asNew] - always a new document.
 * @property {string} [page] - the origin of the page it came from.
 * @property {boolean} [temp] - kept in memory only, never stored.
 */

/**
 * Returns the code with a fragment appended to its root element (mode "add"), indented
 * like the root's children; without a closed root element the fragment goes at the end.
 * @param {string} code - the document's code.
 * @param {string} fragment - the elements to append.
 * @returns {string} the new code.
 */
function getCodeWithFragment(code, fragment) {
    const root = parseCodeNodes(code, TEMPLATE_SYNTAX).els[0];
    if (!root || root.unclosed) return code.replace(/\s*$/, '\n') + fragment.trim() + '\n';
    const lineStart = code.lastIndexOf('\n', root.start - 1) + 1;
    const indent = /^[ \t]*/.exec(code.slice(lineStart))[0];
    const unitMatch = /\n([ \t]+)</.exec(code);
    const unit = unitMatch ? unitMatch[1].slice(indent.length) || DEFAULT_UNIT : DEFAULT_UNIT;
    const body = fragment.trim().split('\n').map(line => indent + unit + line).join('\n');
    if (root.selfClose) {
        const attributesEnd = root.attrs.length ? root.attrs[root.attrs.length - 1].end : root.nameEnd;
        return code.slice(0, attributesEnd) + `>\n${body}\n${indent}</${root.name}>` + code.slice(root.tagEnd);
    }
    const children = root.children.filter(child => !(child.type === 'text' && !code.slice(child.start, child.end).trim()));
    if (!children.length) return code.slice(0, root.tagEnd) + `\n${body}\n${indent}` + code.slice(root.closeStart);
    const lastChild = children[children.length - 1];
    return code.slice(0, lastChild.end) + '\n' + body + code.slice(lastChild.end);
}

/**
 * Takes a document from an AI: into the document the target names (made when there is
 * none), a new one, or the open one; one undo step, no question asked.
 * @param {string} code - the document's code, or the elements to add.
 * @param {string} mode - "add" appends the elements to the root element, otherwise the code replaces the document.
 * @param {DocumentTarget} [target] - where it goes.
 * @returns {Promise<void>} resolves when it is in the editor.
 */
export async function receiveDocument(code, mode, target = {}) {
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const found = isNew ? null : wanted ? store.findByName(wanted) : store.getMeta(state.fileId);
    if (!found) {
        const name = isNew ? target.name || AI_DOCUMENT_NAME : wanted || AI_DOCUMENT_NAME;
        if (createDocument(name, mode === 'add' ? getCodeWithFragment(getBlankDocument(), code) : code) && !VIEWER) showToast(`New document "${state.name}" from the AI - your other documents are unchanged`);
        return;
    }
    if (found.id !== state.fileId) openDocument(found.id);
    applyEdits([[0, state.code.length, mode === 'add' ? getCodeWithFragment(state.code, code) : code]], 0);
    if (VIEWER) return;
    const errorCount = state.result.problems.filter(problem => problem.kind === 'error').length;
    showToast(errorCount ? `Document received - the editor found ${errorCount} ${errorCount === 1 ? 'problem' : 'problems'}, see above the code` : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Loads a document from the page around the editor or from ?src=: it replaces the
 * document of that name that came from the same page before (one undo step) or becomes a
 * new one. The user's own documents are never replaced.
 * @param {ExternalDocument} external - the document and where it came from.
 * @returns {Promise<void>} resolves when it is open.
 */
export async function importExternalDocument({ name, content, into, asNew, page, temp }) {
    const found = asNew ? null : (into && store.getMeta(into)) || store.list().find(entry => entry.name === name && entry.page && entry.page === page && !!entry.temp === !!temp);
    if (found) {
        if (found.id !== state.fileId) openDocument(found.id);
        if (content !== state.code) applyEdits([[0, state.code.length, content]], 0);
    } else {
        const id = createDocument(name, content, !!temp);
        if (id && page) try { store.setFields(id, { page }); } catch (error) { /* storage full: it just is not recognized next time */ }
    }
    elements.codeArea.setSelectionRange(0, 0);
    elements.codeArea.scrollTop = 0;
    elements.scroller.scrollTop = 0;
}
