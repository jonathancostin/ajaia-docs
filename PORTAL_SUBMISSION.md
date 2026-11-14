# Ajaia Docs: submission by Jonathan Costin

A small collaborative document editor. Several people can write in one document at the same time, import files, and share documents with view or edit access.

## 1. Links and test accounts

- **Live app:** https://ajaia-docs.8thlayersolutions.workers.dev
- **Source code:** https://github.com/jonathancostin/ajaia-docs
- **Google Drive folder:** https://drive.google.com/drive/folders/1ju46DyHFKTR3PEHSQ8SyrOJ9qVRYADwh
- **Walkthrough video:** https://drive.google.com/file/d/16KJ8oqkXI5WE8mJpyBqJH0-D-3f-szc4/view

The login page has a one-click button for each account. The password for all three is `ajaia-demo`.

| Account | Email | What it can do in the seeded data |
|---|---|---|
| Alice Nguyen | alice@example.com | Owns "Welcome to Ajaia Docs". Can edit Bob's "Launch checklist" |
| Bob Okafor | bob@example.com | Owns "Launch checklist". Can edit Alice's document |
| Carol Diaz | carol@example.com | Can only view Alice's document |

One browser holds one sign-in for all its windows. To be two people at once, use a normal window and a private window.

## 2. What I built, and how to test it in 2 minutes

A document editor with rich text, autosave, file import, sharing with two roles, real-time co-editing with visible cursors, and version history. It is one deploy on Cloudflare: a React app, an API on a Worker, a SQLite database (D1), and one live room per document (a Durable Object).

1. Open the live app and click **Sign in as Alice**.
2. Open "Welcome to Ajaia Docs". Type something, use the toolbar, and watch "Saving..." turn into "Saved". Reload: it is still there.
3. Open a **private window**, go to the same URL, click **Sign in as Bob**, and open the same document. Type in both windows. Each shows the other's text as it is typed, and the other's cursor with a name.
4. In the private window use **Switch user** and pick Carol. She sees edits arrive but has no toolbar and cannot type.
5. As Alice, press **History**, pick the version from before Bob's edit, and press **Restore this version**. The other window changes without a reload.
6. Go **Back to documents** and press **Import file**. Pick a `.docx`, `.md` or `.txt` file. It opens as a normal editable document.
7. Press **Share** on any document you own to add a person as "Can edit" or "Can view". Press **Download as Markdown** to export.

## 3. Scope

### What works

- Create, rename, edit, delete and reopen documents. Changes save on their own.
- Rich text: bold, italic, underline, strikethrough, headings 1 to 3, bulleted and numbered lists, quotes, links, undo and redo.
- Real-time editing: several people in one document, with live text, named cursors and a list of who is there. Two people typing in the same paragraph merge cleanly.
- File import: `.txt`, `.md` and `.docx`, up to 2 MB. Headings, lists, bold, italic and underline are kept. The page and the README state the supported types.
- Sharing: an owner, "Can edit" and "Can view" roles, change or remove access, and separate "Owned by me" and "Shared with me" lists.
- Access rules enforced on the server, for the API and for the live connection.
- Version history: earlier versions are kept, can be read and can be restored. A restore can be undone.
- Export to Markdown.

### What I cut, and why

- **Sign-up, password reset, email invites.** Three seeded accounts show the sharing model without an email service. You can only share with those accounts.
- **Images and tables.** They are dropped on import, and the app says so. They would not change how the core is built.
- **Comments and suggestion mode.** Version history covers "what changed and who did it" for much less work.
- **PDF export, folders, search, trash.**
- **Server-checked presence.** The name on a cursor comes from that person's browser. Edits and saves are attributed by the server.

### What I would build with another 2 to 4 hours

1. A diff view between two versions, and comments anchored to text.
2. Link sharing and email invites for people without an account.
3. Images (stored in R2) and tables.
4. Rate limiting on login, and the browser test as an automatic step after each deploy.

## 4. Architecture summary

| Part | Choice |
|---|---|
| Client | React 19, Vite, TipTap 3 editor, Yjs, TanStack Query, Tailwind, ui-sdk components |
| API | Hono on a Cloudflare Worker, zod validation on every body |
| Database | Cloudflare D1 (SQLite) through Drizzle, plain SQL migrations |
| Real time | One Durable Object per document holding a Yjs document |
| Auth | Seeded users, PBKDF2 password hashes, signed httpOnly session cookie |
| Deploy | One `wrangler deploy`. Runs locally with no Cloudflare account |

**Data model.** `users`; `documents` (owner, title, content as editor JSON, version, who edited last); `document_shares` (document, user, role); `document_versions` (earlier states); `document_states` (the Yjs state behind a live room). The owner is a column on the document, so a document can never lose its owner.

**Access rules.** One module decides access, and every route and the live socket call it.

| Action | Owner | Editor | Viewer | No access | Signed out |
|---|---|---|---|---|---|
| Read the document | yes | yes | yes | 404 | 401 |
| Open it for live editing | yes | yes | yes | 404 | 401 |
| Edits sent over the live connection | applied | applied | dropped | no socket | no socket |
| See who has access, see history | yes | yes | yes | 404 | 401 |
| Restore an old version | yes | yes | 403 | 404 | 401 |
| Share, change a role, remove a share | yes | 403 | 403 | 404 | 401 |
| Delete | yes | 403 | 403 | 404 | 401 |

A user with no access gets 404, not 403, so the API never confirms that a document exists.

**Real-time design.**

- The browser opens a WebSocket. The Worker checks the session, the request's origin and the user's role, then forwards the socket to the document's room with the role attached. The room trusts that role and nothing the client says about itself.
- Yjs is a CRDT, so every client applies its own edits at once and all clients end up with the same text. There is no "someone saved first" conflict.
- A viewer's socket is read-only. The room drops every edit a viewer sends.
- The room is the only writer of a document's title and content. About a second after edits stop it validates the content and writes it to the database, then tells everyone "saved".
- The room stores its Yjs state next to the readable JSON. Without that, a tab that was offline would merge its copy in as new text and every paragraph would appear twice.
- When the owner changes someone's role, the room closes that person's socket and their page reconnects with the new role.

**File import.** Conversion runs in the browser: `.docx` through mammoth to HTML to editor JSON, `.md` through TipTap's Markdown parser, `.txt` split into paragraphs. The server does not trust the result. It validates every document against a list of allowed content types, safe link protocols, and size and depth limits.

## 5. Decisions and tradeoffs

- **Deploy first.** A health route that reads the database was live in the first ten minutes. Every step after that was deployed and checked on the live URL.
- **Access rules in one place, tested as a table.** Sharing is the part that goes wrong quietly, so every cell of the table above is one assertion against the real Worker, a real database and real sockets.
- **Real time last, behind a fallback.** I first shipped a version without it (turn-based saving with a conflict check) and tagged it. Real-time editing went on a branch with a cut-off time and onto a separate staging copy. It replaced the live site only after a three-person browser test passed twice on staging.
- **One writer.** When real time went in, I removed the HTTP save route and the conflict dialog. Two ways to write a document would race each other.
- **Store editor JSON, not HTML.** It can be validated node by node, and stored HTML is never injected into the page.
- **Keep useful versions, not every save.** A version is kept when a new person starts editing, every ten minutes, and before a restore. With two people typing in turn, "keep when the author changes" would have kept one per second.
- **Seeded accounts with one-click sign-in.** Reviewers need to switch users quickly. Underneath it is a real password and session flow.
- **Cloudflare.** One command deploys the client, API, database bindings and live rooms to one URL. The cost is a less common runtime, which I handled by running the tests inside that runtime.

## 6. AI workflow

**Tools.** A terminal coding agent (omp) running Anthropic Claude models, which reads and edits files and runs commands on my dev machine. Playwright for browser checks and screenshots.

**How the work was split.** I made the product calls and reviewed what was reported and what the app did. The main agent session planned, wrote the API and the real-time server, and owned integration. It ran sub-agents on separate folders: one for the React client, one for file import and export. Before any sub-agent started, the main session wrote the contract they shared: every API route and type, and the one list of editor features. The parts fitted together on the first try.

**Where the AI was wrong, and how it was caught.**

1. **A security layer broke deletes.** The agent added CSRF middleware. The access tests then failed in 7 cells: requests with no body and no Origin header were refused. A looser test ("a viewer cannot write") would have passed. The exact-status table caught it.
2. **Passed locally, failed on the live site.** After the controls were rebuilt on a component library, every check passed against the dev server. The same browser test failed on the live URL: a fast keystroke after pressing Bold pressed the button a second time. The dev build was slow enough to hide it. Since then every change is tested against a production build before it is deployed.
3. **"Cloudflare is down."** The preview stopped answering and my first call was to move hosts. Before moving, the agent checked a fresh deploy, the live URL and the local server. The fault was a leftover local process. A move would have cost about 40 minutes.
4. **Import output the server would refuse.** A review of the import code against the server's rules found that a Markdown file with a relative link produced content the API rejects, so the whole import would fail. Neither side's tests covered the gap. Import tests now run every result through the server's own validation.
5. **A version rule that did not survive real time.** "Keep a version when a different person saves" was fine for turn-based saving and wrong for two people typing together. It was replaced, with a test that eight alternating saves produce one version.
6. **One I found by using it.** With two normal windows open, switching user in one left the other showing the old person's name and rights. All tests passed, because each test used a separate browser. Tabs now follow the browser's sign-in, and there is a browser test for it.

**How I verified.** Tests that run in the real runtime, browser tests on the live site after each deploy, screenshots at each step, and using the app myself, which is how the last bug above was found. I did not accept "tests pass" until it meant "tests pass on the production build".

## 7. Testing and quality

- **99 server and library tests, 3 browser tests.** All pass, locally, in CI and against the live site.
- **Server tests** run inside the Workers runtime against a real D1 database built from the production migrations, with real sockets into the real Durable Object. They cover every cell of the access table, a viewer's edits being dropped, a client that claims to be the owner being ignored, role changes closing open sockets, two people typing at once, formatting surviving a live edit and save, a room restart, version history, and content validation.
- **Import and export tests** use real fixture files, including a `.docx`, plus the rejection cases: wrong type, empty, too large, damaged.
- **Browser tests** (Playwright), run against the live URL after each deploy:
  - Three people in three browsers on one document: formatting, reload, sharing, live edits and cursors, the viewer unable to type, a restore reaching the others, and `.docx` import.
  - The owner lowers someone's role, then removes them, while that person has the document open. Their page changes without a reload.
  - Two tabs in one browser: when one switches user, the other follows.
- **Tests I removed.** At the end I deleted the component tests that ran against a mocked API. They asserted on mocks or repeated what the browser tests prove against the real server.
- **CI** runs the build, the tests and the browser tests against the production build on every push, on a self-hosted runner.
- **Not done:** an accessibility audit. Controls come from a component library that handles keyboard use and ARIA roles, but I did not check the app against WCAG. One known gap: the version preview in History has no accessible name.
- **Validation and errors.** Every request body is validated. Errors come back in one shape and are shown next to the control that caused them. The editor shows Saving, Saved, Offline, or the reason a save failed.
- **Setup.** `npm install`, copy `.dev.vars.example`, `npm run db:local`, `npm run dev`. I checked this from a fresh clone. No paid service or account is needed to run it.

**Known limits.** Cursor names are not verified by the server. Tables in imported Markdown are dropped. Sessions are signed cookies with no server-side list, so signing out on one device does not sign out another.
