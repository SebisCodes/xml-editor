/**
 * Typing in the code: every key stroke draws the code at once and reads the tree after a
 * pause, an undo step and a save follow a short while later. The typing help indents with
 * Tab, keeps the indentation on Enter, closes a start tag with its end tag on ">",
 * completes the end tag on "</", puts quotes around a selection and comments lines out
 * with Ctrl+/. Snippets of the Insert panel go in at the cursor.
 */

import { state, elements, services } from './state.js?v=2';
import { parseCodeNodes, TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { getIndentUnit, getIndentAt } from './nodes.js?v=4';
import { renderCode } from './code-view.js?v=5';
import { startRenderSoon } from './preview.js?v=5';
import { addHistoryStep, startHistoryStep, undo, redo } from './history.js?v=5';
import { startSaveSoon } from './autosave.js?v=5';
import { selectFromCursor } from './tree.js?v=5';

const RENDER_DELAY = 280;               // milliseconds after the last key stroke before the tree is read
const LARGE_CODE_RENDER_DELAY = 600;
const LARGE_CODE = 100000;              // characters
const HISTORY_DELAY = 600;
const TAG_LOOKBEHIND = 400;             // characters searched back for the start tag ">" closes
const CURSOR_MARK = '|';
const SELECTION_MARK = '§';
const OPEN_START_TAG = /<([^\s<>/!?]+)(?:\s[^<>]*)?(?<!\/)>$/;
const UNFINISHED_START_TAG = /<([^\s<>/!?"'=]+)((?:\s+[^\s=<>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*$/;
const NAVIGATION_KEY = /Arrow|Home|End|Page/;
/** The keys of undo (both cases, Shift turns it into redo) and redo with Ctrl or Cmd. */
const UNDO_KEYS = ['z', 'Z'], REDO_KEY = 'y';

/**
 * The code and the selection when a key is pressed.
 * @typedef {Object} TypedState
 * @property {string} value - the code.
 * @property {number} start - the selection's start.
 * @property {number} end - the selection's end.
 */

/**
 * Listens for typing, clicks and cursor keys in the code.
 * @returns {void}
 */
export function startTyping() {
    const codeArea = elements.codeArea;
    codeArea.addEventListener('input', updateCodeFromInput);
    codeArea.addEventListener('click', () => selectFromCursor(true));
    codeArea.addEventListener('keyup', event => { if (NAVIGATION_KEY.test(event.key)) selectFromCursor(true); });
    codeArea.addEventListener('keydown', handleCodeKey);
}

/**
 * Takes what was typed: draws the code, reads the tree after a pause, makes an undo step
 * and saves a while later, and tells the page around the editor.
 * @returns {void}
 */
function updateCodeFromInput() {
    state.code = elements.codeArea.value;
    renderCode();
    startRenderSoon(state.code.length > LARGE_CODE ? LARGE_CODE_RENDER_DELAY : RENDER_DELAY);
    startHistoryStep(HISTORY_DELAY);
    startSaveSoon();
    services.sync?.handleChange();
}

/**
 * Replaces a range of the code as if it was typed, so the browser's own undo and assistive
 * technology follow; the fallback sets the text directly.
 * @param {number} from - the start of the range.
 * @param {number} to - the end of the range.
 * @param {string} text - the new text.
 * @param {number} [selectionStart] - where the selection starts afterwards.
 * @param {number} [selectionEnd] - where it ends; the start by default.
 * @returns {void}
 */
export function editRange(from, to, text, selectionStart, selectionEnd) {
    const codeArea = elements.codeArea;
    if (document.activeElement !== codeArea) codeArea.focus({ preventScroll: true });
    codeArea.setSelectionRange(from, to);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        codeArea.setRangeText(text, from, to, 'end');
        codeArea.dispatchEvent(new Event('input'));
    }
    if (selectionStart != null) codeArea.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

/**
 * Inserts a snippet at the cursor: "|" marks where the cursor goes, "§" stands for the
 * selected text. Without a cursor in the code it goes before the end tag of the root element.
 * @param {string} snippet - the snippet.
 * @returns {void}
 */
export function addSnippet(snippet) {
    const codeArea = elements.codeArea;
    let from = codeArea.selectionStart, to = codeArea.selectionEnd;
    let text = snippet;
    const root = state.model && state.model.els[0];
    if (document.activeElement !== codeArea && from === 0 && to === 0 && root && root.closeStart >= 0) {
        const lineStart = state.code.lastIndexOf('\n', root.closeStart - 1) + 1;
        if (!state.code.slice(lineStart, root.closeStart).trim()) {
            from = to = lineStart;
            text = getIndentAt(root.start) + getIndentUnit() + text + '\n';
        } else from = to = root.closeStart;
    }
    let inserted = text.replace(SELECTION_MARK, state.code.slice(from, to) || '');
    let cursor = inserted.indexOf(CURSOR_MARK);
    inserted = inserted.replace(CURSOR_MARK, '');
    if (cursor < 0) cursor = inserted.length;
    editRange(from, to, inserted, from + cursor);
    addHistoryStep();
}

/**
 * Handles the shortcuts and the typing help in the code.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleCodeKey(event) {
    if (handleCodeShortcut(event)) return;
    const codeArea = elements.codeArea;
    const typed = { value: codeArea.value, start: codeArea.selectionStart, end: codeArea.selectionEnd };
    if (event.key === 'Tab') { event.preventDefault(); setLineIndent(typed, event.shiftKey); return; }
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addLineBreak(typed); return; }
    if (event.key === '>' && typed.start === typed.end && !event.isComposing) { closeStartTag(event, typed); return; }
    if (event.key === '/' && typed.start === typed.end && typed.value[typed.start - 1] === '<' && !event.isComposing) { addOpenEndTag(event, typed); return; }
    if ((event.key === '"' || event.key === "'") && typed.start !== typed.end && !event.isComposing) {
        event.preventDefault();
        editRange(typed.start, typed.end, event.key + typed.value.slice(typed.start, typed.end) + event.key, typed.start + 1, typed.end + 1);
    }
}

/**
 * Handles the shortcuts of the code: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo,
 * Ctrl+Enter shows the cursor's node, Ctrl+/ comments out, Escape leaves the code.
 * @param {KeyboardEvent} event - the key.
 * @returns {boolean} true when the key was a shortcut and is handled (an event handler's answer).
 */
function handleCodeShortcut(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey && UNDO_KEYS.includes(event.key)) {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return true;
    }
    if (modifier && event.key === REDO_KEY) { event.preventDefault(); redo(); return true; }
    if (modifier && event.key === 'Enter') { event.preventDefault(); selectFromCursor(true); return true; }
    if (modifier && event.key === '/') { event.preventDefault(); applyCommentSwitch(); return true; }
    if (event.key === 'Escape') { elements.codeArea.blur(); return true; }
    return false;
}

/**
 * Returns the range of the whole lines a selection touches.
 * @param {string} value - the code.
 * @param {number} start - the selection's start.
 * @param {number} end - the selection's end.
 * @returns {{lineStart: number, lineEnd: number}} from the start of the first line to the end of the last
 *   (a selection that ends at a line's start leaves that line out).
 */
function getSelectedLines(value, start, end) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineBreak = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    return { lineStart, lineEnd: lineBreak < 0 ? value.length : lineBreak };
}

/**
 * Tab: inserts one indentation unit at the cursor, or indents (Shift: outdents) the selected lines.
 * @param {TypedState} typed - the code and the selection.
 * @param {boolean} outdent - Shift was held.
 * @returns {void}
 */
function setLineIndent({ value, start, end }, outdent) {
    const unit = getIndentUnit();
    if (start === end && !outdent) { editRange(start, end, unit); return; }
    const { lineStart, lineEnd } = getSelectedLines(value, start, end);
    const leadingUnit = new RegExp('^(' + unit.replace(/\t/, '\\t') + '|\\t| {1,2})');
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const changed = lines.map(line => (outdent ? line.replace(leadingUnit, '') : unit + line)).join('\n');
    editRange(lineStart, lineEnd, changed, lineStart, lineStart + changed.length);
}

/**
 * Enter: a new line with the indentation of the current one, one level deeper after a start
 * tag; between a start tag and its end tag the end tag goes on a line of its own.
 * @param {TypedState} typed - the code and the selection.
 * @returns {void}
 */
function addLineBreak({ value, start, end }) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(value.slice(lineStart))[0];
    const isAfterStartTag = OPEN_START_TAG.test(value.slice(lineStart, start));
    if (isAfterStartTag && start === end && /^<\//.test(value.slice(start))) {
        const unit = getIndentUnit();
        editRange(start, end, '\n' + indent + unit + '\n' + indent, start + 1 + indent.length + unit.length);
        return;
    }
    editRange(start, end, '\n' + indent + (isAfterStartTag && start === end ? getIndentUnit() : ''));
}

/**
 * ">" that closes a start tag adds its end tag after the cursor.
 * @param {KeyboardEvent} event - the key.
 * @param {TypedState} typed - the code and the cursor.
 * @returns {void}
 */
function closeStartTag(event, { value, start }) {
    const match = UNFINISHED_START_TAG.exec(value.slice(Math.max(0, start - TAG_LOOKBEHIND), start));
    if (!match || value.slice(start).startsWith(`</${match[1]}>`)) return;
    event.preventDefault();
    editRange(start, start, `></${match[1]}>`, start + 1);
}

/**
 * "</" completes the end tag of the element that is open at the cursor; when that end tag
 * follows right after the cursor, the cursor steps over it.
 * @param {KeyboardEvent} event - the key.
 * @param {TypedState} typed - the code and the cursor.
 * @returns {void}
 */
function addOpenEndTag(event, { value, start }) {
    const openElements = parseCodeNodes(value.slice(0, start - 1), TEMPLATE_SYNTAX).els.filter(element => element.unclosed);
    const element = openElements[openElements.length - 1];
    if (!element || !element.name) return;
    event.preventDefault();
    if (value.slice(start).startsWith(`</${element.name}>`)) editRange(start - 1, start + `</${element.name}>`.length, `</${element.name}>`);   // the "<" typed and the end tag after it
    else editRange(start, start, `/${element.name}>`);
}

/**
 * Ctrl+/: comments the selected lines out, or back in when they are one comment.
 * @returns {void}
 */
function applyCommentSwitch() {
    const { value, selectionStart, selectionEnd } = elements.codeArea;
    const { lineStart, lineEnd } = getSelectedLines(value, selectionStart, selectionEnd);
    const block = value.slice(lineStart, lineEnd);
    const comment = /^(\s*)<!--\s?([\s\S]*?)\s?-->(\s*)$/.exec(block);
    const changed = comment ? comment[1] + comment[2] + comment[3]
        : block.replace(/^(\s*)([\s\S]*?)(\s*)$/, (whole, before, text, after) => `${before}<!-- ${text.replace(/--/g, '- -')} -->${after}`);
    editRange(lineStart, lineEnd, changed, lineStart, lineStart + changed.length);
}
