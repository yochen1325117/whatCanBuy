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
  updatedAt?: string;
  dataDate?: string;
  count?: number;
  data?: StockRecord[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      stocks: StockRecord[];
      updatedAt: string | null;
      dataDate: string | null;
    };

type SortKey =
  | "market"
  | "code"
  | "name"
  | "close"
  | "change"
  | "changePercent"
  | "volume";

type SortDirection = "asc" | "desc";

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

const numberFormatter = new Intl.NumberFormat("zh-TW");
const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const sortLabels: Record<SortKey, string> = {
  market: "市場",
  code: "股票代號",
  name: "股票名稱",
  close: "收盤價",
  change: "漲跌",
  changePercent: "漲跌幅",
  volume: "成交量",
};

const numericSortKeys = new Set<SortKey>([
  "close",
  "change",
  "changePercent",
  "volume",
]);

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

function compareText(a: string | null, b: string | null) {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  return a.localeCompare(b, "zh-Hant", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNumber(a: number | null, b: number | null) {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  return a - b;
}

function compareStocks(a: StockRecord, b: StockRecord, sort: SortState) {
  const multiplier = sort.direction === "asc" ? 1 : -1;
  const result = numericSortKeys.has(sort.key)
    ? compareNumber(a[sort.key] as number | null, b[sort.key] as number | null)
    : compareText(a[sort.key] as string | null, b[sort.key] as string | null);

  return result * multiplier;
}

function sortIndicator(sort: SortState, key: SortKey) {
  if (sort.key !== key) {
    return "↕";
  }

  return sort.direction === "asc" ? "↑" : "↓";
}

function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sort, setSort] = useState<SortState>({
    key: "code",
    direction: "asc",
  });

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
          updatedAt: payload.updatedAt ?? payload.generatedAt ?? null,
          dataDate: payload.dataDate ?? null,
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

  const sortedStocks = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return state.stocks
      .map((stock, index) => ({ stock, index }))
      .sort((a, b) => {
        const result = compareStocks(a.stock, b.stock, sort);
        return result === 0 ? a.index - b.index : result;
      })
      .map(({ stock }) => stock);
  }, [state, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function renderSortableHeader(key: SortKey, className?: string) {
    const direction =
      sort.key === key
        ? sort.direction === "asc"
          ? "ascending"
          : "descending"
        : "none";

    return (
      <th aria-sort={direction} className={className}>
        <button
          className="sort-button"
          onClick={() => toggleSort(key)}
          type="button"
        >
          <span>{sortLabels[key]}</span>
          <span aria-hidden="true" className="sort-indicator">
            {sortIndicator(sort, key)}
          </span>
        </button>
      </th>
    );
  }

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
              <span>最後更新時間：{formatDateTime(state.updatedAt)}</span>
              <span>資料日期：{state.dataDate ?? "-"}</span>
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
                      {renderSortableHeader("market")}
                      {renderSortableHeader("code")}
                      {renderSortableHeader("name")}
                      {renderSortableHeader("close", "numeric")}
                      {renderSortableHeader("change", "numeric")}
                      {renderSortableHeader("changePercent", "numeric")}
                      {renderSortableHeader("volume", "numeric")}
                      <th>日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStocks.map((stock, index) => (
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
