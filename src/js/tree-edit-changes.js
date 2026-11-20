/**
 * The change of the code that an edit in the tree or the Node panel makes: only the
 * changed part, mapped back to the code through the entity references of the text, and
 * escaped for its place (&lt; &amp; &gt; in text, the attribute's own quote in values,
 * "--" in comments, "]]>" in CDATA). Renaming an element changes its start and end tag;
 * an empty attribute name removes the attribute.
 */

import { state } from './state.js?v=2';
import { XML_NAME, escapeText, escapeAttribute, expandEntities } from './xml.js?v=6';
import { getShownChildren, getAttributesEnd } from './nodes.js?v=3';

const END_TAG_OPENER = '</';
/** The ranges of the UTF-16 code units that are the first and the second half of a pair. */
const HIGH_SURROGATE_FIRST = 0xd800, HIGH_SURROGATE_LAST = 0xdbff;
const LOW_SURROGATE_FIRST = 0xdc00, LOW_SURROGATE_LAST = 0xdfff;

/**
 * What an edit changes: the part of a row of the tree or a field of the panel.
 * @typedef {Object} EditTarget
 * @property {string} kind - name, aname, aval, text, comment or cdata.
 * @property {Object} node - the node of the row (the element for attributes).
 * @property {number} ai - the place of the attribute in the element, -1 for others.
 */

/**
 * The change of the code an edit makes.
 * @typedef {Object} CodeChange
 * @property {Array<[number, number, string]>} edits - the edits of the code (history.js).
 * @property {number} cursor - where the cursor goes afterwards.
 */

/**
 * Returns the change of the code that an edit in the tree (or the panel) makes.
 * @param {EditTarget} edit - what is edited.
 * @param {string} value - the new text.
 * @returns {?CodeChange} the change, or null when there is none or the value is refused
 *   (getTreeEditRefusal() says why).
 */
export function getTreeEdit(edit, value) {
    if (edit.kind === 'name' || edit.kind === 'aname') return getNameEdit(edit, value.trim());
    if (edit.kind === 'aval') return getAttributeValueEdit(edit.node.attrs[edit.ai], value);
    if (edit.kind === 'comment' || edit.kind === 'cdata') return getDelimitedEdit(edit.node, edit.kind, value);
    return getElementTextEdit(edit.node, value);
}

/**
 * Returns why the value of an edit is refused: a name that is no XML name, or an attribute
 * name the element has already. An empty attribute name is taken (it removes the attribute).
 * @param {EditTarget} edit - what is edited.
 * @param {string} value - the new text.
 * @returns {string} the message for the user, empty when the value is taken.
 */
export function getTreeEditRefusal(edit, value) {
    if (edit.kind !== 'name' && edit.kind !== 'aname') return '';
    const name = value.trim();
    if (edit.kind === 'aname' && !name) return '';
    if (!XML_NAME.test(name)) return `"${name}" is not a valid XML name - names start with a letter or _ and have no spaces`;
    if (edit.kind === 'aname' && edit.node.attrs.some((other, index) => index !== edit.ai && other.name === name)) return `The element already has an attribute "${name}"`;
    return '';
}

/**
 * Returns the change of a renamed element (start and end tag) or attribute; an empty
 * attribute name removes the attribute.
 * @param {EditTarget} edit - what is edited.
 * @param {string} name - the new name, trimmed.
 * @returns {?CodeChange} the change, or null for a name that is refused.
 */
function getNameEdit(edit, name) {
    const element = edit.node;
    if (edit.kind === 'aname' && !name) {
        const attribute = element.attrs[edit.ai];
        return { edits: [[attribute.wsStart, attribute.end, '']], cursor: attribute.wsStart };
    }
    if (getTreeEditRefusal(edit, name)) return null;
    if (edit.kind === 'aname') {
        const attribute = element.attrs[edit.ai];
        return { edits: [[attribute.nameStart, attribute.nameEnd, name]], cursor: attribute.nameStart + name.length };
    }
    const edits = [[element.nameStart, element.nameEnd, name]];
    if (element.closeStart >= 0) {
        const endNameStart = element.closeStart + END_TAG_OPENER.length;
        edits.push([endNameStart, endNameStart + element.name.length, name]);
    }
    return { edits, cursor: element.nameStart + name.length };
}

/**
 * Returns the change of an attribute value; an attribute without a value gets one.
 * @param {Object} attribute - the scanned attribute.
 * @param {string} value - the new value.
 * @returns {CodeChange} the change.
 */
function getAttributeValueEdit(attribute, value) {
    if (attribute.noValue) {
        const inserted = `="${escapeAttribute(value)}"`;
        return { edits: [[attribute.nameEnd, attribute.end, inserted]], cursor: attribute.nameEnd + inserted.length };
    }
    return getChangedPartEdit(attribute.raw, attribute.valStart, attribute.value, 0, value, text => escapeAttribute(text, attribute.quote));
}

/**
 * Returns the length of the start and the end that two texts share.
 * @param {string} oldText - the text before.
 * @param {string} newText - the text after.
 * @returns {{head: number, tail: number}} the characters equal at the start and, after those, at the end.
 */
function getCommonEnds(oldText, newText) {
    let head = 0, tail = 0;
    while (head < oldText.length && head < newText.length && oldText[head] === newText[head]) head++;
    while (tail < oldText.length - head && tail < newText.length - head && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) tail++;
    return { head, tail };
}

/**
 * Returns the change of a text or value: only the changed part, mapped back to the code
 * through its entity references.
 * @param {string} raw - the text as written in the code.
 * @param {number} at - the offset of raw in the code.
 * @param {string} oldText - the text as shown (entities resolved, maybe trimmed).
 * @param {number} lead - the characters of the resolved text before oldText (trimmed white space).
 * @param {string} newText - the new text.
 * @param {function(string): string} escape - escapes the inserted text for its place.
 * @returns {CodeChange} the change.
 */
function getChangedPartEdit(raw, at, oldText, lead, newText, escape) {
    const resolved = expandEntities(raw);
    let { head, tail } = getCommonEnds(oldText, newText);
    // Never between the two halves of an emoji (both stand for one entity like &#x1F600;).
    if (head > 0 && isHighSurrogate(oldText.charCodeAt(head - 1))) head--;
    if (tail > 0 && isLowSurrogate(oldText.charCodeAt(oldText.length - tail))) tail--;
    const from = at + resolved.pos[lead + head], to = at + resolved.pos[lead + oldText.length - tail];
    const inserted = escape(newText.slice(head, newText.length - tail));
    return { edits: [[from, to, inserted]], cursor: from + inserted.length };
}

/**
 * Tells whether a UTF-16 code unit is the first half of a pair.
 * @param {number} codeUnit - the code unit.
 * @returns {boolean} true for a high surrogate.
 */
function isHighSurrogate(codeUnit) {
    return codeUnit >= HIGH_SURROGATE_FIRST && codeUnit <= HIGH_SURROGATE_LAST;
}

/**
 * Tells whether a UTF-16 code unit is the second half of a pair.
 * @param {number} codeUnit - the code unit.
 * @returns {boolean} true for a low surrogate.
 */
function isLowSurrogate(codeUnit) {
    return codeUnit >= LOW_SURROGATE_FIRST && codeUnit <= LOW_SURROGATE_LAST;
}

/**
 * Returns a comment's or CDATA section's text made safe: "--" in comments and "]]>" in CDATA are split.
 * @param {string} kind - "comment" or "cdata".
 * @param {string} text - the text.
 * @returns {string} the safe text.
 */
function getSafeDelimitedText(kind, text) {
    return kind === 'comment' ? text.replace(/--/g, '- -').replace(/-$/, '- ') : text.replace(/]]>/g, ']]]]><![CDATA[>');
}

/**
 * Returns the change of a comment or CDATA section.
 * @param {Object} node - the scanned comment or CDATA node.
 * @param {string} kind - "comment" or "cdata".
 * @param {string} value - the new text.
 * @returns {CodeChange} the change.
 */
function getDelimitedEdit(node, kind, value) {
    const [innerStart, innerEnd] = node.inner;
    const raw = state.code.slice(innerStart, innerEnd);
    const textStart = innerStart + raw.length - raw.trimStart().length;
    const oldText = raw.trim();
    // A text that needs escaping as a whole (]]> or -- made across the edit's edges) is written whole.
    const safeValue = getSafeDelimitedText(kind, value);
    if (safeValue !== value) return { edits: [[textStart, textStart + oldText.length, safeValue]], cursor: textStart + safeValue.length };
    const { head, tail } = getCommonEnds(oldText, value);
    const inserted = value.slice(head, value.length - tail);
    const from = textStart + head;
    return { edits: [[from, textStart + oldText.length - tail, inserted]], cursor: from + inserted.length };
}

/**
 * Returns the change of a text: of a text row, of an element shown in one line, or the
 * first text of an empty element.
 * @param {Object} node - the scanned text node or element.
 * @param {string} value - the new text.
 * @returns {?CodeChange} the change, or null for an empty text in an empty element.
 */
function getElementTextEdit(node, value) {
    let textNode = node.type === 'text' ? node : null;
    if (!textNode && node.type === 'el') textNode = getShownChildren(node).find(child => child.type === 'text') || null;
    if (textNode) {
        const raw = state.code.slice(textNode.start, textNode.end);
        const resolved = expandEntities(raw).text;
        const lead = resolved.length - resolved.trimStart().length;
        return getChangedPartEdit(raw, textNode.start, resolved.trim(), lead, value, escapeText);
    }
    if (!value) return null;
    const inserted = escapeText(value);
    if (node.selfClose) {
        const from = getAttributesEnd(node);
        return { edits: [[from, node.tagEnd, `>${inserted}</${node.name}>`]], cursor: from + 1 + inserted.length };
    }
    return { edits: [[node.tagEnd, node.closeStart >= 0 ? node.closeStart : node.tagEnd, inserted]], cursor: node.tagEnd + inserted.length };
}
