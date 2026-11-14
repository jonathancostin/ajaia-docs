// One browser holds one sign-in for all its tabs. A tab must never keep
// showing one person's name and rights after another tab signed in as someone else.
import { expect, type Page, test } from "@playwright/test";

const viewerNotice = "You can view this document but not edit it.";

async function switchUser(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch user" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Sign in as ${name}`) }).click();
  await expect(page.getByRole("banner")).toContainText(name);
}

test("a second tab in the same browser follows the sign-in of the first", async ({ context }) => {
  const first = await context.newPage();
  await first.goto("/");
  await first.getByRole("button", { name: "Sign in as Alice" }).click();
  await first.getByRole("link", { name: /Welcome to Ajaia Docs/ }).click();
  await expect(first.getByLabel("Document content")).toHaveAttribute("contenteditable", "true");

  const second = await context.newPage();
  await second.goto(first.url());
  await expect(second.getByRole("banner")).toContainText("Alice Nguyen");

  // The second tab becomes Carol, a viewer. The first tab was never touched.
  await switchUser(second, "Carol Diaz");
  await expect(first.getByRole("banner")).toContainText("Carol Diaz");
  await expect(first.getByText(viewerNotice)).toBeVisible();
  await expect(first.getByLabel("Document content")).toHaveAttribute("contenteditable", "false");

  // And back to someone who can edit: the first tab must not stay read-only.
  await switchUser(second, "Bob Okafor");
  await expect(first.getByRole("banner")).toContainText("Bob Okafor");
  await expect(first.getByText(viewerNotice)).toHaveCount(0);
  await expect(first.getByLabel("Document content")).toHaveAttribute("contenteditable", "true");

  await second.getByRole("button", { name: "Sign out" }).click();
  await expect(first.getByRole("button", { name: "Sign in as Alice" })).toBeVisible();
});
