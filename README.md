# What Can Buy

What Can Buy is a Vite React TypeScript dashboard for browsing Taiwan stock
market data. GitHub Actions can refresh the generated JSON data, and GitHub
Pages can publish the built dashboard.

## Local Development

Install Node dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Build the production app:

```bash
npm run build
```

## Manual Data Fetch

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Fetch the latest stock data:

```bash
python scripts/fetch_stock.py
```

The script writes the normalized data to `public/data/latest.json`.

## GitHub Actions

- `.github/workflows/update-data.yml`
  - Runs every day at UTC 00:00 and UTC 07:00, which is Taiwan time 08:00
    and 15:00.
  - Can also be started manually with `workflow_dispatch`.
  - Installs Python dependencies, runs `scripts/fetch_stock.py`, and commits
    `public/data/latest.json` when the data changes.
  - Triggers `.github/workflows/deploy-pages.yml` after committing updated data.
- `.github/workflows/deploy-pages.yml`
  - Runs when `main` receives a push.
  - Can also be started manually with `workflow_dispatch`.
  - Installs Node.js dependencies with `npm ci`.
  - Builds the app with `npm run build`.
  - Deploys the generated `dist/` directory to GitHub Pages using the official
    GitHub Pages Actions.

## GitHub Pages Setup

In the GitHub repository:

1. Open Repository Settings.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Save the setting.

After this, pushes to `main` will trigger `.github/workflows/deploy-pages.yml`
and publish the dashboard.

## Data Sources

The data fetcher uses official public data endpoints first:

- TWSE listed stock data: `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX`
- TPEx OTC stock data:
  `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php`

Each stock record in `public/data/latest.json` includes:

- `market`
- `code`
- `name`
- `close`
- `change`
- `changePercent`
- `volume`
- `date`

The top-level data payload also includes `updatedAt` in Taiwan time and
`dataDate` for the stock data date.

If a field cannot be parsed from the source data, the fetcher writes `null`
instead of failing the whole run.
