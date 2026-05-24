import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type MarketSnapshot = {
  generatedAt: string;
  source: string;
  indices: Array<{
    name: string;
    value: number;
    change: number;
    changePercent: number;
  }>;
};

const fallbackSnapshot: MarketSnapshot = {
  generatedAt: "尚未更新",
  source: "public/data/tw-stock-summary.json",
  indices: [
    {
      name: "TAIEX",
      value: 0,
      change: 0,
      changePercent: 0,
    },
  ],
};

function App() {
  return (
    <main className="page-shell">
      <section className="dashboard">
        <header className="hero">
          <p className="eyebrow">Taiwan Stock Dashboard</p>
          <h1>What Can Buy</h1>
          <p>
            GitHub Actions 會定期抓取台股資料，輸出到 public/data，再由 GitHub
            Pages 顯示這個 React 儀表板。
          </p>
        </header>

        <section className="summary-grid" aria-label="Market summary">
          {fallbackSnapshot.indices.map((item) => (
            <article className="summary-card" key={item.name}>
              <span>{item.name}</span>
              <strong>{item.value || "等待資料"}</strong>
              <small>
                {item.change >= 0 ? "+" : ""}
                {item.change} ({item.changePercent}%)
              </small>
            </article>
          ))}
        </section>

        <footer className="status-line">
          Last generated: {fallbackSnapshot.generatedAt} · Source:{" "}
          {fallbackSnapshot.source}
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
