import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type StockRecord = {
  market: string | null;
  code: string | null;
  name: string | null;
  close: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  date: string | null;
};

type LatestData = {
  generatedAt?: string;
  count?: number;
  data?: StockRecord[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stocks: StockRecord[]; generatedAt: string | null };

const numberFormatter = new Intl.NumberFormat("zh-TW");
const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatNumber(value: number | null | undefined) {
  return value == null ? "-" : numberFormatter.format(value);
}

function formatPrice(value: number | null | undefined) {
  return value == null ? "-" : priceFormatter.format(value);
}

function formatChange(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${priceFormatter.format(value)}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${priceFormatter.format(value)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
}

function changeClass(value: number | null | undefined) {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadStocks() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/latest.json`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`資料讀取失敗 (${response.status})`);
        }

        const payload = (await response.json()) as LatestData;
        setState({
          status: "ready",
          stocks: Array.isArray(payload.data) ? payload.data : [],
          generatedAt: payload.generatedAt ?? null,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "資料讀取失敗",
        });
      }
    }

    loadStocks();

    return () => controller.abort();
  }, []);

  const marketCounts = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return Object.entries(
      state.stocks.reduce<Record<string, number>>((counts, stock) => {
        const market = stock.market ?? "UNKNOWN";
        counts[market] = (counts[market] ?? 0) + 1;
        return counts;
      }, {}),
    );
  }, [state]);

  return (
    <main className="page-shell">
      <section className="dashboard">
        <header className="page-header">
          <div>
            <p className="eyebrow">Taiwan Stock Dashboard</p>
            <h1>台股資料儀表板</h1>
          </div>
          {state.status === "ready" ? (
            <div className="header-meta" aria-label="資料摘要">
              <span>{formatNumber(state.stocks.length)} 檔證券</span>
              <span>更新：{formatDateTime(state.generatedAt)}</span>
            </div>
          ) : null}
        </header>

        {state.status === "loading" ? (
          <section className="state-panel" aria-live="polite">
            <div className="loading-dot" aria-hidden="true" />
            <p>資料載入中...</p>
          </section>
        ) : null}

        {state.status === "error" ? (
          <section className="state-panel error-panel" role="alert">
            <strong>無法載入股票資料</strong>
            <p>{state.message}</p>
          </section>
        ) : null}

        {state.status === "ready" ? (
          <>
            <section className="summary-strip" aria-label="市場統計">
              {marketCounts.map(([market, count]) => (
                <div className="summary-item" key={market}>
                  <span>{market}</span>
                  <strong>{formatNumber(count)}</strong>
                </div>
              ))}
            </section>

            <section className="table-panel" aria-label="股票表格">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>市場</th>
                      <th>股票代號</th>
                      <th>股票名稱</th>
                      <th className="numeric">收盤價</th>
                      <th className="numeric">漲跌</th>
                      <th className="numeric">漲跌幅</th>
                      <th className="numeric">成交量</th>
                      <th>日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.stocks.map((stock, index) => (
                      <tr key={`${stock.market}-${stock.code}-${index}`}>
                        <td>{stock.market ?? "-"}</td>
                        <td className="code">{stock.code ?? "-"}</td>
                        <td>{stock.name ?? "-"}</td>
                        <td className="numeric">{formatPrice(stock.close)}</td>
                        <td className={`numeric ${changeClass(stock.change)}`}>
                          {formatChange(stock.change)}
                        </td>
                        <td
                          className={`numeric ${changeClass(stock.changePercent)}`}
                        >
                          {formatPercent(stock.changePercent)}
                        </td>
                        <td className="numeric">{formatNumber(stock.volume)}</td>
                        <td>{stock.date ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
