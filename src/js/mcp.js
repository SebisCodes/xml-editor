/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext). The tools run in this page only - no server, no connector.
 * Browsers without WebMCP skip this. Every change is a normal undo step.
 * The text tools work on the open document; list_files, open_file and new_file reach the
 * user's other documents ("My documents"). The tool names and parameters are a contract
 * with the agents and stay as they are.
 */

const XPATH_PROPERTY = { type: 'string', description: 'An XPath 1.0 expression that selects the node(s), e.g. /catalog/product[2]/name. Prefixes declared in the document can be used; "_" is the default namespace of the root.' };
const NO_PARAMETERS = { type: 'object', properties: {} };
const MINUTE_TIME_LENGTH = 16;          // characters of an ISO time up to the minute

/**
 * What the editor hands to createMcp().
 * @typedef {Object} McpEditor
 * @property {function(): void} [onUse] - called on each tool call.
 * @property {function(): {name: string, code: string, sel: string}} getState - the open document.
 * @property {function(): Object[]} problems - the problems with line and column.
 * @property {function(string): string} query - evaluates an XPath and answers.
 * @property {function(string, string, boolean): string} setText - sets text by XPath and answers.
 * @property {function(string, string, ?string, boolean): string} setAttribute - sets an attribute by XPath and answers.
 * @property {function(string, string, Object): Promise<void>} receive - takes a whole document.
 * @property {function(string, string, boolean): number} replace - replaces text, returns how often.
 * @property {function(number): void} showLine - shows a line.
 * @property {function(): void} undo - undoes the last change.
 * @property {function(): Object[]} files - the user's documents.
 * @property {function(string): boolean} openFile - opens a document by name.
 * @property {function(string, string): ?string} newFile - makes a document, returns its name.
 */

/**
 * Registers the tools when the browser offers WebMCP.
 * @param {McpEditor} editor - what the tools do in the editor.
 * @returns {?{last: function(): number}} last() tells when an agent last used a tool (for
 *   the AI status), or null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Notes the agent's call for the AI status, then runs the tool (the tool's execute).
         * @param {...*} args - the tool's arguments from the agent.
         * @returns {Promise<*>} the tool's answer, passed on unchanged.
         */
        const runTool = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        tool.execute = runTool;
        addTool(modelContext, tool);
    }
    /**
     * Returns when an agent last used a tool (the status object's last()).
     * @returns {number} milliseconds since 1970, 0 for never.
     */
    const getLastCall = () => lastCall;
    return { last: getLastCall };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {Object} modelContext - the browser's WebMCP interface.
 * @param {Object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const registration = modelContext.registerTool(tool);
        if (registration && typeof registration.catch === 'function') registration.catch(() => { /* not available on this page */ });
    } catch (error) { /* the browser refused this tool */ }
}

/**
 * Returns the answer of get_document: the name, the selected text and the code.
 * @param {McpEditor} editor - the editor.
 * @returns {string} the answer.
 */
function getDocumentToolAnswer(editor) {
    const state = editor.getState();
    return `Document: "${state.name}"\n${state.sel ? `Selected: ${state.sel}\n` : ''}\n${state.code}`;
}

/**
 * Returns the answer of get_problems: one problem per line.
 * @param {McpEditor} editor - the editor.
 * @returns {string} the answer.
 */
function getProblemsToolAnswer(editor) {
    const problems = editor.problems();
    return problems.length ? problems.map(problem => `line ${problem.line}, column ${problem.col} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
}

/**
 * Runs set_document: replaces the open document. Its answer is the tool's result, the shape WebMCP dictates.
 * @param {McpEditor} editor - the editor.
 * @param {string} xml - the new document.
 * @returns {string} the answer.
 * @throws {Error} when the document is empty.
 */
function runSetDocumentTool(editor, xml) {
    if (!String(xml || '').trim()) throw new Error('The document is empty.');
    editor.receive(xml, 'replace', { direct: true });
    const errors = editor.problems().filter(problem => problem.kind === 'error');
    return errors.length ? `Loaded, with ${errors.length} error(s) - see get_problems.` : 'The document is in the editor.';
}

/**
 * Runs replace_text. Its answer is the tool's result, the shape WebMCP dictates.
 * @param {McpEditor} editor - the editor.
 * @param {string} find - the exact text.
 * @param {string} replacement - the new text.
 * @param {boolean} all - every match.
 * @returns {string} the answer.
 * @throws {Error} when the text is not found.
 */
function runReplaceTextTool(editor, find, replacement, all) {
    const count = editor.replace(find, replacement, all);
    if (!count) throw new Error('The text was not found - call get_document to see the exact code.');
    return `Replaced ${count} time${count === 1 ? '' : 's'}.`;
}

/**
 * Returns the answer of list_files: one document per line, the open one marked.
 * @param {McpEditor} editor - the editor.
 * @returns {string} the answer.
 */
function getFilesToolAnswer(editor) {
    return editor.files().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, MINUTE_TIME_LENGTH).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
}

/**
 * Runs open_file. Its answer is the tool's result, the shape WebMCP dictates.
 * @param {McpEditor} editor - the editor.
 * @param {string} name - the document's name.
 * @returns {string} the answer.
 * @throws {Error} when there is no such document.
 */
function runOpenFileTool(editor, name) {
    if (!editor.openFile(name)) throw new Error(`No document "${name}" - call list_files.`);
    return `"${name}" is open.`;
}

/**
 * Runs new_file. Its answer is the tool's result, the shape WebMCP dictates.
 * @param {McpEditor} editor - the editor.
 * @param {string} name - the name wanted.
 * @param {string} [xml] - the document.
 * @returns {string} the answer.
 * @throws {Error} when the storage is full.
 */
function runNewFileTool(editor, name, xml) {
    const createdName = editor.newFile(name, xml);
    if (!createdName) throw new Error('The browser storage is full.');
    return `New document "${createdName}" is open.`;
}

/**
 * Returns the tools with their descriptions, parameters and what they run. The list is
 * data, one entry per tool, and longer than a function's guide value for that reason.
 * @param {McpEditor} editor - the editor.
 * @returns {Object[]} the tools in the form registerTool() takes.
 */
function createTools(editor) {
    return [
        {
            name: 'get_document',
            description: 'Returns the name and the XML code of the document open in the editor and the selected text.',
            inputSchema: NO_PARAMETERS,
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: async () => getDocumentToolAnswer(editor),
        },
        {
            name: 'get_problems',
            description: 'Lists the well-formedness errors and warnings in the document (undeclared namespace prefixes, duplicate ids), with line and column.',
            inputSchema: NO_PARAMETERS,
            annotations: { readOnlyHint: true },
            execute: async () => getProblemsToolAnswer(editor),
        },
        {
            name: 'query',
            description: 'Evaluates an XPath 1.0 expression on the document. Returns the matching nodes with their path and line, or the value (for count(), string() …). The matches are marked in the tree.',
            inputSchema: { type: 'object', properties: { xpath: XPATH_PROPERTY }, required: ['xpath'] },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: async ({ xpath }) => editor.query(String(xpath || '')),
        },
        {
            name: 'set_text',
            description: 'Sets the text content of the element(s) selected by an XPath (special characters are escaped). Only for elements without child elements.',
            inputSchema: { type: 'object', properties: { xpath: XPATH_PROPERTY, text: { type: 'string', description: 'The new text.' }, all: { type: 'boolean', description: 'Change every match, not only the first.' } }, required: ['xpath', 'text'] },
            execute: async ({ xpath, text, all }) => editor.setText(String(xpath || ''), String(text ?? ''), !!all),
        },
        {
            name: 'set_attribute',
            description: 'Sets (or adds) an attribute on the element(s) selected by an XPath; value null removes the attribute.',
            inputSchema: { type: 'object', properties: { xpath: XPATH_PROPERTY, name: { type: 'string', description: 'The attribute name.' }, value: { type: ['string', 'null'], description: 'The new value, or null to remove it.' }, all: { type: 'boolean', description: 'Change every match.' } }, required: ['xpath', 'name', 'value'] },
            execute: async ({ xpath, name, value, all }) => editor.setAttribute(String(xpath || ''), String(name || ''), value == null ? null : String(value), !!all),
        },
        {
            name: 'set_document',
            description: 'Replaces the whole open document with new XML code. Keep the user\'s existing work unless asked otherwise.',
            inputSchema: { type: 'object', properties: { xml: { type: 'string', description: 'The complete XML document.' } }, required: ['xml'] },
            execute: async ({ xml }) => runSetDocumentTool(editor, xml),
        },
        {
            name: 'replace_text',
            description: 'Replaces an exact piece of the XML code with new text (the first match, or every match with all=true).',
            inputSchema: {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'The exact text to find in the code.' },
                    replace: { type: 'string', description: 'The new text.' },
                    all: { type: 'boolean', description: 'Replace every match.' },
                },
                required: ['find', 'replace'],
            },
            execute: async ({ find, replace, all }) => runReplaceTextTool(editor, String(find || ''), String(replace ?? ''), !!all),
        },
        {
            name: 'show_line',
            description: 'Moves the cursor to a line of the code and shows that node in the tree, so the user sees it.',
            inputSchema: { type: 'object', properties: { line: { type: 'number', description: 'Line number (1 = first line).' } }, required: ['line'] },
            execute: async ({ line }) => { editor.showLine(Math.max(1, Math.round(+line || 1))); return `Showing line ${line}.`; },
        },
        {
            name: 'list_files',
            description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
            inputSchema: NO_PARAMETERS,
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: async () => getFilesToolAnswer(editor),
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: async ({ name }) => runOpenFileTool(editor, name),
        },
        {
            name: 'new_file',
            description: 'Creates a new document and opens it; the user\'s other documents stay unchanged. Without xml it starts from an empty root element.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A short name for the document.' },
                    xml: { type: 'string', description: 'Optional: the complete XML document.' },
                },
                required: ['name'],
            },
            execute: async ({ name, xml }) => runNewFileTool(editor, name, xml),
        },
        {
            name: 'undo',
            description: 'Undoes the last change in the editor.',
            inputSchema: NO_PARAMETERS,
            execute: async () => { editor.undo(); return 'Undone.'; },
        },
    ];
}
