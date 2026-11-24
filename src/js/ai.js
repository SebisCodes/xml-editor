/**
 * AI Assistant without any server: any AI sends a document as a link (ai-links.js).
 *
 * "Copy prompt" puts instructions and the current document on the clipboard (ai-prompt.js).
 * A tab opened with an AI's link runs these steps:
 *   1. read the link after the # and remove it from the address;
 *   2. while parts of a long document are missing, say which;
 *   3. hand the document to the open editor tab used last (ai-tabs.js), showing that it
 *      was taken over (it can be opened here too);
 *   4. without an open editor tab, load the document itself.
 * The AI's whole answer can also be pasted into the editor: the links in it are found and
 * every complete document is taken. Inside another website the browser keeps tabs apart,
 * so there the dialog asks to paste the answer.
 */

import { openDialog } from './dialogs.js?v=5';
import { readLink, readLinkHash, findLinks } from './ai-links.js?v=2';
import { isKeyInPrompt, isAnswerFromPage, getPageTexts } from './prompt-parts.js?v=1';
import { getPrompt } from './ai-prompt.js?v=3';
import { openTabChannel, findEditorTab, sendToTab, createRequestId } from './ai-tabs.js?v=3';

const OFF_SCREEN = 'position:fixed;left:-9999px;top:0;opacity:0';
const BROKEN_LINK = 'The document in this link is incomplete or damaged. If the AI\'s link was split over several lines (as in a terminal), copy the whole answer and paste it into the editor with Ctrl+V - the editor joins the lines.';
const FIELDS = 'textarea, input, select, [contenteditable]';
const FRAMED_STEP = 'The AI answers with a link: <b>paste its whole answer below</b> (a clicked link opens a separate editor). <b>Undo</b> takes it back.';

/**
 * What the editor hands to createAi().
 * @typedef {Object} AiEditor
 * @property {function(): Object} getState - what the prompt is made from (ai-prompt.js).
 * @property {function(string, string, Object): Promise<?string>} receive - takes a document; resolves with its id.
 * @property {function(string): void} toast - shows a short message.
 * @property {function(): ?Object} remote - the page's AI settings, or null (sync.js).
 * @property {function(): Promise<void>} fetchKey - asks the page for the session's key while there is none.
 * @property {function(): boolean} keyValid - the session has its key.
 * @property {function(string): boolean} open - opens a stored document in this tab; false when there is none.
 * @property {function(function(): void): void} handleAiClick - a press on the AI button: the page's own dialog when it shows one, else the function given (the editor's dialog).
 * @property {function(): string} getKeyDecline - the page's text for a declined key request, "" without.
 */

/** @type {?AiEditor} */
let editor = null;
const dialog = document.getElementById('ai');
const notice = document.getElementById('ai-receive');
const handCopy = document.getElementById('ai-prompt-text');
const remoteBox = document.getElementById('ai-remote');
const stepLink = document.getElementById('ai-step-link');
const privacy = document.getElementById('ai-privacy');
const keyExplanation = document.getElementById('ai-key-exp');
const pasteField = document.getElementById('ai-paste');
const framed = window.parent !== window;
/** Links being taken: one paste can fire several input events, each with the whole answer. */
const inFlight = new Set();
let privacyText = '';
let stepHtml = '';

/**
 * Sets up the AI Assistant: the dialog, the prompt, the links and the pasted answers.
 * @param {Object} aiEditor - what the assistant needs of the editor (AiEditor; remote,
 *   fetchKey, keyValid, open, handleAiClick and getKeyDecline may be left out).
 * @returns {{refresh: function(): void}} refresh() shows the page's AI settings again.
 */
export function createAi({ getState, receive, toast, remote = () => null, fetchKey = () => Promise.resolve(null), keyValid = () => false, open = () => false, handleAiClick = openEditorDialog => openEditorDialog(), getKeyDecline = () => '' }) {
    editor = { getState, receive, toast, remote, fetchKey, keyValid, open, handleAiClick, getKeyDecline };
    openTabChannel(receive);
    document.getElementById('btn-ai').addEventListener('click', () => editor.handleAiClick(openAiDialog));
    // Inside another website the editor may not use the clipboard API (the page has to allow it with allow="clipboard-write").
    if (framed) stepLink.innerHTML = FRAMED_STEP;
    privacyText = privacy.textContent;
    stepHtml = stepLink.innerHTML;
    document.getElementById('ai-copy').addEventListener('click', copyPromptOfDialog);
    addEventListener('paste', receivePaste);
    pasteField.addEventListener('input', () => { if (findLinks(pasteField.value).length) receivePastedAnswer(pasteField.value).then(() => { pasteField.value = ''; }); });
    addEventListener('hashchange', receiveAddressLink);
    receiveAddressLink();
    return { refresh: showRemote };
}

/**
 * Opens the AI dialog with the name of the open document and the page's AI settings.
 * @returns {void}
 */
function openAiDialog() {
    document.getElementById('ai-cur').textContent = editor.getState().name;
    showRemote();
    openDialog(dialog);
}

/**
 * Shows the notice about a link that arrived.
 * @param {string} title - its heading.
 * @param {string} text - its text.
 * @param {?function(): void} [openHere] - what "Open it here" does; no button without it.
 * @param {boolean} [loading] - the notice is the loading screen (no buttons).
 * @returns {void}
 */
function showNotice(title, text, openHere = null, loading = false) {
    notice.classList.toggle('loading', loading);
    notice.querySelector('h2').textContent = title;
    notice.querySelector('p').textContent = text;
    const hereButton = notice.querySelector('[data-here]');
    hereButton.hidden = !openHere;
    /**
     * Hides the notice and opens the document here ("Open it here").
     * @returns {void}
     */
    const openHereOnClick = () => { notice.hidden = true; openHere(); };
    hereButton.onclick = openHereOnClick;
    notice.hidden = false;
}

/**
 * Takes the document of the link in the address: hands it to the open editor tab used
 * last, or loads it here.
 * @returns {Promise<void>} resolves when the document is taken.
 */
async function receiveAddressLink() {
    if (!readLinkHash(location.hash)) return;
    const hash = location.hash;
    history.replaceState(null, '', location.pathname + location.search);
    showNotice('Loading…', '', null, true);
    const received = await readLink(hash);
    if (received.missing) {
        showNotice(`Part ${received.part} of ${received.of} received`, `Open the other ${received.missing.length === 1 ? 'link' : 'links'} from the AI too (still missing: part ${received.missing.join(', ')}).`);
        return;
    }
    if (received.error) { showNotice('The link could not be read', BROKEN_LINK); return; }
    const requestId = createRequestId();
    const tab = await findEditorTab(requestId);
    const sent = tab && await sendToTab(tab, received, requestId);
    if (!sent) {
        notice.hidden = true;
        editor.receive(received.code, received.mode, received.target);
        return;
    }
    // "Open it here" opens the document the other tab saved; one that is not stored there (kept in memory) comes from the link again.
    showNotice('Taken over by your editor', 'The document is now in the XML Editor tab you already had open. Switch to that tab, or open it here.', () => {
        if (!sent.id || !editor.open(sent.id)) editor.receive(received.code, received.mode, received.target);
    });
}

/**
 * Copies a text with the browser's copy command (inside the open dialog, the only place that can take focus).
 * @param {string} text - the text.
 * @returns {boolean} true when it was copied (a command that reports whether it took place).
 */
function copyWithCommand(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = OFF_SCREEN;
    dialog.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { /* not allowed */ }
    field.remove();
    return copied;
}

/**
 * Copies the prompt: the clipboard, else the copy command, else the text selected to
 * copy by hand. Inside another website the clipboard API needs allow="clipboard-write".
 * @param {string} text - the prompt.
 * @param {function(): void} done - what to do once it is copied.
 * @returns {Promise<void>} resolves when the copy is done or the text is shown.
 */
async function copyPrompt(text, done) {
    /**
     * Hides the field for copying by hand and goes on.
     * @returns {void}
     */
    const showCopyDone = () => { handCopy.hidden = true; done(); };
    try { await navigator.clipboard.writeText(text); showCopyDone(); return; } catch (error) { /* not allowed here */ }
    if (copyWithCommand(text)) { showCopyDone(); return; }
    handCopy.value = text;
    handCopy.hidden = false;
    handCopy.focus();
    handCopy.select();
    editor.toast('Copying is not allowed here - it is selected below: press Ctrl+C (⌘C)');
}

/**
 * Shows the page's AI settings in the dialog: who takes the result, its instructions and the key's state.
 * @returns {void}
 */
function showRemote() {
    const settings = editor.remote();
    remoteBox.hidden = !settings;
    privacy.textContent = !settings ? privacyText : isAnswerFromPage(settings)
        ? `${settings.label} gives the AI its instructions for answering. What you paste into your AI is handled by its provider.`
        : `The AI sends the document to ${settings.label} with a key that only works for this session. What you paste into your AI is handled by its provider.`;
    if (!settings) { stepLink.innerHTML = stepHtml; return; }
    document.getElementById('ai-remote-host').textContent = settings.site && settings.site !== settings.label ? `${settings.label} (${settings.site})` : settings.label;
    const details = document.getElementById('ai-remote-details');
    const pageTexts = getPageTexts(settings);
    details.hidden = !pageTexts;
    details.querySelector('span').textContent = settings.site || settings.label;
    document.getElementById('ai-remote-prompt').textContent = pageTexts;
    stepLink.textContent = isAnswerFromPage(settings)
        ? `The AI answers as ${settings.label} describes in the prompt. If it answers with a link, paste its answer below.`
        : `The AI sends its result to ${settings.label} by itself, and it opens here. If it answers with a link, paste its answer below.`;
    keyExplanation.textContent = !isKeyInPrompt(settings) ? '' : !settings.key ? '(no key yet)' : '(key valid while the editor is open)';
}

/**
 * "Copy prompt": asks the page for a key when the prompt needs one and it has none, then copies
 * the prompt for the current or a new document. A page that declines the key gives the message
 * shown after copying.
 * @returns {Promise<void>} resolves when the prompt is copied.
 */
async function copyPromptOfDialog() {
    let settings = editor.remote(), declined = '';
    if (isKeyInPrompt(settings) && !editor.keyValid()) {
        await editor.fetchKey();
        settings = editor.remote();
        showRemote();
        if (settings && !editor.keyValid()) { declined = editor.getKeyDecline(); editor.toast(declined || `No key from ${settings.label} - the prompt asks the AI for a link instead`); }
    }
    const makeNew = dialog.querySelector('[name=ai-target]:checked').value === 'new';
    const text = getPrompt({ ...editor.getState(), framed, remote: settings && settings.endpoint && !editor.keyValid() ? { ...settings, key: '' } : settings }, makeNew);
    copyPrompt(text, () => {
        editor.toast(declined || (settings && editor.keyValid() && !isAnswerFromPage(settings) ? `Prompt copied - the AI sends its result to ${settings.label}` : 'Prompt copied - paste it into your AI and say what it should write'));
        dialog.close();
    });
}

/**
 * Takes the documents of an AI's pasted answer: every complete document, in order; the
 * same link twice counts once.
 * @param {string} text - the pasted answer.
 * @returns {Promise<boolean>} true when the answer held a link (a command that reports whether it took place).
 */
async function receivePastedAnswer(text) {
    const links = findLinks(text);
    if (!links.length) return false;
    const taken = [];
    try {
        const { last, complete } = await readPastedLinks(links, taken);
        if (!last) return false;
        if (complete.length) {
            for (const received of complete) await editor.receive(received.code, received.mode, received.target);
            dialog.close();
            return true;
        }
        if (last.missing) editor.toast(`Part ${last.part} of ${last.of} received - paste the other ${last.missing.length === 1 ? 'link' : 'links'} too (missing: ${last.missing.join(', ')})`);
        else if (last.error) editor.toast('This link is incomplete or damaged - please ask the AI to send it again');
        return true;
    } finally { for (const link of taken) inFlight.delete(link); }
}

/**
 * Reads the links of a pasted answer that are not being taken already; each link read is
 * marked as in flight (a reader that consumes its input).
 * @param {string[]} links - the links.
 * @param {string[]} taken - collects the links this paste takes (they are in flight until it ends).
 * @returns {Promise<{last: ?Object, complete: Object[]}>} what the last link gave ({busy} when it is
 *   in flight elsewhere) and the complete documents in order.
 */
async function readPastedLinks(links, taken) {
    let last = null;
    const complete = [];
    for (const link of new Set(links)) {
        if (inFlight.has(link)) { last = last || { busy: true }; continue; }
        inFlight.add(link);
        taken.push(link);
        const received = await readLink('#' + link);
        if (!received) continue;
        last = received;
        if (!received.missing && !received.error) complete.push(received);
    }
    return { last, complete };
}

/**
 * Takes an AI's answer pasted outside a field (Ctrl+V anywhere).
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function receivePaste(event) {
    const focused = document.activeElement;
    if (focused && focused !== pasteField && focused.matches(FIELDS)) return;
    const text = event.clipboardData.getData('text');
    if (!findLinks(text).length) return;
    event.preventDefault();
    pasteField.value = '';
    receivePastedAnswer(text);
}
