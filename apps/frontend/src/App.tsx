import { useState } from "react";
import { chat } from "./api";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const CUSTOMER_ID = "demo-1";

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.SyntheticEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await chat({ customerId: CUSTOMER_ID, message: text, history });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header">sbank coach</header>
      <main className="messages">
        {messages.length === 0 && <p className="empty">Ask me anything about your money.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.content}</div>
        ))}
        {busy && <div className="msg assistant">…</div>}
      </main>
      <form className="composer" onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message" />
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
