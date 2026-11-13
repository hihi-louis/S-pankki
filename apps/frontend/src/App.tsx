import { useState } from "react";
import { chat } from "./api";
import { ChatScreen } from "./screens/ChatScreen";
import type { ChatMsg } from "./screens/ChatScreen";
import { HomeScreen } from "./screens/HomeScreen";

type Tab = "home" | "chat";

// The host app (S-mobiili) passes the user in the URL: ?customer=CUST05020&tab=chat
const params = new URLSearchParams(window.location.search);
const CUSTOMER_ID = params.get("customer") ?? "CUST05020";
const START_TAB: Tab = params.get("tab") === "chat" ? "chat" : "home";

export default function App() {
  const [tab, setTab] = useState<Tab>(START_TAB);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(text: string) {
    if (busy) return;
    setTab("chat");
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await chat({ customerId: CUSTOMER_ID, message: text, history });
      setMessages((m) => [...m, { role: "assistant", content: res.answer, res }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Sorry, something went wrong. (${(err as Error).message})`, error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <span className="brand">Money Coach</span>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "home"} onClick={() => setTab("home")}>
            Overview
          </button>
          <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
            Ask
          </button>
        </nav>
      </header>
      {tab === "home" ? (
        <HomeScreen customerId={CUSTOMER_ID} onAsk={ask} />
      ) : (
        <ChatScreen messages={messages} busy={busy} onAsk={ask} />
      )}
    </div>
  );
}
