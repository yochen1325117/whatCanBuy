from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any

import requests

try:
    from zoneinfo import ZoneInfo
    from zoneinfo import ZoneInfoNotFoundError
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore[assignment]
    ZoneInfoNotFoundError = RuntimeError  # type: ignore[assignment]


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "public" / "data" / "latest.json"
LOOKBACK_DAYS = 14
REQUEST_TIMEOUT = 20
USER_AGENT = "whatCanBuy/0.1 (+https://github.com/yochen1325117/whatCanBuy)"

TWSE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"
TPEX_URL = (
    "https://www.tpex.org.tw/web/stock/aftertrading/"
    "otc_quotes_no1430/stk_wn1430_result.php"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FetchResult:
    records: list[dict[str, Any]]
    source_date: str | None


def now_taipei() -> datetime:
    if ZoneInfo is None:
        logger.warning("zoneinfo is unavailable; falling back to UTC+08:00")
        return datetime.now(timezone(timedelta(hours=8)))
    try:
        return datetime.now(ZoneInfo("Asia/Taipei"))
    except ZoneInfoNotFoundError:
        logger.warning("Asia/Taipei timezone data is unavailable; falling back to UTC+08:00")
        return datetime.now(timezone(timedelta(hours=8)))


def today_taipei() -> date:
    return now_taipei().date()


def strip_markup(value: Any) -> str:
    text = unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def parse_number(value: Any) -> float | None:
    text = strip_markup(value)
    text = text.replace(",", "").replace("－", "-").replace("−", "-")
    text = text.replace("+", "").strip()
    if not text or text in {"--", "-", "除權", "除息", "除權息"}:
        return None
    try:
        return float(text)
    except ValueError:
        logger.debug("Unable to parse number from %r", value)
        return None


def parse_integer(value: Any) -> int | None:
    number = parse_number(value)
    return None if number is None else int(number)


def parse_signed_change(sign_or_value: Any, value: Any | None = None) -> float | None:
    if value is None:
        text = strip_markup(sign_or_value)
        number = parse_number(text)
        if number is None:
            return None
        return -abs(number) if text.startswith(("-", "－", "−")) else number

    number = parse_number(value)
    if number is None:
        return None

    sign_text = strip_markup(sign_or_value)
    if any(mark in sign_text for mark in ("-", "－", "−")):
        return -abs(number)
    if "+" in sign_text:
        return abs(number)
    return number


def calculate_change_percent(close: float | None, change: float | None) -> float | None:
    if close is None or change is None:
        return None

    previous_close = close - change
    if previous_close == 0:
        return None

    return round((change / previous_close) * 100, 2)


def normalize_date(value: str | None, fallback: date) -> str:
    if not value:
        return fallback.isoformat()

    roc_match = re.search(r"(\d{2,3})[年/](\d{1,2})[月/](\d{1,2})", value)
    if roc_match:
        year = int(roc_match.group(1)) + 1911
        month = int(roc_match.group(2))
        day = int(roc_match.group(3))
        return date(year, month, day).isoformat()

    gregorian_match = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", value)
    if gregorian_match:
        year = int(gregorian_match.group(1))
        month = int(gregorian_match.group(2))
        day = int(gregorian_match.group(3))
        return date(year, month, day).isoformat()

    return fallback.isoformat()


def row_to_dict(fields: list[str], row: list[Any]) -> dict[str, Any]:
    normalized_fields = [strip_markup(field).replace(" ", "") for field in fields]
    return {
        field: row[index] if index < len(row) else None
        for index, field in enumerate(normalized_fields)
    }


def request_json(url: str, params: dict[str, str]) -> dict[str, Any]:
    response = requests.get(
        url,
        params=params,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    response.encoding = "utf-8"
    return response.json()


def fetch_twse_for_date(target_date: date) -> FetchResult:
    logger.info("Fetching TWSE listed stocks for %s", target_date.isoformat())
    payload = request_json(
        TWSE_URL,
        {
            "date": target_date.strftime("%Y%m%d"),
            "type": "ALLBUT0999",
            "response": "json",
        },
    )

    tables = payload.get("tables") or []
    stock_table = next(
        (
            table
            for table in tables
            if "每日收盤行情" in str(table.get("title", ""))
            and table.get("fields")
            and table.get("data")
        ),
        None,
    )

    if not stock_table:
        return FetchResult(records=[], source_date=None)

    source_date = normalize_date(str(stock_table.get("title", "")), target_date)
    fields = stock_table.get("fields") or []
    records: list[dict[str, Any]] = []

    for row in stock_table.get("data") or []:
        item = row_to_dict(fields, row)
        close = parse_number(item.get("收盤價"))
        change = parse_signed_change(item.get("漲跌(+/-)"), item.get("漲跌價差"))
        records.append(
            {
                "market": "TWSE",
                "code": strip_markup(item.get("證券代號")) or None,
                "name": strip_markup(item.get("證券名稱")) or None,
                "close": close,
                "change": change,
                "changePercent": calculate_change_percent(close, change),
                "volume": parse_integer(item.get("成交股數")),
                "date": source_date,
            }
        )

    return FetchResult(records=records, source_date=source_date)


def roc_date(target_date: date) -> str:
    return f"{target_date.year - 1911}/{target_date.month:02d}/{target_date.day:02d}"


def fetch_tpex_for_date(target_date: date) -> FetchResult:
    logger.info("Fetching TPEx OTC stocks for %s", target_date.isoformat())
    payload = request_json(
        TPEX_URL,
        {
            "d": roc_date(target_date),
            "l": "zh-tw",
            "o": "json",
            "se": "EW",
        },
    )

    tables = payload.get("tables") or []
    stock_table = next(
        (
            table
            for table in tables
            if table.get("fields") and table.get("data")
        ),
        None,
    )

    if not stock_table:
        return FetchResult(records=[], source_date=None)

    source_date = normalize_date(str(stock_table.get("date", "")), target_date)
    fields = stock_table.get("fields") or []
    records: list[dict[str, Any]] = []

    for row in stock_table.get("data") or []:
        item = row_to_dict(fields, row)
        close = parse_number(item.get("收盤"))
        change = parse_signed_change(item.get("漲跌"))
        records.append(
            {
                "market": "TPEX",
                "code": strip_markup(item.get("代號")) or None,
                "name": strip_markup(item.get("名稱")) or None,
                "close": close,
                "change": change,
                "changePercent": calculate_change_percent(close, change),
                "volume": parse_integer(item.get("成交股數")),
                "date": source_date,
            }
        )

    return FetchResult(records=records, source_date=source_date)


def fetch_latest(fetcher: Any, market: str, start_date: date) -> FetchResult:
    last_error: Exception | None = None
    for offset in range(LOOKBACK_DAYS):
        target_date = start_date - timedelta(days=offset)
        try:
            result = fetcher(target_date)
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("%s request failed for %s: %s", market, target_date, exc)
            continue
        except (ValueError, TypeError, KeyError) as exc:
            last_error = exc
            logger.warning("%s parse failed for %s: %s", market, target_date, exc)
            continue

        if result.records:
            logger.info(
                "%s returned %d records for %s",
                market,
                len(result.records),
                result.source_date or target_date.isoformat(),
            )
            return result

        logger.info("%s returned no records for %s", market, target_date.isoformat())

    if last_error:
        logger.error("%s failed after %d days: %s", market, LOOKBACK_DAYS, last_error)
    else:
        logger.error("%s returned no records in the last %d days", market, LOOKBACK_DAYS)
    return FetchResult(records=[], source_date=None)


def latest_data_date(source_dates: dict[str, str | None]) -> str | None:
    dates = [value for value in source_dates.values() if value]
    return max(dates) if dates else None


def write_latest(records: list[dict[str, Any]], source_dates: dict[str, str | None]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    updated_at = now_taipei().isoformat()
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": updated_at,
        "dataDate": latest_data_date(source_dates),
        "sources": {
            "TWSE": TWSE_URL,
            "TPEX": TPEX_URL,
        },
        "sourceDates": source_dates,
        "count": len(records),
        "data": records,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("Wrote %d records to %s", len(records), OUTPUT_PATH)


def main() -> None:
    start_date = today_taipei()
    logger.info("Starting stock data fetch from %s", start_date.isoformat())

    twse = fetch_latest(fetch_twse_for_date, "TWSE", start_date)
    tpex = fetch_latest(fetch_tpex_for_date, "TPEX", start_date)
    records = twse.records + tpex.records

    if not records:
        logger.warning("No stock records were fetched; writing an empty latest.json")

    write_latest(records, {"TWSE": twse.source_date, "TPEX": tpex.source_date})


if __name__ == "__main__":
    main()
