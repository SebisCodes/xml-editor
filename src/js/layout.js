/**
 * The layout of the work area: the splitter between code and tree (dragged or moved with
 * the arrow keys, remembered), the views of a narrow screen (code, tree or panel, one at a
 * time), the side panel (a drawer on the desktop, closed at the start) and its tabs (Node,
 * Insert, Convert).
 */

import { state, elements, findElement, findElements } from './state.js?v=2';
import { syncLayerScroll } from './code-view.js?v=4';
import { saveDocument } from './autosave.js?v=4';
import { renderNodePanel } from './node-panel.js?v=4';
import { renderConvertPanel } from './conversion-panel.js?v=4';

const SPLIT_MIN = 0.15;
const SPLIT_MAX = 0.85;
const SPLIT_STEP = 0.03;                // share of the width one arrow key moves the splitter

/**
 * Listens for the splitter, the view buttons of a narrow screen, the side panel's button and the panel tabs.
 * @returns {void}
 */
export function startLayout() {
    const splitter = findElement('#splitter');
    splitter.addEventListener('pointerdown', event => moveSplitterWithPointer(event, splitter));
    splitter.addEventListener('keydown', moveSplitterOnKey);
    findElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.pane)));
    findElements('[data-itab]').forEach(button => button.addEventListener('click', () => showPanelTab(button)));
    showSidePanel(false);
    findElement('#btn-panel').addEventListener('click', () => showSidePanel(elements.work.dataset.panel !== 'open'));
    findElement('#side-panel').addEventListener('keydown', closeSidePanelOnEscape);
    watchDrawerTop();
}

/**
 * Opens or closes the side panel's drawer.
 * @param {boolean} isOpen - true to open it.
 * @returns {void}
 */
export function showSidePanel(isOpen) {
    elements.work.dataset.panel = isOpen ? 'open' : 'closed';
    findElement('#btn-panel').setAttribute('aria-expanded', String(isOpen));
}

/**
 * Keeps the place of the main view below its bars in --drawer-top of the work area, so the
 * drawer opens below the bars and leaves their tools within reach.
 * @returns {void}
 */
function watchDrawerTop() {
    const stage = findElement('#stage');
    const observer = new ResizeObserver(() => elements.work.style.setProperty('--drawer-top', stage.getBoundingClientRect().top - elements.work.getBoundingClientRect().top + 'px'));
    for (const bar of stage.parentElement.children) if (bar !== stage) observer.observe(bar);
}

/**
 * Closes the side panel's drawer with Escape inside it and puts the focus on its button.
 * @param {KeyboardEvent} event - the key in the side panel.
 * @returns {void}
 */
function closeSidePanelOnEscape(event) {
    if (event.key !== 'Escape' || elements.work.dataset.panel !== 'open' || event.target.closest('dialog')) return;
    showSidePanel(false);
    findElement('#btn-panel').focus();
}

/**
 * Returns a share of the width within the splitter's limits.
 * @param {number} split - the share wanted.
 * @returns {number} the share between SPLIT_MIN and SPLIT_MAX.
 */
function getSplitInLimits(split) {
    return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, split));
}

/**
 * Gives code and tree their shares of the width.
 * @returns {void}
 */
export function showSplit() {
    elements.work.style.setProperty('--code-fr', state.split.toFixed(4) + 'fr');
    elements.work.style.setProperty('--view-fr', (1 - state.split).toFixed(4) + 'fr');
}

/**
 * Moves the splitter with the pointer until it is released, then remembers the place.
 * @param {PointerEvent} event - the press on the splitter.
 * @param {HTMLElement} splitter - the splitter.
 * @returns {void}
 */
function moveSplitterWithPointer(event, splitter) {
    splitter.setPointerCapture(event.pointerId);
    const workBox = elements.work.getBoundingClientRect();
    const available = workBox.width - splitter.offsetWidth;
    /**
     * Moves the splitter to the pointer.
     * @param {PointerEvent} moveEvent - the pointer's move.
     * @returns {void}
     */
    const move = moveEvent => { state.split = getSplitInLimits((moveEvent.clientX - workBox.left) / available); showSplit(); };
    /**
     * Stops following the pointer and remembers the place.
     * @returns {void}
     */
    const stopSplitterMove = () => {
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', stopSplitterMove);
        saveDocument();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', stopSplitterMove);
}

/**
 * Moves the splitter with the left and right arrow keys and remembers the place.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function moveSplitterOnKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    state.split = getSplitInLimits(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP));
    showSplit();
    saveDocument();
}

/**
 * Shows one view on a narrow screen.
 * @param {string} pane - "code", "draw" (the tree) or the panel.
 * @returns {void}
 */
export function showPane(pane) {
    elements.work.dataset.show = pane;
    findElements('[data-pane]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.pane === pane)));
    requestAnimationFrame(() => { if (pane === 'code') syncLayerScroll(); });
}

/**
 * Shows one tab of the side panel and draws it.
 * @param {HTMLElement} tab - the tab button (data-itab: node, insert or convert).
 * @returns {void}
 */
function showPanelTab(tab) {
    findElements('[data-itab]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
    elements.nodePanel.hidden = tab.dataset.itab !== 'node';
    elements.insertPanel.hidden = tab.dataset.itab !== 'insert';
    elements.convertPanel.hidden = tab.dataset.itab !== 'convert';
    if (!elements.nodePanel.hidden) renderNodePanel();
    if (!elements.convertPanel.hidden) renderConvertPanel();
}
