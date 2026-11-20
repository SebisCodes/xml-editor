/**
 * XPath of the scanned nodes (xml.js): every node gets its path, the path is written for
 * the XPath field, the nodes of the browser's parsed document are mapped back to the
 * scanned nodes, and the namespace prefixes of the document are looked up for XPath.
 */

const STEP_OF_TYPE = { text: 'text()', cdata: 'text()', comment: 'comment()', doctype: 'doctype' };
const ELEMENT_NODE = 1;
const ATTRIBUTE_NODE = 2;
const DOCUMENT_NODE = 9;
const DOCUMENT_TYPE_NODE = 10;
const DEFAULT_NAMESPACE_PREFIX = '_';
const XMLNS_PREFIX = 'xmlns:';

/**
 * A node of the parsed document mapped back to the scanned nodes.
 * @typedef {Object} XmlLinker
 * @property {function(Node): (Object|null)} findModelNode - the scanned node (or {attr, el} for an attribute) of a DOM node.
 */

/**
 * The namespace prefixes for XPath.
 * @typedef {Object} NamespaceResolver
 * @property {Object<string, string>} map - prefix -> namespace URI ("_" the default namespace of the root).
 * @property {function(string): (string|null)} fn - looks up a prefix, as document.evaluate() expects.
 */

/**
 * Tells whether a node takes part in the paths (an empty text does not).
 * @param {Object} node - a scanned node.
 * @returns {boolean} true unless it is a text without characters.
 */
function isCounted(node) {
    return node.type !== 'text' || node.end > node.start;
}

/**
 * Returns the key under which siblings of the same kind are counted.
 * @param {Object} node - a scanned node.
 * @returns {string} "e:<name>" for elements, "p:<target>" for processing instructions, the type otherwise.
 */
function getKindKey(node) {
    if (node.type === 'el') return 'e:' + node.name;
    if (node.type === 'pi') return 'p:' + node.target;
    return node.type === 'cdata' ? 'text' : node.type;
}

/**
 * Gives every node its XPath (path), its last step (step, with the position among siblings
 * of the same kind when there are several) and its depth.
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @returns {void}
 */
export function setPaths(model) {
    setPathsBelow(model.doc, '', 0);
}

/**
 * Gives the children of a node their paths, and the nodes below them.
 * @param {Object} node - the document or an element.
 * @param {string} base - the path of the node ("" for the document).
 * @param {number} depth - the depth of the children.
 * @returns {void}
 */
function setPathsBelow(node, base, depth) {
    const count = new Map(), seen = new Map();
    for (const child of node.children) {
        if (!isCounted(child)) continue;
        const key = getKindKey(child);
        count.set(key, (count.get(key) || 0) + 1);
    }
    for (const child of node.children) {
        child.depth = depth;
        if (!isCounted(child)) { child.path = base + '/text()'; child.step = 'text()'; continue; }
        const key = getKindKey(child), position = (seen.get(key) || 0) + 1;
        seen.set(key, position);
        const name = child.type === 'el' ? child.name : child.type === 'pi' ? `processing-instruction('${child.target}')` : STEP_OF_TYPE[child.type];
        child.pos = count.get(key) > 1 ? position : 0;
        child.step = name + (child.pos ? `[${position}]` : '');
        child.path = base + '/' + child.step;
        if (child.type === 'el') setPathsBelow(child, child.path, depth + 1);
    }
}

/**
 * Returns the XPath of a node (after setPaths).
 * @param {Object|null} node - a scanned node, or {attr, el} for an attribute.
 * @param {boolean} [forQuery] - written for the XPath field: elements in a default namespace
 *   get the prefix "_" (XPath 1.0 has no default namespace).
 * @returns {string} the path, "/" for the document or no node.
 */
export function getPath(node, forQuery = false) {
    if (!node || node.type === 'doc') return '/';
    if (node.attr) return getPath(node.el, forQuery) + '/@' + node.attr.name;
    if (!forQuery) return node.path;
    const steps = [];
    for (let step = node; step && step.type !== 'doc'; step = step.parent) steps.unshift((step.type === 'el' && !step.prefix && step.uri ? DEFAULT_NAMESPACE_PREFIX + ':' : '') + step.step);
    return '/' + steps.join('/');
}

/**
 * Creates the map from the nodes of the parsed document back to the scanned nodes:
 * elements by their order, other nodes by their place among their parent's children.
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @param {XMLDocument|null} parsed - the parsed document, null when not well-formed.
 * @returns {XmlLinker} the map; it finds nothing without a parsed document.
 */
export function createLinker(model, parsed) {
    if (!parsed) return { findModelNode: () => null };
    const domElements = parsed.getElementsByTagName('*');
    const elementIndex = new Map();
    for (let index = 0; index < domElements.length; index++) elementIndex.set(domElements[index], index);

    /**
     * Returns the scanned nodes that have a DOM node: the DOM has no node for the XML
     * declaration (<?xml …?>) or the DOCTYPE, and none for text at the top or empty text.
     * @param {Object} node - a scanned document or element.
     * @returns {Object[]} its children that the DOM has too.
     */
    function getDomChildren(node) {
        return node.children.filter(child => child.type !== 'doctype'
            && !(child.type === 'pi' && node.type === 'doc' && /^xml$/i.test(child.target))
            && !(child.type === 'text' && (node.type === 'doc' || child.end === child.start)));
    }

    /**
     * Returns the scanned node of a DOM node.
     * @param {Node|null} domNode - a node of the parsed document.
     * @returns {Object|null} the scanned node, {attr, el} for an attribute, or null.
     */
    function findModelNode(domNode) {
        if (!domNode) return null;
        if (domNode.nodeType === ELEMENT_NODE) return model.els[elementIndex.get(domNode)] || null;
        if (domNode.nodeType === ATTRIBUTE_NODE) {
            const element = findModelNode(domNode.ownerElement);
            const attribute = element && element.attrs.find(candidate => candidate.name === domNode.name);
            return attribute ? { attr: attribute, el: element } : null;
        }
        if (domNode.nodeType === DOCUMENT_NODE) return model.doc;
        const parent = domNode.parentNode;
        const modelParent = parent && findModelNode(parent);
        if (!modelParent) return null;
        const siblings = [...parent.childNodes].filter(child => child.nodeType !== DOCUMENT_TYPE_NODE);
        return getDomChildren(modelParent)[siblings.indexOf(domNode)] || null;
    }

    return { findModelNode };
}

/**
 * Returns the namespace prefixes for the XPath field: every prefix declared in the document
 * (the first declaration counts), and "_" for the default namespace of the root.
 * @param {XmlModel} model - the scanned nodes (xml.js).
 * @returns {NamespaceResolver} the prefixes and their lookup.
 */
export function createNamespaceResolver(model) {
    const map = Object.create(null);
    for (const element of model.els) {
        for (const attribute of element.attrs) {
            if (attribute.name.startsWith(XMLNS_PREFIX) && !(attribute.name.slice(XMLNS_PREFIX.length) in map)) map[attribute.name.slice(XMLNS_PREFIX.length)] = attribute.value;
            if (attribute.name === 'xmlns' && !(DEFAULT_NAMESPACE_PREFIX in map) && attribute.value) map[DEFAULT_NAMESPACE_PREFIX] = attribute.value;
        }
    }
    return { map, fn: prefix => map[prefix] ?? null };
}
