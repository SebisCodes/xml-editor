/**
 * The well-formedness check of the scanned nodes (xml.js): the browser's DOMParser reads a
 * copy of the code without the DTD, and the scanned nodes show what the parser cannot
 * report on that copy.
 *
 * checkDocument() runs these steps:
 *   1. an empty document and elements nested too deep are errors at once;
 *   2. the browser parses a copy with every DOCTYPE blanked, so no external DTD, external
 *      entity or entity expansion is ever read (no XXE, no "billion laughs"); references to
 *      entities declared in a DTD are written as text and stay as they are;
 *   3. a second or misplaced DOCTYPE, undeclared namespace prefixes and ids used twice are
 *      found in the scanned nodes, and a DTD gets a note. In a template (xml-template.js) an id
 *      or a namespace prefix that holds a placeholder counts as filled later.
 */

import { hasTemplatePlaceholder } from './template-tags.js?v=2';

/** Elements nested deeper than this would overflow the browser's stack in the walks over the tree. */
export const MAX_DEPTH = 1000;
/** The predefined entities of XML. */
export const PREDEFINED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const PARSER_ERROR_NAMESPACES = ['http://www.w3.org/1999/xhtml', 'http://www.mozilla.org/newlayout/xml/parsererror.xml'];
const CHROME_ERROR = /line (\d+) at column (\d+): (.*?)\s*(?:Below is a rendering|This page contains|$)/;
const FIREFOX_ERROR = /XML Parsing Error: (.*?) Location: .*? Line Number (\d+), Column (\d+)/;
const ERROR_TEXT_LIMIT = 200;
const ESCAPED_AMPERSAND_GROWTH = 4;     // "&name;" written as "&amp;name;" is 4 characters longer

/**
 * A problem found in the code.
 * @typedef {Object} XmlProblem
 * @property {number} pos - the offset in the code where it is.
 * @property {string} kind - "error" or "warn".
 * @property {string} msg - what is wrong, in English.
 */

/**
 * What the well-formedness check gives back.
 * @typedef {Object} XmlCheckResult
 * @property {XMLDocument|null} doc - the parsed document, null when it is not well-formed.
 * @property {XmlProblem[]} problems - the problems, sorted by their place.
 */


/**
 * Parses the code with the browser's parser and lists the problems: the first
 * well-formedness error, a misplaced or second DOCTYPE, undeclared namespace prefixes,
 * ids used twice and a note about a DTD.
 * @param {XmlModel} model - the nodes of the code.
 * @param {boolean} [isTemplate=false] - true when the code is a template: an id or a namespace prefix
 *     that holds a placeholder counts as filled later and stays out of the checks.
 * @returns {XmlCheckResult} the parsed document (null when not well-formed) and the problems.
 */
export function checkDocument(model, isTemplate = false) {
    if (!model.src.trim()) return { doc: null, problems: [{ pos: 0, kind: 'error', msg: 'The document is empty - an XML document needs one root element' }] };
    if (model.tooDeep >= 0) {
        return { doc: null, problems: [{ pos: model.tooDeep, kind: 'error', msg: `The elements are nested more than ${MAX_DEPTH} levels deep - the editor reads at most ${MAX_DEPTH}` }] };
    }
    const copy = getSafeCopy(model);
    const parsed = parseSafeCopy(model, copy);
    const doctypeProblems = getDoctypeProblems(model);
    const problems = [...parsed.problems, ...doctypeProblems, ...getNamespaceProblems(model, isTemplate), ...getDuplicateIdProblems(model, isTemplate), ...getDtdNotes(copy)];
    problems.sort((first, second) => first.pos - second.pos);
    return { doc: doctypeProblems.length ? null : parsed.doc, problems };
}

/**
 * The copy of the code the browser parses.
 * @typedef {Object} SafeCopy
 * @property {string} text - the copy.
 * @property {number[]} shifts - the offsets where it got longer (an escaped entity reference).
 * @property {?{start: number, entities: Set<string>, external: boolean, used: Set<string>}} dtd - the first
 *   DOCTYPE's start, the entities it declares, whether it is external and the names used; null without one.
 */

/**
 * Returns the copy of the code the browser parses: every DOCTYPE blanked (same length,
 * line breaks kept), so the browser never reads a DTD of the document, and references to
 * entities of a DTD written as text (&name; becomes &amp;name;).
 * @param {XmlModel} model - the nodes of the code.
 * @returns {SafeCopy} the copy, the offsets where it got longer, and what the DTD declares.
 */
function getSafeCopy(model) {
    const source = model.src;
    const doctypes = model.all.filter(node => node.type === 'doctype');
    if (!doctypes.length) return { text: source, shifts: [], dtd: null };
    const firstDoctype = doctypes[0];
    const declarations = doctypes.map(doctype => source.slice(doctype.start, doctype.end));
    const entities = new Set(declarations.flatMap(declaration => [...declaration.matchAll(/<!ENTITY\s+(?!%)([^\s>]+)/g)].map(match => match[1])));
    const external = declarations.some(declaration => /^<!DOCTYPE\s+\S+\s+(SYSTEM|PUBLIC)\b/i.test(declaration));
    let text = source;
    for (const doctype of doctypes) text = text.slice(0, doctype.start) + source.slice(doctype.start, doctype.end).replace(/[^\n]/g, ' ') + text.slice(doctype.end);
    const shifts = [];
    const used = new Set();
    for (const [from, to] of getTextRanges(model, firstDoctype.end)) {
        /**
         * Returns a reference to an entity of the DOCTYPE with its "&" escaped, noting the entity
         * as used and where the code grew (a String.replace callback); others stay as they are.
         * @param {string} reference - the entity reference.
         * @param {string} name - the entity's name.
         * @param {number} at - where the reference starts in the part.
         * @returns {string} the reference as it goes into the copy.
         */
        const escapeDeclaredEntity = (reference, name, at) => {
            if (PREDEFINED_ENTITIES[name] || !(entities.has(name) || external)) return reference;
            used.add(name);
            shifts.push(from + at);
            return '&amp;' + name + ';';
        };
        const part = text.slice(from, to).replace(/&([\p{L}_][\p{L}\p{N}_.\-:]*);/gu, escapeDeclaredEntity);
        text = text.slice(0, from) + part + text.slice(to);
    }
    shifts.sort((first, second) => first - second);
    return { text, shifts, dtd: { start: firstDoctype.start, entities, external, used } };
}

/**
 * Returns the ranges of text after the DOCTYPE and of every attribute value, last first.
 * @param {XmlModel} model - the nodes of the code.
 * @param {number} doctypeEnd - the offset after the first DOCTYPE.
 * @returns {number[][]} [from, to] ranges, sorted from the end of the code to its start.
 */
function getTextRanges(model, doctypeEnd) {
    const ranges = [];
    for (const node of model.all) {
        if (node.type === 'text' && node.start > doctypeEnd) ranges.push([node.start, node.end]);
        if (node.type === 'el') for (const attribute of node.attrs) ranges.push([attribute.valStart, attribute.valEnd]);
    }
    return ranges.sort((first, second) => second[0] - first[0]);
}

/**
 * Parses the safe copy with the browser's parser.
 * @param {XmlModel} model - the nodes of the code.
 * @param {SafeCopy} copy - the copy from getSafeCopy().
 * @returns {{doc: ?XMLDocument, problems: XmlProblem[]}} the parsed document (null when not
 *   well-formed) and its first well-formedness error.
 */
function parseSafeCopy(model, copy) {
    try {
        const parsed = new DOMParser().parseFromString(copy.text, 'application/xml');
        const error = getParserError(parsed);
        if (!error) return { doc: parsed, problems: [] };
        let pos = getOffset(copy.text, error.line, error.col);
        pos -= copy.shifts.filter(shift => shift + ESCAPED_AMPERSAND_GROWTH < pos).length * ESCAPED_AMPERSAND_GROWTH;
        if (/namespace prefix/i.test(error.msg)) return { doc: null, problems: [] };
        return { doc: null, problems: [{ pos: Math.max(0, Math.min(pos, model.src.length)), kind: 'error', msg: 'Not well-formed: ' + error.msg.replace(/\.$/, '') }] };
    } catch (error) {
        return { doc: null, problems: [{ pos: 0, kind: 'error', msg: 'Not well-formed: ' + error.message }] };
    }
}

/**
 * Returns the well-formedness error the browser's parser wrote into a document.
 * @param {XMLDocument} parsed - the parsed document.
 * @returns {{line: number, col: number, msg: string}|null} the error, or null when there is none.
 */
function getParserError(parsed) {
    const errorElement = [...parsed.getElementsByTagName('parsererror')].find(element => PARSER_ERROR_NAMESPACES.includes(element.namespaceURI) || parsed.documentElement === element);
    if (!errorElement) return null;
    const text = errorElement.textContent.replace(/\s+/g, ' ');
    let match = CHROME_ERROR.exec(text);
    if (match) return { line: +match[1], col: +match[2], msg: match[3].trim() };
    match = FIREFOX_ERROR.exec(text);
    if (match) return { line: +match[2], col: +match[3], msg: match[1].trim() };
    return { line: 1, col: 1, msg: text.slice(0, ERROR_TEXT_LIMIT) };
}

/**
 * Returns the offset of a line and column in a text.
 * @param {string} text - the text.
 * @param {number} line - the line, 1-based.
 * @param {number} column - the column, 1-based.
 * @returns {number} the offset, at most the end of that line.
 */
function getOffset(text, line, column) {
    let pos = 0;
    for (let lineNumber = 1; lineNumber < line; lineNumber++) {
        const lineBreak = text.indexOf('\n', pos);
        if (lineBreak < 0) return text.length;
        pos = lineBreak + 1;
    }
    const lineEnd = text.indexOf('\n', pos);
    return Math.min(pos + Math.max(0, column - 1), lineEnd < 0 ? text.length : lineEnd);
}

/**
 * Returns an error for a second DOCTYPE and for one after the root element. The browser
 * gets every DOCTYPE blanked (getSafeCopy), so it cannot report these itself; with one of
 * them the document is not well-formed.
 * @param {XmlModel} model - the nodes of the code.
 * @returns {XmlProblem[]} the errors.
 */
function getDoctypeProblems(model) {
    const root = model.els[0];
    const problems = [];
    model.all.filter(node => node.type === 'doctype').forEach((doctype, position) => {
        const message = position > 0 ? 'Not well-formed: a document has only one DOCTYPE'
            : doctype.parent !== model.doc || (root && doctype.start > root.start) ? 'Not well-formed: the DOCTYPE must come before the root element' : null;
        if (message) problems.push({ pos: doctype.start, kind: 'error', msg: message });
    });
    return problems;
}

/**
 * Returns an error for every element and attribute whose namespace prefix is not declared.
 * @param {XmlModel} model - the nodes of the code.
 * @param {boolean} isTemplate - true for a template: a prefix that holds a placeholder counts as declared.
 * @returns {XmlProblem[]} the errors.
 */
function getNamespaceProblems(model, isTemplate) {
    const problems = [];
    /**
     * Tells whether a node's prefix is missing a declaration.
     * @param {Object} node - a scanned element or attribute, with its uri and prefix.
     * @returns {boolean} true when the prefix is undeclared, for a template only when the prefix is free of placeholders.
     */
    const isUndeclared = node => node.uri === null && !(isTemplate && hasTemplatePlaceholder(node.prefix));
    for (const element of model.els) {
        if (isUndeclared(element)) problems.push({ pos: element.nameStart, kind: 'error', msg: `The namespace prefix "${element.prefix}" is not declared - add xmlns:${element.prefix}="…"` });
        for (const attribute of element.attrs) {
            if (isUndeclared(attribute)) problems.push({ pos: attribute.nameStart, kind: 'error', msg: `The namespace prefix "${attribute.prefix}" is not declared - add xmlns:${attribute.prefix}="…"` });
        }
    }
    return problems;
}

/**
 * Returns a warning for every id (id, xml:id) that is used a second time.
 * @param {XmlModel} model - the nodes of the code.
 * @param {boolean} isTemplate - true for a template: an id that holds a placeholder stands for ids filled in later.
 * @returns {XmlProblem[]} the warnings.
 */
function getDuplicateIdProblems(model, isTemplate) {
    const problems = [];
    const ids = new Set();
    for (const element of model.els) {
        for (const attribute of element.attrs) {
            if (attribute.name !== 'id' && attribute.name !== 'xml:id') continue;
            if (isTemplate && hasTemplatePlaceholder(attribute.value)) continue;
            if (ids.has(attribute.value)) problems.push({ pos: attribute.valStart, kind: 'warn', msg: `The id "${attribute.value}" is used twice` });
            else ids.add(attribute.value);
        }
    }
    return problems;
}

/**
 * Returns a note when the DTD is external or declares entities: they are never read or expanded.
 * @param {SafeCopy} copy - the copy from getSafeCopy().
 * @returns {XmlProblem[]} the note, or none.
 */
function getDtdNotes(copy) {
    if (!copy.dtd || !(copy.dtd.external || copy.dtd.entities.size)) return [];
    return [{ pos: copy.dtd.start, kind: 'warn', msg: copy.dtd.external
        ? 'The DTD is not loaded: the editor never reads external DTDs or entities, entity references stay as written'
        : 'Entities of the DTD are not expanded: references to them stay as written' }];
}
