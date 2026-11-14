export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const buttonBase = `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const primaryButton = `${buttonBase} bg-blue-600 text-white hover:bg-blue-700`;

export const secondaryButton = `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

export const dangerButton = `${buttonBase} bg-red-600 text-white hover:bg-red-700`;

export const inputClass = `rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ${focusRing}`;
