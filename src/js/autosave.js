/**
 * Saving in the browser: the settings go to xmleditor.v1, the open document to its entry
 * in "My documents" (files.js), a short while after typing or right after a change.
 *
 * Two tabs on one document keep both versions: when another tab saved the document since
 * this tab read it and this tab has edits of its own, this tab's version becomes a
 * document of its own. A hidden tab without edits of its own shows the other tab's version.
 */

import { state, services } from './state.js?v=2';
import { store } from './files.js?v=8';
import { showToast } from './toast.js?v=2';
import { showFileName } from './documents.js?v=4';
import { setCode } from './history.js?v=4';

const SETTINGS_KEY = 'xmleditor.v1';
const SAVE_DELAY = 400;                 // milliseconds after the last key stroke
const STORAGE_FULL = 'The browser storage is full - download and delete documents under "My documents"';

let savedCode = null;                   // the code of the open document as stored, null when unknown
let saveTimer = 0;
let isStorageFullShown = false;

/**
 * The settings kept in the browser.
 * @typedef {Object} StoredSettings
 * @property {string} file - the id of the document that was open.
 * @property {number} split - the share of the width the code takes.
 */

/**
 * Listens for saves of the open document in other tabs.
 * @returns {void}
 */
export function startAutosave() {
    addEventListener('storage', showOtherTabVersion);
}

/**
 * Returns the stored settings.
 * @returns {?StoredSettings} the settings, or null when none are stored or storage is blocked.
 */
export function getStoredSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (error) { return null; }
}

/**
 * Remembers the code of the open document as it is stored.
 * @param {?string} code - the stored code.
 * @returns {void}
 */
export function setSavedCode(code) {
    savedCode = code;
}

/**
 * Saves the settings and the open document, unless it is saved already. When another tab
 * changed the document meanwhile, both versions are kept.
 * @returns {void}
 */
export function saveDocument() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ file: state.fileId, split: state.split }));
    } catch (error) { /* Storage blocked or full: the editor keeps working without a saved draft. */ }
    if (!state.fileId || state.code === savedCode) return;
    try {
        const storedCode = store.code(state.fileId);
        if (storedCode != null && storedCode !== savedCode && storedCode !== state.code) { saveBothVersions(); return; }
        store.write(state.fileId, { code: state.code });
        savedCode = state.code;
    } catch (error) {
        if (!isStorageFullShown) showToast(STORAGE_FULL);
        isStorageFullShown = true;
    }
}

/**
 * Saves the open document a short while after the last key stroke.
 * @returns {void}
 */
export function startSaveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, SAVE_DELAY);
}

/**
 * Saves at once what typing left waiting for the delayed save (before another document opens).
 * @returns {void}
 */
export function saveWaiting() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveDocument();
}

/**
 * Keeps this tab's version as a document of its own (with a free name) when another tab
 * changed the open document while this tab had edits of its own; the other tab's stays.
 * @returns {void}
 */
function saveBothVersions() {
    const formerName = state.name;
    let id;
    try { id = store.create(formerName, state.code); } catch (error) { showToast(STORAGE_FULL); return; }
    state.fileId = id;
    state.name = store.getMeta(id)?.name || formerName;
    savedCode = state.code;
    showFileName();
    services.files.render();
    services.sync?.updateUi();
    saveDocument();
    showToast(`"${formerName}" was changed in another tab - your version here is kept as "${state.name}"`);
}

/**
 * Shows the version another tab saved of the open document, in a hidden tab without edits
 * of its own: what the user is looking at never changes by itself.
 * @param {StorageEvent} event - the change in another tab.
 * @returns {void}
 */
function showOtherTabVersion(event) {
    if (!state.fileId || !event.key || !event.key.endsWith(state.fileId) || event.newValue == null || store.isTemp(state.fileId)) return;
    const storedCode = store.code(state.fileId);
    if (storedCode == null || storedCode === state.code || state.code !== savedCode || document.visibilityState !== 'hidden') return;
    savedCode = storedCode;
    setCode(storedCode);
}
