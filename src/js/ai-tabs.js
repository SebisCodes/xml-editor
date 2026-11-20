/**
 * Handing an AI's document from the tab its link opened to the editor tab that is already
 * open (BroadcastChannel xmleditor): the new tab asks who is open, every editor tab
 * answers with when it was used last, and the one used last takes the document and says
 * under which id it keeps it. The viewer neither hands a document on nor takes one.
 */

const CHANNEL_NAME = 'xmleditor';
const ANSWER_WAIT = 350;                // milliseconds the open tabs have to answer
const HANDOVER_WAIT = 4000;             // milliseconds a tab has to take the document

const tabId = createRequestId();
let lastFocus = document.hasFocus() ? Date.now() : 0;
let channel = null;
addEventListener('focus', () => { lastFocus = Date.now(); });

/**
 * Returns a random id of a tab or of one request between tabs.
 * @returns {string} the id.
 */
export function createRequestId() {
    return Math.random().toString(36).slice(2);
}

/**
 * Opens the channel to the other editor tabs (not in the viewer, not without
 * BroadcastChannel) and answers them: says that this tab is open, and takes documents meant for it.
 * @param {function(string, string, Object): Promise<?string>} receive - takes a document; resolves with its id.
 * @returns {void}
 */
export function openTabChannel(receive) {
    if (new URLSearchParams(location.search).get('viewer') === '1' || !('BroadcastChannel' in window)) return;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', event => sendTabAnswer(event, receive));
}

/**
 * Answers a message of another editor tab.
 * @param {MessageEvent} event - a message on the channel.
 * @param {function(string, string, Object): Promise<?string>} receive - takes a document.
 * @returns {void}
 */
function sendTabAnswer(event, receive) {
    const message = event.data || {};
    if (message.type === 'ping') channel.postMessage({ type: 'pong', ask: message.ask, tab: tabId, focus: lastFocus });
    if (message.type === 'document' && message.to === tabId) {
        // got carries the id of the document it is in, for "Open it here" in the other tab
        Promise.resolve(receive(message.code, message.mode, message.target)).catch(() => null).then(id => channel.postMessage({ type: 'got', ask: message.ask, id }));
    }
}

/**
 * Returns the open editor tab that was used last.
 * @param {string} requestId - the id of this request.
 * @returns {Promise<?Object>} the tab's answer, or null when no tab answered.
 */
export function findEditorTab(requestId) {
    if (!channel) return Promise.resolve(null);
    return new Promise(resolve => {
        const tabs = [];
        /**
         * Collects the answer of an open tab to this request.
         * @param {MessageEvent} event - a message on the channel.
         * @returns {void}
         */
        const addTabAnswer = event => { if (event.data && event.data.type === 'pong' && event.data.ask === requestId) tabs.push(event.data); };
        channel.addEventListener('message', addTabAnswer);
        channel.postMessage({ type: 'ping', ask: requestId });
        setTimeout(() => {
            channel.removeEventListener('message', addTabAnswer);
            tabs.sort((first, second) => second.focus - first.focus);
            resolve(tabs[0] || null);
        }, ANSWER_WAIT);
    });
}

/**
 * Hands a document to another editor tab.
 * @param {Object} tab - the tab's answer from findEditorTab().
 * @param {Object} received - the document (code), its mode and target.
 * @param {string} requestId - the id of this request.
 * @returns {Promise<?{id: ?string}>} the id the tab keeps it under, or null when it did not take it in time.
 */
export function sendToTab(tab, received, requestId) {
    return new Promise(resolve => {
        /**
         * Resolves with the id the tab keeps the document under, once it took it.
         * @param {MessageEvent} event - a message on the channel.
         * @returns {void}
         */
        const receiveTabAnswer = event => {
            if (!event.data || event.data.type !== 'got' || event.data.ask !== requestId) return;
            channel.removeEventListener('message', receiveTabAnswer);
            resolve({ id: event.data.id });
        };
        channel.addEventListener('message', receiveTabAnswer);
        channel.postMessage({ type: 'document', to: tab.tab, code: received.code, mode: received.mode, target: received.target, ask: requestId });
        setTimeout(() => { channel.removeEventListener('message', receiveTabAnswer); resolve(null); }, HANDOVER_WAIT);
    });
}
