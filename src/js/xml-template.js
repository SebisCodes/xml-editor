/**
 * Template placeholders in XML (?template=mustache or ?template=angle): a tag is text or part of
 * a quoted attribute value, and the server fills it in before the document is used.
 *
 * checkXmlCode() reads the code in these steps:
 *   1. write every tag in brace form, of the same length (<<?name>> reads as {{?name}}), so an
 *      angle tag is text for the scanner and the browser;
 *   2. replace the section tags that stand outside the root element by spaces, so the text
 *      around the root stays white space;
 *   3. scan that text (xml.js); the browser's check (xml-check.js) reads it with every tag in
 *      text and attribute values as a marker that carries the tag's number (template-markers.js),
 *      tags in comments in brace form (so "--" in a name stays the comment's error); an id or a
 *      namespace prefix that holds a placeholder counts as filled later, and the placeholder
 *      errors are added;
 *   4. write every marker of the parsed document back as its tag (XPath, JSON and YAML read the
 *      tags as written) and give the scanned nodes the code as written: the tree, Format and the
 *      edits read every tag as the syntax writes it, at the same places.
 * Without a syntax the code is scanned and checked as it is.
 */

import { getTemplateSyntax, getTemplateNameByAddress, getTemplateTags, checkTemplateSections, convertTemplateTagsToBraces } from './template-tags.js?v=2';
import { parseNodes, expandEntities } from './xml.js?v=7';
import { checkDocument } from './xml-check.js?v=4';
import { createTemplateMarking, buildTemplateMarker, setMarkedTags } from './template-markers.js?v=1';

/** The template syntax of the placeholders the address asks for with ?template=, or null. */
export const TEMPLATE_SYNTAX = getTemplateSyntax(getTemplateNameByAddress(globalThis.location ? globalThis.location.search : ''));

/**
 * What reading the code gives back.
 * @typedef {Object} CheckedCode
 * @property {import('./xml.js').XmlModel} model - the nodes of the code, with the code as written in src.
 * @property {import('./xml-check.js').XmlCheckResult} result - the parsed document and the problems.
 */

/**
 * Reads the code into nodes and checks it (the steps in the header).
 * @param {string} code - the code as written.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain XML.
 * @returns {CheckedCode} the nodes and the result of the check.
 */
export function checkXmlCode(code, syntax) {
    if (!syntax) {
        const model = parseNodes(code);
        return { model, result: checkDocument(model) };
    }
    const model = parseCheckedNodes(code, syntax);
    const tags = getTemplateTags(code, syntax);
    const marking = createTemplateMarking(code, tags);
    model.src = buildBrowserText(model, tags, marking);
    const result = checkDocument(model, true);
    if (result.doc) setMarkedTags(result.doc, marking);
    result.problems = [...result.problems, ...checkTemplateSections(code, syntax)].sort((first, second) => first.pos - second.pos);
    setWrittenSource(model, code);
    return { model, result };
}

/**
 * Reads the code into nodes the way the editor reads it: with a template syntax the tags are read
 * as text and every node carries the code as written (steps 1, 2 and 4 in the header).
 * @param {string} code - the code as written.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain XML.
 * @returns {import('./xml.js').XmlModel} the nodes of the code.
 */
export function parseCodeNodes(code, syntax) {
    if (!syntax) return parseNodes(code);
    const model = parseCheckedNodes(code, syntax);
    setWrittenSource(model, code);
    return model;
}

/**
 * Scans the code in brace form, with spaces in the place of the section tags outside the root element.
 * @param {string} code - the code as written.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the template syntax.
 * @returns {import('./xml.js').XmlModel} the nodes, with that checked text in src.
 */
function parseCheckedNodes(code, syntax) {
    const braced = convertTemplateTagsToBraces(code, syntax);
    const model = parseNodes(braced);
    const outerTags = getTemplateTags(code, syntax).filter(tag => tag.kind !== 'value' && isOutsideRoot(model, tag.start));
    return outerTags.length ? parseNodes(clearTags(braced, outerTags)) : model;
}

/**
 * Builds the text the browser's check reads from the checked text: every tag that stands in text
 * or an attribute value becomes its marker; tags in comments keep their brace form and the section
 * tags around the root their spaces.
 * @param {import('./xml.js').XmlModel} model - the nodes, with the checked text in src.
 * @param {import('./template-tags.js').TemplateTag[]} tags - the tags of the code, in order.
 * @param {?import('./template-markers.js').TemplateMarking} marking - the marking of the code, or null to keep the brace form.
 * @returns {string} the text for the browser, as long as the code.
 */
function buildBrowserText(model, tags, marking) {
    const source = model.src;
    const comments = model.all.filter(node => node.type === 'comment');
    let text = '', last = 0;
    tags.forEach((tag, index) => {
        const isKept = !marking || source[tag.start] === ' ' || comments.some(node => node.start <= tag.start && tag.start < node.end);
        text += source.slice(last, tag.start) + (isKept ? source.slice(tag.start, tag.end) : buildTemplateMarker(marking, index));
        last = tag.end;
    });
    return text + source.slice(last);
}

/**
 * Tells whether a place of the code lies in text outside the root element.
 * @param {import('./xml.js').XmlModel} model - the nodes of the code.
 * @param {number} place - the offset in the code.
 * @returns {boolean} true when a text node of the document itself holds the place.
 */
function isOutsideRoot(model, place) {
    return model.doc.children.some(node => node.type === 'text' && node.start <= place && place < node.end);
}

/**
 * Replaces tags of a text by spaces.
 * @param {string} text - the text.
 * @param {import('./template-tags.js').TemplateTag[]} tags - the tags to replace, in order.
 * @returns {string} the text with as many spaces in the place of each tag, as long as the text.
 */
function clearTags(text, tags) {
    let result = '', last = 0;
    for (const tag of tags) {
        result += text.slice(last, tag.start) + ' '.repeat(tag.end - tag.start);
        last = tag.end;
    }
    return result + text.slice(last);
}

/**
 * Gives the nodes the code as written: its text as src, and every element and attribute its
 * name and value from the code at the same places.
 * @param {import('./xml.js').XmlModel} model - the nodes, read from the checked text; changed in place.
 * @param {string} code - the code as written, as long as the checked text.
 * @returns {void}
 */
function setWrittenSource(model, code) {
    model.src = code;
    for (const element of model.els) {
        element.name = code.slice(element.nameStart, element.nameEnd);
        for (const attribute of element.attrs) {
            attribute.name = code.slice(attribute.nameStart, attribute.nameEnd);
            attribute.raw = code.slice(attribute.valStart, attribute.valEnd);
            attribute.value = expandEntities(attribute.raw).text;
        }
    }
}

/**
 * Widens the changed part of an edited text so that it holds every tag of the old and the new
 * text that reaches into it: a tag is then written whole, and the rest of a tag cut by the edit
 * is escaped as text.
 * @param {string} oldText - the text before.
 * @param {string} newText - the text after.
 * @param {number} head - the characters the two texts share at the start.
 * @param {number} tail - the characters they share at the end, after those.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain XML.
 * @returns {{head: number, tail: number}} the shared start and end, at most as long as given.
 */
export function getTagBoundedEnds(oldText, newText, head, tail, syntax) {
    if (!syntax) return { head, tail };
    let bounded = { head, tail };
    for (const text of [oldText, newText]) {
        const changedEnd = text.length - tail;
        for (const tag of getTemplateTags(text, syntax)) {
            if (tag.start < changedEnd && tag.end > head) bounded = { head: Math.min(bounded.head, tag.start), tail: Math.min(bounded.tail, text.length - tag.end) };
        }
    }
    return bounded;
}
