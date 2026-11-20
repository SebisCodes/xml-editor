/**
 * The prompt "Copy prompt" puts on the clipboard: how to answer (a link, or a request to
 * the page's server when the page around the editor takes the AI's result), what the
 * editor can show, the user's documents, the current document with the problems the
 * editor found, and the start of the user's request. Text that comes from a website is
 * fenced and marked with its real origin, so the AI can tell it apart from the user's words.
 * The prompt is always English.
 */

const SITE = 'https://xml.giit.ch/';
const OTHERS_LISTED = 40;
const SELECTION_SHOWN = 300;
const PROBLEMS_LISTED = 12;

export const PROMPT_BASE = `You write XML for my editor ${SITE}. It runs in my browser and shows the element tree next to the code.

HOW TO ANSWER
Write the complete document; it must be well-formed XML (one root element, every element closed, & < escaped as &amp; &lt;, namespace prefixes declared). Keep my work, its formatting and its namespaces unless I ask otherwise.
Send it as a link: ${SITE}#b64=<base64url of the UTF-8 text> (shorter: zlib-compress first and use #z=; without code: #xml=<URL-encoded text>). Open the link yourself if you can; otherwise give it to me - I click it or paste your whole answer into the editor.
- New document: add &file=new&name=<short name>. Change one of my documents: add &file=<its exact name>.
- Only add elements to the root element: send just those elements and add &mode=add.
- Longer than about 8000 characters: one link per part with &part=N&of=M&id=<short name>.

WHAT THE EDITOR CAN SHOW
The element tree with attributes, text, comments, CDATA, processing instructions and namespaces, XPath 1.0 queries, well-formedness errors with line and column, undeclared namespace prefixes and duplicate ids. It never loads DTDs, schemas or external entities: entities declared in a DTD stay as written.`;

/** Left out when a page that holds the document opened the editor (it saves there by itself). */
export const PROMPT_SAVING = `MY OWN SERVER (only if I ask about it)
The editor can POST every saved version as JSON {editor:"xml", event:"save", id, name, content, updated} to my server (webhook, optional Bearer token, CORS from ${SITE.replace(/\/$/, '')}). It can be embedded with <iframe src="${SITE}?embed=1"> or opened with window.open("${SITE}?embed=window") and then talks with postMessage (xmleditor:ready, load, loaded, change, save, get, ai, key-request). If I ask you to build that, follow ${SITE}llms.txt exactly.`;
export const PROMPT_HEAD = `${PROMPT_BASE}\n\n${PROMPT_SAVING}`;

/**
 * The page's AI settings (sync.js).
 * @typedef {Object} RemoteAi
 * @property {string} label - the page's name for itself.
 * @property {string} [site] - the page's real host.
 * @property {string} [prompt] - the page's instructions.
 * @property {string} [endpoint] - where the AI sends its result.
 * @property {string} [key] - the session's key.
 * @property {boolean} [base] - include the editor's own instructions.
 */

/**
 * The page that holds the document (plain text from that page, sync.js).
 * @typedef {Object} PageContext
 * @property {string} [host] - the page's name for its host.
 * @property {string} [title] - the page's title.
 * @property {string} [rules] - the page's rules for the document.
 * @property {string} [site] - the page's real origin.
 */

/**
 * What the prompt is made from.
 * @typedef {Object} PromptState
 * @property {string} code - the current document.
 * @property {string} name - its name.
 * @property {string[]} files - the names of the user's documents.
 * @property {string} [sel] - the selected text.
 * @property {string[]} [problems] - the problems the editor found.
 * @property {?PageContext} [context] - the page that holds the document.
 * @property {?RemoteAi} [remote] - the page's AI settings.
 * @property {boolean} [framed] - the editor is inside another website.
 */

/**
 * Returns text from a website marked as such: where it comes from (the real origin) and fenced.
 * @param {string} heading - the heading (INSTRUCTIONS, RULES).
 * @param {string} [site] - the real origin.
 * @param {string} [label] - the name the page gives itself.
 * @param {string} text - the page's text.
 * @returns {string} the fenced part.
 */
function getSitePart(heading, site, label, text) {
    return `${heading} ${site ? `FROM THE WEBSITE ${site}` : 'FROM THE WEBSITE'}${label && label !== site ? ` ("${label}")` : ''}\n\`\`\`text\n${text.replace(/`{3,}/g, "'''")}\n\`\`\``;
}

/**
 * Returns the part about the page that holds the document.
 * @param {PageContext} context - plain text from that page.
 * @returns {string} the part.
 */
function getContextPart(context) {
    return `THIS DOCUMENT BELONGS TO ${context.host ? `"${context.host}"` : 'a website'}${context.title ? ` ("${context.title}")` : ''}
That page opened the editor and gets every saved version back by itself when I click Save (or press Ctrl+S) - nothing to set up and no server to build. Keep the document working with that page.${context.rules ? `\n\n${getSitePart('RULES', context.site, context.host, context.rules)}` : ''}`;
}

/**
 * Returns one part of PROMPT_BASE, from its heading to the next one.
 * @param {string} heading - the heading.
 * @returns {string} the part, empty when there is no such heading.
 */
function getBasePart(heading) {
    const start = PROMPT_BASE.indexOf('\n' + heading + '\n');
    if (start < 0) return '';
    const rest = PROMPT_BASE.slice(start + 1), end = rest.search(/\n\n[A-Z][A-Z ]+\n/);
    return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Returns the prompt when the page around the editor takes the AI's result on its own
 * server: the AI sends the result there itself, and the page then opens it here.
 * @param {PromptState} promptState - what the prompt is made from.
 * @param {RemoteAi} remote - the page's AI settings.
 * @param {boolean} makeNew - the AI makes a new document.
 * @returns {string} the head of the prompt.
 */
function getRemotePrompt(promptState, remote, makeNew) {
    const parts = [];
    if (remote.base) {
        const abilities = getBasePart('WHAT THE EDITOR CAN SHOW');
        parts.push(`You write for my XML editor ${SITE}, inside the website "${remote.label}".\nWrite the complete document; it must be well-formed XML. Keep my work, its formatting and its namespaces unless I ask otherwise.${abilities ? '\n\n' + abilities : ''}`);
    }
    if (remote.prompt) parts.push(getSitePart('INSTRUCTIONS', remote.site, remote.label, remote.prompt));
    if (promptState.context && promptState.context.rules) parts.push(getSitePart('RULES', remote.site, remote.label, promptState.context.rules));
    parts.push(getRemoteAnswerPart(promptState, remote, makeNew));
    return parts.join('\n\n');
}

/**
 * Returns how the AI answers when the page takes the result: by a request to the page's
 * server with the session's key, else by a link the user pastes.
 * @param {PromptState} promptState - what the prompt is made from.
 * @param {RemoteAi} remote - the page's AI settings.
 * @param {boolean} makeNew - the AI makes a new document.
 * @returns {string} the HOW TO ANSWER part.
 */
function getRemoteAnswerPart(promptState, remote, makeNew) {
    const what = makeNew ? `Make a NEW document; leave "${promptState.name}" as it is.` : `Change my document "${promptState.name}".`;
    const link = `${SITE}#b64=<base64url of the UTF-8 XML>${makeNew ? '&file=new&name=<short name>' : ''}`;
    if (!remote.endpoint || !remote.key) return `HOW TO ANSWER\n${what} Give me the link ${link}; I paste your answer into the editor (a clicked link does not reach it).`;
    return `HOW TO ANSWER
${what} Send the result with one HTTP request (run it, do not only show it):
  POST ${remote.endpoint}
  Authorization: Bearer ${remote.key}
  Content-Type: application/json
  {"editor":"xml","target":"${makeNew ? 'new' : 'current'}","name":"<short name>","content":"<the complete XML>"}
Build the JSON with a JSON library. The result then opens in my editor; tell me briefly what you did, or the server's error message.
If you cannot send HTTP requests, give me the link ${link} and I paste your answer into the editor.`;
}

/**
 * Returns the whole prompt: the instructions, the user's documents, the current document
 * with the problems found, and the start of the user's request.
 * @param {PromptState} promptState - what the prompt is made from.
 * @param {boolean} makeNew - the AI makes a new document instead of changing the current one.
 * @returns {string} the prompt.
 */
export function getPrompt(promptState, makeNew) {
    let instructions = promptState.remote ? getRemotePrompt(promptState, promptState.remote, makeNew) : promptState.context ? `${PROMPT_BASE}\n\n${getContextPart(promptState.context)}` : PROMPT_HEAD;
    if (promptState.framed && !promptState.remote) instructions += `\n\nMy editor is inside another website, so a clicked link does not reach it: do not open the link yourself - give it to me and I paste your answer.`;
    const others = promptState.files.filter(name => name !== promptState.name);
    const documentList = `Open now: "${promptState.name}"${others.length ? `. Others: ${others.slice(0, OTHERS_LISTED).map(name => `"${name}"`).join(', ')}${others.length > OTHERS_LISTED ? ' …' : ''}` : ''}.`;
    const goal = makeNew
        ? 'Unless I say otherwise in my request, make a NEW document (&file=new&name=<short name>) and leave my documents as they are.'
        : `Unless I say otherwise in my request, change "${promptState.name}" (&file=${encodeURIComponent(promptState.name)}).`;
    let heading = makeNew ? `MY OPEN DOCUMENT "${promptState.name}" (for reference only - do not change it)` : `MY CURRENT DOCUMENT "${promptState.name}"`;
    const problems = promptState.problems && promptState.problems.length ? `\nThe editor reports: ${promptState.problems.slice(0, PROBLEMS_LISTED).join('; ')}` : '';
    if (promptState.remote) heading = `MY ${makeNew ? 'CURRENT' : ''} DOCUMENT "${promptState.name}"`.replace('  ', ' ');
    const selection = promptState.sel ? ` (I have selected: "${promptState.sel.slice(0, SELECTION_SHOWN)}")` : '';
    return `${instructions}\n\n${promptState.remote ? '' : `${documentList}\n${goal}\n\n`}${heading}${selection}${problems}\n\`\`\`xml\n${promptState.code.trim()}\n\`\`\`\n\nMy request: `;
}
