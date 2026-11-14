# AI workflow note

## Tools

- A terminal coding agent (omp) running Anthropic Claude models. It reads and edits files and runs commands on my dev machine. I direct it, make the product calls, and review what it reports and what the app does.
- The main session planned the work, wrote the API and the live-editing server, and owned integration. It started two sub-agents with their own folders: one for the React client, one for file import and export.
- Playwright for browser checks, with screenshots the agent and I both looked at.

## Where AI sped the work up

- **Parallel work behind a written contract.** Before any sub-agent started, the main session wrote `src/api.ts` (every route and type the client may call) and `src/lib/extensions.ts` (the one list of editor features). The client, the API and the importers were then built at the same time and fitted together on the first try.
- **Tests as a table.** The access rules were written as a table first. The agent turned each cell into one assertion against the real Worker and a real database.
- **Breadth I would not have had time for alone:** .docx import, version history, a full rebuild of the controls on a component library partway through, and real-time editing with its own tests in under an hour.

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
- Lesson kept: "tests pass" had meant "tests pass against the dev server".

### 0:45, a fix that broke its neighbour

- With that fix working, the agent applied the same change to the text style menu "for consistency" and deployed without the production-build check. The live browser test failed again: text typed after choosing "Heading 1" vanished.
- Cause: that menu hands focus back to its own button as it closes, after our code ran, so the direct focus was undone. The delayed focus it replaced had been correct there.
- Reverted that one line and left a comment saying why it must stay.
- Process change: every later change was tested against a local production build before deploying (5 runs out of 5 for this one), and CI now runs the browser test against the production build on every push.

### 0:55, a second model's review

- The agent's work is reviewed in the background by other models. Most of what came back was already fixed or out of date. One point was right: in version history, "Keep mine" and "Restore" read the document and then wrote it in two steps. If someone else saved in the few milliseconds between, their save was replaced without being kept as a version.
- Fixed in the same commit: both writes then only succeeded if the row was still the one that was read. (Real-time editing later replaced this path: one live room per document is now the only writer.)
- The same review questioned whether deleting from the list really deleted. It did. A direct check showed the API's count going from 6 to 5.

### 1:10 to 1:45, real-time editing behind a fallback

- I decided to add real-time editing with about three hours left. Before any code, the working version was tagged `v1-submittable` and its deploy kept. The work went on a branch with a cut-off time, and onto a separate staging Worker with its own database. Nothing touched the live site until the three-person browser test had passed twice on staging.
- **A design point the agent raised before writing code:** the obvious build keeps only the document's JSON and rebuilds the shared state from it when a room restarts. A browser tab that still held the old state would then merge its copy in as new text, and every paragraph would appear twice. So the room stores its Yjs state next to the JSON, and a test restarts the room and reconnects a client that kept its copy.
- **What I insisted on:** role checks on the socket, not only on the API. The tests send edits from a viewer's socket, and from a viewer whose client claims to be the owner, and check that nobody else receives them and nothing is saved.
- **What the first test run caught:** all 26 socket tests timed out. At the Worker's compatibility date, a socket receives binary frames as Blobs, and the test client was reading them as ArrayBuffers. While chasing that, the agent noticed the code that reads the saved Yjs state from the database would get an empty array for one of the two shapes D1 can return. It was fixed before the rerun, so it never failed a test. The restart test now covers that path.
- **A rule that had to change:** version history kept a version "when a different person saves". With two people typing in turn that is one version per second. The room now tracks who has edited since the last kept version, with a test that eight alternating saves produce one version.
- **Removed, not left behind:** the save-over-HTTP route, the save-conflict banner and their tests went away, because a second way to write a document would race the live room.

### 1:45, a bug I found by using it

- With real-time editing live and every test green, I opened the app in two normal windows and switched user in one. The other window showed a person's cursor but would not let them type: "You can view this document but not edit it."
- Cause: a browser holds one sign-in for all its windows. Switching user in one window changed who the other window was, but that window kept the old name and the old rights on screen. The tests never saw it, because each test user had a separate browser.
- The agent reproduced it with two tabs in one browser before changing anything. Fix: every tab follows the browser's sign-in at once, and the document's access is never cached across users. There is now a browser test with two tabs in one browser.
- What I took from it: the test suite modelled three people on three machines. A reviewer is one person with several windows.

### Smaller ones

- mammoth reads `arrayBuffer` in the browser and `buffer` in Node. Code that passed one failed in the other. The converter passes both so the same function runs in the browser and under test.
- mammoth drops underline unless given the style map `u => u`. Found by importing a real .docx made in LibreOffice and looking for the underline, not by reading docs.
- The component library's docs said to declare its CSS layer first. With Tailwind that let Tailwind's reset override every control on pages with a popup. The sub-agent found the cause in the browser's computed styles and fixed the layer order.
- A dev-only failure: the first .docx import reloaded the page, because the dev server discovered mammoth at that moment. Production was never affected. Fixed in `vite.config.ts` so a fresh clone does not hit it.

## How I verified

- **API and live editing:** tests run inside the Workers runtime against a real D1 database built from the production migrations, with real sockets into the real Durable Object. They cover every cell of the access table, viewers and forged roles on the socket, role changes closing open sockets, two people typing at once, a room restart, version history and content validation.
- **Import and export:** tests on real fixture files, including a .docx, plus the rejection cases. Import results are checked against the server's validation schema.
- **UI:** three Playwright tests in real browsers: three people on one document (write, reload, share, live edits and cursors, the viewer unable to type, restore, import), a role change while the document is open, and two tabs in one browser.
- **Tests I removed:** at the end I went through the suite and deleted the component tests that ran against a mocked API. They asserted on the mocks or repeated what the browser tests already prove against the real server. One server test only checked that stored JSON came back unchanged. It now sends the content through a live edit and a save first.
- **Staging, then live:** the Playwright test passed twice on a staging copy on Cloudflare before real-time editing was merged, and the browser tests run against the live URL after each deploy. A fresh clone was installed, seeded, tested and started from the README steps.
- **UX:** screenshots from the browser test at each step, and my own pass through the live app as each of the three users.

## Preparation before the timer

- Checked which deploy targets were logged in on my machine and picked Cloudflare Workers with D1, because the account already existed.
- Ran a throwaway spike to confirm the libraries work together, then deleted it. No application code was kept.
- Measured password hashing on the real account with a probe Worker (table in ARCHITECTURE.md), then deleted the probe.
