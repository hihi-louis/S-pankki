import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import type { Persona } from "@sbank/shared";
import { getPersonas } from "../api";
import { normalizeCustomerId } from "../lib/session";

interface Props {
  /** Resolves when the ID is accepted; throws with a message to show otherwise. */
  onLogin: (customerId: string) => Promise<void>;
  /** An error from outside, e.g. the ID from the URL does not exist. */
  initialError?: string | null;
}

export function LoginScreen({ onLogin, initialError }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    // Demo shortcuts are a convenience: the form works without them
    getPersonas()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  async function enter(raw: string) {
    const id = normalizeCustomerId(raw);
    if (!id) {
      setError("Enter a customer ID like CUST04488, or just the number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onLogin(id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    if (!busy) void enter(input);
  }

  return (
    <main className="login">
      <div className="login-top">
        <div className="login-mark" aria-hidden="true">💬</div>
        <h1>Personal Economic Trainer</h1>
        <p>Plain answers from your own transactions.</p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label htmlFor="customer-id">Customer ID</label>
        <input
          id="customer-id"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. CUST04488 or 4488"
          autoComplete="off"
          autoCapitalize="characters"
          autoFocus
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="cta" disabled={busy || !input.trim()}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>

      {personas.length > 0 && (
        <section className="login-demo">
          <h2>Or try a demo customer</h2>
          <div className="chips">
            {personas.map((p) => (
              <button key={p.customerId} className="chip" disabled={busy} onClick={() => void enter(p.customerId)}>
                {p.name} · {p.age}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="login-note">Demo only: there is no password. All data is synthetic.</p>
    </main>
  );
}
