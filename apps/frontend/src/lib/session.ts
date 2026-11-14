const KEY = "sbank.customer";

/**
 * Accepts "CUST04488", "cust04488", "CUST4488" or just the number ("4488", "04488") and returns "CUST04488".
 * Returns null if it cannot be a customer ID.
 */
export function normalizeCustomerId(input: string): string | null {
  const text = input.trim().toUpperCase().replace(/\s+/g, "");
  const digits = /^(?:CUST)?(\d{1,5})$/.exec(text)?.[1];
  return digits ? `CUST${digits.padStart(5, "0")}` : null;
}

// localStorage can throw (private mode, blocked storage): the app must still work without it.
export function loadCustomerId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveCustomerId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
}

export function clearCustomerId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** What the person was doing, kept per customer so a reload puts them back where they were. Cleared when they sign out. */
export interface SavedState {
  tab: "home" | "chat";
  screen: unknown;
  messages: unknown[];
}
const stateKey = (id: string) => `sbank.state.${id}`;

export function loadState(id: string): SavedState | null {
  try {
    const raw = localStorage.getItem(stateKey(id));
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}

export function saveState(id: string, state: SavedState) {
  try {
    localStorage.setItem(stateKey(id), JSON.stringify(state));
  } catch {
    // storage full or blocked: the app still works, it just forgets on reload
  }
}

export function clearState(id: string) {
  try {
    localStorage.removeItem(stateKey(id));
  } catch {
    // ignore
  }
}
