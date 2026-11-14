# Video notes

Working notes for the 3 to 5 minute walkthrough. Updated as features land.

## Demo flow

Live URL: https://ajaia-docs.8thlayersolutions.workers.dev
Accounts (password `ajaia-demo`, or one click on the login page): Alice, Bob, Carol.

1. Login page: click "Sign in as Alice".
2. List: "Owned by me" has the welcome document, "Shared with me" has Bob's launch checklist.
3. New document. Type a title, a heading, bold, italic, underline, a bulleted and a numbered list. Point at "Saved". Refresh: it is all still there.
4. Back to the list. Import a .docx. It opens as an editable document with headings and lists kept.
5. Share: open the dialog, add Bob as editor and Carol as viewer.
6. Switch user to Bob: the document is under "Shared with me", he can edit.
7. Switch user to Carol: read only, no toolbar.
8. Download as Markdown.

## Works end to end (only things checked on the live URL)

- (fill in as each is checked)

## Cut on purpose

- Real-time co-editing and presence. Two people can edit the same document, and a save over someone's newer version is refused with a choice to load theirs or keep mine.
- Sign-up, password reset, email. Three seeded accounts.
- Comments, images, tables, PDF export, folders, search.

## Key decisions

1. One access module on the server. Every route asks it "what can this user do to this document". A stranger gets 404, a viewer who tries to write gets 403.
2. The access table in the README is the test. Every cell is one assertion against the real Worker and a real database.
3. File conversion runs in the browser, and the server validates the result against a list of allowed content types.
4. Deployed in the first ten minutes and after every step.

## AI moments

1. The access tests failed in 7 cells right after the agent added CSRF middleware. Bodiless DELETE requests without an Origin header were refused. The exact-status matrix caught it.
2. mammoth: one option name in the browser, another in Node. The first version passed in one and failed in the other.
3. Underline vanished from imported .docx files until a style map was added. Found by testing with a real file.
