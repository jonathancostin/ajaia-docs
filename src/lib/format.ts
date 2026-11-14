import type { ShareRole } from "../api";

export const roleLabels: Record<ShareRole, string> = {
  editor: "Can edit",
  viewer: "Can view",
};

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = timestamp - now;
  for (const [unit, size] of units) {
    if (Math.abs(elapsed) >= size) return relativeFormat.format(Math.round(elapsed / size), unit);
  }
  return "just now";
}
