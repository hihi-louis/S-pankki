import { useEffect, useRef, useState } from "react";
import { getLoanStatus } from "../api";
import { demoLoanOpen, setDemoLoanOpen } from "../lib/demo";

/** Round button with the last digits of the customer ID; opens a small menu to switch customer. */
export function AvatarMenu({ customerId, onLogout }: { customerId: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [hasLoan, setHasLoan] = useState(false);
  const demo = demoLoanOpen();

  useEffect(() => {
    getLoanStatus(customerId).then((r) => setHasLoan(r.hasApplication)).catch(() => setHasLoan(false));
  }, [customerId]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="avatar-wrap" ref={ref}>
      <button className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label={`Account ${customerId}`} onClick={() => setOpen((o) => !o)}>
        {customerId.slice(-2)}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-who">Signed in as<br /><strong>{customerId}</strong></div>
          {hasLoan && (
            <button
              role="menuitemcheckbox"
              aria-checked={demo}
              className="menu-item"
              onClick={() => {
                setDemoLoanOpen(!demo);
                window.location.reload();
              }}
            >
              {demo ? "✓ " : ""}Demo: home loan still open
            </button>
          )}
          <button role="menuitem" className="menu-item" onClick={onLogout}>Switch customer</button>
        </div>
      )}
    </div>
  );
}
