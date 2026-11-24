/**
 * The buttons of the bar: the "New" menu (opened with a click, moved through with the arrow
 * keys, closed with Escape or a click outside), "My documents", Undo and Redo, Help, and
 * the close buttons of the dialogs (a click beside a dialog closes it too).
 */

import { services, findElement, findElements } from './state.js?v=2';
import { undo, redo } from './history.js?v=5';
import { createFromMenu } from './documents.js?v=5';
import { openDialog } from './dialogs.js?v=5';

const newButton = findElement('#btn-new');
const newMenu = findElement('#new-menu');

/**
 * Listens for the buttons of the bar and the dialogs.
 * @returns {void}
 */
export function startToolbar() {
    newButton.addEventListener('click', () => applyNewMenuSwitch());
    newMenu.addEventListener('click', createFromMenuItem);
    newMenu.addEventListener('keydown', moveInNewMenu);
    document.addEventListener('pointerdown', event => { if (!newMenu.hidden && !event.target.closest('#new-menu, #btn-new')) applyNewMenuSwitch(false); });
    findElement('#btn-files').addEventListener('click', () => services.files.open());
    findElement('#btn-undo').addEventListener('click', undo);
    findElement('#btn-redo').addEventListener('click', redo);
    findElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    findElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    findElement('#btn-help').addEventListener('click', () => openDialog(findElement('#help')));
}

/**
 * Tells whether the "New" menu is open.
 * @returns {boolean} true while it is shown.
 */
export function isNewMenuOpen() {
    return !newMenu.hidden;
}

/**
 * Opens or closes the "New" menu; an opened menu focuses its first item.
 * @param {boolean} [open] - open (true) or close (false); switches by default.
 * @returns {void}
 */
export function applyNewMenuSwitch(open = newMenu.hidden) {
    newMenu.hidden = !open;
    newButton.setAttribute('aria-expanded', open);
    if (open) newMenu.querySelector('button').focus();
}

/**
 * Makes the document of the chosen menu item.
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function createFromMenuItem(event) {
    const item = event.target.closest('[data-new]');
    if (!item) return;
    applyNewMenuSwitch(false);
    createFromMenu(item.dataset.new);
}

/**
 * Moves through the menu with the arrow keys; Escape closes it and focuses its button.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function moveInNewMenu(event) {
    const items = findElements('button', newMenu), index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
    if (event.key === 'Escape') {
        event.stopPropagation();
        applyNewMenuSwitch(false);
        newButton.focus();
    }
}
