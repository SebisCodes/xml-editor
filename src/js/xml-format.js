/**
 * Formatting and conversions of the scanned nodes (xml.js): Format indents every element
 * on its own line, Minify removes comments and the white space between elements (mixed
 * content and xml:space="preserve" stay as written in both), plain text collects the
 * text, and the parsed document converts to JSON and YAML (attributes as "@name", text
 * next to elements as "#text", repeated elements as lists).
 */

import { expandEntities } from './xml.js?v=6';

const DEFAULT_UNIT = '  ';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const YAML_RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const YAML_PLAIN = /^[\p{L}_/.][\p{L}\p{N} _\-./()&,]*$/u;
const JSON_INDENT = 2;
const YAML_INDENT = 2;

/**
 * Tells whether a node is a text of white space only.
 * @param {string} source - the code.
 * @param {Object} node - a scanned node.
 * @returns {boolean} true for a blank text.
 */
function isBlankText(source, node) {
    return node.type === 'text' && !source.slice(node.start, node.end).trim();
}

/**
 * Returns an element's start tag with one space before each attribute and none around "=".
 * @param {string} source - the code.
 * @param {Object} element - a scanned element.
 * @returns {string} the start tag.
 */
function getStartTag(source, element) {
    return `<${element.name}${element.attrs.map(attribute => ' ' + source.slice(attribute.start, attribute.end).replace(/\s*=\s*/, '=')).join('')}${element.selfClose ? '/>' : '>'}`;
}

/**
 * Tells whether an element keeps its white space (xml:space="preserve" on it or around it).
 * @param {Object} element - a scanned element.
 * @returns {boolean} true when the nearest xml:space is "preserve".
 */
function isSpacePreserved(element) {
    for (let current = element; current && current.type === 'el'; current = current.parent) {
        const attribute = current.attrs.find(candidate => candidate.name === 'xml:space');
        if (attribute) return attribute.value === 'preserve';
    }
    return false;
}

/**
 * Tells whether an element holds text or CDATA next to (or instead of) elements.
 * @param {string} source - the code.
 * @param {Object} element - a scanned element.
 * @returns {boolean} true for mixed content.
 */
function isMixed(source, element) {
    return element.children.some(child => (child.type === 'text' && !isBlankText(source, child)) || child.type === 'cdata');
}

/**
 * Tells whether an element's content is written as it stands.
 * @param {string} source - the code.
 * @param {Object} element - a scanned element.
 * @returns {boolean} true for mixed content and xml:space="preserve".
 */
function isKeptAsWritten(source, element) {
    return isSpacePreserved(element) || isMixed(source, element);
}

/**
 * Returns the document indented by a unit, one element per line; mixed content (text with
 * elements) and xml:space="preserve" stay as they are.
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @param {string} [unit] - one level of indentation.
 * @returns {string} the formatted code, ending with a line break.
 */
export function formatXml(model, unit = DEFAULT_UNIT) {
    const lines = [];
    for (const child of model.doc.children) addFormattedNode(model.src, child, 0, unit, lines);
    return lines.join('\n') + '\n';
}

/**
 * Adds the lines of one node to the formatted code.
 * @param {string} source - the code.
 * @param {Object} node - a scanned node.
 * @param {number} depth - its indentation level.
 * @param {string} unit - one level of indentation.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addFormattedNode(source, node, depth, unit, lines) {
    if (node.type === 'el') { addFormattedElement(source, node, depth, unit, lines); return; }
    if (node.type !== 'text') { lines.push(unit.repeat(depth) + source.slice(node.start, node.end)); return; }
    const text = source.slice(node.start, node.end).trim();
    if (text) lines.push(unit.repeat(depth) + text);
}

/**
 * Adds the lines of one element to the formatted code.
 * @param {string} source - the code.
 * @param {Object} element - a scanned element.
 * @param {number} depth - its indentation level.
 * @param {string} unit - one level of indentation.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addFormattedElement(source, element, depth, unit, lines) {
    const indent = unit.repeat(depth);
    const startTag = getStartTag(source, element);
    if (element.selfClose) { lines.push(indent + startTag); return; }
    const endTag = `</${element.name}>`;
    if (isKeptAsWritten(source, element)) { lines.push(indent + startTag + source.slice(element.tagEnd, element.closeStart) + endTag); return; }
    const children = element.children.filter(child => !isBlankText(source, child));
    if (!children.length) { lines.push(indent + startTag + endTag); return; }
    lines.push(indent + startTag);
    for (const child of children) addFormattedNode(source, child, depth + 1, unit, lines);
    lines.push(indent + endTag);
}

/**
 * Returns the document compact: no comments, no white space between elements (except in
 * mixed content and xml:space="preserve").
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @returns {string} the minified code.
 */
export function getMinifiedXml(model) {
    return model.doc.children.map(child => (child.type === 'text' ? '' : getMinifiedNode(model.src, child))).filter(Boolean).join('');
}

/**
 * Returns one node minified.
 * @param {string} source - the code.
 * @param {Object} node - a scanned node.
 * @returns {string} the node without comments and white space between elements.
 */
function getMinifiedNode(source, node) {
    if (node.type === 'el') return getMinifiedElement(source, node);
    return node.type === 'comment' || node.type === 'text' ? '' : source.slice(node.start, node.end);
}

/**
 * Returns one element minified.
 * @param {string} source - the code.
 * @param {Object} element - a scanned element.
 * @returns {string} the element without comments and white space between its elements.
 */
function getMinifiedElement(source, element) {
    const startTag = getStartTag(source, element);
    if (element.selfClose) return startTag;
    if (isKeptAsWritten(source, element)) return startTag + source.slice(element.tagEnd, element.closeStart) + `</${element.name}>`;
    return startTag + element.children.map(child => getMinifiedNode(source, child)).join('') + `</${element.name}>`;
}

/**
 * Returns all text of the document, one text node per line.
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @returns {string} the text of the elements and CDATA sections, entities resolved.
 */
export function getPlainText(model) {
    const source = model.src;
    return model.all.filter(node => (node.type === 'text' || node.type === 'cdata') && node.parent.type === 'el')
        .map(node => (node.type === 'cdata' ? source.slice(node.inner[0], node.inner[1]) : expandEntities(source.slice(node.start, node.end)).text).trim())
        .filter(Boolean).join('\n') + '\n';
}

// --- JSON and YAML ---

/**
 * Returns an element as a value: attributes as "@name", text as "#text" (or the element's
 * value when it has nothing else), repeated children as arrays.
 * @param {Element} element - an element of the parsed document.
 * @returns {Object|string} the value of the element.
 */
function getElementValue(element) {
    const value = Object.create(null);
    for (const attribute of element.attributes) value['@' + attribute.name] = attribute.value;
    const childNodes = [...element.childNodes];
    const childElements = childNodes.filter(child => child.nodeType === ELEMENT_NODE);
    const text = childNodes.filter(child => child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE).map(child => child.data).join('').trim();
    if (!childElements.length && !element.attributes.length) return text;
    const groups = new Map();
    for (const child of childElements) {
        if (!groups.has(child.tagName)) groups.set(child.tagName, []);
        groups.get(child.tagName).push(getElementValue(child));
    }
    for (const [name, values] of groups) value[name] = values.length > 1 ? values : values[0];
    if (text) value['#text'] = text;
    // Names such as __proto__ are plain keys: built with defineProperty-like semantics, never through a setter.
    return Object.fromEntries(Object.entries(value));
}

/**
 * Returns the parsed document as a value: its root element's name and value.
 * @param {XMLDocument|null} parsed - the parsed document.
 * @returns {Object} {rootName: value}, empty without a document.
 */
export function getJsonValue(parsed) {
    return parsed && parsed.documentElement ? { [parsed.documentElement.tagName]: getElementValue(parsed.documentElement) } : {};
}

/**
 * Returns the parsed document as JSON.
 * @param {XMLDocument|null} parsed - the parsed document.
 * @returns {string} the JSON text, ending with a line break.
 */
export function convertToJson(parsed) {
    return JSON.stringify(getJsonValue(parsed), null, JSON_INDENT) + '\n';
}

/**
 * Returns the parsed document as YAML.
 * @param {XMLDocument|null} parsed - the parsed document.
 * @returns {string} the YAML text, ending with a line break.
 */
export function convertToYaml(parsed) {
    return getYamlLines(getJsonValue(parsed), 0).join('\n') + '\n';
}

/**
 * Returns a string as YAML: plain when it is safe, else as a JSON string.
 * @param {*} text - a key or a value.
 * @returns {string} the YAML scalar.
 */
function getYamlString(text) {
    return typeof text === 'string' && YAML_PLAIN.test(text) && !/\s$/.test(text) && !YAML_RESERVED.test(text) ? text : JSON.stringify(String(text));
}

/**
 * Returns a value that is written on one line.
 * @param {*} value - null, an empty list or object, or a string.
 * @returns {string} the YAML scalar.
 */
function getYamlScalar(value) {
    if (value == null) return 'null';
    if (Array.isArray(value)) return '[]';
    if (typeof value === 'object') return '{}';
    return value === '' ? '""' : getYamlString(value);
}

/**
 * Tells whether a value is a list or object with content (written on lines of its own).
 * @param {*} value - a value.
 * @returns {boolean} true for a non-empty list or object.
 */
function hasEntries(value) {
    return !!value && typeof value === 'object' && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);
}

/**
 * Returns the YAML lines of a value.
 * @param {*} value - a value from getJsonValue().
 * @param {number} indent - the spaces before each line.
 * @returns {string[]} the lines.
 */
function getYamlLines(value, indent) {
    const pad = ' '.repeat(indent);
    if (Array.isArray(value)) return getYamlListLines(value, indent, pad);
    if (!value || typeof value !== 'object') return [pad + getYamlScalar(value)];
    const keys = Object.keys(value);
    if (!keys.length) return [pad + '{}'];
    const lines = [];
    for (const key of keys) {
        const entry = value[key];
        if (hasEntries(entry)) lines.push(pad + getYamlString(key) + ':', ...getYamlLines(entry, Array.isArray(entry) ? indent : indent + YAML_INDENT));
        else lines.push(pad + getYamlString(key) + ': ' + getYamlScalar(entry));
    }
    return lines;
}

/**
 * Returns the YAML lines of a list.
 * @param {Array} list - the list.
 * @param {number} indent - the spaces before each line.
 * @param {string} pad - those spaces.
 * @returns {string[]} the lines, one "- " item after the other.
 */
function getYamlListLines(list, indent, pad) {
    if (!list.length) return [pad + '[]'];
    const lines = [];
    for (const item of list) {
        if (item && typeof item === 'object' && Object.keys(item).length) {
            const itemLines = getYamlLines(item, indent + YAML_INDENT);
            lines.push(pad + '- ' + itemLines[0].trimStart(), ...itemLines.slice(1));
        } else lines.push(pad + '- ' + getYamlScalar(item));
    }
    return lines;
}
