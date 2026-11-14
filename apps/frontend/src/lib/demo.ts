const KEY = "sbank.demoLoanOpen";

/** Demo switch: show the customer's home loan as if the bank had not decided yet (the data has no open applications today). */
export function demoLoanOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoLoanOpen(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
