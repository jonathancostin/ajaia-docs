# AI workflow note

## Tools

- A terminal coding agent (omp) running Anthropic Claude models. It reads and edits files and runs commands on my dev machine. I direct it, make the product calls, and review what it reports and what the app does.
- The main session planned the work, wrote the API and owned integration. It started two sub-agents with their own folders: one for the React client, one for file import and export.
- Playwright for browser checks, with screenshots the agent and I both looked at.

## Where AI sped the work up

- **Parallel work behind a written contract.** Before any sub-agent started, the main session wrote `src/api.ts` (every route and type the client may call) and `src/lib/extensions.ts` (the one list of editor features). The client, the API and the importers were then built at the same time and fitted together on the first try.
- **Tests as a table.** The access rules were written as a table first. The agent turned each cell into one assertion against the real Worker and a real database: 5 kinds of user by 10 actions.
- **Breadth I would not have had time for alone:** .docx import, the save-conflict check, version history, and a full rebuild of the controls on a component library partway through.

## What I changed or rejected

Times are minutes into the four hours.

### 0:10, a security layer that quietly broke deletes

- The agent added Hono's CSRF middleware under the SameSite cookie. The access tests then failed in 7 cells: a signed-out DELETE returned 403 where the table says 401, and the owner's "remove a share" did nothing.
- Cause: the middleware treats a request with no Content-Type as a form post and refuses it without an Origin header. Browsers always send Origin on a DELETE. The test client did not.
- Kept the middleware, made the test client send Origin like a browser, and added a test that a DELETE from another origin with the owner's cookie is refused.
- A looser test ("a viewer cannot write") would have passed while this was wrong. That is why the table asserts exact status codes.

### 0:15, a toolbar that lost keystrokes

- The generated toolbar looked right and type-checked. The first browser run clicked Bold, typed "Ship it", and the document said "it", not bold. The screenshot showed three places with missing characters.
- Cause: the click moved focus from the document to the button, and focus came back a frame later. Keys pressed in between were lost.
- Fixed so focus never leaves the document.

### 0:15, "Cloudflare is down"

- The dev preview stopped answering and Cloudflare's status page showed Workers as degraded. My first call was to move hosts.
- Before moving, the agent checked three things: a fresh deploy (went through), the live URL (served the app, sign-in worked), and the local dev server (hung). A leftover local process was holding the port.
- No migration. It would have cost about 40 minutes and two new accounts to fix something that was not broken.

### 0:18, import output the server would have refused

- The main session reviewed the sub-agent's import code against the server's validation rules. Neither side's tests covered the gap between them: a Markdown file with a relative link (`[x](./other.md)`) converted to a link the server rejects, so the whole import would have failed.
- Added one normalising pass after every converter. The import tests now run each result through the server's own schema.
- Found the same way and left as a documented limit: TipTap's Markdown parser drops tables.

### 0:35, passed in development, failed on the live site

- After the controls were rebuilt on ui-sdk, everything passed locally, including the browser test against the dev server. The same test against the live URL failed. Bold stayed on, and spaces and line breaks went missing.
- Reproduced by serving the production build locally, where it failed 2 runs out of 2.
- Cause: the component library moves focus to the pressed button. The editor took it back one frame later. In the faster production build, the next Space or Enter landed inside that frame and pressed the button again.
- Fixed by focusing the editor directly. 3 out of 3 on the production build, then 2 out of 2 on the live URL.
- Lesson kept: "tests pass" had meant "tests pass against the dev server". The browser test now runs against the live URL after each deploy.

### Smaller ones

- mammoth reads `arrayBuffer` in the browser and `buffer` in Node. Code that passed one failed in the other. The converter passes both so the same function runs in the browser and under test.
- mammoth drops underline unless given the style map `u => u`. Found by importing a real .docx made in LibreOffice and looking for the underline, not by reading docs.
- The component library's docs said to declare its CSS layer first. With Tailwind that let Tailwind's reset override every control on pages with a popup. The sub-agent found the cause in the browser's computed styles and fixed the layer order.
- A dev-only failure: the first .docx import reloaded the page, because the dev server discovered mammoth at that moment. Production was never affected. Fixed in `vite.config.ts` so a fresh clone does not hit it.

## How I verified

- **API:** tests run inside the Workers runtime against a real D1 database built from the production migrations. They cover every cell of the access table, that a refused edit changes nothing, role changes taking effect at once, save conflicts, version history and content validation.
- **Import and export:** tests on real fixture files, including a .docx, plus the rejection cases. Import results are checked against the server's validation schema.
- **UI:** component tests for the toolbar and share dialog, and a Playwright test of the whole flow (write, reload, share, each role's view, history, import).
- **Live site:** the Playwright test runs against the deployed URL after each deploy. A fresh clone was installed, seeded, tested and started from the README steps.
- **UX:** screenshots from the browser test at each step, and my own pass through the live app as each of the three users.

## Preparation before the timer

- Checked which deploy targets were logged in on my machine and picked Cloudflare Workers with D1, because the account already existed.
- Ran a throwaway spike to confirm the libraries work together, then deleted it. No application code was kept.
- Measured password hashing on the real account with a probe Worker (table in ARCHITECTURE.md), then deleted the probe.
