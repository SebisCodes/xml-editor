/**
 * Template placeholders in XML (?template=): where each tag stands in the markup, and an
 * example written as text for that place, for the example view of an editor that reads XML.
 *
 * getXmlTagPlaces() runs these steps:
 *   1. write the tags in brace form of the same length (an angle tag would read as markup);
 *   2. walk the code from "<" to "<" and note the stretches that hold text: element content
 *      (with the name of the element around it), quoted attribute values (with the attribute's
 *      name and quote), comments, CDATA sections and processing instructions; everything else is
 *      markup;
 *   3. give every tag the stretch that holds its start.
 * escapeXmlFill() writes an example for its place: text and attribute values with XML's
 * escapes (given by the editor), a comment, CDATA section or processing instruction with its
 * closing mark split (also where it would form with the text before or after the fill), the
 * markup itself nothing.
 * The SVG and XML editors use this same file; it works on strings only, so it runs in Node as well.
 */

import { getTemplateTags, convertTemplateTagsToBraces } from './template-tags.js?v=2';

const COMMENT_START = '<!--';
const COMMENT_END = '-->';
const CDATA_START = '<![CDATA[';
const CDATA_END = ']]>';
const INSTRUCTION_START = '<?';
const INSTRUCTION_END = '?>';
const DECLARATION_START = '<!';
/** An XML name at the start of a text (element or attribute). */
const NAME_AT_START = /^[^\s=/>"'<]+/;

/**
 * Where a tag stands in the markup.
 * @typedef {object} XmlTagPlace
 * @property {string} kind - "text", "attribute", "comment", "cdata", "instruction" or "markup".
 * @property {string} element - text and CDATA: the name of the element around it; attribute: the name of its
 *     element; "" outside every element.
 * @property {string} attribute - attribute: the attribute's name as written, else "".
 * @property {string} quote - attribute: the quote around the value (" or '), else "".
 */

/**
 * The escapes of the editor for its places.
 * @typedef {object} XmlEscapes
 * @property {function(string): string} text - escapes text for element content.
 * @property {function(string, string): string} attribute - escapes text for an attribute value in the given quote.
 */

/**
 * A stretch of the code that holds text, with its place.
 * @typedef {object} XmlTextStretch
 * @property {number} start - where it starts in the code.
 * @property {number} end - where it ends.
 * @property {XmlTagPlace} place - the place of a tag in it.
 */

/** The place of a tag in the markup itself (element and attribute names, end tags, declarations). */
const MARKUP_PLACE = Object.freeze({ kind: 'markup', element: '', attribute: '', quote: '' });

/**
 * Returns the place of every tag of a code (the steps in the header).
 * @param {string} code - the code as written.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the template syntax.
 * @returns {Map<number, XmlTagPlace>} the place of each tag, by the tag's start.
 */
export function getXmlTagPlaces(code, syntax) {
    const stretches = getTextStretches(convertTemplateTagsToBraces(code, syntax));
    const places = new Map();
    let index = 0;
    for (const tag of getTemplateTags(code, syntax)) {
        while (index < stretches.length && stretches[index].end <= tag.start) index++;
        const stretch = stretches[index];
        places.set(tag.start, stretch && stretch.start <= tag.start ? stretch.place : MARKUP_PLACE);
    }
    return places;
}

/**
 * Returns the stretches of a code that hold text, in order.
 * @param {string} code - the code, tags in brace form.
 * @returns {XmlTextStretch[]} the stretches.
 */
function getTextStretches(code) {
    const stretches = [], open = [];
    let offset = 0;
    while (offset < code.length) {
        const lt = code.indexOf('<', offset);
        const textEnd = lt < 0 ? code.length : lt;
        if (textEnd > offset) stretches.push(createStretch(offset, textEnd, 'text', open[open.length - 1] || ''));
        if (lt < 0) break;
        offset = readMarkup(code, lt, open, stretches);
    }
    return stretches;
}

/**
 * Reads the markup that starts at a "<" and adds the stretches of text in it (a reader that
 * consumes its input: it returns where the next read starts).
 * @param {string} code - the code, tags in brace form.
 * @param {number} lt - where the markup starts.
 * @param {string[]} open - the names of the open elements, innermost last; changed in place.
 * @param {XmlTextStretch[]} stretches - the stretches so far; changed in place.
 * @returns {number} the offset after the markup.
 */
function readMarkup(code, lt, open, stretches) {
    const element = open[open.length - 1] || '';
    if (code.startsWith(COMMENT_START, lt)) return readDelimited(code, lt, COMMENT_START, COMMENT_END, 'comment', element, stretches);
    if (code.startsWith(CDATA_START, lt)) return readDelimited(code, lt, CDATA_START, CDATA_END, 'cdata', element, stretches);
    if (code.startsWith(INSTRUCTION_START, lt)) return readDelimited(code, lt, INSTRUCTION_START, INSTRUCTION_END, 'instruction', element, stretches);
    if (code.startsWith(DECLARATION_START, lt)) return findMarkEnd(code, '>', lt);
    if (code[lt + 1] === '/') { open.pop(); return findMarkEnd(code, '>', lt); }
    return readStartTag(code, lt, open, stretches);
}

/**
 * Reads a comment, CDATA section or processing instruction and adds its text as a stretch.
 * @param {string} code - the code.
 * @param {number} lt - where it starts.
 * @param {string} opener - its opening mark.
 * @param {string} closer - its closing mark.
 * @param {string} kind - "comment", "cdata" or "instruction".
 * @param {string} element - the name of the element around it.
 * @param {XmlTextStretch[]} stretches - the stretches so far; changed in place.
 * @returns {number} the offset after it.
 */
function readDelimited(code, lt, opener, closer, kind, element, stretches) {
    const closeAt = code.indexOf(closer, lt + opener.length);
    const innerEnd = closeAt < 0 ? code.length : closeAt;
    stretches.push(createStretch(lt + opener.length, innerEnd, kind, element));
    return closeAt < 0 ? code.length : closeAt + closer.length;
}

/**
 * Reads a start tag: adds the stretch of every quoted attribute value and opens the element
 * unless it closes itself (a reader that consumes its input: it returns where the next read starts).
 * @param {string} code - the code.
 * @param {number} lt - where the start tag starts.
 * @param {string[]} open - the names of the open elements; changed in place.
 * @param {XmlTextStretch[]} stretches - the stretches so far; changed in place.
 * @returns {number} the offset after the start tag.
 */
function readStartTag(code, lt, open, stretches) {
    const nameMatch = NAME_AT_START.exec(code.slice(lt + 1, lt + 200));
    const name = nameMatch ? nameMatch[0] : '';
    let at = lt + 1 + name.length;
    while (at < code.length && code[at] !== '>') {
        const attribute = NAME_AT_START.exec(code.slice(at, at + 200));
        if (!attribute) { at++; continue; }
        at += attribute[0].length;
        while (/\s/.test(code[at] || '')) at++;
        if (code[at] !== '=') continue;
        at++;
        while (/\s/.test(code[at] || '')) at++;
        const quote = code[at];
        if (quote !== '"' && quote !== "'") continue;
        const closeAt = code.indexOf(quote, at + 1);
        const valueEnd = closeAt < 0 ? code.length : closeAt;
        stretches.push({ start: at + 1, end: valueEnd, place: { kind: 'attribute', element: name, attribute: attribute[0], quote } });
        at = valueEnd + 1;
    }
    if (code[at - 1] !== '/' && name) open.push(name);
    return Math.min(at + 1, code.length);
}

/**
 * Creates a stretch of text, CDATA, a comment or a processing instruction.
 * @param {number} start - where it starts.
 * @param {number} end - where it ends.
 * @param {string} kind - what it is.
 * @param {string} element - the name of the element around it.
 * @returns {XmlTextStretch} the stretch.
 */
function createStretch(start, end, kind, element) {
    return { start, end, place: { kind, element, attribute: '', quote: '' } };
}

/**
 * Returns the offset after the next closing mark.
 * @param {string} code - the code.
 * @param {string} mark - the mark, e.g. ">".
 * @param {number} from - where to look from.
 * @returns {number} the offset after it, or the code's length when it is missing.
 */
function findMarkEnd(code, mark, from) {
    const found = code.indexOf(mark, from);
    return found < 0 ? code.length : found + mark.length;
}

/**
 * Writes an example as text for its place in the markup.
 * @param {XmlTagPlace} place - where the tag stands.
 * @param {string} text - the example text (or the label in brackets).
 * @param {XmlEscapes} escapes - the editor's escapes for text and attribute values.
 * @param {string} [before] - the filled text just before the fill, to keep a closing mark from forming across it.
 * @returns {string} the text for the place; empty in the markup itself.
 */
export function escapeXmlFill(place, text, escapes, before = '') {
    if (place.kind === 'text') return escapes.text(text);
    if (place.kind === 'attribute') return escapes.attribute(text, place.quote);
    if (place.kind === 'comment') return (before.endsWith('-') && text.startsWith('-') ? ' ' : '') + escapeXmlComment(text);
    if (place.kind === 'cdata') return escapeCdataFill(text, before);
    if (place.kind === 'instruction') return (before.endsWith('?') && text.startsWith('>') ? ' ' : '') + text.replace(/\?>/g, '? >').replace(/\?$/, '? ');
    return '';
}

/**
 * Writes an example into a CDATA section: "]]>" inside it, and one that would form with the text
 * before or after it, ends the section and starts a new one in its middle, so the text stays as it is.
 * @param {string} text - the example text.
 * @param {string} before - the filled text just before the fill.
 * @returns {string} the text for the CDATA section.
 */
function escapeCdataFill(text, before) {
    const split = CDATA_END + CDATA_START;
    const start = before.endsWith(']') && (text.startsWith(']') || text.startsWith('>')) ? split : '';
    const end = text.endsWith(']') ? split : '';
    return start + escapeXmlCdata(text) + end;
}

/**
 * Makes a text safe for a comment: "--" and a "-" at its end are split by a space.
 * @param {string} text - the text.
 * @returns {string} the text a comment can hold.
 */
export function escapeXmlComment(text) {
    return text.replace(/--/g, '- -').replace(/--/g, '- -').replace(/-$/, '- ');
}

/**
 * Makes a text safe for a CDATA section: "]]>" ends the section and starts a new one in its middle.
 * @param {string} text - the text.
 * @returns {string} the text a CDATA section can hold.
 */
export function escapeXmlCdata(text) {
    return text.replace(/]]>/g, ']]]]><![CDATA[>');
}
