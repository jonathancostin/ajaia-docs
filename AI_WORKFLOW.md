# AI workflow note

Working notes, kept while building. Times are minutes into the timer.

## Tools

- A terminal coding agent (omp) running Anthropic Claude models. One main session planned the work, wrote the API and owned integration. It started two sub-agents for separate folders: one for the React client, one for file import and export.
- No code was pasted from a chat window. The agent edits files and runs commands on my dev machine, and I review what it reports and what the app does.

## Log

### Before the timer

- Checked which deploy targets were logged in on my machine and picked Cloudflare Workers with D1, because the account already existed.
- Ran a throwaway spike to confirm the libraries work together, then deleted it. No application code was kept.
- Measured password hashing on the real account with a probe Worker (table in ARCHITECTURE.md), then deleted the probe.

### 0:00 to 0:10, scaffold and first deploy

- Deployed a health route that reads D1 before writing any feature, so deploy problems would show up in minute 8 and not in hour 3. Checked on the live URL that `/api/health` returns the user count and that a deep link like `/d/abc` returns the app.

### 0:05 to 0:12, splitting the work

- Decision: write the contract first, then split. I had the agent write `src/api.ts` (every route and type the client may call) and `src/lib/extensions.ts` (the one list of editor features) before any sub-agent started. Each sub-agent owned a folder and was told not to touch config or the other's files.
- Why: three agents editing one repo without a contract produce three ideas of the API.

### 0:10, the access tests caught a wrong assumption

- The agent added Hono's `csrf()` middleware as a second layer under the SameSite cookie. The access matrix test then failed in 7 cells: a signed-out DELETE returned 403 where the table says 401, and the owner's "remove a share" did nothing.
- Cause: Hono's CSRF check treats a request with no Content-Type as a form post and refuses it when there is no Origin header. Browsers always send Origin on a DELETE. The test client did not.
- What changed: the test client now sends Origin like a browser does, and there is a new test that a DELETE from another origin with the owner's cookie is refused and the document survives. The middleware stayed.
- This is the reason the matrix asserts exact status codes for every role and action. A looser test ("viewer cannot write") would have passed while "owner can remove a share" was broken for any client without an Origin header.

### Import, from the sub-agent's report

- mammoth's browser build reads `arrayBuffer` and its Node build reads `buffer`. Code that passed only one worked in one place and failed in the other with "Could not find file in options". The converter passes both, so the same function runs in the browser and under test.
- mammoth drops underline unless it is given the style map `u => u`. Found by importing a real .docx made in LibreOffice and looking for the underline mark, not by reading docs.
- Expected the Markdown serializer to drop underline. It writes `<u>text</u>` and reads it back, so no custom code was added.

## How correctness was checked

- API: 54 tests run inside the Workers runtime against a real D1 database built from the production migrations. They cover every cell of the access table, version conflicts and content validation.
- Import and export: 12 tests on real fixture files, including a .docx.

## Log, continued (to merge into the log above in the final pass)

### 0:15, the browser test found a bug no unit test would

- The generated toolbar looked right and type-checked. The first Playwright run typed "Ship it" after clicking Bold and the document said "it", not bold. The page screenshot showed three places where characters and line breaks had gone missing.
- Cause: a mouse click moved focus from the document to the toolbar button. TipTap gives focus back on the next animation frame. Keys pressed in between went to the button, and the pending bold was dropped when focus returned.
- Fix: the toolbar cancels the mouse-down so focus never leaves the document. A person typing fast after a click would have hit this.

### 0:15, "Cloudflare is down"

- Mid-build the dev preview stopped answering and Cloudflare's status page showed Workers as degraded. The first reaction was to move hosts.
- Before moving, the agent checked three things: a fresh deploy (went through), the live URL (served the app, sign-in worked), and the local dev server (hung). The problem was local: a leftover dev server process held the port, so the preview proxy pointed at a dead process.
- Decision: no migration. A move would have cost about 40 minutes and two new accounts to fix something that was not broken.

### 0:17, a dev-only failure in the import step

- The browser test's .docx import did nothing on the first run and passed on the second. Vite found mammoth for the first time at that moment, rebuilt its dependency cache and reloaded the page, which dropped the import. Production was never affected. `vite.config.ts` now pre-bundles mammoth so a fresh clone does not hit this on its first import.

### 0:18, import results the server would have refused

- Reviewing the sub-agent's import code against the server rules showed a gap neither side's tests covered: a Markdown file with a relative link (`[x](./other.md)`) converts to a link the server rejects, so the whole import would fail with a 400.
- Fix: one normalising pass after every converter (unsafe links keep their text and lose the link, unknown nodes are unwrapped), and the import tests now run each result through the server's own validation schema. The editor's link rule and the server's link rule are the same function's worth of logic.
- Known limit found the same way: TipTap's Markdown parser drops tables, including their text.

### 0:35, passed in development, failed on the live site

- After the controls were rebuilt on ui-sdk, every check passed locally: types, unit tests, and the browser test against the dev server. The same browser test against the live URL failed. Bold stayed on, and spaces and line breaks went missing.
- Reproduced it locally by serving the production build (`vite preview`), where it failed 2 runs out of 2.
- Cause: ui-sdk moves keyboard focus to the toolbar button that was pressed. TipTap's focus command hands it back one frame later. In the faster production build, the next Space or Enter arrived inside that frame and pressed the button a second time. The dev build was slow enough to hide it.
- Fix: focus the editor view directly, with no one-frame wait. 3 runs out of 3 on the production build, then 2 out of 2 on the live URL.
- What I took from it: "tests pass" meant "tests pass against the dev server". The browser test now runs against the live URL after each deploy.
