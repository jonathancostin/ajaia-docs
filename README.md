# Ajaia Docs

A small collaborative document editor: write rich text, import files, and share documents with view or edit access.

**Live app:** https://ajaia-docs.8thlayersolutions.workers.dev

## Test accounts

The login page has a one-click button for each account. The password for all three is `ajaia-demo`.

| Account | Email | In the seeded data |
|---|---|---|
| Alice Nguyen | alice@example.com | Owns "Welcome to Ajaia Docs". Can edit Bob's "Launch checklist" |
| Bob Okafor | bob@example.com | Owns "Launch checklist". Can edit Alice's welcome document |
| Carol Diaz | carol@example.com | Can only view Alice's welcome document |

The header has a "Switch user" menu, so you can move between accounts without going back to the login page.

## What works

- **Documents:** create, rename, edit, delete, reopen. Changes save on their own about a second after you stop typing, with a Saving and Saved indicator.
- **Formatting:** bold, italic, underline, strikethrough, headings 1 to 3, bulleted and numbered lists, quotes, links, undo and redo.
- **File import:** `.txt`, `.md` and `.docx`, up to 2 MB, each becomes a new editable document. Headings, lists, bold, italic and underline are kept. Images and tables in a .docx are dropped.
- **Sharing:** the owner shares with another user as **Can edit** or **Can view**, changes a role, or removes access. The document list separates "Owned by me" from "Shared with me".
- **Roles are enforced on the server.** A viewer cannot save, a user without access cannot tell the document exists. See the access table in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Conflict safety:** if two people edit the same document, the second save is refused and that person chooses "Load their version" or "Keep mine". Nothing is overwritten silently.
- **Version history:** earlier versions of a document are kept, can be read, and can be restored. A restore can itself be undone.
- **Export:** download any document as Markdown.

## What is not built

- Real-time co-editing and presence. Editing is turn-based with the conflict check above.
- Sign-up, password reset and email invites. You can only share with the three seeded accounts.
- Comments, images, tables, PDF export, folders and search. Tables in an imported Markdown file are dropped.

[ARCHITECTURE.md](ARCHITECTURE.md) explains each cut and what I would build next with another 2 to 4 hours.

## Run it locally

You need Node 22 or newer. No Cloudflare account is needed: the database runs in the local emulator that ships with wrangler.

```bash
npm install
cp .dev.vars.example .dev.vars   # the session secret for local use
npm run db:local                 # creates the local database with the three accounts
npm run dev                      # http://127.0.0.1:3410
```

## Tests

```bash
npm test
```

- `test/worker`: API tests that run inside the Workers runtime against a real D1 database built from the production migrations. They assert every cell of the access table (5 kinds of user, 10 actions), that a refused edit changes nothing, that role changes take effect at once, version conflicts, version history, and content validation.
- `test/lib`: file import and export on real fixture files, including a .docx, plus the rejection cases (wrong type, empty, too large, damaged).
- `test/e2e`: one browser test of the main flow with Playwright. Run it with `npm run test:e2e` while `npm run dev` is running.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create ajaia-docs      # put the returned id in wrangler.jsonc
npm run db:remote                      # applies migrations, including the seed
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npm run deploy
```

## Project layout

```
src/                 React client
  api.ts             the only file that calls the API, with all shared types
  pages/             login, document list, editor
  components/        header, toolbar, share dialog
  hooks/             autosave
  lib/               editor extensions, file import, Markdown export
worker/              Cloudflare Worker (Hono)
  access.ts          who can do what to a document. Every route calls it
  content.ts         validation of document content
  session.ts         signed cookie sessions
  history.ts         when an earlier version of a document is kept
  routes/            auth, documents, shares and version history
  db/schema.ts       tables (Drizzle)
migrations/          SQL migrations and the seed data
test/                API, import and browser tests
```

## Other documents

- [ARCHITECTURE.md](ARCHITECTURE.md): what I prioritised, how it is built, and the tradeoffs.
- [AI_WORKFLOW.md](AI_WORKFLOW.md): which AI tools I used, what I changed or rejected, and how I verified the result.
- [SUBMISSION.md](SUBMISSION.md): what is in this submission.
