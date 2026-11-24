# Embedding the XML Editor

The XML Editor can be part of your own website: in an `<iframe>`, in a window of its own or
as a read-only viewer. Your page hands it a document, hears about every change and every
save, and can let an AI deliver its results to your own server. There is no sign-up and no
key from us; any https page (and `localhost`) can embed the editor.

This page describes the whole interface. The developer page of the running site,
`https://xml.giit.ch/embed/` (also `/de/embed/`, `/fr/embed/` …), explains the same with
examples, and `https://xml.giit.ch/llms.txt` is a compact version for AI assistants.

In the examples, `xmleditor` is the message prefix of this editor and `"xml"` its `editor`
value. The other giit editors speak the same protocol with their own prefix.

## Quick start

```html
<iframe id="ed" src="https://xml.giit.ch/?embed=1" allow="clipboard-write"
        style="width:100%;height:800px;border:0"></iframe>
<script>
const ed = document.getElementById('ed');
const ORIGIN = 'https://xml.giit.ch';

addEventListener('message', async event => {
  if (event.source !== ed.contentWindow || event.origin !== ORIGIN) return;
  const m = event.data;
  if (m.type === 'xmleditor:ready') {                 // the editor can take a document
    ed.contentWindow.postMessage({
      type: 'xmleditor:load',
      name: 'Flyer',
      content: await (await fetch('/docs/flyer.xml')).text(),
    }, ORIGIN);
  }
  if (m.type === 'xmleditor:change') document.title = 'Not saved';    // a real edit
  if (m.type === 'xmleditor:save') {                  // the user clicked Save or pressed Ctrl+S
    await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: m.name, content: m.content }) });
    document.title = 'Saved';
  }
});

// A Save button on your own page: the answer comes as xmleditor:save
function saveNow() { ed.contentWindow.postMessage({ type: 'xmleditor:get' }, ORIGIN); }
</script>
```

Always check `event.origin` and `event.source` before you trust a message. Embedded, the
editor hides the page text around it and shows a Save button.

## URL parameters

| Parameter | Meaning |
|---|---|
| `embed=1` | The reduced view for an iframe: no page text, a Save button. |
| `embed=window` | The full editor in a window of its own, opened by your page (see "Own window"). |
| `save=0` | Hides the editor's Save button, for pages with their own. Ctrl+S still sends `xmleditor:save`. |
| `viewer=1` | The read-only viewer (see "Viewer"). Works alone or with `embed`, `theme`, `src` and a document in the hash. |
| `theme=light`, `dark`, `auto` | Fixes the color theme for this page load and hides the theme switch. The visitor's own stored choice stays as it is. Other values are ignored. |
| `template=mustache`, `angle` | For documents whose placeholders your server fills in before the document is used: `{{name}}`, `{{#name}} … {{/name}}` and `{{^name}} … {{/name}}`, or with `angle` `<<name>>` and `<<?name>> … <</?name>>`, in text and in quoted attribute values. The tree shows the document filled with your examples (`xmleditor:template`, see "Template placeholders" below), or with the switch "Template" the tags as text; the code view shows the tags as written, and the check reads each tag as text, with sections around the root element counted as text around it. An id or a namespace prefix that holds a placeholder counts as filled later. The list of problems reports a section left open, a stray end tag, an end tag that closes an outer section while an inner one is open and a tag with a sign outside the syntax. Format keeps every tag byte for byte. It holds for every document of this page load. |
| `tidy=1` | Every document your page hands over (by `load` or `src`) is tidied as part of the load, exactly as the editor's Tidy / Format does it. It does not count as an edit: no `change` message, `get` and `save` return the tidied code, and Undo does not go back before it. Code the editor cannot read is loaded as it is. |
| `src=<URL>` | Opens a file from an https address. Your server must allow CORS for `https://xml.giit.ch`. |
| `name=<name>` | The name of the document opened with `src`. |
| `webhook=<URL>` | Sends the document to that address on Save (see "Webhook"). Only for this document and only while the page is open; it is never stored. At the top level the visitor is asked first; inside your page it works only together with `src`. |
| `auto` | With `webhook`: saves automatically a few seconds after each change. |
| `lang=<code>` | The interface language of an embedded editor, e.g. `?embed=1&lang=de`. The same as the language address `https://xml.giit.ch/de/?embed=1`. |

Every parameter and the hash work the same on every language page (`/de/`, `/fr/` …). The
languages are English at `/` and de, fr, it, es, pt, nl, pl, tr, ru, uk, zh, ja, ko. A page
inside another page is never redirected to another language; it keeps the language of its
address. Nothing in a link is stored except the document itself.

### Documents in the hash

A link can carry the document itself after the `#`, the same links an AI assistant sends:

- `#b64=<base64url of the UTF-8 text>`
- `#xml=<URL-encoded text>`
- `#z=<base64url of the zlib-compressed text>` (shortest)

Further options join with `&`: `file=new&name=<name>` makes a new document next to the
visitor's others, `file=<name>` changes that one, and `part=N&of=M&id=<name>` sends a long
document in several links. `mode=add` adds to the open document. See
[USAGE.md](USAGE.md#ai-assistant) for what each option does in this editor.

## Messages (postMessage)

The editor sends to `window.parent` (in an own window to `window.opener`). After your page's
first message it talks only to your page's origin and takes messages only from it. Pages
without a real origin (`null`) are ignored.

Editor to page:

| Message | Fields | Meaning |
|---|---|---|
| `xmleditor:ready` | `version: 2, editor, window` | The editor can take a document. `window` is true in an own window. |
| `xmleditor:loaded` | `id, name, target?` | After each load. Remember the `id`: later messages are about this document. `target: "new"` marks a new document from the AI, which is not yours. |
| `xmleditor:change` | `id, name, content` | A real edit of your document (not the load itself), also an Undo back to your version. |
| `xmleditor:save` | `editor, event, id, name, content, updated` | The user clicked Save or pressed Ctrl+S, or the answer to `get`. |
| `xmleditor:closing` | `id, name, unsaved, content?` | (own window) The window closes. Always sent; `content` only when there are unsaved changes, `id` is null before the first load. |
| `xmleditor:reload` | `id, unsaved` | F5 or Ctrl+R inside your page. The editor does not reload itself; ask the user and reload the frame if wanted. |
| `xmleditor:key-request` | `reason: "missing"` | The editor has no AI key for this session yet (see "AI through your own server"). |
| `xmleditor:ai-click` | `request, id, name` | The user pressed the AI button; only with `ai: { dialog: "page" }` (see "AI through your own server"). |

Page to editor:

| Message | Fields | Meaning |
|---|---|---|
| `xmleditor:load` | `name, content, context?, hook?, ai?, from?, target?, tidy?` | Opens your document. A document of the same name that came from your page before is replaced; the user's own documents never are. |
| `xmleditor:get` |  | Asks for the current state; always answered with `xmleditor:save`, also when nothing changed (`id` and `content` are null before the first load). |
| `xmleditor:save` |  | Presses Save. |
| `xmleditor:ai` | `label?, prompt?, endpoint?, key?, base?, answer?, dialog?` or `clear: true`, or `decline: true, message?` | AI through your own server; `decline` answers `xmleditor:key-request`. |
| `xmleditor:ai-click` | `request, handled` | The answer to `xmleditor:ai-click`: `handled: true` when your page shows its own AI dialog. |
| `xmleditor:template` | `placeholders, assets?` or `clear: true` | With `?template=`: your placeholders with examples (see "Template placeholders"). |

Optional fields of `xmleditor:load`:

- `context: { host, title, rules }`: plain text about your page (rules up to 2000
  characters). "Copy prompt" in the AI Assistant then tells the AI that the document belongs
  to your page and is saved back there, and includes your rules.
- `hook: { url, token, auto }`: a webhook (https) for this document only, used on Save in
  addition to the message and kept in memory only. Use it to hand over a token, which a link
  must never carry.
- `ai: { … }`: the AI settings, the same fields as `xmleditor:ai`.
- `from: "ai"` and `target: "current" | "new"`: a result of the AI (see below).
- `tidy: true`: tidies this one document as part of the load, like `?tidy=1`.
- `template: { placeholders, assets? }`: with `?template=`, the placeholders of this document with examples
  (see "Template placeholders"); `null` ends them, a load without the field keeps them.

Documents of the XML Editor have no files of their own, so no message carries `assets`,
`assetsChanged` or `assetsRemoved`, and `assets` in a `load` is ignored.

### Your document

Your document is the one your page loaded (or opened with `src`). `change`, `save`,
`closing` and `get` are only ever about it, never about other documents in the user's
browser, also when the user opens them in the editor. The AI settings and the hook from
`load` apply only while your document is open. Your document is kept in memory only: it is
never stored in the user's browser and is gone when the editor closes.

### AI Assistant inside your page

Add `allow="clipboard-write"` to the iframe so "Copy prompt" can use the clipboard (without
it the editor falls back to the old copy command or shows the prompt to copy by hand). A
link from an AI cannot reach an editor inside another website, so in a frame the editor asks
the user to paste the AI's whole answer instead. Open the editor in its own window if links
should work.

## Template placeholders

With `?template=mustache` (or `angle`) your page can send the placeholders of the document with
examples, as the message `xmleditor:template` or as the field `template` of `xmleditor:load`:

```js
frame.contentWindow.postMessage({
  type: 'xmleditor:template',
  placeholders: [
    { name: 'name', kind: 'value', label: 'Name', example: 'John Doe' },
    { name: 'hasNote', kind: 'section', label: 'With a note', shown: true },
    { name: 'items', kind: 'list', label: 'Items',
      fields: [ { name: 'label', label: 'Item' }, { name: 'quantity', label: 'Quantity' } ],
      rows: [ { label: 'Chair', quantity: '2' }, { label: 'Table', quantity: '1' } ] },
  ],
}, 'https://xml.giit.ch');
```

| Field | Meaning | Limit |
|---|---|---|
| `name` | the tag's name: a letter or `_`, then letters, digits, `_`, `.`, `-` | 60 characters |
| `kind` | `value` (the default), `image` (the tree shows the name of its example picture), `section` (also for inverted sections), `list` | - |
| `image` | `image`: the name of an example picture in `assets` | - |
| `label`, `description` | what the "Placeholders" box shows | 80, 300 characters |
| `example` | `value`: the example text | 2000 characters |
| `shown` | `section`: example state, `true` or `false` | - |
| `fields`, `rows` | `list`: the placeholders of one entry, and example entries (field name to text) | 50, 50 |
| `assets` | example pictures: PNG, JPEG, GIF or WebP as base64 data addresses under plain names | 20 pictures, 40 MB |

- The tree shows the example view by default: the document filled with your examples, sections
  by their example state (an inverted section the opposite), a list once per row. A placeholder
  without an example shows its label in brackets (`[Name]`); a section without `shown` is shown
  once (an inverted one hidden); a list without `rows` shows one entry with the field labels. A
  line that holds only section tags is left out with its line break. The switch "Template" in
  the tree's bar shows the tree with the tags as text.
- Each example is written as text for its place: text and attribute values with XML's escapes,
  comments, CDATA sections and processing instructions with their closing mark split.
- A click on a row of the example view selects its node of the code, also for each row of a list.
  A name, value or text of the code is edited in the tree; one that shows an example is edited in
  the code or in the template view. The buttons of a row, the search, XPath and the side panel
  work on the document as written.
- Each message replaces the list before it; `{ type: 'xmleditor:template', clear: true }` (or
  `template: null` in a load) ends it, a load without `template` keeps it. The list belongs to
  your document: other documents of the user show the labels in brackets.
- Every text is shown as text; longer texts are cut. Examples stay in memory only: never stored,
  never part of the document, never sent anywhere.
- The "Placeholders" box at the bottom of the code lists label, tag and example; a click puts the
  tag at the cursor (a section around the selection) as one undo step. Without a list from your
  page it lists the tags found in the document.
- The code, Save, `change`, `get`, the webhook, Download and every export and conversion are always
  the template as written.

## Webhook

A webhook makes Save send the document to your server. The user sets one under "Save to
server" (the cloud button), a link sets one with `?webhook=<URL>`, and your page hands one
over in `load` as `hook: { url, token }`. On Save (Ctrl+S), or automatically after each
change if chosen, the browser sends:

```
POST <webhook URL>
Content-Type: application/json
Authorization: Bearer <token>        (only when a token is set)

{"editor": "xml", "event": "save", "id": "<document id>", "name": "<name>",
 "content": "<the XML>", "updated": "<ISO date>"}
```

- One request carries at most 40 MB (UTF-8 bytes). One request at a time: a save asked for
  meanwhile waits and goes next with the newest content. A server that has not answered
  after 60 seconds counts as failed.
- Your server must answer CORS requests from `https://xml.giit.ch`
  (`Access-Control-Allow-Origin`, and `Access-Control-Allow-Headers: Content-Type,
  Authorization`). The request is sent without cookies and without a referrer.
- An error answer is shown to the user: `{"error": "..."}`, `{"message": "..."}` or a short
  text.
- A link never carries a token (it would end up in server logs and the browser history). For
  a public server, hand the webhook over in `load` with a token and check it:

```php
<?php
header('Access-Control-Allow-Origin: https://xml.giit.ch');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer SECRET') { http_response_code(403); exit; }
$data = json_decode(file_get_contents('php://input'), true);
$name = preg_replace('/[^\w\- ]/u', '_', $data['name']);
file_put_contents(__DIR__ . "/docs/$name.xml", $data['content']);
echo '{"ok":true}';
```

A webhook from a link or from `load` is used only for that one document and only while the
page is open; it is never stored.

## Opening a document by HTTP POST

Another website can open a document in the editor with an ordinary form, without JavaScript:
`POST /post.php` as `application/x-www-form-urlencoded`. Use `target` to open it in an
iframe or a new tab.

```html
<form method="post" action="https://xml.giit.ch/post.php?viewer=1" target="_blank">
  <input type="hidden" name="name" value="Report">
  <input type="hidden" name="b64" value="...">
  <button>Open</button>
</form>
```

| Field | Meaning |
|---|---|
| `content` | the document as UTF-8 text, or |
| `b64` | the document as base64 or base64url |
| `name` | optional; at most 80 characters are kept |
| `lang` | optional language page, e.g. `de` |

The address may carry `viewer=1`, `embed`, `save`, `theme`, `tidy`; any other parameter is
refused. At most 20 MB of text and 64 MB per request; files are not taken. The answer is the
editor's page with the document, or 400, 405, 413 or 415 with a short text. Without
`viewer=1` the document opens in the normal editor. Either way it is kept in memory only, is
not stored on the server, does not join "My documents" and sets no webhook.

## AI through your own server

The editor has no backend; your site keeps the keys and the results. Hand the editor your
prompt, an endpoint and a key for this editor session, in `load` as `ai: { … }` or at any
time as a message of its own:

```js
ed.contentWindow.postMessage({
  type: 'xmleditor:ai',
  label: 'My Site',
  prompt: 'Keep the [[placeholders]]. Write in German.',   // up to 8000 characters
  endpoint: 'https://your-site.com/api/ai-result',
  key: '<session key>',
  base: true
}, ORIGIN);
```

Fields left out keep their value; `{ type: 'xmleditor:ai', clear: true }` ends the AI
settings and the session's key. `base: false` leaves out the editor's own instructions. The
endpoint must be https on your page's own host (with or without `www.`) or a subdomain of
it. Keys are 16 to 512 characters of `A-Z a-z 0-9 . _ ~ + / = -`.

The AI dialog then shows "Connected to" your label and real host, what your page tells the
AI, and a choice: change the current document or make a new one. "Copy prompt" puts together
the editor's short instructions, your prompt (fenced and marked with your host), the current
document and how to send the result:

```
POST <endpoint>
Authorization: Bearer <key>
Content-Type: application/json

{"editor": "xml", "target": "current" | "new", "name": "<short name>", "content": "<the complete XML>"}
```

An AI that cannot send HTTP requests answers with a link instead, which the user pastes into
the editor. When your server has a result, your page sends `{ type: 'xmleditor:load', name,
content, from: 'ai', target }`: `target: "current"` puts it into your document (the user
sees a note, Undo takes it back, it counts as not saved yet), and `target: "new"` opens a
separate document that stays in the user's browser; its edits and saves never go to your
page.

One key per editor session: once the editor has a key it keeps it until the session ends or
`clear`, and does not take a different one. Only while it has none, "Copy prompt" sends `{
type: 'xmleditor:key-request', reason: 'missing' }`; answer with a `xmleditor:ai` message
within 5 seconds.

### Your own answer part, your own AI dialog, declining a key

- `answer` (in `ai` of `load`, or in `xmleditor:ai`): your own text for the "HOW TO ANSWER" part of
  the copied prompt, for example when your page takes the AI's answer in its own way. The
  prompt shows it fenced under `HOW TO ANSWER FROM THE WEBSITE <your host>` and carries neither
  the endpoint nor the key, so "Copy prompt" sends no `key-request`. `"none"` leaves the part
  out, `""` gives the editor's own part back, `clear` ends it with the other settings. At most
  4000 characters are kept. The AI dialog says that your site gives the answering
  instructions and shows your text together with your prompt.
- `dialog: "page"` (in `ai`): your page shows its own AI dialog. When the user presses the AI
  button while your document is open, the editor sends `{ type: 'xmleditor:ai-click', request,
  id, name }` (no content) and waits 300 ms. Answer `{ type: 'xmleditor:ai-click', request,
  handled: true }` with the same `request` to keep the editor's dialog shut; `handled: false`
  opens it at once, and without an answer it opens after the wait. `dialog: "editor"` or
  `clear` ends it.
- Declining a key: answer `xmleditor:key-request` with `{ type: 'xmleditor:ai', decline: true,
  message }` when your server gives no key, for example when the user is not logged in. The
  editor stops waiting at once, the prompt asks the AI for a link, and after copying the user
  sees `<your host>: <message>` as plain text on one line (at most 200 characters). Write
  `message` in your page's language; without it the editor shows its own note.

```js
ed.contentWindow.postMessage({ type: 'xmleditor:ai', dialog: 'page', answer: 'Reply in the chat of example.com.' }, ORIGIN);
addEventListener('message', e => {
  if (e.source !== ed.contentWindow || e.origin !== ORIGIN) return;
  const m = e.data;
  if (m.type === 'xmleditor:ai-click') {                 // the user pressed the AI button
    openMyAiDialog();
    ed.contentWindow.postMessage({ type: 'xmleditor:ai-click', request: m.request, handled: true }, ORIGIN);
  }
  if (m.type === 'xmleditor:key-request' && !loggedIn) {
    ed.contentWindow.postMessage({ type: 'xmleditor:ai', decline: true, message: 'Please log in to use the AI.' }, ORIGIN);
  }
});
```

In every prompt the document stands in a code fence one backtick longer than any run of
backticks in it, below a line that marks its text, its name and a quoted selection as data;
your texts (`prompt`, `rules`, `answer`) stand in such fences under your real host.

Key, endpoint and prompt are taken only from the page around the editor, kept in memory,
never stored and never sent by the editor itself: the key only goes into the prompt the user
copies.

Your backend should:

- make keys with at least 128 random bits and store only their hash;
- bind each key to the logged-in user, the document and this editor session, and make
  exactly one key per session;
- give the key no fixed lifetime, but keep it valid only while your open page reports the
  session (for example every minute; void it 3 minutes after the last report), and void it
  when the editor, its window or your page closes and when the user logs out;
- accept only JSON of a sensible size, keep results as drafts until the user saves, and send
  no CORS headers on the endpoint (AIs call it from a server or a command line).

## Own window

```js
const win = window.open('https://xml.giit.ch/?embed=window', 'xmleditor-17');   // no "noopener"
```

The full editor (not the reduced embedded view) with a Save button, in a top-level window,
so links from an AI reach it. It talks to `window.opener` exactly as an iframe talks to its
parent. Save sends `xmleditor:save` to the opener (if it is still open) and to the webhook
from `load`. Closing the window always sends `xmleditor:closing`, with `content` when there
are unsaved changes; if the opener is gone, the browser asks before closing with such
changes. When the opener closes, the AI settings (key included) and the hook from `load`
end. Calling `window.open` again with the same name reloads the window; focus the open one
instead. The site sends no Cross-Origin-Opener-Policy, so `window.opener` is kept.

## Viewer

`?viewer=1` shows only the finished document: no code, no tools, nothing can be changed, and
nothing is stored in the browser. The document comes from a link (`#b64=`, `#z=`, `?src=`),
from your page with `xmleditor:load`, or by POST to `post.php`. A webhook in the address is
ignored in the viewer. Opened directly, the viewer says that the content comes from a third
party.

```html
<iframe src="https://xml.giit.ch/?viewer=1&embed=1#b64=..." style="width:100%;height:600px;border:0"></iframe>
```

## What the editor stores

The editor runs in the browser and contacts no server except the addresses the user or your
page set (webhook, `src`). It stores, in the visitor's browser only:

- `localStorage`, under keys that start with `xmleditor.`: the settings and the open
  document, the list of "My documents" and each document, the webhook the user set, the
  color theme and the parts of a long link while they are collected.
- `sessionStorage` (this tab only): webhook tokens the user entered.

Documents, pictures, webhooks and AI settings from your page stay in memory only.
