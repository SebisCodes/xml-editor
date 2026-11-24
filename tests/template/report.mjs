/**
 * Reads a JSON list of cases (argv[3]) and runs each through the XML editor's modules in src/js
 * (argv[2]) as the editor runs them: the scan and the check of xml-template.js, the highlighting,
 * Format, Minify, the shared template module and the tree of the example view (xml-examples.js). The browser's DOMParser is stood in for by a
 * recorder that keeps the text it is given and reports it well-formed, so the result shows what
 * the browser reads. Prints one JSON result per case for template_test.py.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scriptFolder = process.argv[2];
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
let parsedTexts = [];

/** A stand-in for the browser's DOMParser: it keeps every text and returns a document without errors. */
globalThis.DOMParser = class {
    /**
     * Keeps the text and returns an empty document.
     * @param {string} text - the text the editor hands the browser.
     * @returns {{getElementsByTagName: function(): Array, childNodes: Array}} a document without parser errors.
     */
    parseFromString(text) {
        parsedTexts.push(text);
        return { getElementsByTagName: () => [], childNodes: [] };
    }
};

const { checkXmlCode, getTagBoundedEnds } = await importModule('xml-template.js');
const { highlight } = await importModule('xml-highlight.js');
const { formatXml, getMinifiedXml } = await importModule('xml-format.js');
const { escapeText } = await importModule('xml.js');
const template = await importModule('template-tags.js');
const { buildExampleTree } = await importModule('xml-examples.js');
const { createTemplateExamples } = await importModule('template-examples.js');

/**
 * Imports a module of the editor by its file name.
 * @param {string} fileName - the file in src/js, e.g. "xml.js".
 * @returns {Promise<object>} the module's exports.
 */
function importModule(fileName) {
    return import(pathToFileURL(join(scriptFolder, fileName)).href);
}

/**
 * One case of template_test.py.
 * @typedef {object} TemplateCase
 * @property {string} code - the XML code.
 * @property {?string} template - the template syntax, or null for plain XML.
 * @property {?{oldText: string, newText: string}} [edit] - a tree edit to compute.
 * @property {object} [examples] - a page's template message, whose examples fill the code.
 */

/**
 * A tree edit of a text.
 * @typedef {object} TextEdit
 * @property {string} oldText - the text before the edit.
 * @property {string} newText - the text after the edit.
 */

/**
 * Builds the change a tree edit of a text makes, the way tree-edit-changes.js computes it.
 * @param {TextEdit} edit - the text before (oldText) and after (newText).
 * @param {?object} syntax - the template syntax.
 * @returns {{head: number, tail: number, inserted: string}} the shared ends and the inserted code.
 */
function buildEditResult(edit, syntax) {
    let head = 0, tail = 0;
    const { oldText, newText } = edit;
    while (head < oldText.length && head < newText.length && oldText[head] === newText[head]) head++;
    while (tail < oldText.length - head && tail < newText.length - head && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) tail++;
    const bounded = getTagBoundedEnds(oldText, newText, head, tail, syntax);
    return { ...bounded, inserted: template.escapeTextOutsideTemplateTags(newText.slice(bounded.head, newText.length - bounded.tail), syntax, escapeText) };
}

/**
 * Builds the result of one case: what the editor makes of its code with its template syntax.
 * @param {TemplateCase} testCase - the code and the template syntax.
 * @returns {Promise<object>} the problems, the text the browser reads, the tree's values, the highlighted
 *     HTML, the formatted and minified code, the tags and the example tree.
 */
async function buildCaseResult(testCase) {
    const syntax = template.getTemplateSyntax(testCase.template);
    const examples = testCase.examples ? await createTemplateExamples(testCase.examples) : null;
    parsedTexts = [];
    const { model, result } = checkXmlCode(testCase.code, syntax);
    const formatted = formatXml(model);
    /**
     * Returns the tags of a text as written.
     * @param {string} text - the text.
     * @returns {string[]} every tag, in order; none without a syntax.
     */
    const readTags = text => (syntax ? template.getTemplateTags(text, syntax).map(tag => text.slice(tag.start, tag.end)) : []);
    return {
        problems: result.problems,
        browserText: parsedTexts[0] ?? null,
        source: model.src,
        attributes: model.els.flatMap(element => element.attrs.map(attribute => [element.name, attribute.name, attribute.value])),
        texts: model.all.filter(node => node.type === 'text').map(node => model.src.slice(node.start, node.end).trim()).filter(Boolean),
        plainHighlighted: highlight(testCase.code),
        highlighted: template.buildHighlightWithTemplateTags(highlight(template.convertTemplateTagsToBraces(testCase.code, syntax)), syntax, testCase.code),
        formatted,
        formattedTwice: formatXml(checkXmlCode(formatted, syntax).model),
        minified: getMinifiedXml(model, syntax),
        tags: readTags(testCase.code),
        formattedTags: readTags(formatted),
        edit: testCase.edit ? buildEditResult(testCase.edit, syntax) : null,
        exampleTree: syntax && testCase.examples ? buildExampleResult(testCase.code, syntax, examples, model) : null,
    };
}

/**
 * Builds the tree of the example view of a case: its filled text and, for every node, its type,
 * its text and where its node of the code starts.
 * @param {string} code - the template.
 * @param {object} syntax - the template syntax.
 * @param {object} examples - the checked examples.
 * @param {object} model - the nodes of the code.
 * @returns {{text: string, nodes: Array<[string, string, number]>}|{error: string}} the filled text and the nodes, or the
 *     error that ends the example view.
 */
function buildExampleResult(code, syntax, examples, model) {
    let tree;
    try { tree = buildExampleTree(code, syntax, examples, model); } catch (error) { return { error: error.message }; }
    const text = tree.model.src;
    return { text, nodes: tree.model.all.map(node => [node.type, node.type === 'el' ? node.name : text.slice(node.start, node.end).trim(), node.codeNode.start]) };
}

console.log(JSON.stringify(await Promise.all(cases.map(buildCaseResult))));
