/**
 * The example view of the XML editor's tree: the document filled with the page's examples
 * (template-expansion.js), each example written as text for its place, and the way back from
 * every node of the filled document to its node in the code.
 *
 * buildExampleTree() runs these steps:
 *   1. find the place of every tag (template-xml.js) and fill the template: text and attribute
 *      values get the example with XML's escapes, comments, CDATA sections and processing
 *      instructions with their closing mark split, the markup itself nothing;
 *   2. read the filled text into nodes (xml.js); each node knows the filled text it is read from;
 *      a filled text that leaves more elements open or end tags stray than the code ends the
 *      example view (sections that cross elements);
 *   3. lead every node back to its node in the code: an element by the start of its start tag
 *      (copied text), any other node by the node of the code that holds its first character (a
 *      filled text by its tag); an element of a list stands once per example row, a node of a
 *      hidden section not at all.
 * The filled document only goes to the tree; edits in the tree change the nodes of the code.
 */

import { expandTemplate, getCodeOffsetByViewOffset } from './template-expansion.js?v=2';
import { getXmlTagPlaces, escapeXmlFill } from './template-xml.js?v=1';
import { parseNodes, findNodeAt, escapeText, escapeAttribute } from './xml.js?v=7';

/** XML's escapes for text and attribute values. */
const XML_ESCAPES = { text: escapeText, attribute: escapeAttribute };

/**
 * The example view of a document's tree.
 * @typedef {object} ExampleTree
 * @property {import('./xml.js').XmlModel} model - the nodes of the filled document; each node carries
 *     `source` (the filled text) and `codeNode` (its node in the code).
 * @property {Map<object, object>} firstNodes - for a node of the code, the first node of the filled
 *     document that stands for it.
 */

/**
 * Builds the example view of a document's tree (the steps in the header).
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples, or null.
 * @param {import('./xml.js').XmlModel} writtenModel - the nodes of the code as the editor read them.
 * @returns {ExampleTree} the filled tree.
 * @throws {Error} when the filling goes past its limits, leaves elements open or stray end tags where the code closes them, or an element has no way back.
 */
export function buildExampleTree(code, syntax, examples, writtenModel) {
    const places = getXmlTagPlaces(code, syntax);
    const view = expandTemplate(code, syntax, { examples, writeFill: (tag, fill, before) => escapeXmlFill(places.get(tag.start), fill.text, XML_ESCAPES, before) });
    const model = parseNodes(view.text);
    if (getUnmatchedCount(model) > getUnmatchedCount(writtenModel)) throw new Error('The filled document leaves elements open where the code closes them');
    const elementByStart = new Map(writtenModel.els.map(element => [element.start, element]));
    const firstNodes = new Map();
    for (const node of model.all) {
        node.source = view.text;
        node.codeNode = findCodeNode(node, getCodeOffsetByViewOffset(view.map, node.start), writtenModel, elementByStart);
        if (!firstNodes.has(node.codeNode)) firstNodes.set(node.codeNode, node);
    }
    return { model, firstNodes };
}

/**
 * Returns how many elements of a document stay open and how many end tags are stray.
 * @param {import('./xml.js').XmlModel} model - the nodes of a document.
 * @returns {number} the number of unclosed elements and stray end tags.
 */
function getUnmatchedCount(model) {
    return model.stray.length + model.els.filter(element => element.unclosed).length;
}

/**
 * Returns the node of the code a node of the filled document stands for: an element the element
 * whose start tag starts at the same place, any other node the node of the code that holds its
 * first character, else the node of the code of its parent.
 * @param {import('./xml.js').XmlNode} node - the node of the filled document; its parent was led back before it.
 * @param {number} codeOffset - where its first character comes from in the code.
 * @param {import('./xml.js').XmlModel} writtenModel - the nodes of the code.
 * @param {Map<number, import('./xml.js').XmlNode>} elementByStart - the elements of the code by the start of their start tag.
 * @returns {import('./xml.js').XmlNode} the node of the code.
 * @throws {Error} when the code has no element for an element.
 */
function findCodeNode(node, codeOffset, writtenModel, elementByStart) {
    if (node.type !== 'el') return findNodeAt(writtenModel, codeOffset) || node.parent.codeNode || writtenModel.doc;
    const element = elementByStart.get(codeOffset);
    if (!element) throw new Error('An element of the filled document has no element in the code');
    return element;
}
