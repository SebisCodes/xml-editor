/**
 * Markers for template tags in a text that the browser's HTML or XML parser reads (?template=):
 * each tag gives way to a marker of the same length that carries the tag's number, written in
 * characters of the private use area, which HTML and XML read as text in content and in attribute
 * values. After
 * parsing, setMarkedTags() writes every marker of the parsed document back as its tag.
 *
 * A marker is its start character, three digit characters (the tag's number, base 256) and fill
 * characters up to the tag's length. The start character is one that the code holds neither as a
 * character nor as a character reference, so every start character in the parsed document begins
 * a marker. The same file serves the HTML, SVG and XML editors; it works on strings and DOM nodes.
 */

/** The ranges of characters a marker may start with; the first one the code leaves free is taken. */
const START_RANGES = [[0xE000, 0xE0FE], [0xE200, 0xF8FF]];
/** The character a marker is filled with up to the length of its tag. */
const MARKER_FILL = '\uE0FF';
/** The first of the 256 characters that write the digits of a tag's number. */
const MARKER_DIGIT = 0xE100;
const MARKER_BASE = 256;
const DIGIT_COUNT = 3;
const ELEMENT_NODE = 1;

/**
 * How the markers of one text are written.
 * @typedef {Object} TemplateMarking
 * @property {string} start - the start character of every marker.
 * @property {string[]} labels - every tag as written, by its number.
 */

/**
 * Creates the marking of a code: a start character the code leaves free and the tags as written.
 * @param {string} code - the code as written.
 * @param {import('./template-tags.js').TemplateTag[]} tags - the tags of the code, in order.
 * @returns {?TemplateMarking} the marking, or null when every start character occurs in the code.
 */
export function createTemplateMarking(code, tags) {
    const labels = tags.map(tag => code.slice(tag.start, tag.end));
    for (const [first, last] of START_RANGES) {
        for (let codePoint = first; codePoint <= last; codePoint++) {
            if (!isCharacterInCode(code, codePoint)) return { start: String.fromCharCode(codePoint), labels };
        }
    }
    return null;
}

/**
 * Tells whether a code holds a character, written as itself or as a character reference.
 * @param {string} code - the code.
 * @param {number} codePoint - the character's code point.
 * @returns {boolean} true when the code holds it.
 */
function isCharacterInCode(code, codePoint) {
    if (code.includes(String.fromCharCode(codePoint))) return true;
    return new RegExp(`&#(?:x0*${codePoint.toString(16)}|0*${codePoint});`, 'i').test(code);
}

/**
 * Builds the marker of a tag.
 * @param {TemplateMarking} marking - the marking of the code.
 * @param {number} index - the tag's number.
 * @returns {string} the marker, as long as the tag.
 */
export function buildTemplateMarker(marking, index) {
    let digits = '';
    for (let place = 0, rest = index; place < DIGIT_COUNT; place++, rest = Math.floor(rest / MARKER_BASE)) {
        digits = String.fromCharCode(MARKER_DIGIT + (rest % MARKER_BASE)) + digits;
    }
    return marking.start + digits + MARKER_FILL.repeat(marking.labels[index].length - 1 - DIGIT_COUNT);
}

/**
 * A marker found in a text.
 * @typedef {Object} FoundMarker
 * @property {number} start - where the marker starts in the text.
 * @property {number} end - where it ends.
 * @property {string} label - the tag it stands for, as written.
 */

/**
 * Finds the markers of a text, in order.
 * @param {string} text - an attribute value or the data of a text, CDATA or comment node.
 * @param {TemplateMarking} marking - the marking of the code.
 * @returns {FoundMarker[]} each marker with its place and its tag.
 */
export function findTemplateMarkers(text, marking) {
    const markers = [];
    for (let at = text.indexOf(marking.start); at >= 0; at = text.indexOf(marking.start, at + 1)) {
        const label = marking.labels[getMarkerIndex(text.slice(at + 1, at + 1 + DIGIT_COUNT))] ?? '';
        const end = at + Math.max(label.length, 1);
        markers.push({ start: at, end, label });
        at = end - 1;
    }
    return markers;
}

/**
 * Returns a text of the parsed document with each marker written as its tag.
 * @param {string} text - an attribute value or the data of a text, CDATA or comment node.
 * @param {TemplateMarking} marking - the marking of the code.
 * @returns {string} the text as written in the code.
 */
export function getMarkedText(text, marking) {
    let result = '', last = 0;
    for (const marker of findTemplateMarkers(text, marking)) {
        result += text.slice(last, marker.start) + marker.label;
        last = marker.end;
    }
    return result + text.slice(last);
}

/**
 * Returns the number the digits of a marker write.
 * @param {string} digits - the digit characters.
 * @returns {number} the tag's number.
 */
function getMarkerIndex(digits) {
    let index = 0;
    for (const digit of digits) index = index * MARKER_BASE + (digit.charCodeAt(0) - MARKER_DIGIT);
    return index;
}

/**
 * Writes every marker of a parsed document back as its tag: in attribute values and in the data of
 * text, CDATA and comment nodes.
 * @param {Node} node - the parsed document or one of its nodes; changed in place.
 * @param {?TemplateMarking} marking - the marking of the code, or null when the code holds no tag.
 * @returns {void}
 */
export function setMarkedTags(node, marking) {
    if (!marking || !marking.labels.length) return;
    if (node.nodeType === ELEMENT_NODE) {
        for (const attribute of node.attributes) {
            if (attribute.value.includes(marking.start)) attribute.value = getMarkedText(attribute.value, marking);
        }
    } else if (typeof node.data === 'string' && node.data.includes(marking.start)) {
        node.data = getMarkedText(node.data, marking);
    }
    for (const child of node.childNodes) setMarkedTags(child, marking);
}
