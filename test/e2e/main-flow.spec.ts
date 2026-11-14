// The main flow a reviewer would walk through, in a real browser: write and
// format, reload, share with two roles, then Alice, Bob and Carol in the same
// document at once, history restore, and a .docx import.
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";

const shots = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

// Each person gets their own browser context, so their sessions are separate and all can be open at once.
async function openAs(browser: Browser, first: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: `Sign in as ${first}` }).click();
  await expect(page.getByRole("heading", { name: "Owned by me" })).toBeVisible();
  return page;
}

// ui-sdk Select is a button-like combobox with a popup listbox, not a native <select>.
async function choose(page: Page, select: Locator, option: string) {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const editorOf = (page: Page) => page.getByLabel("Document content");

// A click on the empty part of the sheet puts the cursor at the end of the document.
async function typeAtEnd(page: Page, text: string) {
  const sheet = editorOf(page).locator("xpath=../..");
  const box = (await sheet.boundingBox())!;
  await sheet.click({ position: { x: 24, y: box.height - 24 } });
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

const saved = (page: Page) => expect(page.getByText("Saved", { exact: true })).toBeVisible();

test("write, share, edit together in real time, restore, import a .docx", async ({ page: alice, browser }) => {
  test.setTimeout(120_000);
  const title = `Team plan ${Date.now()}`;
  const content = editorOf(alice);

  await alice.goto("/");
  await shot(alice, "01-login");
  await alice.getByRole("button", { name: "Sign in as Alice" }).click();
  await expect(alice.getByRole("heading", { name: "Owned by me" })).toBeVisible();
  await shot(alice, "02-list");

  // Create and format.
  await alice.getByRole("button", { name: "New document" }).click();
  await alice.getByLabel("Document title").fill(title);
  await content.click();
  await choose(alice, alice.getByRole("combobox", { name: "Text style" }), "Heading 1");
  await alice.keyboard.type("Goals");
  await alice.keyboard.press("Enter");
  await alice.getByRole("button", { name: "Bold" }).click();
  await alice.keyboard.type("Ship it");
  await alice.getByRole("button", { name: "Bold" }).click();
  await alice.keyboard.type(" by Friday, ");
  await alice.getByRole("button", { name: "Underline" }).click();
  await alice.keyboard.type("no excuses");
  await alice.getByRole("button", { name: "Underline" }).click();
  await alice.keyboard.press("Enter");
  await alice.getByRole("button", { name: "Numbered list" }).click();
  await alice.keyboard.type("First step");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Second step");
  await saved(alice);
  await shot(alice, "03-editor");

  // Formatting survives a reload.
  await alice.reload();
  await expect(alice.getByLabel("Document title")).toHaveValue(title);
  await expect(content.locator("h1")).toHaveText("Goals");
  await expect(content.locator("strong")).toHaveText("Ship it");
  await expect(content.locator("u")).toHaveText("no excuses");
  await expect(content.locator("ol > li")).toHaveText(["First step", "Second step"]);

  // Share: Bob can edit, Carol can view.
  await alice.getByRole("button", { name: "Share" }).click();
  const dialog = alice.getByRole("dialog");
  const person = dialog.getByRole("combobox", { name: "Person" });
  const role = dialog.getByRole("combobox", { name: "Role", exact: true });
  await choose(alice, person, "Bob Okafor (bob@example.com)");
  await choose(alice, role, "Can edit");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByRole("combobox", { name: "Role for Bob Okafor" })).toHaveText("Can edit");
  await choose(alice, person, "Carol Diaz (carol@example.com)");
  await choose(alice, role, "Can view");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByRole("combobox", { name: "Role for Carol Diaz" })).toHaveText("Can view");
  await shot(alice, "04-share");
  await dialog.getByRole("button", { name: "Close" }).click();
  const documentUrl = alice.url();

  // Bob finds it under "Shared with me" and opens it while Alice is still in it.
  const bob = await openAs(browser, "Bob");
  const sharedWithBob = bob.locator("section", { has: bob.getByRole("heading", { name: "Shared with me" }) });
  await expect(sharedWithBob.getByRole("link", { name: new RegExp(title) })).toContainText("Can edit");
  await shot(bob, "05-bob-list");
  await sharedWithBob.getByRole("link", { name: new RegExp(title) }).click();
  await expect(editorOf(bob).locator("h1")).toHaveText("Goals");

  // Carol opens it too, as a viewer.
  const carol = await openAs(browser, "Carol");
  await carol.goto(documentUrl);
  await expect(editorOf(carol).locator("h1")).toHaveText("Goals");

  // Alice types and Bob and Carol see it arrive without reloading.
  await typeAtEnd(alice, "Alice says hi");
  await expect(editorOf(bob)).toContainText("Alice says hi");
  await expect(editorOf(carol)).toContainText("Alice says hi");
  await saved(alice);

  // Bob types and Alice and Carol see it.
  await typeAtEnd(bob, "Bob was here");
  await expect(content).toContainText("Bob was here");
  await expect(editorOf(carol)).toContainText("Bob was here");
  await saved(bob);

  // Alice sees where Bob is and that he is here.
  await expect(content.locator(".collaboration-carets__label", { hasText: "Bob Okafor" })).toBeVisible();
  await expect(alice.getByRole("img", { name: "Bob Okafor is here" })).toBeVisible();
  await expect(alice.getByRole("img", { name: "Carol Diaz is here" })).toBeVisible();
  await shot(alice, "09-realtime");

  // Carol has no way to change anything.
  await expect(carol.getByText("You can view this document but not edit it.")).toBeVisible();
  await expect(carol.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(editorOf(carol)).toHaveAttribute("contenteditable", "false");
  await expect(carol.getByLabel("Document title")).not.toBeEditable();
  await editorOf(carol).click();
  await carol.keyboard.type("Carol typed this");
  await expect(editorOf(carol)).not.toContainText("Carol typed this");
  await expect(content).not.toContainText("Carol typed this");
  await shot(carol, "06-carol-view");

  // Alice restores her version from before Bob's edit, and Bob's open editor follows.
  await alice.getByRole("button", { name: "History" }).click();
  const history = alice.getByRole("dialog", { name: "Version history" });
  await history.getByRole("option", { name: /by Alice Nguyen/ }).first().click();
  const preview = history.getByRole("region", { name: "Version preview" });
  await expect(preview).toContainText("Alice says hi");
  await expect(preview).not.toContainText("Bob was here");
  await shot(alice, "08-history");
  await history.getByRole("button", { name: "Restore this version" }).click();
  await expect(history).toHaveCount(0);
  await expect(content).toContainText("Alice says hi");
  await expect(content).not.toContainText("Bob was here");
  await expect(editorOf(bob)).not.toContainText("Bob was here");
  await expect(editorOf(bob)).toContainText("Second step");
  await expect(editorOf(carol)).not.toContainText("Bob was here");
  await saved(alice);

  // Carol can read the history but not restore from it.
  await carol.getByRole("button", { name: "History" }).click();
  const carolHistory = carol.getByRole("dialog", { name: "Version history" });
  await expect(carolHistory.getByRole("option").first()).toBeVisible();
  await expect(carolHistory.getByText("You can view earlier versions but not restore them.")).toBeVisible();
  await expect(carolHistory.getByRole("button", { name: "Restore this version" })).toHaveCount(0);
  await carolHistory.getByRole("button", { name: "Close" }).click();
  await expect(carolHistory).toHaveCount(0);

  await bob.context().close();
  await carol.context().close();

  // Import a real .docx as a new document.
  await alice.goto("/");
  await alice.locator('input[type="file"]').setInputFiles("test/fixtures/sample.docx");
  await expect(alice.getByLabel("Document title")).toHaveValue("sample");
  await expect(content.locator("h1")).toBeVisible();
  await expect(content.locator("ul > li").first()).toBeVisible();
  await expect(content.locator("ol > li").first()).toBeVisible();
  await expect(content.locator("u").first()).toBeVisible();
  await shot(alice, "07-imported-docx");
});
