/**
 * Documents that come in as files or from the clipboard: the Open button, files dropped on
 * the page (each becomes a document in "My documents"), and a whole XML document pasted
 * outside the code, which replaces the open one (one undo step).
 */

import { state, findElement } from './state.js?v=2';
import { applyEdits } from './history.js?v=3';
import { createDocument } from './documents.js?v=3';
import { showToast } from './toast.js?v=2';

const XML_FILE = /\.(xml|xsd|xsl|xslt|rss|atom|svg|xhtml|kml|gpx|plist|config|csproj|vbproj|props|targets|resx|wsdl|xlf|xliff|nuspec|pom|txt)$/i;
const XML_TYPE = /xml|text/;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const DEFAULT_NAME = 'Document';
const DROP_CLASS = 'drop';
/** Fields that take typing: shortcuts and pasting a document pause while one has the focus. */
export const TYPING_FIELDS = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';

const fileField = findElement('#file');
let dragDepth = 0;

/**
 * Listens for the Open button, dragging and dropping files and pasting outside the code.
 * @returns {void}
 */
export function startFileInput() {
    findElement('#btn-open').addEventListener('click', () => fileField.click());
    fileField.addEventListener('change', async () => { await openFiles([...fileField.files]); fileField.value = ''; });
    window.addEventListener('dragenter', showDropTarget);
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) hideDropTarget(); });
    window.addEventListener('drop', openDroppedFiles);
    window.addEventListener('paste', importPastedDocument);
}

/**
 * Opens the file dialog of the browser.
 * @returns {void}
 */
export function openFileDialog() {
    fileField.click();
}

/**
 * Opens files as new documents; files that are no XML or larger than 8 MB are refused with a message.
 * @param {File[]} files - the files.
 * @returns {Promise<void>} resolves when every file is read.
 */
async function openFiles(files) {
    for (const file of files) {
        if (!XML_FILE.test(file.name) && !XML_TYPE.test(file.type)) { showToast(`"${file.name}" is not an XML file`); continue; }
        if (file.size > MAX_FILE_SIZE) { showToast('The file is larger than 8 MB'); continue; }
        const text = await file.text();
        if (createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, text)) showToast(`Opened "${file.name}" - it is now in "My documents"`);
    }
}

/**
 * Marks the page as a drop target while files are dragged over it.
 * @param {DragEvent} event - the drag entering the page or one of its elements.
 * @returns {void}
 */
function showDropTarget(event) {
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    document.body.classList.add(DROP_CLASS);
    event.preventDefault();
}

/**
 * Removes the drop mark.
 * @returns {void}
 */
function hideDropTarget() {
    dragDepth = 0;
    document.body.classList.remove(DROP_CLASS);
}

/**
 * Opens the files dropped on the page.
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function openDroppedFiles(event) {
    hideDropTarget();
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    openFiles(files);
}

/**
 * Replaces the open document with a whole XML document pasted outside the code and its fields.
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function importPastedDocument(event) {
    const focused = document.activeElement;
    if (focused && focused.matches(TYPING_FIELDS)) return;
    const text = event.clipboardData.getData('text');
    if (!/^\s*<\?xml\b/.test(text)) return;
    event.preventDefault();
    applyEdits([[0, state.code.length, text]], 0);
    showToast('XML pasted from the clipboard - "Undo" brings the old text back');
}
