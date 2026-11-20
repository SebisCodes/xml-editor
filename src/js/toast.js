/**
 * The short message at the bottom of the editor (the toast): one at a time, hidden again
 * after a few seconds.
 */

import { elements } from './state.js?v=2';

const SHOWN_CLASS = 'shown';
const TOAST_DURATION = 2600;            // milliseconds a message stays

let hideTimer = 0;

/**
 * Shows a short message.
 * @param {string} message - the message (translated by i18n.js on the page).
 * @returns {void}
 */
export function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add(SHOWN_CLASS);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => elements.toast.classList.remove(SHOWN_CLASS), TOAST_DURATION);
}
