import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { ChatResponse, SourceTx } from "@sbank/shared";
import { CardRenderer, MiniChart } from "../components/Cards";
import { SourcesSheet } from "../components/SourcesSheet";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  res?: ChatResponse;
  error?: boolean;
  /** Still being written: show the status line and the text so far. */
  pending?: boolean;
  status?: string;
}

export const STARTERS = [
  "Where did my money go?",
  "What kind of spender am I?",
  "What can I safely spend this week?",
  "How could I save more?",
];

interface Props {
  /** First assistant message, e.g. "Hello, welcome Aino to Personal Economic Trainer". */
  greeting: string;
  messages: ChatMsg[];
  busy: boolean;
  onAsk: (text: string) => void;
}

export function ChatScreen({ greeting, messages, busy, onAsk }: Props) {
  const [input, setInput] = useState("");
  const [sheet, setSheet] = useState<{ sources: SourceTx[]; total?: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function submit(e: SyntheticEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    onAsk(text);
  }

  const lastAssistant = messages.map((m) => m.role).lastIndexOf("assistant");

  return (
    <>
      <main className="messages">
        <div className="assistant-block">
          <div className="msg assistant greeting">{greeting}</div>
          {messages.length === 0 && (
            <>
              <p className="greeting-sub">Ask anything about your money. Try one of these:</p>
              <div className="chips chips-col">
                {STARTERS.map((q) => (
                  <button key={q} className="chip" onClick={() => onAsk(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="assistant-block">
              {m.pending && !m.content ? (
                <div className="msg assistant typing" aria-label={m.status ?? "Thinking"} role="status">
                  <span />
                  <span />
                  <span />
                  {m.status && <em className="typing-status">{m.status}</em>}
                </div>
              ) : (
                <div className={`msg assistant${m.error ? " error" : ""}${m.pending ? " writing" : ""}`}>{m.content}</div>
              )}
              {m.res?.cards.map((c, j) => <CardRenderer key={j} card={c} />)}
              {m.res?.chart && <MiniChart chart={m.res.chart} />}
              {m.res && m.res.sources.length > 0 && (
                <button
                  className="link sources-btn"
                  onClick={() => setSheet({ sources: m.res!.sources, total: m.res!.sourcesTotal })}
                >
                  See {m.res.sourcesTotal ?? m.res.sources.length} transactions →
                </button>
              )}
              {i === lastAssistant && !busy && m.res && m.res.suggestions.length > 0 && (
                <div className="chips">
                  {m.res.suggestions.map((q) => (
                    <button key={q} className="chip" onClick={() => onAsk(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        <div ref={endRef} />
      </main>

      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your money…"
          enterKeyHint="send"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          ↑
        </button>
      </form>

      {sheet && <SourcesSheet sources={sheet.sources} total={sheet.total} onClose={() => setSheet(null)} />}
    </>
  );
}
