/**
 * The two views of a template's tree (?template=): the example view, the tree of the document
 * filled with the page's examples (the default), and the template view, the tree of the code with
 * its tags shown as their text.
 *
 * setShownTree() runs these steps:
 *   1. without a template syntax, or in the template view, the tree is the nodes of the code;
 *   2. in the example view, the nodes of the filled document (xml-examples.js), each led back to
 *      its node of the code; when filling fails, the template view is shown with a note.
 * The selection, the edits, the search and every export work on the nodes of the code; the code
 * and what is sent to the page are the template as written. A part of a row of the example view
 * is edited in place only when it shows the text of the code itself (isCopiedTreePart()).
 */

import { state, services } from './state.js?v=2';
import { getTemplateTags, checkTemplateSections } from './template-tags.js?v=2';
import { TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { buildExampleTree } from './xml-examples.js?v=1';
import { getNodeText, getShownChildren } from './nodes.js?v=4';

/** The view that shows the tree of the filled document. */
export const EXAMPLE_VIEW = 'example';
/** The view that shows the tags as their text. */
export const TEMPLATE_VIEW = 'template';

/** What an edit of a part with an example in the example view says. */
export const EXAMPLE_PART_NOTE = 'This part shows an example - edit it in the code or in the template view';

/** The state of the views: the view chosen, whether the example view could not be made, and the example tree shown. */
const views = { mode: EXAMPLE_VIEW, failed: false, tree: null };

/**
 * Returns the view chosen.
 * @returns {string} EXAMPLE_VIEW or TEMPLATE_VIEW.
 */
export function getViewMode() {
    return views.mode;
}

/**
 * Sets the view chosen.
 * @param {string} mode - EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @returns {void}
 */
export function setViewMode(mode) {
    views.mode = mode === TEMPLATE_VIEW ? TEMPLATE_VIEW : EXAMPLE_VIEW;
}

/**
 * Tells whether the tree shows the example view.
 * @returns {boolean} true while the tree of the filled document is shown.
 */
export function isExampleTreeShown() {
    return views.tree !== null;
}

/**
 * Tells whether the example view was chosen but could not be made.
 * @returns {boolean} true while the template view stands in for it.
 */
export function isExampleViewFailed() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && views.failed;
}

/**
 * Returns the page's examples for the open document.
 * @returns {?import('./template-examples.js').TemplateExamples} the examples, null without a page or away from its document.
 */
export function getTemplateExamples() {
    return services.sync?.getTemplate() || null;
}

/**
 * Makes the tree to show from the nodes of the code just read (the steps in the header).
 * @returns {void}
 */
export function setShownTree() {
    views.failed = false;
    views.tree = null;
    if (!TEMPLATE_SYNTAX || views.mode === TEMPLATE_VIEW || !state.model) return;
    try {
        views.tree = buildExampleTree(state.code, TEMPLATE_SYNTAX, getTemplateExamples(), state.model);
    } catch (error) {
        console.error(error);
        views.failed = true;
    }
}

/**
 * Returns the nodes the tree draws: those of the filled document in the example view, else those
 * of the code.
 * @returns {import('./xml.js').XmlModel} the nodes.
 */
export function getTreeModel() {
    return views.tree ? views.tree.model : state.model;
}

/**
 * Returns the node of the tree that shows a node of the code: in the example view the first node
 * of the filled document that stands for it.
 * @param {?object} node - a node of the code, or null.
 * @returns {?object} the node of the tree, null when the example view shows none for it.
 */
export function getShownNode(node) {
    if (!node || !views.tree) return node;
    return views.tree.firstNodes.get(node) || null;
}

/**
 * Tells whether a part of a row shows the text of the code itself, so an edit in place changes
 * only that text: always outside the example view; in it, when the part of the node of the code
 * holds no tag and reads as shown.
 * @param {object} node - the node of the code of the row.
 * @param {string} kind - the part: name, aname, aval, text, comment or cdata.
 * @param {number} attributeIndex - the attribute's place in the element, -1 for other parts.
 * @param {string} shown - the text the row shows for the part.
 * @returns {boolean} true when the part may be edited in place.
 */
export function isCopiedTreePart(node, kind, attributeIndex, shown) {
    if (!views.tree) return true;
    const written = getWrittenPartText(node, kind, attributeIndex);
    return written === shown && !getTemplateTags(written, TEMPLATE_SYNTAX).length;
}

/**
 * Tells whether a node of the code can be moved or removed as a whole from the example view:
 * always outside it; in it, when the node's code holds no tag (an element: only sections that
 * open and close inside it), so the change takes no tag shared with the code around it.
 * @param {object} node - a node of the code, or {attr, el} for an attribute.
 * @returns {boolean} true when the node may be moved or removed.
 */
export function isWholeTreeNode(node) {
    if (!views.tree) return true;
    const range = node.attr || node;
    const code = state.code.slice(range.start, range.end);
    if (node.type === 'el') return !checkTemplateSections(code, TEMPLATE_SYNTAX).length;
    return !getTemplateTags(code, TEMPLATE_SYNTAX).length;
}

/**
 * Returns the text of a part of a node of the code as a row shows it.
 * @param {object} node - the node of the code.
 * @param {string} kind - the part: name, aname, aval, text, comment or cdata.
 * @param {number} attributeIndex - the attribute's place, -1 for other parts.
 * @returns {?string} the text, null when the node has no such part.
 */
function getWrittenPartText(node, kind, attributeIndex) {
    if (kind === 'name') return node.name ?? null;
    if (kind === 'aname' || kind === 'aval') {
        const attribute = node.attrs ? node.attrs[attributeIndex] : null;
        return attribute ? (kind === 'aname' ? attribute.name : attribute.value) : null;
    }
    if (kind === 'comment' || kind === 'cdata') return state.code.slice(node.inner[0], node.inner[1]).trim();
    if (node.type === 'text') return getNodeText(node);
    const textNode = node.children ? getShownChildren(node).find(child => child.type === 'text') : null;
    return textNode ? getNodeText(textNode) : '';
}
