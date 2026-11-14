import { useEffect, useState } from "react";
import type { CustomerProfile } from "@sbank/shared";
import { chatStream, getCustomer } from "./api";
import { clearCustomerId, loadCustomerId, saveCustomerId } from "./lib/session";
import { AvatarMenu } from "./components/AvatarMenu";
import { IconArrowLeft, IconChat } from "./components/Icons";
import { ChatScreen } from "./screens/ChatScreen";
import type { ChatMsg } from "./screens/ChatScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { ForecastScreen } from "./screens/ForecastScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { InsightStoryScreen } from "./screens/InsightStoryScreen";
import { LoginScreen } from "./screens/LoginScreen";
import type { Nav, Screen } from "./lib/nav";

type Tab = "home" | "chat";

// The host app (S-mobiili) can pass the user in the URL: ?customer=CUST05020&tab=chat. That skips the login screen.
const params = new URLSearchParams(window.location.search);
const URL_CUSTOMER = params.get("customer");
const START_TAB: Tab = params.get("tab") === "chat" ? "chat" : "home";
// URL first, then the last customer on this device
const START_ID = URL_CUSTOMER ?? loadCustomerId();

export default function App() {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [booting, setBooting] = useState(START_ID !== null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Restore the session and check the customer still exists.
  useEffect(() => {
    if (!START_ID) return;
    getCustomer(START_ID)
      .then(setCustomer)
      .catch((e: Error) => {
        clearCustomerId();
        setBootError(e.message);
      })
      .finally(() => setBooting(false));
  }, []);

  async function login(customerId: string) {
    const profile = await getCustomer(customerId);
    saveCustomerId(profile.customerId);
    setCustomer(profile);
  }

  function logout() {
    clearCustomerId();
    // Otherwise a ?customer= in the address bar would sign the same customer straight back in
    const url = new URL(window.location.href);
    url.searchParams.delete("customer");
    window.history.replaceState(null, "", url);
    setBootError(null);
    setCustomer(null);
  }

  if (booting) {
    return (
      <div className="app">
        <main className="login">
          <div className="skeleton" />
        </main>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="app">
        <LoginScreen onLogin={login} initialError={bootError} />
      </div>
    );
  }
  // key = customer: switching customer starts with a clean chat and fresh data
  return <Session key={customer.customerId} customer={customer} onLogout={logout} />;
}

function Session({ customer, onLogout }: { customer: CustomerProfile; onLogout: () => void }) {
  const customerId = customer.customerId;
  const [tab, setTab] = useState<Tab>(START_TAB);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(text: string) {
    if (busy) return;
    setTab("chat");
    const history = messages.map(({ role, content }) => ({ role, content }));
    // The assistant message exists from the start and fills in as the answer streams
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", pending: true, status: "Thinking…" }]);
    const patch = (fn: (last: ChatMsg) => ChatMsg) =>
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? fn(msg) : msg)));
    setBusy(true);
    try {
      const res = await chatStream(
        { customerId, message: text, history },
        {
          onStatus: (status) => patch((l) => ({ ...l, status })),
          onDelta: (d) => patch((l) => ({ ...l, content: l.content + d })),
          onReset: () => patch((l) => ({ ...l, content: "" })),
        },
      );
      patch(() => ({ role: "assistant", content: res.answer, res }));
    } catch (err) {
      patch(() => ({
        role: "assistant",
        content: `Sorry, something went wrong. (${(err as Error).message})`,
        error: true,
      }));
    } finally {
      setBusy(false);
    }
  }

  const nav: Nav = { open: setScreen, back: () => setScreen({ name: "home" }), ask: (text) => void ask(text) };

  return (
    <div className="app">
      <header className="header">
        {tab === "chat" ? (
          <>
            <button className="back-btn" aria-label="Back to overview" onClick={() => setTab("home")}>
              <IconArrowLeft />
            </button>
            <span className="header-title">Ask your coach</span>
          </>
        ) : (
          <span className="brand">S-Pankki</span>
        )}
        <AvatarMenu customerId={customerId} onLogout={onLogout} />
      </header>
      {tab === "home" ? (
        screen.name === "insight" ? (
          <InsightStoryScreen customerId={customerId} id={screen.id} nav={nav} />
        ) : screen.name === "category" ? (
          <CategoryScreen customerId={customerId} category={screen.category} nav={nav} />
        ) : screen.name === "forecast" ? (
          <ForecastScreen customerId={customerId} nav={nav} />
        ) : (
          <HomeScreen customerId={customerId} nav={nav} />
        )
      ) : (
        <ChatScreen
          customerId={customerId}
          greeting={`Hello, welcome ${customerId} to Personal Economic Trainer`}
          messages={messages}
          busy={busy}
          onAsk={ask}
        />
      )}
      {tab === "home" && (
        <button className="fab" onClick={() => setTab("chat")}>
          <IconChat />
          Ask the coach
        </button>
      )}
    </div>
  );
}
