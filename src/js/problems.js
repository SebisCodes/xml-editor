/**
 * The problems above the code: the number of errors and notes, a list that can be hidden,
 * and each problem with its line and column; a click (or Enter) on one goes to its place
 * in the code and selects its node.
 */

import { state, elements, isNarrow } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=7';
import { getLineIndex, getColumnIndex, showInCode } from './code-view.js?v=4';
import { selectFromCursor } from './tree.js?v=4';
import { showPane } from './layout.js?v=4';

const PROBLEMS_SHOWN = 60;

/**
 * Listens for clicks and keys on the problems.
 * @returns {void}
 */
export function startProblems() {
    elements.problems.addEventListener('keydown', runProblemOnKey);
    elements.problems.addEventListener('click', handleProblemClick);
}

/**
 * Draws the problems above the code; hidden when there are none.
 * @returns {void}
 */
export function renderProblems() {
    const problems = state.result.problems;
    const box = elements.problems;
    if (!problems.length) { box.hidden = true; return; }
    const errorCount = problems.filter(problem => problem.kind === 'error').length, noteCount = problems.length - errorCount;
    const parts = [];
    if (errorCount) parts.push(`<b>${errorCount} ${errorCount === 1 ? 'error' : 'errors'}</b>`);
    if (noteCount) parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
    const items = problems.slice(0, PROBLEMS_SHOWN).map(renderProblem).join('');
    box.innerHTML = `<div class="pr-header"><span>${parts.join(' · ')}</span><button type="button" class="button small" data-toggle-probs>${state.showProblems ? 'Hide' : 'Show'}</button></div>${state.showProblems ? `<ul>${items}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errorCount);
    box.hidden = false;
}

/**
 * Returns the HTML of one problem.
 * @param {XmlProblem} problem - the problem (xml.js).
 * @param {number} index - its place in the list.
 * @returns {string} the list item.
 */
function renderProblem(problem, index) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-prob="${index}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">Line ${getLineIndex(problem.pos) + 1}:${getColumnIndex(problem.pos) + 1}</span><span>${escapeHtml(problem.msg)}</span></div></li>`;
}

/**
 * Lets Enter and Space on a problem act as a click.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function runProblemOnKey(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-prob]')) {
        event.preventDefault();
        event.target.click();
    }
}

/**
 * Handles a click on the problems: the button hides or shows the list, a problem goes to
 * its place in the code (unless the user selects its text to copy it).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleProblemClick(event) {
    if (event.target.closest('[data-prob]') && String(getSelection())) return;
    if (event.target.closest('[data-toggle-probs]')) {
        state.showProblems = !state.showProblems;
        renderProblems();
        return;
    }
    const row = event.target.closest('[data-prob]');
    if (!row) return;
    const problem = state.result.problems[+row.dataset.prob];
    if (isNarrow()) showPane('code');
    showInCode(problem.pos);
    selectFromCursor(true);
}
