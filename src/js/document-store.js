/**
 * The documents of this browser (localStorage), no server. xmleditor.files holds the list
 * [{ id, name, created, updated, size }], xmleditor.file.<id> the code of each document.
 *
 * Documents from a page around the editor are kept in memory only (temp): they are in the
 * list like the others but never written to the browser's storage, and are gone when the
 * editor closes. An entry of such a document found in storage is removed with its content
 * when this module loads, before anything reads the list.
 */

/** The key of the list; files.js listens for its changes in other tabs. */
export const LIST_KEY = 'xmleditor.files';
const FILE_KEY = 'xmleditor.file.';
const DEFAULT_NAME = 'Document';
const NAME_LIMIT = 80;
const ID_RADIX = 36;                    // ids are the time and a random part in base 36
const ID_RANDOM_LENGTH = 4;

/**
 * The entry of a document in the list.
 * @typedef {Object} DocumentEntry
 * @property {string} id - its id.
 * @property {string} name - its name, unique among the documents (ignoring case).
 * @property {number} created - when it was made (milliseconds since 1970).
 * @property {number} updated - when its code last changed.
 * @property {number} [size] - the size of its code in bytes.
 * @property {boolean} [temp] - a page's document, kept in memory only.
 * @property {string} [page] - the origin of the page it came from.
 * @property {{url: string, token: string}} [hook] - its own webhook (sync.js).
 */

/**
 * What store.write() changes of a document.
 * @typedef {Object} DocumentFields
 * @property {string} [name] - the new name.
 * @property {string} [code] - the new code.
 */

/** In-memory documents of a page: id -> { meta, code }. */
const temporary = new Map();

/**
 * The documents of this browser. The tests call list, create, remove and code by
 * these names.
 */
export const store = {
    /**
     * Returns the documents stored in this browser.
     * @returns {DocumentEntry[]} the stored entries, without in-memory ones.
     */
    getSaved() {
        try {
            const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
            return Array.isArray(entries) ? entries.filter(entry => entry && entry.id && !entry.temp) : [];
        } catch (error) { return []; }
    },
    /**
     * Returns every document: the stored ones and the page's in memory.
     * @returns {DocumentEntry[]} the entries.
     */
    list() { return [...this.getSaved(), ...[...temporary.values()].map(held => held.meta)]; },
    /**
     * Returns every document, most recently changed first.
     * @returns {DocumentEntry[]} the entries.
     */
    getSorted() { return this.list().sort((first, second) => second.updated - first.updated); },
    /**
     * Returns the entry of a document.
     * @param {string} id - the document's id.
     * @returns {?DocumentEntry} the entry, or null.
     */
    getMeta(id) { return this.list().find(entry => entry.id === id) || null; },
    /**
     * Tells whether a document is kept in memory only.
     * @param {string} id - the document's id.
     * @returns {boolean} true for a page's document.
     */
    isTemp(id) { return temporary.has(id); },
    /**
     * Returns the code of a document.
     * @param {string} id - the document's id.
     * @returns {?string} the code, or null when there is none or storage is blocked.
     */
    code(id) {
        if (temporary.has(id)) return temporary.get(id).code;
        try { return localStorage.getItem(FILE_KEY + id); } catch (error) { return null; }
    },
    /**
     * Writes the code and/or name of a document; adds it to the list if it is missing
     * (for example deleted in another tab meanwhile).
     * @param {string} id - the document's id.
     * @param {DocumentFields} fields - what changes.
     * @returns {void}
     * @throws {DOMException} when the storage is full.
     */
    write(id, { name, code }) {
        const inMemory = temporary.get(id);
        if (inMemory) {
            if (code != null) { inMemory.code = code; inMemory.meta.updated = Date.now(); inMemory.meta.size = new Blob([code]).size; }
            if (name) inMemory.meta.name = name;
            return;
        }
        const entries = this.getSaved();
        let entry = entries.find(candidate => candidate.id === id);
        if (!entry) { entry = { id, name: name || DEFAULT_NAME, created: Date.now(), updated: Date.now() }; entries.push(entry); }
        if (code != null) { localStorage.setItem(FILE_KEY + id, code); entry.updated = Date.now(); entry.size = new Blob([code]).size; }
        if (name) entry.name = name;
        localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },
    /**
     * Sets other fields of a document's entry (its webhook, the page it came from); null removes a field.
     * @param {string} id - the document's id.
     * @param {Object} fields - field -> value.
     * @returns {void}
     * @throws {DOMException} when the storage is full.
     */
    setFields(id, fields) {
        const inMemory = temporary.get(id);
        const entries = inMemory ? null : this.getSaved();
        const entry = inMemory ? inMemory.meta : entries.find(candidate => candidate.id === id);
        if (!entry) return;
        for (const [key, value] of Object.entries(fields)) { if (value == null) delete entry[key]; else entry[key] = value; }
        if (entries) localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },
    /**
     * Creates a document with a free name.
     * @param {string} name - the name wanted.
     * @param {string} code - its code.
     * @param {boolean} [inMemory] - keep it in memory only (a page's document).
     * @returns {string} the new document's id.
     * @throws {DOMException} when the storage is full.
     */
    create(name, code, inMemory = false) {
        const id = Date.now().toString(ID_RADIX) + Math.random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LENGTH);
        if (inMemory) {
            const now = Date.now();
            temporary.set(id, { meta: { id, name: this.getUniqueName(name), created: now, updated: now, size: new Blob([code || '']).size, temp: true }, code: code || '' });
        } else this.write(id, { name: this.getUniqueName(name), code });
        return id;
    },
    /**
     * Removes a document and its code.
     * @param {string} id - the document's id.
     * @returns {void}
     */
    remove(id) {
        if (temporary.delete(id)) return;
        try {
            localStorage.removeItem(FILE_KEY + id);
            localStorage.setItem(LIST_KEY, JSON.stringify(this.getSaved().filter(entry => entry.id !== id)));
        } catch (error) { /* storage blocked */ }
    },
    /**
     * Returns the document with a name (ignoring case and spaces around it).
     * @param {string} name - the name.
     * @returns {?DocumentEntry} the entry, or null.
     */
    findByName(name) {
        const wanted = String(name || '').trim().toLowerCase();
        return wanted ? this.list().find(entry => entry.name.trim().toLowerCase() === wanted) || null : null;
    },
    /**
     * Returns a free name: "House", or "House 2", "House 3" … when the name is taken.
     * @param {string} name - the name wanted.
     * @param {string} [exceptId] - a document whose own name does not count (when renaming it).
     * @returns {string} the free name.
     */
    getUniqueName(name, exceptId) {
        const base = String(name || DEFAULT_NAME).trim().slice(0, NAME_LIMIT) || DEFAULT_NAME;
        const taken = new Set(this.list().filter(entry => entry.id !== exceptId).map(entry => entry.name.trim().toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        const stem = base.replace(/\s+\d+$/, '');
        for (let number = 2; ; number++) if (!taken.has(`${stem} ${number}`.toLowerCase())) return `${stem} ${number}`;
    },
};

/**
 * Removes the entries of a page's in-memory documents found in storage, with their content:
 * such a document never belongs there.
 * @returns {void}
 */
function removeStoredTemporary() {
    try {
        const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
        if (!Array.isArray(entries) || !entries.some(entry => entry && entry.temp)) return;
        for (const entry of entries) {
            if (entry && entry.temp && entry.id) localStorage.removeItem(FILE_KEY + entry.id);
        }
        localStorage.setItem(LIST_KEY, JSON.stringify(entries.filter(entry => entry && !entry.temp)));
    } catch (error) { /* storage blocked */ }
}

removeStoredTemporary();
