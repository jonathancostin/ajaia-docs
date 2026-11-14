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
- Import `.txt`, `.md` and `.docx` files (up to 2 MB) as new editable documents.
- Share with another user as "Can edit" or "Can view", change the role, remove access. Owned and shared documents are listed separately.
- Access rules enforced on the server and covered by tests for every role and action.
- A save over someone else's newer version is refused, with a choice of whose version to keep.
- Version history: earlier versions are kept, can be read, and can be restored.
- Download a document as Markdown.

## What is incomplete or left out

- No real-time co-editing or presence. Two people can edit the same document, but they take turns, and the conflict check stops one overwriting the other.
- No sign-up or email invites. Sharing works between the three seeded accounts.
- Imported .docx files lose images and tables. Markdown tables are dropped by the parser.
- No comments, PDF export, folders or search.

## What I would build next with another 2 to 4 hours

1. Real-time editing with Yjs in a Cloudflare Durable Object, with presence.
2. Link sharing and email invites for people without an account.
3. Images and tables in documents.
4. Login rate limiting, and the browser test running against each deploy in CI.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev        # http://127.0.0.1:3410
npm test
```

Node 22 or newer. No Cloudflare account or paid service is needed.
