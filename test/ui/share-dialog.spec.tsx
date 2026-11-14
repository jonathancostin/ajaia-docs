import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, expect, test, vi } from "vitest";
import type { Share, User } from "../../src/api";
import { ShareDialog } from "../../src/components/ShareDialog";

const alice: User = { id: "u1", email: "alice@example.com", name: "Alice Nguyen" };
const bob: User = { id: "u2", email: "bob@example.com", name: "Bob Okafor" };
const carol: User = { id: "u3", email: "carol@example.com", name: "Carol Diaz" };

const server = vi.hoisted(() => ({ shares: [] as Share[] }));

vi.mock("../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api")>();
  return {
    ...actual,
    api: {
      listShares: vi.fn(async () => ({ owner: alice, shares: server.shares })),
      users: vi.fn(async () => ({ users: [alice, bob, carol] })),
      setShare: vi.fn(async (_id: string, email: string, role: Share["role"]) => {
        const user = [bob, carol].find((person) => person.email === email)!;
        server.shares = [...server.shares.filter((share) => share.user.id !== user.id), { user, role }];
        return { share: { user, role } };
      }),
      removeShare: vi.fn(async (_id: string, userId: string) => {
        server.shares = server.shares.filter((share) => share.user.id !== userId);
      }),
    },
  };
});

const { api } = await import("../../src/api");
const agent = createAgent();

function renderDialog(isOwner: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ShareDialog documentId="doc1" isOwner={isOwner} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.shares = [{ user: bob, role: "editor" }];
  vi.mocked(api.setShare).mockClear();
  vi.mocked(api.removeShare).mockClear();
});

test("an agent can open sharing, pick a person and a role, and add them", async () => {
  renderDialog(true);

  const opened = await agent.act({ steps: [{ ref: "Share", action: "press" }] });
  expect(opened.ok, opened.error?.message).toBe(true);
  await screen.findByRole("combobox", { name: "Role for Bob Okafor" });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Person" }).hasAttribute("disabled")).toBe(false));

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  }
  const labels = components.map((entry) => entry.label);
  for (const label of ["Share document", "Person", "Role", "Add", "Role for Bob Okafor", "Remove Bob Okafor"]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label);
  }

  const person = components.find((entry) => entry.label === "Person")!;
  expect(person.items?.map((item) => item.label)).toEqual(["Carol Diaz (carol@example.com)"]);
  const role = components.find((entry) => entry.label === "Role")!;

  const result = await agent.act({
    steps: [
      { ref: person.ref, action: "setValue", args: ["Carol Diaz (carol@example.com)"] },
      { ref: role.ref, action: "setValue", args: ["Can view"] },
      { ref: "Add", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  await waitFor(() => expect(api.setShare).toHaveBeenCalledWith("doc1", carol.email, "viewer"));
  const carolRole = await screen.findByRole("combobox", { name: "Role for Carol Diaz" });
  expect(carolRole.textContent).toBe("Can view");
});

test("the owner changes a role and removes a person from their rows", async () => {
  renderDialog(true);
  fireEvent.click(screen.getByRole("button", { name: "Share" }));

  fireEvent.click(await screen.findByRole("combobox", { name: "Role for Bob Okafor" }));
  fireEvent.click(screen.getByRole("option", { name: "Can view" }));
  await waitFor(() => expect(api.setShare).toHaveBeenCalledWith("doc1", bob.email, "viewer"));

  fireEvent.click(await screen.findByRole("button", { name: "Remove Bob Okafor" }));
  await waitFor(() => expect(api.removeShare).toHaveBeenCalledWith("doc1", bob.id));
  await waitFor(() => expect(screen.queryByText("Bob Okafor")).toBeNull());
});

test("Add stays off until a person is chosen, and Close returns focus to Share", async () => {
  renderDialog(true);
  const trigger = screen.getByRole("button", { name: "Share" });
  trigger.focus();
  fireEvent.click(trigger);

  const add = await screen.findByRole("button", { name: "Add" });
  expect(add.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

test("people who are not the owner see the list read-only", async () => {
  renderDialog(false);
  fireEvent.click(screen.getByRole("button", { name: "Share" }));

  await screen.findByText("Only the owner can change sharing.");
  await screen.findByText("Bob Okafor");
  expect(screen.getByText("Can edit")).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  expect(api.users).not.toHaveBeenCalled();
});
