/**
 * Highlighting of XML code: the HTML laid under the code's textarea, with a class for
 * every kind of token (p punctuation, k names, a attribute names, s values, e entity
 * references, c comments, d CDATA, processing instructions and the DOCTYPE).
 */

import { escapeHtml, findTagClose, findDoctypeClose } from './xml.js?v=6';

const TAG_TOKEN = /(\s+)|([^\s=/>"']+)|(=)|("[^"]*"?|'[^']*'?)|(\/?>)|([\s\S])/g;
const ENTITY_REFERENCE = /&#?[\w.:-]+;/g;
const COMMENT_OPENER = '<!--';
const CDATA_OPENER = '<![CDATA[';
const PI_OPENER = '<?';

/**
 * Returns a token as a span of its class.
 * @param {string} className - the class of the token.
 * @param {string} text - the token.
 * @returns {string} the escaped token in a span.
 */
function renderToken(className, text) {
    return `<span class="${className}">${escapeHtml(text)}</span>`;
}

/**
 * Returns the HTML of a text with its entity references marked.
 * @param {string} text - text or an attribute value.
 * @returns {string} the escaped text.
 */
function renderText(text) {
    let html = '', last = 0;
    text.replace(ENTITY_REFERENCE, (reference, at) => {
        html += escapeHtml(text.slice(last, at)) + renderToken('e', reference);
        last = at + reference.length;
        return reference;
    });
    return html + escapeHtml(text.slice(last));
}

/**
 * Returns the HTML of a start tag: its name, attribute names, "=" and values.
 * @param {string} tag - the start tag from "<" to ">".
 * @returns {string} the highlighted tag.
 */
function renderStartTag(tag) {
    const nameMatch = /^<([^\s/>]*)/.exec(tag);
    let html = renderToken('p', '<') + renderToken('k', nameMatch[1]);
    const rest = tag.slice(nameMatch[0].length);
    TAG_TOKEN.lastIndex = 0;
    let token;
    while ((token = TAG_TOKEN.exec(rest))) {
        if (token[1]) html += token[1];
        else if (token[2]) html += renderToken('a', token[2]);
        else if (token[3]) html += renderToken('p', '=');
        else if (token[4]) html += `<span class="s">${renderText(token[4])}</span>`;
        else if (token[5]) html += renderToken('p', token[5]);
        else html += escapeHtml(token[6]);
    }
    return html;
}

/**
 * Returns the highlighted HTML of the code.
 * @param {string} source - the code.
 * @returns {string} HTML with the same text as the code.
 */
export function highlight(source) {
    let html = '', index = 0;
    while (index < source.length) {
        const tagStart = source.indexOf('<', index);
        const textEnd = tagStart < 0 ? source.length : tagStart;
        if (textEnd > index) html += renderText(source.slice(index, textEnd));
        if (tagStart < 0) break;
        const markup = renderMarkup(source, tagStart);
        html += markup.html;
        index = markup.end;
    }
    return html;
}

/**
 * Returns the HTML of one piece of markup and where it ends.
 * @param {string} source - the code.
 * @param {number} tagStart - the offset of the "<".
 * @returns {{html: string, end: number}} the highlighted markup and the offset after it.
 */
function renderMarkup(source, tagStart) {
    if (source.startsWith(COMMENT_OPENER, tagStart)) return renderDelimited(source, tagStart, 'c', '-->', COMMENT_OPENER.length);
    if (source.startsWith(CDATA_OPENER, tagStart)) return renderDelimited(source, tagStart, 'd', ']]>', CDATA_OPENER.length);
    if (source.startsWith(PI_OPENER, tagStart)) return renderDelimited(source, tagStart, 'd', '?>', PI_OPENER.length);
    if (source.startsWith('<!', tagStart)) {
        const end = findDoctypeClose(source, tagStart) + 1;
        return { html: renderToken('d', source.slice(tagStart, end)), end };
    }
    if (source[tagStart + 1] === '/') {
        const closeAt = source.indexOf('>', tagStart);
        const end = closeAt < 0 ? source.length : closeAt + 1;
        const parts = /^<\/([^\s>]*)([\s\S]*)$/.exec(source.slice(tagStart, end));
        return { html: renderToken('p', '</') + renderToken('k', parts[1]) + (parts[2] ? renderToken('p', parts[2]) : ''), end };
    }
    const end = Math.min(findTagClose(source, tagStart) + 1, source.length);
    return { html: renderStartTag(source.slice(tagStart, end)), end };
}

/**
 * Returns the HTML of a comment, a CDATA section or a processing instruction.
 * @param {string} source - the code.
 * @param {number} tagStart - the offset of the "<".
 * @param {string} className - the class of the whole piece.
 * @param {string} closer - the text that ends it.
 * @param {number} openerLength - the length of the text that starts it.
 * @returns {{html: string, end: number}} the highlighted piece and the offset after it.
 */
function renderDelimited(source, tagStart, className, closer, openerLength) {
    const closeAt = source.indexOf(closer, tagStart + openerLength);
    const end = closeAt < 0 ? source.length : closeAt + closer.length;
    return { html: renderToken(className, source.slice(tagStart, end)), end };
}
