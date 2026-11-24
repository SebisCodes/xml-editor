/**
 * The reader of XML: a scanner that gives every node its place in the code. The
 * well-formedness check is in xml-check.js.
 *
 * parseNodes() reads the code in these steps:
 *   1. walk from "<" to "<": text, comments, CDATA, processing instructions, the DOCTYPE,
 *      end tags and start tags, each with its exact range in the code;
 *   2. keep a stack of the open elements, so end tags close their element and unclosed
 *      elements end where their parent ends;
 *   3. give every element and attribute its namespace from the xmlns declarations in scope;
 *   4. give every node its XPath (xml-paths.js).
 *
 * The scanner is one topic, the rules of XML markup, and stays in one file, longer than the
 * guide value of 300 lines. Highlighting, paths, the check and formatting are in
 * xml-highlight.js, xml-paths.js, xml-check.js and xml-format.js.
 */

import { setPaths } from './xml-paths.js?v=2';
import { MAX_DEPTH, PREDEFINED_ENTITIES } from './xml-check.js?v=4';

/**
 * A node of the code with its place.
 * @typedef {Object} XmlNode
 * @property {string} type - "doc", "el", "text", "comment", "cdata", "pi" or "doctype".
 * @property {number} start - the offset of its first character in the code.
 * @property {number} end - the offset after its last character.
 * @property {number[]} [inner] - [from, to] of its content (text, comment, CDATA, PI, element content).
 * @property {number} id - its place in XmlModel.all (-1 for the document).
 * @property {XmlNode|null} parent - the node it is in.
 * @property {XmlNode[]} [children] - the nodes in a document or element.
 * @property {string} [name] - an element's name as written.
 * @property {number} [nameStart] - the offset of an element's name.
 * @property {number} [nameEnd] - the offset after an element's name.
 * @property {number} [tagEnd] - the offset after an element's start tag.
 * @property {number} [closeStart] - the offset of an element's end tag, -1 when self-closing or never closed.
 * @property {boolean} [selfClose] - an element written as <name/>.
 * @property {boolean} [unclosed] - an element whose end tag is missing.
 * @property {XmlAttribute[]} [attrs] - an element's attributes.
 * @property {number} [index] - an element's place among all elements (document order).
 * @property {string} [target] - a processing instruction's target.
 * @property {string} [prefix] - an element's namespace prefix, "" without.
 * @property {string} [local] - an element's name without its prefix.
 * @property {string|null} [uri] - an element's namespace URI, null when the prefix is not declared.
 * @property {Object<string, string>} [scope] - the namespace prefixes in scope at an element.
 * @property {string} [path] - the node's XPath (xml-paths.js).
 * @property {string} [step] - the last step of the node's XPath.
 * @property {number} [depth] - how many elements the node is in.
 * @property {number} [pos] - its position among siblings of the same kind, 0 when it is the only one.
 */

/**
 * An attribute of a start tag with its place.
 * @typedef {Object} XmlAttribute
 * @property {string} name - the name as written.
 * @property {number} wsStart - the offset of the white space before the name.
 * @property {number} start - the offset of the name.
 * @property {number} nameStart - the offset of the name.
 * @property {number} nameEnd - the offset after the name.
 * @property {number} end - the offset after the value and its closing quote.
 * @property {string} quote - the quote of the value (`"` when the value has none).
 * @property {number} valStart - the offset of the value inside its quotes.
 * @property {number} valEnd - the offset after the value.
 * @property {string} raw - the value as written.
 * @property {string} value - the value with its entity references resolved.
 * @property {boolean} [noValue] - an attribute written without "=value".
 * @property {string} [prefix] - its namespace prefix, "" without.
 * @property {string|null} [uri] - its namespace URI, null when the prefix is not declared.
 */

/**
 * The nodes of the code.
 * @typedef {Object} XmlModel
 * @property {XmlNode} doc - the document node.
 * @property {XmlNode[]} all - every node in document order; node.id is its place here.
 * @property {XmlNode[]} els - every element in document order (as getElementsByTagName('*')).
 * @property {{name: string, start: number, end: number}[]} stray - end tags without a start tag.
 * @property {string} src - the code the model was read from.
 * @property {number} tooDeep - the offset of the first element nested too deep, -1 when none.
 */

/** An XML name, optionally with a prefix (letters, digits, _ - . and one colon). */
export const XML_NAME = /^[\p{L}_][\p{L}\p{N}_.\-·]*(?::[\p{L}_][\p{L}\p{N}_.\-·]*)?$/u;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const ENTITY_REFERENCE = /^&(#x[0-9a-fA-F]+|#[0-9]+|[\p{L}_][\p{L}\p{N}_.\-:]*);/u;
const ENTITY_LOOKAHEAD = 48;            // characters read for one entity reference
const MAX_CODE_POINT = 0x10ffff;
const PI_TARGET_LOOKAHEAD = 80;         // characters read for the target of a processing instruction
const PI_SPACE_LOOKAHEAD = 200;         // characters from "<?" within which the white space after the target is read
const COMMENT_OPENER = '<!--';
const CDATA_OPENER = '<![CDATA[';
const TWO_CHARACTER_OPENER = 2;         // "<?", "<!" and "</"
const XMLNS_PREFIX = 'xmlns:';
const ATTRIBUTE = /(\s*)([^\s=/>"']+)(?:(\s*=\s*)("([^"]*)"?|'([^']*)'?|[^\s/>"']+))?/g;

// --- Escaping ---

/**
 * Escapes a text for the content of an element.
 * @param {*} text - the text (turned into a string).
 * @returns {string} the text with &, < and > as entity references.
 */
export function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes a text for an attribute value between the given quotes.
 * @param {*} text - the value (turned into a string).
 * @param {string} [quote] - the quote around the value, `"` or `'`.
 * @returns {string} the value with &, <, the quote, tabs and line breaks as references.
 */
export function escapeAttribute(text, quote = '"') {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&apos;' : '&quot;')
        .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

/**
 * Escapes a text for the HTML of the editor itself (highlighting, tree).
 * @param {*} text - the text (turned into a string).
 * @returns {string} the text with &, <, > and " as entity references.
 */
export function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Resolves the entity references of a text and keeps where each character came from.
 * Entities that are not predefined stay as they are written.
 * @param {string} raw - the text as written in the code.
 * @returns {{text: string, pos: number[]}} the text, and pos[i] the offset in raw of
 *   character i (pos[text.length] is raw.length).
 */
export function expandEntities(raw) {
    let text = '';
    const pos = [];
    for (let index = 0; index < raw.length;) {
        const reference = raw[index] === '&' ? ENTITY_REFERENCE.exec(raw.slice(index, index + ENTITY_LOOKAHEAD)) : null;
        if (reference) {
            const character = getEntityCharacter(reference[1], reference[0]);
            for (let k = 0; k < character.length; k++) { text += character[k]; pos.push(index); }
            index += reference[0].length;
            continue;
        }
        text += raw[index];
        pos.push(index);
        index++;
    }
    pos.push(raw.length);
    return { text, pos };
}

/**
 * Returns what an entity reference stands for.
 * @param {string} key - the reference without & and ; ("#x41", "#65", "amp" …).
 * @param {string} written - the reference as written, kept for unknown entities.
 * @returns {string} the character(s), or the reference as written.
 */
function getEntityCharacter(key, written) {
    if (key[0] === '#') {
        const codePoint = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
        return codePoint > 0 && codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : written;
    }
    return Object.hasOwn(PREDEFINED_ENTITIES, key) ? PREDEFINED_ENTITIES[key] : written;   // &constructor; stays as written
}

// --- Scanner ---

/**
 * Returns the end of a start tag, skipping quoted values.
 * @param {string} source - the code.
 * @param {number} start - the offset of the "<".
 * @returns {number} the offset of the ">", before a "<" inside the tag (a broken tag), or the code's length.
 */
export function findTagClose(source, start) {
    let quote = null;
    for (let index = start + 1; index < source.length; index++) {
        const character = source[index];
        if (quote) { if (character === quote) quote = null; } else if (character === '"' || character === "'") quote = character;
        else if (character === '>') return index;
        else if (character === '<') return index - 1;
    }
    return source.length;
}

/**
 * Returns the end of a DOCTYPE declaration including an internal subset in square brackets.
 * @param {string} source - the code.
 * @param {number} start - the offset of the "<!".
 * @returns {number} the offset of its ">", or the code's length.
 */
export function findDoctypeClose(source, start) {
    let depth = 0;
    for (let index = start + 2; index < source.length; index++) {
        const character = source[index];
        if (character === '"' || character === "'") {
            const quoteEnd = source.indexOf(character, index + 1);
            if (quoteEnd < 0) return source.length;
            index = quoteEnd;
        } else if (character === '[') depth++;
        else if (character === ']') depth--;
        else if (character === '>' && depth <= 0) return index;
    }
    return source.length;
}

/**
 * Returns the name at a position (as long as it is: XML names have no length limit).
 * @param {string} source - the code.
 * @param {number} at - the offset where the name starts.
 * @param {RegExp} pattern - a sticky pattern of the characters of the name.
 * @returns {string} the name, empty when there is none.
 */
function getNameAt(source, at, pattern) {
    pattern.lastIndex = at;
    return pattern.exec(source)[0];
}

/**
 * Returns the attributes of a start tag.
 * @param {string} source - the code.
 * @param {number} from - the offset after the element's name.
 * @param {number} to - the offset of the tag's ">" (or "/>").
 * @returns {XmlAttribute[]} the attributes in order.
 */
function getAttributes(source, from, to) {
    const attributes = [];
    const part = source.slice(from, to);
    const pattern = new RegExp(ATTRIBUTE.source, 'g');
    let match;
    while ((match = pattern.exec(part))) attributes.push(createAttribute(source, from + match.index, match));
    return attributes;
}

/**
 * Creates the attribute that a match of ATTRIBUTE found.
 * @param {string} source - the code.
 * @param {number} at - the offset of the match in the code.
 * @param {RegExpExecArray} match - the match: white space, name, "=", value, and the value inside its quotes.
 * @returns {XmlAttribute} the attribute with its places.
 */
function createAttribute(source, at, match) {
    const nameStart = at + match[1].length;
    const attribute = { name: match[2], wsStart: at, start: nameStart, nameStart, nameEnd: nameStart + match[2].length, end: at + match[0].length };
    if (match[4] != null) {
        const quote = match[4][0] === '"' || match[4][0] === "'" ? match[4][0] : '';
        attribute.quote = quote || '"';
        attribute.valStart = attribute.nameEnd + match[3].length + (quote ? 1 : 0);
        attribute.valEnd = attribute.valStart + (match[5] ?? match[6] ?? match[4]).length;
        attribute.raw = source.slice(attribute.valStart, attribute.valEnd);
    } else {
        attribute.quote = '"';
        attribute.valStart = attribute.valEnd = attribute.end;
        attribute.raw = '';
        attribute.noValue = true;
    }
    attribute.value = expandEntities(attribute.raw).text;
    return attribute;
}

/**
 * Reads the code into nodes, each with its place in the code. Every node has id (its place
 * in all) and parent; elements are counted in document order (index), the same order as
 * getElementsByTagName('*').
 * @param {string} source - the code.
 * @returns {XmlModel} the nodes of the code.
 */
export function parseNodes(source) {
    const reader = createReader(source);
    while (reader.index < source.length && readNextNode(reader)) { /* one node per step */ }
    while (reader.stack.length > 1) closeUnclosed(reader.stack.pop(), source.length);
    setNamespaces(reader.doc);
    const model = { doc: reader.doc, all: reader.all, els: reader.els, stray: reader.stray, src: source, tooDeep: reader.tooDeep };
    setPaths(model);
    return model;
}

/**
 * The state of one run of the scanner.
 * @typedef {Object} ScannerState
 * @property {string} source - the code.
 * @property {XmlNode} doc - the document node.
 * @property {XmlNode[]} all - every node so far.
 * @property {XmlNode[]} els - every element so far.
 * @property {Object[]} stray - end tags without a start tag.
 * @property {XmlNode[]} stack - the open elements, the document first.
 * @property {string[]} deep - names of elements below MAX_DEPTH, kept flat; their end tags are matched here.
 * @property {number} tooDeep - the offset of the first element nested too deep, -1 when none.
 * @property {number} index - where the next read starts.
 */

/**
 * Creates the state of one run of the scanner.
 * @param {string} source - the code.
 * @returns {ScannerState} the state at the start of the code.
 */
function createReader(source) {
    const doc = { type: 'doc', children: [], start: 0, end: source.length, parent: null, id: -1 };
    // deep: names of elements below MAX_DEPTH, kept flat; their end tags are matched there.
    return { source, doc, all: [], els: [], stray: [], stack: [doc], deep: [], tooDeep: -1, index: 0 };
}

/**
 * Adds a node to the element open at the reader's position, and gives it its parent and id.
 * @param {ScannerState} reader - the scanner's state.
 * @param {Object} node - the node, without parent and id.
 * @returns {void}
 */
function addNode(reader, node) {
    const parent = reader.stack[reader.stack.length - 1];
    node.parent = parent;
    node.id = reader.all.length;
    parent.children.push(node);
    reader.all.push(node);
}

/**
 * Marks an element that is never closed: it ends where its parent ends.
 * @param {XmlNode} element - the open element.
 * @param {number} end - the offset where it ends.
 * @returns {void}
 */
function closeUnclosed(element, end) {
    element.end = end;
    element.unclosed = true;
}

/**
 * Reads the text before the next "<" and the markup that starts there. Like every read step
 * of the scanner it adds what it read to the nodes and moves on (a reader that
 * consumes its input).
 * @param {ScannerState} reader - the scanner's state; its index moves past what was read.
 * @returns {boolean} false when no "<" is left (the rest was text).
 */
function readNextNode(reader) {
    const { source } = reader;
    const start = reader.index;
    const tagStart = source.indexOf('<', start);
    const textEnd = tagStart < 0 ? source.length : tagStart;
    if (textEnd > start) addNode(reader, { type: 'text', start, end: textEnd, inner: [start, textEnd] });
    if (tagStart < 0) return false;
    reader.index = readMarkup(reader, tagStart);
    return true;
}

/**
 * Reads one piece of markup and returns where the next one starts.
 * @param {ScannerState} reader - the scanner's state.
 * @param {number} tagStart - the offset of the "<".
 * @returns {number} the offset after the markup.
 */
function readMarkup(reader, tagStart) {
    const { source } = reader;
    if (source.startsWith(COMMENT_OPENER, tagStart)) return readDelimited(reader, tagStart, 'comment', '-->', COMMENT_OPENER.length);
    if (source.startsWith(CDATA_OPENER, tagStart)) return readDelimited(reader, tagStart, 'cdata', ']]>', CDATA_OPENER.length);
    if (source.startsWith('<?', tagStart)) return readProcessingInstruction(reader, tagStart);
    if (source.startsWith('<!', tagStart)) {
        const end = findDoctypeClose(source, tagStart) + 1;
        addNode(reader, { type: 'doctype', start: tagStart, end, inner: [tagStart + TWO_CHARACTER_OPENER, end - 1] });
        return end;
    }
    if (source[tagStart + 1] === '/') return readEndTag(reader, tagStart);
    return readStartTag(reader, tagStart);
}

/**
 * Reads a comment or a CDATA section.
 * @param {ScannerState} reader - the scanner's state.
 * @param {number} tagStart - the offset of the "<".
 * @param {string} type - "comment" or "cdata".
 * @param {string} closer - the text that ends it.
 * @param {number} openerLength - the length of the text that starts it.
 * @returns {number} the offset after it.
 */
function readDelimited(reader, tagStart, type, closer, openerLength) {
    const { source } = reader;
    const closeAt = source.indexOf(closer, tagStart + openerLength);
    const end = closeAt < 0 ? source.length : closeAt + closer.length;
    addNode(reader, { type, start: tagStart, end, inner: [tagStart + openerLength, closeAt < 0 ? source.length : closeAt] });
    return end;
}

/**
 * Reads a processing instruction (also the XML declaration).
 * @param {ScannerState} reader - the scanner's state.
 * @param {number} tagStart - the offset of the "<?".
 * @returns {number} the offset after it.
 */
function readProcessingInstruction(reader, tagStart) {
    const { source } = reader;
    const closeAt = source.indexOf('?>', tagStart + TWO_CHARACTER_OPENER);
    const end = closeAt < 0 ? source.length : closeAt + 2;
    const contentEnd = closeAt < 0 ? source.length : closeAt;
    const targetStart = tagStart + TWO_CHARACTER_OPENER;
    const target = /^[^\s?]*/.exec(source.slice(targetStart, targetStart + PI_TARGET_LOOKAHEAD))[0];
    const targetEnd = targetStart + target.length;
    const dataStart = targetEnd + /^\s*/.exec(source.slice(targetEnd, tagStart + PI_SPACE_LOOKAHEAD))[0].length;
    addNode(reader, { type: 'pi', target, start: tagStart, end, inner: [Math.min(dataStart, contentEnd), contentEnd] });
    return end;
}

/**
 * Reads an end tag: it closes its element and every element left open inside it.
 * @param {ScannerState} reader - the scanner's state.
 * @param {number} tagStart - the offset of the "</".
 * @returns {number} the offset after the end tag.
 */
function readEndTag(reader, tagStart) {
    const { source, stack, deep } = reader;
    const closeAt = source.indexOf('>', tagStart);
    const end = closeAt < 0 ? source.length : closeAt + 1;
    const name = getNameAt(source, tagStart + TWO_CHARACTER_OPENER, /[^\s>/]*/y);
    if (deep.length && deep[deep.length - 1] === name) { deep.pop(); return end; }
    let level = stack.length - 1;
    while (level > 0 && stack[level].name !== name) level--;
    if (level <= 0) { reader.stray.push({ name, start: tagStart, end }); return end; }
    while (stack.length - 1 > level) closeUnclosed(stack.pop(), tagStart);
    const element = stack.pop();
    element.closeStart = tagStart;
    element.end = end;
    element.inner[1] = tagStart;
    return end;
}

/**
 * Reads a start tag; an element that is not self-closing stays open for its content.
 * @param {ScannerState} reader - the scanner's state.
 * @param {number} tagStart - the offset of the "<".
 * @returns {number} the offset after the start tag.
 */
function readStartTag(reader, tagStart) {
    const { source, stack } = reader;
    const close = findTagClose(source, tagStart);
    const tagEnd = Math.min(close + 1, source.length);
    const selfClose = source[close - 1] === '/';
    const name = getNameAt(source, tagStart + 1, /[^\s/>]*/y);
    const nameEnd = tagStart + 1 + name.length;
    const element = {
        type: 'el', name, start: tagStart, nameStart: tagStart + 1, nameEnd, tagEnd, end: tagEnd, selfClose, closeStart: -1,
        attrs: getAttributes(source, nameEnd, selfClose ? close - 1 : close), children: [], index: reader.els.length, inner: [tagEnd, tagEnd],
    };
    addNode(reader, element);
    reader.els.push(element);
    if (selfClose || source[close] !== '>') return tagEnd;
    // Deeper nesting would overflow the browser's stack in the walks over the tree: it is an error.
    if (stack.length > MAX_DEPTH) {
        reader.deep.push(element.name);
        if (reader.tooDeep < 0) reader.tooDeep = tagStart;
    } else stack.push(element);
    return tagEnd;
}

/**
 * Gives every element and attribute its namespace from the xmlns declarations in scope.
 * @param {XmlNode} doc - the document node.
 * @returns {void}
 */
function setNamespaces(doc) {
    setNamespacesBelow(doc, Object.assign(Object.create(null), { xml: XML_NAMESPACE }));
}

/**
 * Gives the elements below a node, and their attributes, their namespaces.
 * @param {XmlNode} node - the document or an element.
 * @param {Object<string, string>} scope - prefix -> URI in scope at the node ("" the default namespace).
 * @returns {void}
 */
function setNamespacesBelow(node, scope) {
    for (const child of node.children) {
        if (child.type !== 'el') continue;
        const childScope = getElementScope(child, scope);
        child.scope = childScope;
        const prefix = child.name.includes(':') ? child.name.split(':')[0] : '';
        child.prefix = prefix;
        child.local = prefix ? child.name.slice(prefix.length + 1) : child.name;
        child.uri = prefix === 'xml' ? XML_NAMESPACE : childScope[prefix] ?? (prefix ? null : '');
        for (const attribute of child.attrs) setAttributeNamespace(attribute, childScope);
        setNamespacesBelow(child, childScope);
    }
}

/**
 * Returns the namespace scope of an element: its parent's, with its own declarations added.
 * @param {XmlNode} element - the element.
 * @param {Object<string, string>} scope - the scope of its parent.
 * @returns {Object<string, string>} the parent's scope, or a copy with the element's declarations.
 */
function getElementScope(element, scope) {
    let elementScope = scope;
    for (const attribute of element.attrs) {
        if (attribute.name !== 'xmlns' && !attribute.name.startsWith(XMLNS_PREFIX)) continue;
        if (elementScope === scope) elementScope = Object.assign(Object.create(null), scope);   // prefixes like __proto__ are plain keys
        elementScope[attribute.name === 'xmlns' ? '' : attribute.name.slice(XMLNS_PREFIX.length)] = attribute.value;
    }
    return elementScope;
}

/**
 * Gives an attribute its prefix and namespace URI.
 * @param {XmlAttribute} attribute - the attribute.
 * @param {Object<string, string>} scope - the namespace scope of its element.
 * @returns {void}
 */
function setAttributeNamespace(attribute, scope) {
    const prefix = attribute.name.includes(':') ? attribute.name.split(':')[0] : '';
    attribute.prefix = prefix;
    attribute.uri = !prefix || prefix === 'xmlns' || attribute.name === 'xmlns' ? '' : prefix === 'xml' ? XML_NAMESPACE : scope[prefix] ?? null;
}

/**
 * Returns the innermost node (an element or a node inside one) whose range contains a position.
 * @param {XmlModel} model - the nodes of the code.
 * @param {number} pos - the offset in the code.
 * @returns {XmlNode|null} the node, or null outside every node.
 */
export function findNodeAt(model, pos) {
    let node = model.doc;
    for (;;) {
        const next = node.children ? node.children.find(child => pos >= child.start && (pos < child.end || (pos === child.end && child.type === 'el' && child.end === model.src.length))) : null;
        if (!next) return node === model.doc ? null : node;
        if (next.type !== 'el') return next;
        node = next;
    }
}
