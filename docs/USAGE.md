# Using the XML Editor

The XML Editor shows your XML next to a live element tree. A click in the tree jumps to the
code, and you can edit names, values and text right in the tree, run XPath queries, see
well-formedness errors with line and column, format, minify and convert to JSON or YAML.

Open it at https://xml.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your documents stay there unless you send them somewhere yourself.

## What it can do

- An element tree with attributes, text, comments, CDATA, processing instructions and
  namespaces; elements fold, and the XPath of the selected node is shown above the tree.
- Editing in the tree: element text, attribute values, comments and CDATA, renaming elements
  (start and end tag) and attributes, adding child elements and attributes, moving elements
  up and down, removing nodes; special characters are escaped.
- Search in names, attributes and text, and an XPath 1.0 field that marks the matching nodes
  (`_:` is the default namespace of the root element).
- Problems: the first well-formedness error with line and column, undeclared namespace
  prefixes, ids used twice, a note when a DTD is present.
- **Format** (indent with 2 or 4 spaces or tabs; mixed content and `xml:space="preserve"`
  stay as they are) and **minify**.
- Convert to JSON and YAML: attributes as `"@name"`, text next to elements as `"#text"`,
  repeated elements as lists.
- Templates: product catalog, RSS feed, sitemap, configuration.

## Getting started

1. **Start**: choose a template under **New**, open an `.xml` file or paste XML.
2. **Edit**: type in the code, or edit names, values and text in the tree.
3. **Export**: save XML, minified XML, JSON, YAML or plain text.

## Editing in the tree

Click a node in the tree to go to its place in the code; the cursor in the code shows its
node in the tree. Click a name, an attribute value or a text to edit it right there.
**Enter** or a click elsewhere writes the change into the code (special characters escaped,
one step for Undo), **Escape** cancels. The buttons of a row add a child element or an
attribute, move the element up or down, or remove it.

The right side panel has **Node** (the selected node), **Insert** (ready-made pieces) and
**Convert** (format, minify, JSON, YAML).

## Safe parsing

The editor uses the browser's own XML parser on a copy without the DTD. It never loads a
DTD, a schema, an external entity, a stylesheet or an included file, and it never expands
entities declared in a DTD: their references stay as written. There is no validation against
a DTD or an XML Schema.

## Your documents

Your documents are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My documents** (the folder button at the top left) lists
every document of this browser: open, rename, duplicate, download (`.xml`) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open `.xml` files (and related ones such as `.xsd`, `.xsl`, `.rss`,
`.svg`, `.kml` or `.gpx`) with the button, by drop or by paste.

## Export

**Export** saves `.xml`, minified `.xml`, `.json`, `.yaml`, plain text, or all of them as
one ZIP.

**Export > Open in another editor** converts the document in the browser to JSON, YAML,
TOML, SHLS or CSV and opens the result as a new document in that editor. Anything the other
format cannot hold is listed first.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://xml.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://xml.giit.ch/#xml=<URL-encoded text>`
- `https://xml.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` appends elements to the root element of the open document.
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `query` (XPath 1.0),
`set_text` and `set_attribute` (on the elements an XPath selects), `set_document`,
`replace_text`, `show_line`, `undo`, and `list_files`, `open_file`, `new_file` for your
other documents. Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://xml.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| `>` after a start tag | Adds the matching end tag |
| Ctrl + / | Comment lines in or out (`<!-- -->`) |
| Ctrl + Enter | Show the cursor's node in the tree |
| Tab / Shift + Tab | Indent / outdent |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download `.xml`, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |
| Ctrl + F | Search in the tree (outside the code) |

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
