# App Spec — "Planting & Urea Sinks"

**Working title:** `greenrow` (placeholder).
**One-liner:** Lightweight internal web app showing, for every major agricultural
region, the current planting / N-application window for each crop, and the
implied urea demand flow by import basin.

**Primary user:** Macquarie ags analyst on the fertilizer / grains desk.
**Cadence:** Daily refresh (overnight cron). Weekly-equivalent resolution.

---

## 1. The core data model

### 1.1 The three inputs

| # | Dataset | Type | Source | Refresh |
|---|---|---|---|---|
| A | **Crop planting calendar** — start / peak / end of planting, top-dress, and harvest windows by crop × admin-1 region | Static | USDA FAS Crop Explorer + FAO GIEWS + NASA Harvest `cropharvest` `planting_date` labels | Annual; rebuild in Q4 |
| B | **Fertilizer intensity** — kg N / ha by crop × country | Static | IFA IFASTAT + FAO FertiStat + USDA fert-use surveys + Our World in Data | Annual |
| C | **Real-time phenology shift** — how early/late is this year vs baseline (NDVI emergence, soil moisture, GDD) | Live | NASA Harvest `glam-api` + `presto` embeddings on Sentinel-2 composites + ERA5 GDD | Every 5 days |

### 1.2 The derived signal

```
N_demand(region, crop, week) =
    planted_area(region, crop)                         [ha, from crop-mask]
  * n_intensity(region, crop)                          [kg N/ha, from IFA]
  * application_share(region, crop, week)              [%, from calendar]
  * phenology_shift(region, crop, week, this_year)     [±days vs baseline]
  * urea_equivalent_factor(region, crop)               [share of N from urea vs UAN/ammonia/AN]
```

Aggregate up:
- `sum over crop` → total N demand per region per week.
- `sum over region within import basin` → N demand per **sink** (CFR India,
  CFR Brazil, CFR SE Asia, NOLA, ARAG, etc.).
- Divide by per-vessel tonnage → vessel-equivalent demand.

### 1.3 The six canonical urea sinks (starting scope)

1. **CFR Brazil** (Paranaguá, Santos, Rio Grande, Itaqui) — safrinha corn
   Jan–Mar, first-crop corn Sep–Nov, cane year-round.
2. **CFR India** (Kandla, Mumbai, Chennai, Visakhapatnam, Paradip) — kharif
   rice/cotton Jun–Aug, rabi wheat Nov–Feb.
3. **CFR SE Asia** (Thailand, Philippines, Vietnam, Indonesia) — paddy rice
   staggered by basin.
4. **NOLA / US Gulf inland** — spring corn Apr–May top-dress + side-dress.
5. **Euro-ARAG** — winter wheat top-dress Feb–Apr, spring cereals, OSR.
6. **China (domestic)** — harder because of export bans; model as a closed
   system and use net exports as residual.

Secondary: Mexico, Australia (wheat top-dress May–Jul), East Africa, Pakistan.

### 1.4 The fourth input (price) — external to the app

Urea price quotes and freight come from **Macquarie's existing Argus / Fertecon /
Platts / CRU / Baltic feeds**. The app consumes them via an internal REST
adapter — we do not redistribute. Screens that show prices are gated to
desk users with appropriate entitlements.

---

## 2. Screens

### 2.1 Global map (default landing)
Choropleth world map coloured by **"N-demand intensity this week vs 5-year
seasonal average."** Red = over-demanded, blue = under-demanded. Hover shows
country. Click opens country panel.

Toggles: crop filter (all / corn / wheat / rice / OSR / cotton / sugar);
week selector (past 52 weeks, forward 26 weeks using forecast).

### 2.2 Country / region panel
Per country: phenology tape for each crop, rendered as a horizontal Gantt:
- **Planting window** — baseline grey band, this-year teal band, the shift
  annotated in days.
- **N-application windows** (basal, top-dress 1, top-dress 2) — amber bands
  sized by kg N/ha applied in that window.
- **Harvest window** — brown band.
- Overlay: NDVI anomaly line + rainfall anomaly line from GLAM.

Side table: total N demand for this country this quarter, vs 5-yr mean,
vs urea import runs (if customs data available — we subscribe to Kpler /
Refinitiv Eikon; reuse existing feed).

### 2.3 Urea-sink ranking (the money screen)
Table, top-20 basins for the coming 4 weeks. Columns:
| Basin | N demand (kt) | vs 5y avg | Delta vs last week | CFR price | FOB origin | Implied margin | Vessel count needed | Alert |
|---|---|---|---|---|---|---|---|---|

Clicking a row expands the component crops × countries driving that basin's
demand. An "Alert" flag fires when N demand crosses a configurable z-score
threshold vs the 5-yr seasonal norm.

### 2.4 Seasonality heatmap
52-week × N-basin heatmap, average N demand intensity. Toggle to this-year
overlay vs baseline. The quick-glance screen a trader uses to size a
length/short book for the next quarter.

### 2.5 Admin / QA
Data lineage: which Sentinel scenes went into the latest phenology pass,
which FAO calendar version, which fert-intensity year. Every number on
every other screen is traceable to its inputs.

---

## 3. Tech stack (opinionated, lightweight)

```
┌────────────────┐      ┌──────────────┐      ┌────────────────┐
│  Nightly cron  │ ───▶ │   DuckDB     │ ◀─── │  FastAPI read  │
│  (Python)      │      │  (single file,│      │     API        │
│  + openmapflow │      │   versioned)  │      │                │
│  + glam-api    │      └──────────────┘      └────────┬───────┘
│  + IFA/FAO CSVs│                                     │
└────────────────┘                             ┌───────▼────────┐
                                               │  React + SWR   │
                                               │  + MapLibre GL │
                                               │  + Plotly/ECh. │
                                               └────────────────┘
```

- **Storage:** DuckDB file on a mounted Macquarie network share. Versioned
  by date. Smaller and faster than Postgres for this read-heavy, low-write
  shape. One parquet per week per crop/region.
- **Backend:** FastAPI, one process, ~10 endpoints. Serves JSON to the UI.
- **Pipeline:** A single Python service runs nightly:
  1. Pull this-week Sentinel-2 composite via Earth Engine for each priority
     region.
  2. Run `presto` encoder to get embeddings.
  3. Run cached crop-mask to restrict to cropland pixels.
  4. Compute NDVI emergence timing vs baseline → phenology_shift.
  5. Merge with static calendar + fert intensity.
  6. Write to DuckDB.
  7. Recompute urea-sink aggregations + alerts.
- **Frontend:** React (keep it simple — no Next.js / SSR; static build served
  by FastAPI). MapLibre GL for the choropleth. Plotly for the tapes.
- **Auth:** Macquarie SSO. Gate price-displaying screens to entitled users.
- **Compute:** One small GCE VM (e4) + Earth Engine batch; < $150/month.
- **Deployment:** Internal Macquarie cloud tenancy. Not internet-exposed.

The whole app is one git repo, one Dockerfile, one CI pipeline. A single
engineer can carry it.

---

## 4. MVP build plan (4 weeks, 1 engineer)

| Week | Deliverable |
|---|---|
| 1 | Pipeline skeleton + static datasets (calendar, fert intensity) loaded into DuckDB. Basic FastAPI serving country rollups. |
| 2 | `openmapflow` + `glam-api` ingestion for Brazil + US + India + Black Sea. `presto` encoder cached. |
| 3 | Screens 2.1 (global map) and 2.3 (sink ranking). Alert engine. |
| 4 | Screens 2.2 (country panel) and 2.4 (seasonality). Desk walkthrough. |

**Week 5–8 (post-MVP):** add SE Asia, EU, Argentina, palm/sugar/cotton;
formalise back-tests vs paper CFR Brazil urea and USDA fertilizer-use
surveys; wire into desk position system.

---

## 5. KPIs — how we know it's working

### Data-quality KPIs
- **Phenology nowcast error** vs USDA NASS Crop Progress (US), CONAB
  (Brazil), IMD (India) — target < 5 days MAE by crop × region.
- **Planted-acreage estimate error** vs USDA NASS Acreage — target < 3 %
  MAPE at state level.
- **N-demand estimate back-test** — implied quarterly imports vs Kpler
  customs data, target < 8 % error.

### Desk-impact KPIs
- **Count of trade ideas sourced from the app** per month.
- **P&L attribution** on positions tagged as "greenrow-informed".
- **Time-to-insight** on reactive events (e.g. Brazil drought alert) — target
  < 2 h from satellite imagery availability to desk Slack alert.
- **Client note pull-through** if we publish externally.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Earth Engine commercial licence cost / terms for internal trading alpha | Legal review up front. Alternative: AWS Open Data cube + self-hosted Sentinel catalogue. Budget for $30–100 k/yr GEE commercial as plan B. |
| Model is wrong and we lose money | Size trades as % of confidence band. First 90 days: paper-trade only. All positions tagged. |
| Data coverage gaps (clouds, SAR alignment) | `galileo` handles multi-modal; also keep MODIS fallback via `octvi`. |
| NASA Harvest drops / changes a dependency | We fork every Tier-1 repo to Macquarie-internal GitHub on day 1. |
| Compliance — using public science tools for proprietary alpha | Confirmed MIT / permissive licences; document derivation chain; internal memo. |
| Concentration of knowledge in one engineer | Pair with a second engineer by month 3; full runbook in repo. |

---

## 7. Out of scope (v1)

- Trade execution (connect to OMS later if signals prove out).
- Client distribution (internal only for 6 months minimum).
- Real-time streaming (5-day Sentinel-2 is enough; we are not a high-freq desk).
- Full NN retraining inside the app (offline, separate repo).
