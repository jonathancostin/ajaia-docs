# Submission

Candidate: Jonathan Costin

## Links

- **Live app:** https://ajaia-docs.8thlayersolutions.workers.dev
- **Source:** https://github.com/jonathancostin/ajaia-docs (the same code is in `source/` in this folder)
- **Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts

Use the one-click buttons on the login page, or sign in with email. The password for all three is `ajaia-demo`.

| Account | Email | What to look at |
|---|---|---|
| Alice Nguyen | alice@example.com | Owns "Welcome to Ajaia Docs", shared with Bob (can edit) and Carol (can view) |
| Bob Okafor | bob@example.com | Owns "Launch checklist". Can edit Alice's document |
| Carol Diaz | carol@example.com | Can only view Alice's document |

The header has a "Switch user" menu for moving between accounts.

## What is in this folder

| File or folder | What it is |
|---|---|
| `SUBMISSION.md` | This file |
| `README.md` | What the app does, test accounts, local setup, tests, deploy |
| `ARCHITECTURE.md` | What I prioritised and why, how it is built, tradeoffs, what is next |
| `AI_WORKFLOW.md` | AI tools used, what I changed or rejected, how I verified |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `source/` | The full source code, without `node_modules` |
| `ajaia-docs-source.zip` | The same source as one file |
| `screenshots/` | The main screens, taken by the browser test |

## What works

- Create, rename, edit, delete and reopen documents, with autosave.
- Rich text: bold, italic, underline, strikethrough, headings 1 to 3, bulleted and numbered lists, quotes, links.
- Real-time editing: several people in one document see each other's text, cursors and names as they type. To try it, open the same document as two accounts, one in a private window.
- Import `.txt`, `.md` and `.docx` files (up to 2 MB) as new editable documents.
- Share with another user as "Can edit" or "Can view", change the role, remove access. Owned and shared documents are listed separately.
- Access rules enforced on the server, including on the live connection, and covered by tests for every role and action. A viewer's edits are dropped by the server.
- Version history: earlier versions are kept, can be read, and can be restored for everyone who has the document open.
- Download a document as Markdown.

## What is incomplete or left out

- No sign-up or email invites. Sharing works between the three seeded accounts.
- Imported .docx files lose images and tables. Markdown tables are dropped by the parser.
- No comments, PDF export, folders or search.
- The name shown on a cursor comes from that person's browser and is not checked by the server. Edits and saves are.

## What I would build next with another 2 to 4 hours

1. A diff view between two versions, and comments anchored to text.
2. Link sharing and email invites for people without an account.
3. Images and tables in documents.
4. Login rate limiting, and the browser test running against the live URL as a deploy step.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev        # http://127.0.0.1:3410
npm test
```

Node 22 or newer. No Cloudflare account or paid service is needed.
