/**
 * Small helpers shared by the modules: file names, downloads and copying to the clipboard.
 */

const DEFAULT_FILE_NAME = 'document';
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|]+/g;
const TEXT_TYPE = /^text|xml|json|x-tex/;
const URL_LIFETIME = 4000;              // milliseconds the download address stays valid

/**
 * Returns a name that can be used as a file name.
 * @param {*} name - the document's name.
 * @returns {string} the name with "-" for characters that file systems refuse, "document" when empty.
 */
export function getSafeName(name) {
    return (String(name || '').trim() || DEFAULT_FILE_NAME).replace(UNSAFE_FILE_CHARACTERS, '-');
}

/**
 * Saves text or a Blob as a file through the browser's download.
 * @param {string|Blob} data - the content.
 * @param {string} name - the file name.
 * @param {string} [type] - the media type of text (UTF-8 is added for text types).
 * @returns {void}
 */
export function saveDownload(data, name, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type + (TEXT_TYPE.test(type) ? ';charset=utf-8' : '') });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), URL_LIFETIME);
}

/**
 * Copies a text to the clipboard; where the clipboard API is not allowed, the field that
 * shows the text is selected and copied with the browser's copy command.
 * @param {string} text - the text.
 * @param {?HTMLInputElement|HTMLTextAreaElement} fallbackField - the field that holds the text.
 * @returns {Promise<void>} resolves when the text was copied (or the copy was tried).
 */
export async function copyToClipboard(text, fallbackField) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        fallbackField.select();
        document.execCommand('copy');
    }
}
