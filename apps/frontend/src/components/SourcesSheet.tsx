import type { SourceTx } from "@sbank/shared";
import { eur, shortDate, txLabel } from "../lib/format";

interface Props {
  sources: SourceTx[];
  total?: number;
  onClose: () => void;
}

/** Bottom sheet listing the transactions behind an answer. */
export function SourcesSheet({ sources, total, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Transactions" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Transactions</h2>
          <button className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="tx-list">
          {sources.map((tx, i) => (
            <li key={i} className="tx">
              <div>
                <div className="tx-name">{txLabel(tx)}</div>
                <div className="tx-meta">
                  {shortDate(tx.date)} · {tx.category}
                </div>
              </div>
              <div className={tx.amount < 0 ? "tx-out" : "tx-in"}>
                {tx.amount < 0 ? "" : "+"}
                {eur(tx.amount)}
              </div>
            </li>
          ))}
        </ul>
        {total !== undefined && total > sources.length && (
          <p className="sheet-foot">Showing {sources.length} of {total}</p>
        )}
      </div>
    </div>
  );
}
