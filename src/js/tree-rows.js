/**
 * The HTML of the rows of the element tree. Every row carries its node's id (data-n); the
 * parts that can be edited in place carry the class "ed" and what they are (data-ed:
 * name, aname, aval, text, comment, cdata), attributes their place (data-a); the row
 * buttons carry their action (data-act).
 */

import { state, translate } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=6';
import { getNodeText, getShownChildren, isLeaf, isOpen } from './nodes.js?v=3';

const SHOW_MAX = 4000;                  // longer texts are shown shortened and edited in the code
const DECLARATION_SHOW_MAX = 300;       // characters shown of a processing instruction or DOCTYPE
const ELLIPSIS = ' …';

const ICON = {
    child: '<path d="M6 4v10a3 3 0 0 0 3 3h4"/><path d="M17 14v6M14 17h6"/>',
    attr: '<path d="M15.5 9.5a3.5 3.5 0 1 0 0 5V9M15.5 12.5c0 2 1 3 2.5 3 1.8 0 3-1.6 3-4a9 9 0 1 0-4 7.5"/>',
    up: '<path d="m7 11 5-5 5 5M12 6v13"/>',
    down: '<path d="m7 13 5 5 5-5M12 18V5"/>',
    del: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const ELEMENT_ACTIONS = [['child', 'Add a child element'], ['attr', 'Add an attribute'], ['up', 'Move up'], ['down', 'Move down'], ['del', 'Remove the element']];
const REMOVE_ACTION = [['del', 'Remove']];
const DELIMITERS = { comment: ['&lt;!-- ', ' --&gt;', 'c'], cdata: ['&lt;![CDATA[', ']]&gt;', 'd'] };

/**
 * Returns the HTML of the row buttons.
 * @param {Array<[string, string]>} actions - the action (data-act) and English title of each button.
 * @returns {string} the buttons in their row.
 */
function renderItemButtons(actions) {
    return `<span class="item-button-row">${actions.map(([action, title]) => `<button type="button" class="item-button" data-act="${action}" title="${escapeHtml(translate(title))}" aria-label="${escapeHtml(translate(title))}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[action]}</svg></button>`).join('')}</span>`;
}

/**
 * Returns a text shortened for the tree.
 * @param {string} text - the text.
 * @returns {string} the escaped text, cut with " …" when longer than SHOW_MAX.
 */
function renderShortText(text) {
    return escapeHtml(text.length > SHOW_MAX ? text.slice(0, SHOW_MAX) + ELLIPSIS : text);
}

/**
 * Returns the HTML of an element's attributes, each name and value editable.
 * @param {Object} element - a scanned element.
 * @returns {string} the attributes, each with a space before it.
 */
function renderAttributes(element) {
    return element.attrs.map((attribute, index) => {
        const isDeclaration = attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:');
        return ` <span class="at${isDeclaration ? ' ns-decl' : ''}" data-a="${index}"><span class="a ed" data-ed="aname" data-a="${index}">${escapeHtml(attribute.name)}</span><span class="p">=</span><span class="p">${attribute.quote}</span><span class="s ed" data-ed="aval" data-a="${index}">${escapeHtml(attribute.value)}</span><span class="p">${attribute.quote}</span></span>`;
    }).join('');
}

/**
 * Returns the HTML of the row of a node and, for an open element, the rows below it.
 * @param {Object} node - a scanned node.
 * @returns {string} the list item, empty for a blank text.
 */
export function renderRow(node) {
    const classes = ['kn', node.type];
    if (state.found.has(node.id)) classes.push('found');
    const start = `<li class="${classes.join(' ')}" data-n="${node.id}" role="treeitem"`;
    if (node.type === 'text') return renderTextRow(node, start);
    if (node.type === 'comment' || node.type === 'cdata') return renderDelimitedRow(node, start);
    if (node.type === 'pi' || node.type === 'doctype') return renderDeclarationRow(node, start);
    return renderElementRow(node, start);
}

/**
 * Returns the row of a text between elements.
 * @param {Object} node - a scanned text node.
 * @param {string} start - the opening of the list item, without ">".
 * @returns {string} the row, empty for a blank text.
 */
function renderTextRow(node, start) {
    const text = getNodeText(node);
    if (!text) return '';
    const editable = text.length > SHOW_MAX ? '' : ' ed';
    return `${start}><div class="row"><span class="fold-space"></span><span class="content" data-no-i18n><span class="tx${editable}" data-ed="text">${renderShortText(text)}</span></span>${renderItemButtons(REMOVE_ACTION)}</div></li>`;
}

/**
 * Returns the row of a comment or CDATA section.
 * @param {Object} node - a scanned comment or CDATA node.
 * @param {string} start - the opening of the list item, without ">".
 * @returns {string} the row.
 */
function renderDelimitedRow(node, start) {
    const inner = state.code.slice(node.inner[0], node.inner[1]);
    const [opener, closer, className] = DELIMITERS[node.type];
    const isLong = inner.length > SHOW_MAX;
    const shown = escapeHtml(isLong ? inner.slice(0, SHOW_MAX) + ELLIPSIS : inner.trim());
    return `${start}><div class="row"><span class="fold-space"></span><span class="content" data-no-i18n><span class="${className}">${opener}</span><span class="${className}${isLong ? '' : ' ed'}" data-ed="${node.type}">${shown}</span><span class="${className}">${closer}</span></span>${renderItemButtons(REMOVE_ACTION)}</div></li>`;
}

/**
 * Returns the row of a processing instruction or the DOCTYPE (only the first can be removed).
 * @param {Object} node - a scanned processing instruction or DOCTYPE.
 * @param {string} start - the opening of the list item, without ">".
 * @returns {string} the row.
 */
function renderDeclarationRow(node, start) {
    const raw = state.code.slice(node.start, node.end);
    const shown = escapeHtml(raw.length > DECLARATION_SHOW_MAX ? raw.slice(0, DECLARATION_SHOW_MAX) + ELLIPSIS : raw);
    return `${start}><div class="row"><span class="fold-space"></span><span class="content" data-no-i18n><span class="d">${shown}</span></span>${node.type === 'pi' ? renderItemButtons(REMOVE_ACTION) : ''}</div></li>`;
}

/**
 * Returns the row of an element and, when it is open, the rows of its children.
 * @param {Object} element - a scanned element.
 * @param {string} start - the opening of the list item, without ">".
 * @returns {string} the row.
 */
function renderElementRow(element, start) {
    const leaf = isLeaf(element);
    const open = leaf || isOpen(element);
    const children = getShownChildren(element);
    const nameTitle = element.uri ? ` title="${escapeHtml(element.uri)}"` : '';
    const head = `<span class="p">&lt;</span><span class="k ed" data-ed="name"${nameTitle}>${escapeHtml(element.name)}</span>${renderAttributes(element)}`
        + (leaf ? renderLeafEnd(element, children[0]) : renderBranchEnd(element, open));
    const count = open ? '' : `<span class="number">${children.length} ${children.length === 1 ? 'child' : 'children'}</span>`;
    const body = !leaf && open ? `<ul role="group">${children.map(renderRow).join('')}</ul>` : '';
    return `${start} aria-expanded="${open}"><div class="row">${renderFoldButton(leaf, open)}<span class="content" data-no-i18n>${head}</span>${count}${renderItemButtons(ELEMENT_ACTIONS)}</div>${body}</li>`;
}

/**
 * Returns the end of a leaf element's head: its text (editable) and its end tag.
 * @param {Object} element - a scanned element shown in one row.
 * @param {?Object} textNode - its only text, or undefined when it is empty.
 * @returns {string} the HTML after the attributes.
 */
function renderLeafEnd(element, textNode) {
    const text = textNode ? getNodeText(textNode) : '';
    const slot = textNode ? `<span class="tx${text.length > SHOW_MAX ? '' : ' ed'}" data-ed="text" data-t="${textNode.id}">${renderShortText(text)}</span>`
        : `<span class="tx ed empty" data-ed="text" data-empty="${escapeHtml(translate('empty'))}"></span>`;
    if (element.selfClose && !textNode) return `<span class="p">/&gt;</span>${slot}`;
    return `<span class="p">&gt;</span>${slot}<span class="p">&lt;/</span><span class="k">${escapeHtml(element.name)}</span><span class="p">&gt;</span>`;
}

/**
 * Returns the end of an element's head that has children: ">" and, when folded, its end tag.
 * @param {Object} element - a scanned element.
 * @param {boolean} open - whether its children are shown.
 * @returns {string} the HTML after the attributes.
 */
function renderBranchEnd(element, open) {
    return `<span class="p">&gt;</span>${open ? '' : `<span class="p"> … &lt;/</span><span class="k">${escapeHtml(element.name)}</span><span class="p">&gt;</span>`}`;
}

/**
 * Returns the fold button of an element row, or the space it takes in a leaf row.
 * @param {boolean} leaf - whether the element is shown in one row.
 * @param {boolean} open - whether its children are shown.
 * @returns {string} the button or the space.
 */
function renderFoldButton(leaf, open) {
    if (leaf) return '<span class="fold-space"></span>';
    const title = escapeHtml(translate(open ? 'Fold' : 'Unfold'));
    return `<button type="button" class="fold" data-fold aria-expanded="${open}" title="${title}" aria-label="${title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
}
