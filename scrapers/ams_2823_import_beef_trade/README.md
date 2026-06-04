# AMS_2823 "Import Beef Trade" — Beef Trim (0-15 Days) scraper

Standalone scraper that extracts the **Beef Trim, 0-15 Days** price series from
USDA AMS Market News report **AMS_2823**.

> Note: this directory is unrelated to the duckGammon app in the rest of this
> repo. It is a self-contained data-collection script with no shared dependencies.

## The report

| | |
|---|---|
| AMS report number | **AMS_2823** |
| Official title | **Import Beef Trade** |
| Internal slug | **NW_LS421** |
| Office | USDA Market News, Des Moines, IA |
| Content | Prices for **imported** beef trimmings (and other cuts), by origin, trim grade, and delivery window |

The report groups prices by **origin** (Australia & New Zealand, Uruguay), then by
product/grade. Beef Trim is quoted at grades **85, 80, 75, 70, 65%**, under two
delivery windows — **0-15 Days** and **16-45 Days** — with East Coast / West Coast
sub-columns. This scraper keeps **only the 0-15 Days window**, across every origin
and grade.

## Data source

Pre-2024 reports are published as **plain-text files** in the ESMIS archive:

- Listing: <https://esmis.nal.usda.gov/publication/import-beef-trade>
- Each release links a `NW_LS421.TXT` file at a **content-addressed** URL, e.g.
  `https://esmis.nal.usda.gov/sites/default/release-files/<hash>/<hash>/<hash>/NW_LS421.TXT`

No API key is required. Because the per-release URLs are unguessable hashes, the
scraper **walks the paginated listing** to discover them rather than constructing URLs.

The report switched to a **PDF-only, weekly** format on **April 28, 2023**, so the
text archive — and therefore this dataset — runs from **Nov 2018 through Apr 2023**.
That covers the "years before 2024" the text files provide.

## Usage

```bash
node scrape.mjs
```

Requires Node 18+ (uses the built-in global `fetch`; no npm dependencies). Writes
`ams_2823_beef_trim_0-15days.csv` next to the script and prints a run summary.

## Output: `ams_2823_beef_trim_0-15days.csv`

One row per (report date × origin × trim grade × coast). Grades that were quoted
but had no trades that day are kept with blank prices.

| column | description |
|---|---|
| `report_date` | ISO date of the report (`YYYY-MM-DD`) |
| `origin` | `AUSTRALIA AND NEW ZEALAND`, `URUGUAY`, … (as labeled in the report) |
| `product` | always `Beef Trim` |
| `trim_pct` | trim/lean grade: `85`, `80`, `75`, `70`, `65` |
| `delivery` | always `0-15 Days` |
| `region` | `East Coast` / `West Coast` for Australia & NZ; blank where the report shows no coast split (e.g. Uruguay) |
| `price_low` | low end of the quoted range (blank if no trade) |
| `price_high` | high end of the quoted range (blank if no trade) |
| `unit` | `USD/cwt` (equivalently US cents per pound) |
| `basis` | `FOB/TIS` (free-on-board / through-in-store, as stated in the report) |
| `source_url` | the exact TXT release the row was parsed from |

### Latest snapshot

- Archive pages walked: 47
- Releases parsed: 460 (0 fetch failures, 0 missing dates)
- Date range: **2018-11-21 → 2023-04-21**
- Rows: 3,681 (582 with prices, the rest quoted-but-no-trade)

## Parsing notes

- Report date is read from the header line (e.g. `… Wed, Sep 22, 2021 …`).
- The parser is a small state machine that tracks the current origin and delivery
  window. Australia & NZ stack the `0-15 Days` and `16-45 Days` blocks (columns =
  East/West coast); Uruguay places the two windows side by side as columns. In both
  cases only the 0-15 Days figures are emitted; 16-45 Days is ignored.
- It anchors on the `Beef Trim NN%` row text and numeric ranges rather than fixed
  column offsets, so it tolerates the minor layout differences across years.
