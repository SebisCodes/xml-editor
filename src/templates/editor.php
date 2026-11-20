<?php
/**
 * The editor page: markup and keys of the shared language packs (src/php/page.php).
 */
?>
<!DOCTYPE html>
<html <?= build_html_attributes() ?>>
<head>
<meta charset="utf-8">
<!-- The same policy as the server header (.htaccess), in case the header is ever missing; frame-ancestors only works as a header. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= get_text('title') ?></title>
<meta name="description" content="<?= get_text('description') ?>">
<meta name="author" content="Sebastian Grünwald, Grünwald Innovation">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#b8551a">
<link rel="canonical" href="<?= escape_html(get_page_url()) ?>">
<?= build_hreflang_links() ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="<?= get_page_locale() ?>">
<meta property="og:site_name" content="XML Editor">
<meta property="og:title" content="<?= get_text('og_title') ?>">
<meta property="og:description" content="<?= get_text('og_description') ?>">
<meta property="og:url" content="<?= escape_html(get_page_url()) ?>">
<meta property="og:image" content="https://xml.giit.ch/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/logo.svg">
<link rel="stylesheet" href="/css/style.css?v=25">
<script src="/js/lang-menu.js?v=1" defer></script>
<script src="/js/theme.js?v=9" data-editor-page></script>
<script type="application/ld+json"><?= get_json_ld('jsonld') ?></script>
</head>
<body>

<header class="header">
    <div class="header-brand">
        <a class="back-to-editors" href="<?= escape_html(get_site_url('https://editors.giit.ch/')) ?>" title="All giit editors" aria-label="All giit editors"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></a>
        <a class="brand" href="<?= escape_html(get_language_path(get_template_language(), '')) ?>" aria-label="XML Editor - home">
            <img src="/img/logo.svg" alt="" width="28" height="28">
            <h1>XML Editor <span>online</span></h1>
        </a>
        <a class="by-giit" href="https://giit.ch/"><img src="/img/giit.svg" alt="" width="16" height="18">by giit.ch</a>
    </div>
    <div class="toolbar file" role="toolbar" aria-label="File">
        <button type="button" class="button with-symbol file-button" id="btn-files" title="My documents (Ctrl+O)" aria-label="My documents"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="file-name" class="file-title" data-no-i18n></span><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <span class="menu-anchor">
            <button type="button" class="button with-symbol" id="btn-new" title="New document, or start this one over" aria-haspopup="menu" aria-expanded="false" aria-controls="new-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="txt">New</span></button>
            <span id="new-menu" class="menu" role="menu" aria-label="New" hidden>
                <button type="button" role="menuitem" data-new="blank"><b>New blank document</b><span>An XML declaration and an empty root element</span></button>
                <button type="button" role="menuitem" data-new="catalog"><b>Product catalog</b><span>Products with attributes, prices and stock</span></button>
                <button type="button" role="menuitem" data-new="rss"><b>RSS feed</b><span>A channel with one item, RSS 2.0</span></button>
                <button type="button" role="menuitem" data-new="sitemap"><b>Sitemap</b><span>sitemap.xml for search engines, with a default namespace</span></button>
                <button type="button" role="menuitem" data-new="config"><b>Configuration</b><span>Settings and a database connection</span></button>
                <button type="button" role="menuitem" data-new="example"><b>The welcome example</b><span>Shows what the editor can do</span></button>
                <button type="button" role="menuitem" data-new="restart" id="new-restart"><b>Start this document over</b><span>Keeps the declaration and the root element, empties the rest - "Undo" brings it back</span></button>
            </span>
        </span>
        <button type="button" class="button" id="btn-open" title="Open an XML file from your computer (you can also drag it into the window)">Open file…</button>
        <input type="file" id="file" accept=".xml,.xsd,.xsl,.xslt,.rss,.atom,.svg,.xhtml,.kml,.gpx,.plist,.config,.csproj,.resx,.wsdl,.xlf,.xliff,.txt,text/xml,application/xml,text/plain" multiple hidden>
        <span class="divider" aria-hidden="true"></span>
        <button type="button" class="button with-symbol" id="btn-undo" title="Undo the last change (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span class="txt">Undo</span></button>
        <button type="button" class="button with-symbol" id="btn-redo" title="Redo the change you just undid (Ctrl+Y)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg><span class="txt">Redo</span></button>
    </div>
    <div class="toolbar output" role="toolbar" aria-label="Output">
        <span class="languages" data-languages><?= build_language_menu(get_text('language')) ?></span>
        <div class="schema" role="radiogroup" aria-label="Color theme">
            <button type="button" role="radio" data-theme-set="light" aria-checked="false" title="Light theme" aria-label="Light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button type="button" role="radio" data-theme-set="dark" aria-checked="false" title="Dark theme" aria-label="Dark theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
            <button type="button" role="radio" data-theme-set="auto" aria-checked="true" title="Same as your system setting" aria-label="Automatic theme (system setting)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        </div>
        <button type="button" class="button with-symbol ai-button" id="btn-ai" title="Let any AI write in this editor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5l5.2-1.6z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span class="txt">AI Assistant</span></button>
        <button type="button" class="button symbol" id="btn-sync" title="Save to your own server and embed the editor in your website" aria-label="Save to server"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8m-3-3 3 3 3-3"/></svg></button>
        <button type="button" class="button" id="btn-help" title="How it works and keyboard shortcuts (?)">Help</button>
        <button type="button" class="button" id="btn-download" title="Save the document as an .xml file (Ctrl+S)">Download .xml</button>
        <button type="button" class="button primary save" id="btn-save" hidden>Save</button>
        <button type="button" class="button primary" id="btn-export" title="XML, minified XML, JSON, YAML and plain text (Ctrl+E)">Export…</button>
    </div>
</header>

<nav class="views" role="tablist" aria-label="View">
    <button type="button" role="tab" data-pane="code" aria-selected="false">Code</button>
    <button type="button" role="tab" data-pane="draw" aria-selected="true">Tree</button>
    <button type="button" role="tab" data-pane="properties" aria-selected="false">Edit</button>
</nav>

<main id="work" class="workspace" data-show="draw">
    <section class="pane code-pane" aria-label="XML code">
        <div class="pane-header">
            <b>Code</b>
            <span id="code-status" class="muted"></span>
            <span class="right">
                <button type="button" class="button small" id="btn-wrap" aria-pressed="false" title="Wrap long lines in the view - each line of the code stays one line (Alt+Z)">Wrap</button>
                <button type="button" class="button small with-symbol" id="btn-copy" title="Copy the XML code to the clipboard" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span class="txt">Copy</span></button>
                <button type="button" class="button small" id="btn-format" title="Indent every element on its own line (mixed content stays as it is)">Format</button>
            </span>
        </div>
        <div id="code-error" class="error problems" hidden role="status"></div>
        <div class="editor">
            <div class="gutter" aria-hidden="true"><div id="gutter"></div></div>
            <div class="code-field" id="code-layers">
                <pre class="layer marks" id="marks" aria-hidden="true"></pre>
                <pre class="layer hl" id="hl" aria-hidden="true"></pre>
                <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="XML code"></textarea>
            </div>
        </div>
    </section>

    <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Drag to change the width of the code area" title="Drag to change the width" tabindex="0"></div>

    <section class="pane draw-pane" aria-label="Element tree">
        <div class="pane-header tools tree-tools" role="toolbar" aria-label="Tree">
            <label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg><input id="tree-search" type="search" placeholder="Search names, values and text" aria-label="Search in the tree" spellcheck="false" autocomplete="off"></label>
            <label class="search-field xpath-field"><span class="xp-mark" aria-hidden="true">/</span><input id="xpath" type="search" placeholder="XPath query, e.g. //book[price &gt; 30]" aria-label="XPath query" spellcheck="false" autocomplete="off"></label>
            <span class="group hit-group">
                <span id="hit-info" class="muted hit-info" aria-live="polite"></span>
                <button type="button" class="tool" id="hit-prev" title="Previous match (Shift+Enter)" aria-label="Previous match"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg></button>
                <button type="button" class="tool" id="hit-next" title="Next match (Enter)" aria-label="Next match"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
                <span class="divider" aria-hidden="true"></span>
                <button type="button" class="tool" id="fold-all" title="Fold everything below the root" aria-label="Fold all"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 15 5-5 5 5"/><path d="M5 20h14"/></svg></button>
                <button type="button" class="tool" id="unfold-all" title="Unfold every element" aria-label="Unfold all"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/><path d="M5 4h14"/></svg></button>
            </span>
        </div>
        <div id="path" class="path tree-path" aria-label="Path of the selected node"></div>
        <div id="stage" class="stage preview tree-stage" aria-label="Element tree: click a node to go to its place in the code, click a value to edit it">
            <div id="scroller" class="scroller"><ul id="tree" class="xtree" role="tree" aria-label="Element tree"></ul></div>
            <div class="stale-hint" aria-hidden="true">Updating…</div>
        </div>
    </section>

    <aside class="pane inspector" aria-label="Side panel">
        <div class="pane-header tabs" role="tablist">
            <button type="button" role="tab" data-itab="node" aria-selected="true" title="The selected node: path, namespace, attributes and actions">Node</button>
            <button type="button" role="tab" data-itab="insert" aria-selected="false" title="Ready-made pieces: elements, comments, CDATA, characters">Insert</button>
            <button type="button" role="tab" data-itab="convert" aria-selected="false" title="Format, minify, JSON and YAML">Convert</button>
        </div>
        <div id="node-wrap" class="inspector-body"></div>
        <div id="insert-wrap" class="inspector-body" hidden></div>
        <div id="convert-wrap" class="inspector-body" hidden></div>
    </aside>
</main>

<div id="ai-receive" class="receive" role="status" hidden>
    <div class="receive-box"><img src="/img/logo.svg" alt="" width="40" height="40"><h2></h2><p></p>
        <div class="receive-buttons"><button type="button" class="button primary" data-here>Open it here</button></div>
    </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div class="storage-hint" aria-hidden="true"><span>Drop the XML file here</span></div>

<dialog id="export" class="dialog" aria-labelledby="ex-title">
    <form method="dialog" class="dialog-header"><h2 id="ex-title">Export</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="ex-row">
            <label class="field"><span>File name</span><input id="ex-name" spellcheck="false"></label>
            <label class="field"><span>File format</span>
                <select id="ex-format">
                    <option value="xml">XML as it is (.xml)</option>
                    <option value="min">Minified XML (.xml)</option>
                    <option value="json">Converted to JSON (.json)</option>
                    <option value="yaml">Converted to YAML (.yaml)</option>
                    <option value="txt">Plain text (.txt)</option>
                </select>
            </label>
        </div>
        <textarea id="ex-text" class="ex-text" readonly spellcheck="false" aria-label="Result" data-no-i18n></textarea>
        <div class="dialog-footer">
            <span id="ex-info" class="muted"></span>
            <button type="button" class="button" id="ex-zip" title="Download everything at once: XML, minified XML, JSON, YAML and text">All formats (ZIP)</button>
            <button type="button" class="button" id="ex-copy">Copy</button>
            <button type="button" class="button primary" id="ex-download">Download</button>
        </div>
    </div>
</dialog>

<dialog id="files" class="dialog files" aria-labelledby="files-title">
    <form method="dialog" class="dialog-header"><h2 id="files-title">My documents</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="files-toolbar">
            <input id="files-search" type="search" placeholder="Search by name" aria-label="Search your documents" spellcheck="false">
            <button type="button" class="button" id="files-import" title="Open an XML file from your computer as a new document">Open file…</button>
            <button type="button" class="button primary" id="files-new">New document</button>
        </div>
        <ul id="files-grid" class="file-grid"></ul>
        <p class="muted">Click a document to open it. They are stored only in this browser - nothing is uploaded. Clearing the browser's site data removes them, so download the ones you want to keep.</p>
        <div class="dialog-footer"><span id="files-info" class="muted"></span><button type="button" class="button" id="files-zip" title="Download every document as an .xml file in one ZIP">Download all (ZIP)</button></div>
    </div>
</dialog>

<dialog id="ask" class="dialog question" aria-labelledby="ask-title">
    <div class="dialog-header"><h2 id="ask-title"></h2></div>
    <div class="dialog-content"><p id="ask-text"></p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="ask-cancel">Cancel</button><button type="button" class="button primary" id="ask-ok">OK</button></div>
    </div>
</dialog>

<dialog id="ai" class="dialog ai-dialog" aria-labelledby="ai-title">
    <form method="dialog" class="dialog-header"><h2 id="ai-title">AI Assistant</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>Any AI can write with you - ChatGPT, Claude, Gemini, Copilot.</p>
        <ul id="ai-status" class="ai-status" aria-label="Connected AI"></ul>
        <ol class="steps">
            <li>Click <b>Copy prompt</b>.</li>
            <li>Paste it into your AI and say what it should write.</li>
            <li id="ai-step-link">The AI answers with a link: click it, or paste the whole answer below. <b>Undo</b> takes it back.</li>
        </ol>
        <div id="ai-remote" class="ai-remote" hidden>
            <p><b>Connected to <span id="ai-remote-host" data-no-i18n></span>:</b> the AI sends its result there, and it opens here. <span id="ai-key-exp" class="muted"></span></p>
            <details id="ai-remote-details" hidden><summary>What <span data-no-i18n></span> tells the AI</summary><pre id="ai-remote-prompt" class="ai-remote-prompt" data-no-i18n></pre></details>
        </div>
        <fieldset class="ai-target">
            <legend>The AI should</legend>
            <label><input type="radio" name="ai-target" value="change" checked><span><b>Change “<span id="ai-cur" data-no-i18n></span>”</b></span></label>
            <label><input type="radio" name="ai-target" value="new"><span><b>Make a new document</b></span></label>
        </fieldset>
        <label class="field ai-insert"><span id="ai-paste-label">The AI's answer (or press Ctrl+V anywhere):</span><textarea id="ai-paste" rows="2" spellcheck="false" placeholder="https://xml.giit.ch/#…"></textarea></label>
        <p class="muted" id="ai-privacy">The document travels in the link after the “#”, which no server sees. What you paste into your AI is handled by its provider.</p>
        <textarea id="ai-prompt-text" class="ai-prompt-text" rows="6" readonly hidden aria-label="The prompt - copy it with Ctrl+C"></textarea>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button primary" id="ai-copy">Copy prompt</button></div>
    </div>
</dialog>

<dialog id="sync" class="dialog" aria-labelledby="sync-title">
    <form method="dialog" class="dialog-header"><h2 id="sync-title">Save to your server</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>The editor can send each saved version to your own server (a <b>webhook</b>), so your work is kept where you want it. Nothing is sent until you enter an address here.</p>
        <div class="sync-fields">
            <label class="field"><span>Webhook address</span><input id="sync-url" type="url" placeholder="https://example.com/api/xml" spellcheck="false" autocomplete="off"></label>
            <label class="field"><span>Token <small>(optional, sent as "Authorization: Bearer …"; kept until this tab is closed)</small></span><input id="sync-token" type="password" spellcheck="false" autocomplete="off"></label>
        </div>
        <label class="box sync-choice"><input type="checkbox" id="sync-auto"> Send automatically a few seconds after each change (otherwise only when you click <b>Save</b> or press Ctrl+S)</label>
        <label class="box sync-choice"><input type="checkbox" id="sync-doc"> Only for “<span id="sync-docname" data-no-i18n></span>” (other documents use the general address)</label>
        <details class="sync-help">
            <summary>What your server receives</summary>
            <p class="muted">A POST request with JSON (your server must allow CORS from https://xml.giit.ch):</p>
            <pre class="code-example">{ "editor": "xml", "event": "save", "id": "…", "name": "Catalog",
  "content": "&lt;?xml version=\"1.0\"?&gt; …",
  "updated": "2026-01-15T09:30:00.000Z" }</pre>
        </details>
        <details class="sync-help">
            <summary>Embed the editor in your website</summary>
            <pre class="code-example">&lt;iframe src="https://xml.giit.ch/?embed=1" style="width:100%;height:80vh;border:0"&gt;&lt;/iframe&gt;
&lt;script&gt;
const frame = document.querySelector('iframe');
addEventListener('message', e =&gt; {
  if (e.origin !== 'https://xml.giit.ch' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'xmleditor:ready')
    frame.contentWindow.postMessage({ type: 'xmleditor:load', name: 'Catalog',
      content: '&lt;catalog&gt;…&lt;/catalog&gt;' }, 'https://xml.giit.ch');
  if (e.data.type === 'xmleditor:save') saveOnYourServer(e.data.content);
});
&lt;/script&gt;</pre>
            <p class="muted">Also possible: <code>?src=&lt;URL of an XML file&gt;</code> opens a file, <code>&amp;webhook=&lt;URL&gt;</code> saves this document there. The editor can also open in a window of its own (<code>?embed=window</code>), and your page can hand it its own AI prompt and a session key so the AI sends its result to your server (<code>xmleditor:ai</code>, <code>xmleditor:key-request</code>) - see "Use the editor on your own website" below the editor. Details are in <a href="/llms.txt">llms.txt</a>.</p>
        </details>
        <div class="dialog-footer"><span id="sync-status" class="muted"></span><button type="button" class="button" id="sync-test">Send now</button><button type="button" class="button primary" id="sync-ok">Save setting</button></div>
    </div>
</dialog>

<dialog id="help" class="dialog" aria-labelledby="help-title">
    <form method="dialog" class="dialog-header"><h2 id="help-title">Help</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content shortcuts">
        <h3>How it works</h3>
        <ol class="steps">
            <li><b>Write</b> XML on the left - or start with <b>New</b> and one of the templates. The tree in the middle shows the elements, attributes, text, comments and CDATA as you type.</li>
            <li><b>Click a node in the tree</b> to go to its place in the code; the cursor in the code shows its node in the tree. Fold elements with the arrow.</li>
            <li><b>Click a name, an attribute value or a text in the tree</b> to edit it right there. <b>Enter</b> or a click elsewhere writes the change into the code (special characters escaped, one step for Undo), <b>Escape</b> cancels. The buttons of a row add a child element or an attribute, move the element up or down, or remove it.</li>
            <li><b>Search</b> marks nodes whose name, value or text contains the words; the <b>XPath</b> field marks the nodes an XPath 1.0 expression selects (<code>_:</code> is the default namespace of the root).</li>
            <li>Problems (the first well-formedness error, undeclared namespace prefixes, ids used twice) are listed above the code with line and column - click one to go there.</li>
            <li><b>Node</b> on the right shows the selected node; <b>Insert</b> has ready-made pieces; <b>Convert</b> formats, minifies and turns the document into JSON or YAML.</li>
            <li><b>My documents</b> (the folder button at the top left) lists every document kept in this browser. <b>Export</b> saves XML, minified XML, JSON, YAML or plain text.</li>
            <li><b>Export</b> also has <b>Open in another editor</b>: it converts the document and opens it as a new document there. Anything the other format cannot hold is listed first.</li>
        </ol>
        <p class="muted">The editor never loads a DTD, a schema or an external entity, and it does not expand entities declared in a DTD: their references stay as written.</p>
        <h3>Keyboard shortcuts</h3>
        <dl>
            <dt><kbd>&gt;</kbd> after a start tag</dt><dd>Adds the matching end tag</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>/</kbd></dt><dd>Comment lines in or out (<code>&lt;!-- --&gt;</code>)</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Show the cursor's node in the tree</dd>
            <dt><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></dt><dd>Indent / outdent</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>E</kbd></dt><dd>Save (download .xml, or to your server) / export</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>My documents</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>F</kbd></dt><dd>Search in the tree (outside the code)</dd>
        </dl>
    </div>
</dialog>

<div class="page-text">
<?= get_html('page_text') ?>
</div>

<?php include __DIR__ . '/footer.php'; ?>

<script type="module" src="/js/app.js?v=41"></script>
</body>
</html>
