/**
 * The keyboard shortcuts of the whole page: Ctrl+S saves, Ctrl+E exports, Ctrl+O opens
 * "My documents", Ctrl+F searches the tree, Ctrl+Z / Ctrl+Y undo and redo outside the code,
 * "?" opens the help. Shortcuts pause only while typing into a field or in a dialog.
 */

import { elements, services, findElement, isNarrow } from './state.js?v=2';
import { undo, redo } from './history.js?v=5';
import { openExport, saveQuickly } from './export-dialog.js?v=5';
import { showPane } from './layout.js?v=5';
import { isNewMenuOpen, applyNewMenuSwitch } from './toolbar.js?v=5';
import { TYPING_FIELDS } from './file-input.js?v=5';
import { openDialog } from './dialogs.js?v=5';

/** The keys of the shortcuts with Ctrl or Cmd, as KeyboardEvent.key gives them. */
const SAVE_KEY = 's', EXPORT_KEY = 'e', OPEN_KEY = 'o', SEARCH_KEY = 'f', REDO_KEY = 'y';
/** The keys of undo in both cases (Shift turns it into redo). */
const UNDO_KEYS = ['z', 'Z'];
/** The key that opens the help. */
const HELP_KEY = '?';

/**
 * Listens for the shortcuts.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handleShortcut);
}

/**
 * Runs the shortcut of a key.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleShortcut(event) {
    const focused = document.activeElement;
    const isTyping = focused && focused.matches(TYPING_FIELDS);
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === SAVE_KEY) { event.preventDefault(); saveQuickly(); return; }
    if (modifier && event.key === EXPORT_KEY) { event.preventDefault(); openExport(); return; }
    if (modifier && event.key === OPEN_KEY) { event.preventDefault(); services.files.open(); return; }
    if (modifier && event.key === SEARCH_KEY && focused !== elements.codeArea && !findElement('dialog[open]')) { event.preventDefault(); selectSearchField(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { applyNewMenuSwitch(false); return; }
    if (isTyping || findElement('dialog[open]')) return;
    if (modifier && UNDO_KEYS.includes(event.key)) {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
    }
    if (modifier && event.key === REDO_KEY) { event.preventDefault(); redo(); return; }
    if (modifier) return;
    if (event.key === HELP_KEY) openDialog(findElement('#help'));
}

/**
 * Puts the cursor into the search field of the tree (showing the tree on a narrow screen).
 * @returns {void}
 */
function selectSearchField() {
    if (isNarrow()) showPane('draw');
    elements.search.focus();
    elements.search.select();
}
