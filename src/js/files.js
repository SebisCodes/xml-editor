/**
 * My documents: the dialog that opens, renames, duplicates, downloads and deletes the
 * documents kept in this browser (document-store.js). The editor works on one of them at
 * a time. The store is handed on from here, where app.js and the review test import it.
 */

import { store, LIST_KEY } from './document-store.js?v=2';
import { openDialog, openConfirmation } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveDownload, getSafeName } from './util.js?v=3';

export { store };

const SECOND = 1000, MINUTE = 60, HOUR = 3600, DAY = 86400, TWO_DAYS = 172800;
const KILOBYTE = 1024;
const ONE_DECIMAL_LIMIT = 10 * KILOBYTE;   // sizes below this get one decimal
const SUMMARY_LENGTH = 260;
const ZIP_NAME = 'xml-documents.zip';
const ICONS = {
    rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

/**
 * What the editor hands to createFiles().
 * @typedef {Object} FilesEditor
 * @property {function(): {id: string, name: string, code: string}} current - the open document.
 * @property {function(string): void} open - opens a document.
 * @property {function(string): void} create - makes a new document of a kind ("blank").
 * @property {function(string, string): void} rename - renames a document.
 * @property {function(string): void} removed - a document was deleted.
 * @property {function(): void} importFile - opens the browser's file dialog.
 * @property {function(string): void} toast - shows a short message.
 */

/** @type {?FilesEditor} */
let editor = null;
const dialog = document.getElementById('files');
const grid = document.getElementById('files-grid');
const search = document.getElementById('files-search');
const info = document.getElementById('files-info');

/**
 * Sets up the "My documents" dialog.
 * @param {FilesEditor} filesEditor - what the dialog needs of the editor.
 * @returns {{open: function(): void, render: function(): void}} open() shows the dialog,
 *   render() draws it again while it is open.
 */
export function createFiles(filesEditor) {
    editor = filesEditor;
    grid.addEventListener('click', handleCardClick);
    search.addEventListener('input', renderList);
    document.getElementById('files-new').addEventListener('click', () => { dialog.close(); editor.create('blank'); });
    document.getElementById('files-import').addEventListener('click', () => { dialog.close(); editor.importFile(); });
    document.getElementById('files-zip').addEventListener('click', saveAllDocuments);
    // Another editor tab changed the list.
    addEventListener('storage', event => { if (event.key === LIST_KEY && dialog.open) renderList(); });
    return { open: openFilesDialog, render: renderOpenDialog };
}

/**
 * Shows the dialog with every document, the open one focused.
 * @returns {void}
 */
function openFilesDialog() {
    search.value = '';
    renderList();
    openDialog(dialog);
    grid.querySelector('.current .file-open')?.focus();
}

/**
 * Draws the dialog again while it is open.
 * @returns {void}
 */
function renderOpenDialog() {
    if (dialog.open) renderList();
}

/**
 * Returns how long ago a time was, in words.
 * @param {number} time - milliseconds since 1970.
 * @returns {string} "just now", "5 min ago", "3 h ago", "yesterday" or the date.
 */
function getAgeText(time) {
    const seconds = (Date.now() - time) / SECOND;
    if (seconds < MINUTE) return 'just now';
    if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min ago`;
    if (seconds < DAY) return `${Math.floor(seconds / HOUR)} h ago`;
    if (seconds < TWO_DAYS) return 'yesterday';
    return new Date(time).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns the root element and the first words of a document for its card.
 * @param {string} code - the document's code.
 * @returns {{title: string, text: string}} the root element as "<name>" and the start of its text.
 */
function getSummary(code) {
    const root = /<([^\s?!/>][^\s/>]*)/.exec(code.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, ''));
    const text = code.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: root ? `<${root[1]}>` : '', text: text.slice(0, SUMMARY_LENGTH) };
}

/**
 * Returns a size in words.
 * @param {number} bytes - the size.
 * @returns {string} "512 bytes" or "1.5 KB".
 */
function getSizeText(bytes) {
    return bytes < KILOBYTE ? `${bytes} bytes` : `${(bytes / KILOBYTE).toFixed(bytes < ONE_DECIMAL_LIMIT ? 1 : 0)} KB`;
}

/**
 * Returns an icon of the card buttons.
 * @param {string} key - rename, copy, download or delete.
 * @returns {string} the SVG.
 */
function renderIcon(key) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
}

/**
 * Returns the code of a document; the open one's as it is in the editor.
 * @param {string} id - the document's id.
 * @returns {string} the code.
 */
function getDocumentCode(id) {
    return id === editor.current().id ? editor.current().code : store.code(id) || '';
}

/**
 * Draws the cards of the documents that match the search, and the total size.
 * @returns {void}
 */
function renderList() {
    const current = editor.current();
    const entries = store.getSorted();
    const query = search.value.trim().toLowerCase();
    const shown = query ? entries.filter(entry => entry.name.toLowerCase().includes(query)) : entries;
    grid.replaceChildren(...shown.map(entry => createCard(entry, entry.id === current.id ? current.code : store.code(entry.id) || '', entry.id === current.id)));
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'muted file-empty';
        empty.textContent = query ? `No document named "${search.value.trim()}".` : 'No documents yet.';
        grid.append(empty);
    }
    const total = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
    info.textContent = `${entries.length} ${entries.length === 1 ? 'document' : 'documents'} · ${getSizeText(total)} in this browser`;
}

/**
 * Creates the card of a document.
 * @param {Object} entry - the document's entry (document-store.js).
 * @param {string} code - its code.
 * @param {boolean} isCurrent - whether it is open.
 * @returns {HTMLLIElement} the card.
 */
function createCard(entry, code, isCurrent) {
    const card = document.createElement('li');
    card.className = 'file-card' + (isCurrent ? ' current' : '');
    card.dataset.id = entry.id;
    card.innerHTML = `<button type="button" class="file-open"><span class="file-picture doc"><span class="mini-page" data-no-i18n><b></b><i></i></span></span></button>
            <div class="file-text"><span class="file-name" data-no-i18n></span><span class="file-info muted"></span></div>
            <div class="file-buttons">
                <button type="button" class="item-button" data-act="rename" title="Rename" aria-label="Rename">${renderIcon('rename')}</button>
                <button type="button" class="item-button" data-act="copy" title="Duplicate" aria-label="Duplicate">${renderIcon('copy')}</button>
                <button type="button" class="item-button" data-act="download" title="Download as .xml" aria-label="Download">${renderIcon('download')}</button>
                <button type="button" class="item-button danger" data-act="delete" title="Delete" aria-label="Delete">${renderIcon('delete')}</button>
            </div>`;
    card.title = isCurrent ? 'This document is open' : 'Click to open this document';
    const summary = getSummary(code);
    card.querySelector('.mini-page b').textContent = summary.title;
    card.querySelector('.mini-page i').textContent = summary.text;
    card.querySelector('.file-name').textContent = entry.name;
    card.querySelector('.file-open').setAttribute('aria-label', isCurrent ? `${entry.name} (open now)` : `Open ${entry.name}`);
    card.querySelector('.file-info').textContent = isCurrent ? `Open now · ${getSizeText(entry.size || 0)}` : `${getAgeText(entry.updated)} · ${getSizeText(entry.size || 0)}`;
    return card;
}

/**
 * Turns the name of a card into a field; Enter or leaving it renames, Escape cancels.
 * @param {HTMLLIElement} card - the card.
 * @returns {void}
 */
function startRename(card) {
    const id = card.dataset.id;
    const field = document.createElement('input');
    field.className = 'file-rename';
    field.value = store.getMeta(id)?.name || '';
    field.setAttribute('aria-label', 'New name');
    card.querySelector('.file-name').replaceWith(field);
    field.focus();
    field.select();
    let isDone = false;

    /**
     * Ends the rename once and draws the list again.
     * @param {boolean} keep - rename (true) or cancel (false).
     * @returns {void}
     */
    function stopRename(keep) {
        if (isDone) return;
        isDone = true;
        const name = field.value.trim();
        if (keep && name) editor.rename(id, store.getUniqueName(name, id));
        renderList();
        grid.querySelector(`[data-id="${id}"] .file-open`)?.focus();
    }

    field.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); stopRename(true); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRename(false); }
    });
    field.addEventListener('blur', () => stopRename(true));
}

/**
 * Handles a click on a card: open the document, or one of its buttons.
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} resolves when a deletion is answered.
 */
async function handleCardClick(event) {
    const card = event.target.closest('.file-card');
    if (!card) return;
    const id = card.dataset.id;
    const entry = store.getMeta(id);
    if (!entry) { renderList(); return; }
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action && !event.target.closest('input')) {
        dialog.close();
        if (id !== editor.current().id) editor.open(id);
    } else if (action === 'rename') startRename(card);
    else if (action === 'copy') copyDocument(entry);
    else if (action === 'download') saveDownload(getDocumentCode(id), `${getSafeName(entry.name)}.xml`, 'application/xml');
    else if (action === 'delete') await removeDocument(entry);
}

/**
 * Makes a copy of a document named "<name> copy".
 * @param {Object} entry - the document's entry.
 * @returns {void}
 */
function copyDocument(entry) {
    try {
        store.create(store.getUniqueName(entry.name + ' copy'), getDocumentCode(entry.id));
        editor.toast(`"${entry.name}" duplicated`);
    } catch (error) { editor.toast('The browser storage is full - delete or download some documents first'); }
    renderList();
}

/**
 * Deletes a document after asking.
 * @param {Object} entry - the document's entry.
 * @returns {Promise<void>} resolves when the question is answered.
 */
async function removeDocument(entry) {
    const confirmed = await openConfirmation({
        title: `Delete "${entry.name}"?`,
        text: 'The document is removed from this browser for good. Download it first if you want to keep a copy.',
        ok: 'Delete',
    });
    openDialog(dialog);
    if (!confirmed) return;
    store.remove(entry.id);
    editor.removed(entry.id);
    editor.toast(`"${entry.name}" deleted`);
    renderList();
}

/**
 * Downloads every document as .xml files in one ZIP (names made unique).
 * @returns {Promise<void>} resolves when the ZIP is downloaded.
 */
async function saveAllDocuments() {
    const current = editor.current();
    const usedNames = new Set();
    const files = [];
    const entries = store.getSorted();
    for (const entry of entries) {
        let name = getSafeName(entry.name);
        for (let number = 2; usedNames.has(name.toLowerCase()); number++) name = `${getSafeName(entry.name)}-${number}`;
        usedNames.add(name.toLowerCase());
        files.push({ name: `${name}.xml`, data: entry.id === current.id ? current.code : store.code(entry.id) || '' });
    }
    saveDownload(await createZip(files), ZIP_NAME);
    editor.toast(`ZIP with ${entries.length} ${entries.length === 1 ? 'document' : 'documents'} downloaded`);
}
