/** Small line icons for the question grid and buttons. Decorative: the text next to them carries the meaning. */
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconArrowDownRight = () => (
  <svg {...base}><path d="M7 7l10 10M17 8v9H8" /></svg>
);
export const IconTarget = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>
);
export const IconEuro = () => (
  <svg {...base}><path d="M17 6.5A6.5 6.5 0 0 0 7 9.5v5a6.5 6.5 0 0 0 10 3M5 10.5h8M5 13.5h8" /></svg>
);
export const IconTrendUp = () => (
  <svg {...base}><path d="M7 17L17 7M9 7h8v8" /></svg>
);
export const IconArrowRight = () => (
  <svg {...base} width={18} height={18}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconArrowLeft = () => (
  <svg {...base} width={18} height={18}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const IconChat = () => (
  <svg {...base}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M12 9v6M9 12h6" /></svg>
);
export const IconBars = () => (
  <svg {...base} width={16} height={16}><path d="M5 18V9M10 18V5M15 18v-7M20 18V8" /></svg>
);
