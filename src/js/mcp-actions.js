/**
 * What the WebMCP tools (mcp.js) do in the editor: XPath queries, setting text and
 * attributes of the nodes an XPath selects, replacing text, showing a line and reaching the
 * user's other documents. Every change is one undo step. The tools answer an agent with a
 * text, so the functions that change something return that answer (the shape WebMCP
 * dictates for a tool's result).
 */

import { state, elements } from './state.js?v=2';
import { XML_NAME, escapeText, escapeAttribute } from './xml.js?v=7';
import { getPath } from './xml-paths.js?v=2';
import { getAttributesEnd } from './nodes.js?v=4';
import { store } from './files.js?v=8';
import { applyEdits } from './history.js?v=4';
import { getLineIndex, getLineStart, showInCode } from './code-view.js?v=4';
import { findByXpath } from './search.js?v=4';
import { selectFromCursor } from './tree.js?v=4';
import { openDocument, createDocument, getBlankDocument } from './documents.js?v=4';

const NOT_WELL_FORMED = 'The document is not well-formed - call get_problems.';
const MATCHES_LISTED = 200;
const MATCH_TEXT_SHOWN = 200;
const AI_DOCUMENT_NAME = 'AI document';

/**
 * Returns the nodes an XPath selects, in document order.
 * @param {string} xpath - an XPath 1.0 expression.
 * @returns {Object[]} the scanned nodes ({attr, el} for attributes).
 * @throws {Error} when the document is not well-formed or the expression is not valid.
 */
function findXpathNodes(xpath) {
    const parsed = state.result.doc;
    if (!parsed) throw new Error(NOT_WELL_FORMED);
    let result;
    try { result = parsed.evaluate(xpath, parsed, state.namespaces.fn, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); } catch (error) { throw new Error('Not a valid XPath expression: ' + error.message); }
    const nodes = [];
    for (let index = 0; index < result.snapshotLength; index++) {
        const node = state.linker.findModelNode(result.snapshotItem(index));
        if (node) nodes.push(node);
    }
    return nodes;
}

/**
 * Evaluates an XPath like the XPath field (its matches are marked in the tree) and answers
 * with the value or the matching nodes with path and line. The answer is the query tool's
 * result, the shape WebMCP dictates.
 * @param {string} xpath - an XPath 1.0 expression.
 * @returns {string} the answer for the agent.
 * @throws {Error} when the document is not well-formed or the expression is not valid.
 */
export function runQueryTool(xpath) {
    elements.xpath.value = xpath;
    findByXpath(xpath);
    const parsed = state.result.doc;
    if (!parsed) throw new Error(NOT_WELL_FORMED);
    let result;
    try { result = parsed.evaluate(xpath, parsed, state.namespaces.fn, XPathResult.ANY_TYPE, null); } catch (error) { throw new Error('Not a valid XPath expression: ' + error.message); }
    if (result.resultType === XPathResult.NUMBER_TYPE) return String(result.numberValue);
    if (result.resultType === XPathResult.STRING_TYPE) return JSON.stringify(result.stringValue);
    if (result.resultType === XPathResult.BOOLEAN_TYPE) return String(result.booleanValue);
    if (!state.hits.length) return 'No match.';
    const more = state.hits.length > MATCHES_LISTED ? `\n… ${state.hits.length - MATCHES_LISTED} more` : '';
    return state.hits.slice(0, MATCHES_LISTED).map(getMatchLine).join('\n') + more;
}

/**
 * Returns one match as a line of the answer: its path, its line and its code.
 * @param {Object} hit - a scanned node, or {attr, el}.
 * @returns {string} the line.
 */
function getMatchLine(hit) {
    const at = hit.attr ? hit.attr.start : hit.start;
    const code = hit.attr ? `${hit.attr.name}="${hit.attr.value}"` : hit.type === 'el' ? state.code.slice(hit.start, hit.tagEnd) : state.code.slice(hit.start, hit.end);
    return `${getPath(hit, true)} (line ${getLineIndex(at) + 1}): ${code.length > MATCH_TEXT_SHOWN ? code.slice(0, MATCH_TEXT_SHOWN) + '…' : code}`;
}

/**
 * Sets the text of the node(s) an XPath selects (escaped): attributes get the value,
 * elements without child elements their content, text nodes their text. The answer is the
 * tool's result, the shape WebMCP dictates.
 * @param {string} xpath - an XPath 1.0 expression.
 * @param {string} text - the new text.
 * @param {boolean} all - change every match, not only the first.
 * @returns {string} the answer for the agent.
 * @throws {Error} when nothing matches or a match cannot take a text.
 */
export function setTextByXpath(xpath, text, all) {
    let nodes = findXpathNodes(xpath);
    if (!nodes.length) throw new Error('No node matches - call query first.');
    if (!all) nodes = nodes.slice(0, 1);
    const edits = nodes.map(node => getSetTextEdit(node, text));
    applyEdits(edits);
    return `Changed ${edits.length} node${edits.length === 1 ? '' : 's'}.`;
}

/**
 * Returns the edit that sets the text of one node.
 * @param {Object} node - a scanned node, or {attr, el}.
 * @param {string} text - the new text.
 * @returns {Array} the edit [from, to, text].
 * @throws {Error} when the node cannot take a text.
 */
function getSetTextEdit(node, text) {
    if (node.attr) return [node.attr.valStart, node.attr.valEnd, escapeAttribute(text, node.attr.quote)];
    if (node.type === 'text') return [node.start, node.end, escapeText(text)];
    if (node.type !== 'el') throw new Error('set_text works on elements, text nodes and attributes.');
    if (node.children.some(child => child.type === 'el')) throw new Error(`<${node.name}> has child elements - use replace_text or set_document.`);
    if (node.selfClose) return [getAttributesEnd(node), node.tagEnd, `>${escapeText(text)}</${node.name}>`];
    return [node.tagEnd, node.closeStart, escapeText(text)];
}

/**
 * Sets, adds or removes an attribute on the element(s) an XPath selects. The answer is the
 * tool's result, the shape WebMCP dictates.
 * @param {string} xpath - an XPath 1.0 expression.
 * @param {string} name - the attribute's name.
 * @param {?string} value - the new value, null to remove the attribute.
 * @param {boolean} all - change every match, not only the first.
 * @returns {string} the answer for the agent.
 * @throws {Error} for an invalid name or when no element matches.
 */
export function setAttributeByXpath(xpath, name, value, all) {
    if (!XML_NAME.test(name)) throw new Error(`"${name}" is not a valid attribute name.`);
    let elementList = [...new Set(findXpathNodes(xpath).map(node => (node.attr ? node.el : node)).filter(node => node.type === 'el'))];   // /r/@* names one element once
    if (!elementList.length) throw new Error('No element matches - call query first.');
    if (!all) elementList = elementList.slice(0, 1);
    const edits = elementList.map(element => getSetAttributeEdit(element, name, value)).filter(Boolean);
    if (!edits.length) return 'Nothing to change.';
    applyEdits(edits);
    return `Changed ${edits.length} element${edits.length === 1 ? '' : 's'}.`;
}

/**
 * Returns the edit that sets, adds or removes an attribute of one element.
 * @param {Object} element - the scanned element.
 * @param {string} name - the attribute's name.
 * @param {?string} value - the new value, null to remove it.
 * @returns {?Array} the edit [from, to, text], or null when there is nothing to remove.
 */
function getSetAttributeEdit(element, name, value) {
    const attribute = element.attrs.find(candidate => candidate.name === name);
    if (value == null) return attribute ? [attribute.wsStart, attribute.end, ''] : null;
    if (attribute) return attribute.noValue ? [attribute.nameEnd, attribute.end, `="${escapeAttribute(value)}"`] : [attribute.valStart, attribute.valEnd, escapeAttribute(value, attribute.quote)];
    const at = getAttributesEnd(element);
    return [at, at, ` ${name}="${escapeAttribute(value)}"`];
}

/**
 * Replaces an exact piece of the code (one undo step) and returns how often, which the
 * replace_text tool reports (a command that reports whether it took place).
 * @param {string} find - the text to find.
 * @param {string} replacement - the new text.
 * @param {boolean} all - replace every match, not only the first.
 * @returns {number} how many pieces were replaced, 0 when the text is not found.
 */
export function updateCodeText(find, replacement, all) {
    if (!find) return 0;
    const count = state.code.split(find).length - 1;
    if (!count) return 0;
    applyEdits([[0, state.code.length, all ? state.code.split(find).join(replacement) : state.code.replace(find, () => replacement)]]);
    return all ? count : 1;
}

/**
 * Puts the cursor on a line and selects its node in the tree.
 * @param {number} line - the line, 1-based.
 * @returns {void}
 */
export function showLine(line) {
    showInCode(getLineStart(line));
    selectFromCursor(true);
}

/**
 * Returns the user's documents for list_files.
 * @returns {{name: string, updated: number, open: boolean}[]} the documents, most recently changed first.
 */
export function getFileList() {
    return store.getSorted().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId }));
}

/**
 * Opens one of the user's documents by name (a command that reports whether it took place).
 * @param {string} name - the name.
 * @returns {boolean} true when there is such a document (a command that reports whether it took place).
 */
export function openFileByName(name) {
    const found = store.findByName(name);
    if (found && found.id !== state.fileId) openDocument(found.id);
    return !!found;
}

/**
 * Creates a document and opens it; returns the name it got, which the new_file tool reports
 * (a command that reports whether it took place).
 * @param {string} name - its name.
 * @param {string} [xml] - its code; an empty root element when omitted.
 * @returns {?string} the name it got (made unique), null when the storage is full.
 */
export function createFile(name, xml) {
    return createDocument(name || AI_DOCUMENT_NAME, xml || getBlankDocument()) && state.name;
}

