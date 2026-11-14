// The owner changes someone's access while that person has the document open.
// Their page must change at once, without a reload.
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";

async function openAs(browser: Browser, first: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: `Sign in as ${first}` }).click();
  await expect(page.getByRole("heading", { name: "Owned by me" })).toBeVisible();
  return page;
}

async function choose(page: Page, select: Locator, option: string) {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("lowering a role makes an open editor read-only, and removing access closes it", async ({ browser }) => {
  const alice = await openAs(browser, "Alice");
  await alice.getByRole("button", { name: "New document" }).click();
  await alice.getByLabel("Document title").fill(`Roles ${Date.now()}`);
  await alice.getByLabel("Document content").click();
  await alice.keyboard.type("Shared text");
  await expect(alice.getByText("Saved", { exact: true })).toBeVisible();

  await alice.getByRole("button", { name: "Share" }).click();
  const dialog = alice.getByRole("dialog");
  await choose(alice, dialog.getByRole("combobox", { name: "Person" }), "Bob Okafor (bob@example.com)");
  await choose(alice, dialog.getByRole("combobox", { name: "Role", exact: true }), "Can edit");
  await dialog.getByRole("button", { name: "Add" }).click();
  const bobsRole = dialog.getByRole("combobox", { name: "Role for Bob Okafor" });
  await expect(bobsRole).toHaveText("Can edit");

  const bob = await openAs(browser, "Bob");
  await bob.goto(alice.url());
  const bobsEditor = bob.getByLabel("Document content");
  await expect(bobsEditor).toContainText("Shared text");
  await expect(bobsEditor).toHaveAttribute("contenteditable", "true");

  await choose(alice, bobsRole, "Can view");
  await expect(bob.getByText("You can view this document but not edit it.")).toBeVisible();
  await expect(bobsEditor).toHaveAttribute("contenteditable", "false");
  await expect(bob.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(bobsEditor).toContainText("Shared text");

  await dialog.getByRole("button", { name: "Remove Bob Okafor" }).click();
  await expect(bob.getByText("This document does not exist or you do not have access to it.")).toBeVisible();

  // Clean up, so the test can run against a live site.
  await dialog.getByRole("button", { name: "Close" }).click();
  await alice.getByRole("link", { name: "Back to documents" }).click();
});
