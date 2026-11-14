// The main flow a reviewer would walk through, in a real browser:
// write and format, reload, share with two roles, and see each role's view.
import { expect, type Locator, type Page, test } from "@playwright/test";

const shots = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

async function switchUser(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch user" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Sign in as ${name}`) }).click();
  await expect(page.getByRole("banner")).toContainText(name);
}

// ui-sdk Select is a button-like combobox with a popup listbox, not a native <select>.
async function choose(page: Page, select: Locator, option: string) {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("write, reload, share as editor and viewer, import a .docx", async ({ page }) => {
  const title = `Team plan ${Date.now()}`;

  await page.goto("/");
  await shot(page, "01-login");
  await page.getByRole("button", { name: "Sign in as Alice" }).click();
  await expect(page.getByRole("heading", { name: "Owned by me" })).toBeVisible();
  await shot(page, "02-list");

  // Create and format.
  await page.getByRole("button", { name: "New document" }).click();
  await page.getByLabel("Document title").fill(title);
  const content = page.getByLabel("Document content");
  await content.click();
  await choose(page, page.getByRole("combobox", { name: "Text style" }), "Heading 1");
  await page.keyboard.type("Goals");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Ship it");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type(" by Friday, ");
  await page.getByRole("button", { name: "Underline" }).click();
  await page.keyboard.type("no excuses");
  await page.getByRole("button", { name: "Underline" }).click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Numbered list" }).click();
  await page.keyboard.type("First step");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second step");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await shot(page, "03-editor");

  // Formatting survives a reload.
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(title);
  await expect(content.locator("h1")).toHaveText("Goals");
  await expect(content.locator("strong")).toHaveText("Ship it");
  await expect(content.locator("u")).toHaveText("no excuses");
  await expect(content.locator("ol > li")).toHaveText(["First step", "Second step"]);

  // Share: Bob can edit, Carol can view.
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog");
  const person = dialog.getByRole("combobox", { name: "Person" });
  const role = dialog.getByRole("combobox", { name: "Role", exact: true });
  await choose(page, person, "Bob Okafor (bob@example.com)");
  await choose(page, role, "Can edit");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByRole("combobox", { name: "Role for Bob Okafor" })).toHaveText("Can edit");
  await choose(page, person, "Carol Diaz (carol@example.com)");
  await choose(page, role, "Can view");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByRole("combobox", { name: "Role for Carol Diaz" })).toHaveText("Can view");
  await shot(page, "04-share");
  await dialog.getByRole("button", { name: "Close" }).click();
  const documentUrl = page.url();

  // Bob sees it under "Shared with me" and can edit it.
  await switchUser(page, "Bob Okafor");
  await page.goto("/");
  const sharedWithBob = page.locator("section", { has: page.getByRole("heading", { name: "Shared with me" }) });
  await expect(sharedWithBob.getByRole("link", { name: new RegExp(title) })).toContainText("Can edit");
  await shot(page, "05-bob-list");
  await sharedWithBob.getByRole("link", { name: new RegExp(title) }).click();
  // A click on the empty part of the sheet puts the cursor at the end of the document.
  const sheet = content.locator("xpath=../..");
  const sheetBox = (await sheet.boundingBox())!;
  await sheet.click({ position: { x: 24, y: sheetBox.height - 24 } });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bob was here");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Carol sees Bob's edit but has no way to change anything.
  await switchUser(page, "Carol Diaz");
  await expect(page).toHaveURL(documentUrl);
  await expect(content).toContainText("Bob was here");
  await expect(page.getByText("You can view this document but not edit it.")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(content).toHaveAttribute("contenteditable", "false");
  await expect(page.getByLabel("Document title")).not.toBeEditable();
  await shot(page, "06-carol-view");

  // Alice opens the history and restores her version from before Bob's edit.
  await switchUser(page, "Alice Nguyen");
  await expect(content).toContainText("Bob was here");
  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByRole("option", { name: /by Alice Nguyen/ }).first().click();
  const preview = history.getByRole("region", { name: "Version preview" });
  await expect(preview).toContainText("Second step");
  await expect(preview).not.toContainText("Bob was here");
  await shot(page, "08-history");
  await history.getByRole("button", { name: "Restore this version" }).click();
  await expect(history).toHaveCount(0);
  await expect(content).toContainText("Second step");
  await expect(content).not.toContainText("Bob was here");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Carol can read the history but not restore from it.
  await switchUser(page, "Carol Diaz");
  await page.getByRole("button", { name: "History" }).click();
  await expect(history.getByRole("option").first()).toBeVisible();
  await expect(history.getByText("You can view earlier versions but not restore them.")).toBeVisible();
  await expect(history.getByRole("button", { name: "Restore this version" })).toHaveCount(0);
  await history.getByRole("button", { name: "Close" }).click();
  await expect(history).toHaveCount(0);

  // Import a real .docx as a new document.
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles("test/fixtures/sample.docx");
  await expect(page.getByLabel("Document title")).toHaveValue("sample");
  await expect(content.locator("h1")).toBeVisible();
  await expect(content.locator("ul > li").first()).toBeVisible();
  await expect(content.locator("ol > li").first()).toBeVisible();
  await expect(content.locator("u").first()).toBeVisible();
  await shot(page, "07-imported-docx");
});
