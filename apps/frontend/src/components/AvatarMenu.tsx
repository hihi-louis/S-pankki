import { useEffect, useRef, useState } from "react";

/** Round button with the last digits of the customer ID; opens a small menu to switch customer. */
export function AvatarMenu({ customerId, onLogout }: { customerId: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <button role="menuitem" className="menu-item" onClick={onLogout}>Switch customer</button>
        </div>
      )}
    </div>
  );
}
