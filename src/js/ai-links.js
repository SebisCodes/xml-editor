/**
 * Reading the links an AI answers with. The XML is carried after the # (that part never
 * reaches a server):
 *   #b64=<base64url of the UTF-8 XML>   #xml=<URL-encoded XML>   #z=<base64url of zlib-compressed XML>
 * optional &mode=add (elements appended to the root element), &file=new&name=NAME (a new
 * document in "My documents") or &file=NAME (that document), and, for long documents,
 * &part=N&of=M&id=NAME on each of M links; the parts are collected in localStorage
 * (xmleditor.parts.*) until all have arrived. Terminals break long links over several
 * lines, so links are also found in a pasted answer and their lines joined.
 */

const PARTS_KEY = 'xmleditor.parts.';
const MAX_TEXT = 5e6;                   // a link never carries more than this (also unpacked)
const MAX_ENCODED = MAX_TEXT * 1.4;     // the encoded text of MAX_TEXT
const MAX_PARTS = 200;
const PARTS_LIFETIME = 30 * 60e3;       // milliseconds the parts of one document belong together
const ID_LIMIT = 60;
const NAME_LIMIT = 80;
const DEFAULT_PARTS_ID = 'document';
const DATA_KINDS = ['b64', 'z', 'xml'];
const INFLATE_FORMATS = ['deflate', 'deflate-raw', 'gzip'];
const LINK_START = /#((?:b64|z|xml)=)/g;
const LINK_CHARACTERS = /^[A-Za-z0-9\-_=&%+/.~]+$/;
const LINK_TAIL = /[)>\].,`*'"]+$/;

/**
 * What a link carries.
 * @typedef {Object} LinkData
 * @property {string} kind - b64, z or xml.
 * @property {string} data - the encoded document (or one part of it).
 * @property {string} mode - "add" or "set".
 * @property {number} part - the number of this part, 0 without parts.
 * @property {number} of - the number of parts, 0 without parts.
 * @property {string} id - the name that holds the parts together.
 * @property {{file: string, name: string}} target - where the document goes (incoming.js).
 */

/**
 * What reading a link gave.
 * @typedef {Object} LinkResult
 * @property {string} [code] - the document.
 * @property {string} [mode] - "add" or "set".
 * @property {{file: string, name: string}} [target] - where it goes.
 * @property {number[]} [missing] - the parts still missing.
 * @property {number} [part] - the part that arrived.
 * @property {number} [of] - the number of parts.
 * @property {boolean} [error] - the link is incomplete or damaged.
 */

/**
 * Returns the bytes of base64 or base64url text (spaces taken as "+", line breaks ignored).
 * @param {string} text - the encoded text.
 * @returns {Uint8Array} the bytes.
 * @throws {DOMException} when the text is not base64.
 */
function getBase64Bytes(text) {
    const base64 = text.replace(/ /g, '+').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/**
 * Unpacks zlib (or raw deflate, or gzip) compressed bytes into text.
 * @param {Uint8Array} bytes - the compressed bytes.
 * @returns {Promise<string>} the text.
 * @throws {Error} when the text would be longer than 5 MB or no format unpacks it.
 */
async function expandText(bytes) {
    for (const format of INFLATE_FORMATS) {
        try {
            return await expandWith(bytes, format);
        } catch (error) {
            if (error instanceof RangeError) throw new Error('The link unpacks to more than 5 MB - it is not opened.');
        }
    }
    throw new Error('The compressed document could not be unpacked.');
}

/**
 * Unpacks bytes in one compression format, stopping at MAX_TEXT.
 * @param {Uint8Array} bytes - the compressed bytes.
 * @param {string} format - a format of DecompressionStream.
 * @returns {Promise<string>} the text.
 * @throws {RangeError} when it unpacks to more than MAX_TEXT bytes (a small link with a huge text is no document).
 */
async function expandWith(bytes, format) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_TEXT) { reader.cancel(); throw new RangeError('too big'); }
        chunks.push(value);
    }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

/**
 * Reads the parameters of a link after the #. Split by hand: URLSearchParams would turn
 * the "+" of normal base64 into spaces.
 * @param {string} hash - the part of the link from the #.
 * @returns {?LinkData} what it carries, or null when it carries no document.
 */
export function readLinkHash(hash) {
    const parameters = new Map();
    for (const pair of hash.replace(/^#/, '').split('&')) {
        const equals = pair.indexOf('=');
        if (equals < 0) continue;
        let value = pair.slice(equals + 1);
        try { value = decodeURIComponent(value); } catch (error) { /* keep it as it is */ }
        parameters.set(pair.slice(0, equals), value);
    }
    const kind = DATA_KINDS.find(key => parameters.has(key));
    if (!kind) return null;
    return {
        kind, data: parameters.get(kind),
        mode: parameters.get('mode') === 'add' ? 'add' : 'set',
        part: +parameters.get('part') || 0, of: +parameters.get('of') || 0, id: (parameters.get('id') || DEFAULT_PARTS_ID).slice(0, ID_LIMIT),
        target: { file: (parameters.get('file') || '').slice(0, NAME_LIMIT), name: (parameters.get('name') || '').replace(/\+/g, ' ').slice(0, NAME_LIMIT) },
    };
}

/**
 * Returns the link parts (after the #) in a pasted text. A link that a terminal broke over
 * several lines continues on the following lines as long as they hold link characters only.
 * @param {string} text - the pasted text.
 * @returns {string[]} the links without "#", in order.
 */
export function findLinks(text) {
    const links = [];
    const pattern = new RegExp(LINK_START.source, 'g');
    let match;
    while ((match = pattern.exec(text))) {
        let index = match.index + 1, link = '';
        while (index < text.length && !/\s/.test(text[index])) link += text[index++];
        for (;;) {
            const nextLine = text.slice(index).match(/^[ \t]*\r?\n[ \t]*([^\s]+)[ \t]*(?=\r?\n|$)/);
            if (!nextLine || !LINK_CHARACTERS.test(nextLine[1]) || /#(?:b64|z|xml)=/.test(nextLine[1])) break;
            link += nextLine[1];
            index += nextLine[0].length;
        }
        links.push(link.replace(LINK_TAIL, ''));
        pattern.lastIndex = index;
    }
    return links;
}

/**
 * Returns the document a link's data encodes.
 * @param {string} kind - b64, z or xml.
 * @param {string} data - the encoded document.
 * @returns {Promise<string>} the document's code.
 * @throws {Error} when the data is too long or cannot be decoded.
 */
async function convertFromLinkData(kind, data) {
    if (data.length > MAX_ENCODED) throw new Error('The link is too long.');
    if (kind === 'xml') return data;
    const bytes = getBase64Bytes(data);
    return kind === 'z' ? expandText(bytes) : new TextDecoder().decode(bytes);
}

/**
 * Reads one part of a long document into the parts collected in storage and returns the
 * joined text once every part is there (a reader that consumes its input).
 * Parts belong together only within half an hour and up to the size limit.
 * @param {LinkData} link - the part.
 * @returns {{data?: string, missing?: number[], error?: boolean}} the joined data, the parts
 *   still missing, or error when the parts are too many or too long.
 */
function readPart(link) {
    const key = PARTS_KEY + link.kind + '.' + link.id;
    let parts = {};
    try { parts = JSON.parse(localStorage.getItem(key) || '{}'); } catch (error) { /* storage blocked */ }
    if (parts.of !== link.of || !(Date.now() - (parts.t || 0) < PARTS_LIFETIME)) parts = { of: link.of, p: {}, t: Date.now() };
    parts.p[link.part] = link.data;
    if (link.of > MAX_PARTS || Object.values(parts.p).reduce((length, value) => length + value.length, 0) > MAX_ENCODED) {
        try { localStorage.removeItem(key); } catch (error) { /* storage blocked */ }
        return { error: true };
    }
    const missing = [];
    for (let number = 1; number <= link.of; number++) if (!(number in parts.p)) missing.push(number);
    try {
        if (missing.length) localStorage.setItem(key, JSON.stringify(parts));
        else localStorage.removeItem(key);
    } catch (error) { /* storage blocked: parts cannot be collected */ }
    return missing.length ? { missing } : { data: Array.from({ length: link.of }, (unused, index) => parts.p[index + 1]).join('') };
}

/**
 * Reads one link: its document, or which parts are still missing, or that it is damaged.
 * A part is stored until the others arrive (a reader that consumes its input).
 * @param {string} hash - the link from the #.
 * @returns {Promise<?LinkResult>} what the link gave, or null when it carries no document.
 */
export async function readLink(hash) {
    const link = readLinkHash(hash);
    if (!link) return null;
    let data = link.data;
    if (link.of > 1) {
        const collected = readPart(link);
        if (collected.error) return { error: true };
        if (collected.missing) return { missing: collected.missing, part: link.part, of: link.of };
        data = collected.data;
    }
    try {
        const code = await convertFromLinkData(link.kind, data);
        if (!code.trim() || /\uFFFD/.test(code)) throw new Error('no text');
        return { code, mode: link.mode, target: link.target };
    } catch (error) { return { error: true }; }
}
