# What Can Buy

What Can Buy 是一個 Vite React TypeScript 專案，用來呈現台股資料儀表板。

這個專案的目標是透過 GitHub Actions 定期抓取台股資料，將整理後的 JSON
資料輸出到 `public/data/`，再由 GitHub Pages 部署前端儀表板。

## Project Structure

```text
src/                 React application source
scripts/             Data fetching and data preparation scripts
public/data/         Generated stock market JSON data
.github/workflows/   GitHub Actions for data refresh and Pages deploy
```

## Scripts

```bash
npm run dev
npm run build
npm run fetch:stocks
```

## GitHub Actions

- `fetch-stock-data.yml` 會在交易日排程執行資料抓取腳本，更新
  `public/data/tw-stock-summary.json`。
- `deploy-pages.yml` 會在 `main` 更新時建置 Vite app，並部署到 GitHub Pages。

目前 `scripts/fetch-twse-data.ts` 先放入資料輸出骨架，後續可以接上 TWSE/TPEX
資料來源與欄位轉換邏輯。
