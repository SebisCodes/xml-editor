/**
 * The Convert tab of the side panel and the Format button: Format indents every element on
 * its own line (2 or 4 spaces or tabs), Minify removes comments and the white space between
 * elements, both one undo step; "As JSON" and "As YAML" show the document converted, to
 * copy or download.
 */

import { state, elements, findElement } from './state.js?v=2';
import { escapeHtml } from './xml.js?v=7';
import { formatXml, getMinifiedXml, convertToJson, convertToYaml } from './xml-format.js?v=4';
import { getIndentUnit } from './nodes.js?v=4';
import { readTreeNow } from './preview.js?v=5';
import { TEMPLATE_SYNTAX } from './xml-template.js?v=1';
import { applyEdits } from './history.js?v=5';
import { showToast } from './toast.js?v=2';
import { saveDownload, getSafeName, copyToClipboard } from './util.js?v=3';

const DEFAULT_INDENT_CHOICE = '2';
const TAB_CHOICE = 'tab';
const OUTPUT_TYPES = { json: 'application/json', yaml: 'application/yaml' };

let output = { kind: '', text: '' };    // the conversion shown: kind "json", "yaml" or "" for none
let indentChoice = '';                  // the choice of the "Indent with" field, "" until one is made

/**
 * Listens for the Convert tab and the Format button.
 * @returns {void}
 */
export function startConvertPanel() {
    elements.convertPanel.addEventListener('change', event => { if (event.target.id === 'cv-unit') indentChoice = event.target.value; });
    elements.convertPanel.addEventListener('click', handleConvertClick);
    findElement('#btn-format').addEventListener('click', () => formatCode(getIndentUnit()));
}

/**
 * Draws the Convert tab with the conversion shown, made again from the current document.
 * @returns {void}
 */
export function renderConvertPanel() {
    const isWellFormed = !!state.result.doc;
    const kind = output.kind;
    if (kind === 'json' && isWellFormed) output.text = convertToJson(state.result.doc);
    if (kind === 'yaml' && isWellFormed) output.text = convertToYaml(state.result.doc);
    const disabled = isWellFormed ? '' : ' disabled';
    elements.convertPanel.innerHTML = `
        <h3>Code</h3>
        <label class="field"><span>Indent with</span><select id="cv-unit"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tabs</option></select></label>
        <div class="button-row two">
            <button type="button" class="button" id="cv-format"${disabled} title="Indent every element on its own line (one undo step)">Format</button>
            <button type="button" class="button" id="cv-minify"${disabled} title="Remove comments and the white space between elements (one undo step)">Minify</button>
        </div>
        <h3>Other formats</h3>
        <div class="button-row two">
            <button type="button" class="button${kind === 'json' ? ' on' : ''}" id="cv-json"${disabled}>As JSON</button>
            <button type="button" class="button${kind === 'yaml' ? ' on' : ''}" id="cv-yaml"${disabled}>As YAML</button>
        </div>
        ${isWellFormed ? '' : '<p class="hint">The document is not well-formed - fix the errors above the code first.</p>'}
        <p class="hint">Attributes become <code>@name</code>, text next to elements <code>#text</code>, repeated elements a list. Comments are left out.</p>
        ${kind && isWellFormed ? `<textarea id="cv-text" class="ex-text cv-text" readonly spellcheck="false" aria-label="Result" data-no-i18n>${escapeHtml(output.text)}</textarea>
        <div class="button-row two"><button type="button" class="button" id="cv-copy">Copy</button><button type="button" class="button primary" id="cv-download">Download</button></div>` : ''}`;
    findElement('#cv-unit').value = indentChoice || DEFAULT_INDENT_CHOICE;
}

/**
 * Returns the indentation unit of a choice of the "Indent with" field.
 * @param {string} choice - "2", "4" or "tab".
 * @returns {string} the unit.
 */
function getUnitOfChoice(choice) {
    return choice === TAB_CHOICE ? '\t' : ' '.repeat(+choice || +DEFAULT_INDENT_CHOICE);
}

/**
 * Formats the code with an indentation unit (one undo step).
 * @param {string} [unit] - one level of indentation; the choice of the Convert tab by default.
 * @returns {void}
 */
export function formatCode(unit = getUnitOfChoice(indentChoice || DEFAULT_INDENT_CHOICE)) {
    readTreeNow();
    if (!state.result.doc) { showToast('The document is not well-formed - fix the errors first'); return; }
    const formatted = formatXml(state.model, unit);
    if (formatted === state.code) { showToast('The code is formatted already'); return; }
    applyEdits([[0, state.code.length, formatted]], 0);
    showToast('Code formatted - "Undo" brings the old layout back');
}

/**
 * Minifies the code (one undo step).
 * @returns {void}
 */
function compressCode() {
    const minified = getMinifiedXml(state.model, TEMPLATE_SYNTAX);
    if (minified === state.code) { showToast('The code is minified already'); return; }
    applyEdits([[0, state.code.length, minified]], 0);
    showToast('Code minified - "Undo" brings it back');
}

/**
 * Handles the buttons of the Convert tab.
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} resolves when a copy is done.
 */
async function handleConvertClick(event) {
    const id = event.target.closest('button')?.id;
    if (id === 'cv-format') formatCode();
    else if (id === 'cv-minify') compressCode();
    else if (id === 'cv-json' || id === 'cv-yaml') {
        output = { kind: id.slice(3), text: '' };
        renderConvertPanel();
    } else if (id === 'cv-copy') {
        await copyToClipboard(output.text, findElement('#cv-text'));
        showToast('Copied to the clipboard');
    } else if (id === 'cv-download') {
        saveDownload(output.text, `${getSafeName(state.name)}.${output.kind === 'json' ? 'json' : 'yaml'}`, OUTPUT_TYPES[output.kind === 'json' ? 'json' : 'yaml']);
    }
}
