// The seeded accounts from migrations/0001_seed.sql. Shown on the login page
// so a reviewer can switch between users in one click.
export const DEMO_PASSWORD = "ajaia-demo";

export const DEMO_ACCOUNTS = [
  { email: "alice@example.com", name: "Alice Nguyen", note: "Owns the welcome document" },
  { email: "bob@example.com", name: "Bob Okafor", note: "Can edit the welcome document" },
  { email: "carol@example.com", name: "Carol Diaz", note: "Can only view the welcome document" },
] as const;
