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
