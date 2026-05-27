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
} | null;

type ChangePercentFilterMode = "all" | "gte" | "lte";

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

function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-TW");
}

function matchesQuery(stock: StockRecord, query: string) {
  if (!query) {
    return true;
  }

  return (
    normalizeSearchText(stock.code).includes(query) ||
    normalizeSearchText(stock.name).includes(query)
  );
}

function matchesChangePercent(
  stock: StockRecord,
  mode: ChangePercentFilterMode,
  thresholdText: string,
) {
  if (mode === "all") {
    return true;
  }

  const threshold = Number.parseFloat(thresholdText);
  if (Number.isNaN(threshold)) {
    return true;
  }

  if (stock.changePercent == null) {
    return false;
  }

  return mode === "gte"
    ? stock.changePercent >= threshold
    : stock.changePercent <= threshold;
}

function compareNullable(a: string | number | null, b: string | number | null) {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  return null;
}

function compareText(a: string | null, b: string | null) {
  const nullableResult = compareNullable(a, b);
  if (nullableResult != null) {
    return nullableResult;
  }

  if (a == null || b == null) {
    return 0;
  }

  return a.localeCompare(b, "zh-Hant", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNumber(a: number | null, b: number | null) {
  const nullableResult = compareNullable(a, b);
  if (nullableResult != null) {
    return nullableResult;
  }

  if (a == null || b == null) {
    return 0;
  }

  return a - b;
}

function compareStocks(a: StockRecord, b: StockRecord, sort: NonNullable<SortState>) {
  const aValue = a[sort.key] as number | string | null;
  const bValue = b[sort.key] as number | string | null;
  const nullableResult = compareNullable(aValue, bValue);
  if (nullableResult != null) {
    return nullableResult;
  }

  const multiplier = sort.direction === "asc" ? 1 : -1;
  const result = numericSortKeys.has(sort.key)
    ? compareNumber(a[sort.key] as number | null, b[sort.key] as number | null)
    : compareText(a[sort.key] as string | null, b[sort.key] as string | null);

  return result * multiplier;
}

function sortIndicator(sort: SortState, key: SortKey) {
  if (!sort || sort.key !== key) {
    return "•";
  }

  return sort.direction === "asc" ? "↑" : "↓";
}

function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sort, setSort] = useState<SortState>(null);
  const [query, setQuery] = useState("");
  const [changePercentMode, setChangePercentMode] =
    useState<ChangePercentFilterMode>("all");
  const [changePercentThreshold, setChangePercentThreshold] = useState("");

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

  const filteredStocks = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const normalizedQuery = normalizeSearchText(query);
    return state.stocks.filter(
      (stock) =>
        matchesQuery(stock, normalizedQuery) &&
        matchesChangePercent(
          stock,
          changePercentMode,
          changePercentThreshold,
        ),
    );
  }, [state, query, changePercentMode, changePercentThreshold]);

  const marketCounts = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return Object.entries(
      filteredStocks.reduce<Record<string, number>>((counts, stock) => {
        const market = stock.market ?? "UNKNOWN";
        counts[market] = (counts[market] ?? 0) + 1;
        return counts;
      }, {}),
    );
  }, [state, filteredStocks]);

  const sortedStocks = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    if (!sort) {
      return filteredStocks;
    }

    return filteredStocks
      .map((stock, index) => ({ stock, index }))
      .sort((a, b) => {
        const result = compareStocks(a.stock, b.stock, sort);
        return result === 0 ? a.index - b.index : result;
      })
      .map(({ stock }) => stock);
  }, [state, filteredStocks, sort]);

  const hasActiveFilters =
    query.trim() !== "" ||
    (changePercentMode !== "all" && changePercentThreshold.trim() !== "");

  function resetFilters() {
    setQuery("");
    setChangePercentMode("all");
    setChangePercentThreshold("");
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }

      return null;
    });
  }

  function renderSortableHeader(key: SortKey, className?: string) {
    const direction =
      sort?.key === key
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
              <span>
                {formatNumber(sortedStocks.length)} /{" "}
                {formatNumber(state.stocks.length)} 檔證券
              </span>
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

            <section className="filter-bar" aria-label="篩選股票">
              <label className="filter-field">
                <span>搜尋</span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="代號或名稱"
                  type="search"
                  value={query}
                />
              </label>

              <label className="filter-field compact">
                <span>漲跌幅</span>
                <select
                  onChange={(event) =>
                    setChangePercentMode(
                      event.target.value as ChangePercentFilterMode,
                    )
                  }
                  value={changePercentMode}
                >
                  <option value="all">全部</option>
                  <option value="gte">大於等於</option>
                  <option value="lte">小於等於</option>
                </select>
              </label>

              <label className="filter-field compact">
                <span>百分比</span>
                <input
                  disabled={changePercentMode === "all"}
                  inputMode="decimal"
                  onChange={(event) =>
                    setChangePercentThreshold(event.target.value)
                  }
                  placeholder="+5 或 -5"
                  type="number"
                  value={changePercentThreshold}
                />
              </label>

              <button
                className="reset-button"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
                type="button"
              >
                重設
              </button>
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
                    {sortedStocks.length > 0 ? (
                      sortedStocks.map((stock, index) => (
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
                      ))
                    ) : (
                      <tr>
                        <td className="empty-cell" colSpan={8}>
                          沒有符合條件的資料
                        </td>
                      </tr>
                    )}
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
