/**
 * Export: the dialog with the document as .xml, minified, JSON, YAML or plain text (shown,
 * copied, downloaded, or all of them as one ZIP), the buttons that copy or download the
 * code, and Ctrl+S, which saves to the server or the page around the editor when one is
 * set up and downloads the .xml otherwise.
 */

import { state, elements, services, findElement, translate } from './state.js?v=2';
import { getMinifiedXml, getPlainText, convertToJson, convertToYaml } from './xml-format.js?v=4';
import { readTreeNow } from './preview.js?v=4';
import { TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { isEditing, stopTreeEdit } from './tree-edit.js?v=4';
import { openDialog } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveDownload, getSafeName, copyToClipboard } from './util.js?v=3';
import { showToast } from './toast.js?v=2';

const EXTENSIONS = { xml: 'xml', min: 'min.xml', json: 'json', yaml: 'yaml', txt: 'txt' };
const MEDIA_TYPES = { xml: 'application/xml', min: 'application/xml', json: 'application/json', yaml: 'application/yaml', txt: 'text/plain' };
const CONVERT_CHOICE = 'convert';       // the format choice that opens another editor (export-menu.js)
const NOT_WELL_FORMED = 'The document is not well-formed - fix the errors first';

const dialog = findElement('#export');
const nameField = findElement('#ex-name'), formatField = findElement('#ex-format'), textField = findElement('#ex-text'), infoField = findElement('#ex-info');

/**
 * Listens for the export dialog and the copy and download buttons of the bar.
 * @returns {void}
 */
export function startExport() {
    formatField.addEventListener('change', showExport);
    nameField.addEventListener('input', showExport);
    findElement('#ex-download').addEventListener('click', saveExport);
    findElement('#ex-zip').addEventListener('click', saveAllFormats);
    findElement('#ex-copy').addEventListener('click', async () => {
        await copyToClipboard(textField.value, textField);
        showToast('Copied to the clipboard');
    });
    findElement('#btn-export').addEventListener('click', openExport);
    findElement('#btn-copy').addEventListener('click', async () => {
        await copyToClipboard(state.code, elements.codeArea);
        showToast('Code copied');
    });
    findElement('#btn-download').addEventListener('click', () => saveXmlFile());
}

/**
 * Returns the document in an export format.
 * @param {string} format - xml, min, json, yaml or txt.
 * @returns {?string} the text, or null when the format needs a well-formed document and it is not.
 */
function getExport(format) {
    const parsed = state.result.doc;
    if (format === 'xml') return state.code;
    if (format === 'txt') return getPlainText(state.model);
    if (!parsed) return null;
    if (format === 'min') return getMinifiedXml(state.model, TEMPLATE_SYNTAX);
    return format === 'json' ? convertToJson(parsed) : convertToYaml(parsed);
}

/**
 * Opens the export dialog with the document as it is now (an edit in the tree is kept first).
 * @returns {void}
 */
export function openExport() {
    if (isEditing()) stopTreeEdit(true);
    readTreeNow();
    nameField.value = state.name;
    showExport();
    openDialog(dialog);
}

/**
 * Returns the file name of the export, without extension.
 * @returns {string} the name in the dialog, else the document's name, made safe.
 */
function getExportName() {
    return getSafeName(nameField.value || state.name);
}

/**
 * Shows the chosen format in the dialog with its size; the buttons are off when there is nothing to export.
 * @returns {void}
 */
function showExport() {
    if (formatField.value === CONVERT_CHOICE) return;
    const text = getExport(formatField.value);
    textField.value = text == null ? translate(NOT_WELL_FORMED) : text;
    infoField.textContent = text == null ? '' : `${new Blob([text]).size.toLocaleString('en')} bytes`;
    findElement('#ex-download').disabled = findElement('#ex-copy').disabled = text == null;
}

/**
 * Downloads the document in the chosen format.
 * @returns {void}
 */
function saveExport() {
    readTreeNow();
    const format = formatField.value, text = getExport(format);
    if (text == null) return;
    saveDownload(text, `${getExportName()}.${EXTENSIONS[format]}`, MEDIA_TYPES[format]);
    showToast('Downloaded');
}

/**
 * Downloads every format the document can be exported in as one ZIP.
 * @returns {Promise<void>} resolves when the ZIP is downloaded.
 */
async function saveAllFormats() {
    const name = getExportName();
    const files = Object.keys(EXTENSIONS).map(format => ({ name: `${name}.${EXTENSIONS[format]}`, data: getExport(format) })).filter(file => file.data != null);
    saveDownload(await createZip(files), `${name}-all.zip`);
    showToast(`ZIP downloaded with ${files.length} files`);
}

/**
 * Downloads the code as an .xml file.
 * @returns {void}
 */
function saveXmlFile() {
    saveDownload(state.code, `${getSafeName(state.name)}.xml`, 'application/xml');
    showToast('.xml downloaded');
}

/**
 * Ctrl+S: saves to the server or the page around the editor if set up, otherwise downloads the .xml.
 * @returns {void}
 */
export function saveQuickly() {
    if (isEditing()) stopTreeEdit(true);
    if (services.sync && services.sync.isActive()) { services.sync.save(); return; }
    saveXmlFile();
}

