/** Screens opened from the Overview. The Overview itself is "home". */
export type Screen =
  | { name: "home" }
  | { name: "insight"; id: string }
  | { name: "category"; category: string }
  | { name: "basket"; basket: 1 | 2 | 3 }
  | { name: "forecast" };

export interface Nav {
  open: (screen: Screen) => void;
  back: () => void;
  /** Send a question to the chat tab. */
  ask: (text: string) => void;
}
