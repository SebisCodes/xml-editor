/**
 * The code view: the textarea with the highlighting and the marks (problem lines, the
 * selected node) laid under it, the line numbers, the band of the cursor's line and the
 * status line. Positions in the code are turned into lines and columns here.
 */

import { state, elements, services, isNarrow } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=7';
import { highlight } from './xml-highlight.js?v=4';
import { buildHighlightWithTemplateTags, convertTemplateTagsToBraces } from './template-tags.js?v=2';
import { TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { updateHistoryButtons } from './history.js?v=4';
import { selectFromCursor } from './tree.js?v=4';

const LINE_HEIGHT = 20;                 // pixels per row of the code
const HIGHLIGHT_LIMIT = 600000;         // longer code is shown without colors
const BAND_OFFSET = 10;                 // pixels between the textarea's top and its first row
const WIDTH_PROBE_LENGTH = 100;         // characters measured for the width of one
const SCROLL_MARGIN_RIGHT = 60;         // pixels a revealed position keeps from the right edge
const SCROLL_MARGIN_LEFT = 40;          // pixels left of a revealed position after scrolling sideways
const SCROLL_MARGIN_LINES = 2;          // lines a revealed position keeps from the bottom edge
const SCROLL_TARGET_SHARE = 1 / 3;      // share of the height above a line scrolled to
const KILOBYTE = 1024;

let lineBand = null;
let characterWidth = 0;

/**
 * Adds the band of the cursor's line and follows the cursor with it.
 * @returns {void}
 */
export function startCodeView() {
    lineBand = document.createElement('div');
    lineBand.className = 'line-band';
    lineBand.setAttribute('aria-hidden', 'true');
    elements.marks.before(lineBand);
    document.addEventListener('selectionchange', moveWithCursor);
    elements.codeArea.addEventListener('scroll', syncLayerScroll);
}

/**
 * Moves the band and selects the cursor's node while the cursor moves in the code.
 * @returns {void}
 */
function moveWithCursor() {
    if (document.activeElement !== elements.codeArea) return;
    moveLineBand();
    selectFromCursor(false);
}

/**
 * Draws the highlighting, the marks, the line numbers and the status line of the code. With a
 * template syntax the code is highlighted in brace form and every tag is put back as written, inside the highlighting around it.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    elements.highlight.innerHTML = code.length < HIGHLIGHT_LIMIT ? buildHighlightWithTemplateTags(highlight(convertTemplateTagsToBraces(code, TEMPLATE_SYNTAX)), TEMPLATE_SYNTAX, code) + '\n' : escapeHtml(code) + '\n';
    renderMarks();
    services.lineWrap.update(code);
    elements.status.textContent = getStatusText(code);
    updateHistoryButtons();
}

/**
 * Returns the status line: lines, size and the number of elements.
 * @param {string} code - the code.
 * @returns {string} for example "12 lines · 1.2 KB · 8 elements".
 */
function getStatusText(code) {
    const lineCount = code.split('\n').length;
    const bytes = new Blob([code]).size;
    const elementCount = state.model && state.model.src === code ? state.model.els.length : 0;
    const size = bytes < KILOBYTE ? bytes + ' B' : (bytes / KILOBYTE).toFixed(1) + ' KB';
    return `${lineCount} lines · ${size}${elementCount ? ` · ${elementCount} ${elementCount === 1 ? 'element' : 'elements'}` : ''}`;
}

/**
 * Draws the marks: lines with problems get a colored background, the selected node a frame.
 * @returns {void}
 */
export function renderMarks() {
    const code = state.code;
    const ranges = getProblemLineRanges(code);
    const selectedRange = getSelectedRange();
    if (selectedRange && state.model && state.model.src === code) ranges.push([selectedRange[0], selectedRange[1], 'sel']);
    ranges.sort((first, second) => first[0] - second[0]);
    let html = '', last = 0;
    for (const [from, to, className] of ranges) {
        if (from < last) continue;
        html += escapeHtml(code.slice(last, from)) + `<mark class="${className}">` + escapeHtml(code.slice(from, to) || ' ') + '</mark>';
        last = to;
    }
    elements.marks.innerHTML = html + escapeHtml(code.slice(last)) + '\n';
}

/**
 * Returns the lines that have a problem, each once.
 * @param {string} code - the code.
 * @returns {Array<[number, number, string]>} [from, to, class] of each line: "err" or "warn".
 */
function getProblemLineRanges(code) {
    const ranges = [];
    const seen = new Set();
    for (const problem of state.result.problems) {
        const lineStart = code.lastIndexOf('\n', problem.pos - 1) + 1;
        if (seen.has(lineStart)) continue;
        seen.add(lineStart);
        let lineEnd = code.indexOf('\n', lineStart);
        if (lineEnd < 0) lineEnd = code.length;
        ranges.push([lineStart, Math.max(lineEnd, lineStart + 1), problem.kind === 'error' ? 'err' : 'warn']);
    }
    return ranges;
}

/**
 * Returns the part of the code the selected node starts with: an element's start tag, an
 * attribute, a text without its surrounding white space, or the whole node.
 * @returns {?number[]} [from, to] in the code, or null without a selection.
 */
export function getSelectedRange() {
    const node = state.selected;
    if (!node) return null;
    if (node.attr) return [node.attr.start, node.attr.end];
    if (node.type === 'el') return [node.start, node.tagEnd];
    if (node.type !== 'text') return [node.start, node.end];
    const raw = state.code.slice(node.start, node.end);
    const leading = raw.length - raw.trimStart().length;
    return [node.start + leading, node.start + raw.trimEnd().length];
}

/**
 * Moves the layers under the textarea and the line numbers with its scroll position.
 * @returns {void}
 */
export function syncLayerScroll() {
    const codeArea = elements.codeArea;
    const transform = `translate(${-codeArea.scrollLeft}px, ${-codeArea.scrollTop}px)`;
    elements.highlight.style.transform = transform;
    elements.marks.style.transform = transform;
    elements.gutter.style.transform = `translateY(${-codeArea.scrollTop}px)`;
    moveLineBand();
}

/**
 * Puts the band on the line with the cursor, so the cursor is easy to find; hidden while text is selected.
 * @returns {void}
 */
function moveLineBand() {
    const codeArea = elements.codeArea;
    lineBand.hidden = codeArea.selectionStart !== codeArea.selectionEnd;
    const lineIndex = getLineIndex(codeArea.selectionStart);
    lineBand.style.transform = `translateY(${BAND_OFFSET + services.lineWrap.getLineTop(lineIndex) - codeArea.scrollTop}px)`;
    lineBand.style.height = services.lineWrap.getLineHeight(lineIndex) + 'px';
}

/**
 * Returns the line a position is on.
 * @param {number} pos - an offset in the code.
 * @returns {number} the line, 0-based.
 */
export function getLineIndex(pos) {
    let lineIndex = 0;
    for (let lineBreak = state.code.indexOf('\n'); lineBreak >= 0 && lineBreak < pos; lineBreak = state.code.indexOf('\n', lineBreak + 1)) lineIndex++;
    return lineIndex;
}

/**
 * Returns the column of a position.
 * @param {number} pos - an offset in the code.
 * @returns {number} the column, 0-based.
 */
export function getColumnIndex(pos) {
    return pos - (state.code.lastIndexOf('\n', pos - 1) + 1);
}

/**
 * Returns where a line starts; past the last line the end of the code (also for a huge or endless number).
 * @param {number} line - the line, 1-based.
 * @returns {number} the offset of its first character.
 */
export function getLineStart(line) {
    let pos = 0;
    for (let lineNumber = 1; lineNumber < line; lineNumber++) {
        const lineBreak = state.code.indexOf('\n', pos);
        if (lineBreak < 0) return state.code.length;
        pos = lineBreak + 1;
    }
    return pos;
}

/**
 * Puts the cursor at a position and scrolls the code there.
 * @param {number} pos - an offset in the code.
 * @param {boolean} [focus] - also focus the code (not on narrow screens, where it would open the keyboard).
 * @param {number} [selectionEnd] - the end of the selection, the position itself by default.
 * @returns {void}
 */
export function showInCode(pos, focus = true, selectionEnd = pos) {
    const codeArea = elements.codeArea;
    if (focus && !isNarrow()) codeArea.focus({ preventScroll: true });
    codeArea.setSelectionRange(pos, selectionEnd);
    const top = services.lineWrap.getLineTop(getLineIndex(pos)), height = codeArea.clientHeight;
    if (top < codeArea.scrollTop + LINE_HEIGHT || top > codeArea.scrollTop + height - LINE_HEIGHT * SCROLL_MARGIN_LINES) codeArea.scrollTop = Math.max(0, top - height * SCROLL_TARGET_SHARE);
    const left = getColumnIndex(pos) * getCharacterWidth();
    if (left < codeArea.scrollLeft || left > codeArea.scrollLeft + codeArea.clientWidth - SCROLL_MARGIN_RIGHT) codeArea.scrollLeft = Math.max(0, left - SCROLL_MARGIN_LEFT);
    syncLayerScroll();
}

/**
 * Returns the width of one character of the code's font, measured once (the query fills its cache).
 * @returns {number} pixels.
 */
function getCharacterWidth() {
    if (characterWidth) return characterWidth;
    const probe = document.createElement('span');
    probe.textContent = 'x'.repeat(WIDTH_PROBE_LENGTH);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    probe.style.font = getComputedStyle(elements.codeArea).font;
    document.body.appendChild(probe);
    characterWidth = probe.getBoundingClientRect().width / WIDTH_PROBE_LENGTH;
    probe.remove();
    return characterWidth;
}
