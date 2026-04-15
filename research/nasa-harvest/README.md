# NASA Harvest — Macquarie Ags Desk Investigation

A working document for the ags analyst team. Purpose: map every publicly released
NASA Harvest tool to actionable trade ideas, and propose a lightweight in-house
app that times **planting seasons** and **urea (nitrogen) demand sinks** to the
flat price / freight / spread curves we already trade.

**Sibling docs in this folder:**
- [`repo-inventory.md`](repo-inventory.md) — every one of the 28 repos, scored.
- [`app-spec-planting-and-urea.md`](app-spec-planting-and-urea.md) — build spec for the lightweight app.
- [`trade-ideas.md`](trade-ideas.md) — additional achievable/impressive trade ideas.
- [`data-legal-costs.md`](data-legal-costs.md) — licensing, latency, costs, compliance.

---

## 1. TL;DR — what's actually there

NASA Harvest is the University-of-Maryland-led NASA consortium that publishes
satellite-derived agricultural monitoring tools. Their GitHub org
(`github.com/nasaharvest`) has **28 public repos, all MIT / permissive licensed**,
and the meaningful ones for us split into four buckets:

| Bucket | Key repos | What it gives Macquarie |
|---|---|---|
| **Cropland / crop-type mapping** | `crop-mask`, `cropharvest`, `openmapflow`, `crop-maml`, `kenya-crop-mask`, `us-inseason-phenorm`, `togo-crop-mask`, `croptype-mapping-gsn` | Nowcasted "where is corn vs soy vs wheat vs rice" at 10–30 m, including **in-season** before USDA / national stats publish. |
| **Foundation models** | `presto`, `galileo`, `timl` | Pretrained transformers on Sentinel-1/2/ERA5/SRTM. Free feature extractors — you fine-tune once for yield, phenology, fertilizer proxies with a few hundred labels. |
| **Global monitoring infra** | `glam-api`, `glam-processing`, `glam_data_processing`, `octvi` | Operational GLAM pipeline: NDVI, rainfall, soil moisture, ET at admin-unit granularity. Same feed the USDA FAS and GEOGLAM Crop Monitor run on. |
| **Adjacent**  | `yield`, `dora`, `street2sat`, `presto-embeddings`, `mlhub` | `yield` is an empty scaffold (placeholder); `dora` outlier ranking is useful for anomaly-triggered alerts; `street2sat` geolocates farmer photos — useful for ground-truth in Africa/LatAm desks. |

**Why this matters for P&L:** the ags markets we trade (CBOT corn/wheat/soy,
MATIF wheat/rapeseed, ICE canola/cotton/sugar/coffee/cocoa, Dalian corn, ASX
wheat, physical urea / ammonia / UAN, dry bulk C3/C5/P2A) all re-price around
**five publish events**: USDA WASDE, USDA NASS acreage/crop-progress, IGC, EU
MARS, and the GEOGLAM Crop Monitor. Every one of those agencies uses satellite
inputs that are in this repo set. **Running the same pipeline two to six weeks
ahead of their publish cycle is the alpha.**

---

## 2. The five signals worth the infra spend

Ranked by expected trade conversion, not by ML novelty.

### 2.1 Planted-acreage nowcast (late planting → late-March through July, by country)
- **Repos**: `us-inseason-phenorm` (US Corn Belt), `openmapflow` + `crop-mask` + `cropharvest` (anywhere else), `crop-maml` for low-label regions.
- **Edge**: USDA NASS Prospective Plantings drops end of March, Acreage end of June. Our model reads Sentinel-2 phenology curves in real time at 10 m. A mid-May read on IA/IL/IN can swing CBOT corn/soy 20–40¢.
- **Trade**: CBOT N/X corn-soy ratio, MATIF wheat-rapeseed, outright CZ corn calls around WASDE.

### 2.2 Crop condition / yield skew (in-season, every 5 days)
- **Repos**: `glam-api` NDVI + rainfall + soil-moisture feed, `presto`/`galileo` finetuned to yield with a 2–5 k label dataset from USDA NASS county yields + FAO for ROW.
- **Edge**: GLAM's own indicators are free but report at admin-1 (state/province); your finetuned model predicts at 10-m pixel. Compute yield-weighted national averages and compare to the consensus trade deck + Pro Farmer.
- **Trade**: Flat price; calendar spreads on CZ/CN; CME soy-oil vs ICE canola in OSR stress scenarios.

### 2.3 Planting-calendar & urea-demand map (the "app" section 3)
- See section 3 and [`app-spec-planting-and-urea.md`](app-spec-planting-and-urea.md).
- **Trade**: Physical urea differentials (Egypt vs Middle East FOB, CFR Brazil, CFR India), UAN/ammonia spreads, Trammo/Yara bilateral indications, dry-bulk handysize timing into US Gulf and Paranaguá.

### 2.4 Early-warning stress anomaly (heatwaves, droughts, floods, frost)
- **Repos**: `dora` outlier ranking on top of `glam-api` indicator stack.
- **Edge**: We already pay IHS/Gro/Planet for this — but their signals are often day-T+1 and not reproducible. Running it in-house gives you a **provable audit trail** for compliance + a 2–24 h lead because you don't wait for their publish cycle.
- **Trade**: Short-dated options around weather scares; ASX wheat during El Niño; MATIF rapeseed in French heat stress; India monsoon convexity in soy/palm/rice.

### 2.5 Ukraine / Russia / CIS black-box coverage
- **Repos**: `crop-maml` + `openmapflow`. Zero labelled data needed beyond a few hundred ground-truth points we can seed internally or scrape from Ukrainian ag-ministry PDFs.
- **Edge**: Since 2022, SovEcon / APK-Inform / UkrAgroConsult are the only public source — all of them paid, all of them political. Our own satellite-based Russian winter wheat condition map is defensible, reproducible, and Macquarie-only.
- **Trade**: MATIF wheat flat price, CBOT wheat–MATIF wheat arb, dry bulk Black Sea freight.

---

## 3. The lightweight app — planting seasons & urea sinks

**One-liner:** a single-page web app that shows, for every major agricultural
region on Earth, (a) the current planting / fertilizer-application window for
each N-heavy crop, and (b) the implied urea demand flow — "where the tonnes go."

### Why this is tractable
Two static reference datasets + one live satellite feed do 90 % of the work:

1. **Static — FAO/USDA planting calendars** (crop × region × start/peak/end week).
   Public, CSV, needs one cleanup pass.
2. **Static — Fertilizer-use intensity** (IFA / Our World in Data / USDA
   fertilizer-use surveys): kg N per ha by country × crop. Public.
3. **Live — `glam-api` NDVI + soil-moisture** to shift the planting window
   forward / backward in real time vs the FAO calendar baseline.

Multiplied together at country-crop grain and aggregated, you get a **weekly
nitrogen demand curve by destination port / river basin** — the urea sinks.

### Headline screens
1. **Global map** — colour-coded by "is a key N-demand crop being planted this
   week?". Click-through to country panel.
2. **Country panel** — phenology tape for each crop (planted → emerged →
   V6/flowering → harvest), overlaid with historical and *this-year nowcasted*
   N-application peaks, plus local urea price (FOB origin) and CFR landed price.
3. **Urea-sink ranking** — table of top-20 import destinations this week,
   ranked by implied N-tonne demand vs 5-yr seasonal average. Includes the
   price spread vs nearest export basis.
4. **Seasonality calendar** — one row per basin, heatmap of 52 weeks, shaded
   by intensity of N demand. Used to size fertilizer length / freight books.

Full spec in [`app-spec-planting-and-urea.md`](app-spec-planting-and-urea.md)
including stack (keep it FastAPI + React + DuckDB + a nightly cron pulling
`openmapflow`/`glam-api`), data schemas, KPIs, and the 4-week MVP build plan.

---

## 4. Monetisation playbook for Macquarie

Short version; full detail in [`trade-ideas.md`](trade-ideas.md).

### A. Flat-price and spread ideas on listed futures
1. **US corn / soy planted-acreage nowcast** into NASS Prospective Plantings
   and Acreage reports. Expected hit rate on direction: 65 %+ with 10 m
   satellite reads; position via CZ straddles and N/X ratio.
2. **Brazil safrinha corn** — the second crop is planted Jan–Mar and is the
   single biggest P&L driver on CBOT corn most years. NDVI-anomaly feed with
   `glam-api` + `crop-mask` is an edge vs CONAB.
3. **Indian monsoon Kharif** — urea sink + rice/cotton/soy position. Monitor
   IMD + GLAM rainfall anomalies; position CBOT soy, ICE cotton, freight.
4. **Russian/Ukrainian winter-wheat dormancy break** — `crop-maml` Sentinel-1
   backscatter for frost-kill. MATIF wheat.
5. **Argentine soy pod-fill stress** — Jan/Feb. `glam-api` ET deficit + LST.
   CBOT soy complex.

### B. Physical and paper fertilizer book
6. **CFR Brazil urea seasonality** — app section 3 tells you *before the
   price quotes update* when safrinha planting windows start shifting in MT /
   MS / GO. Position paper CFR Brazil urea against FOB Egypt / AG.
7. **India urea tenders** — IPL / RCF tender frequency tracks kharif/rabi
   planting. Size the urea length before tender announcements.
8. **US nitrogen stack arb** — UAN / ammonia / urea tons per planted acre
   of corn, sized off a real-time US Midwest planted-corn nowcast.
9. **EU nitrogen** — MATIF wheat-linked. French/German winter-wheat area
   plus top-dress window.

### C. Softs & adjacent
10. **Cocoa (Ivory Coast / Ghana)** — Harvest Africa focus region. Mid-crop /
    main-crop windows; `crop-maml` for cocoa area nowcast.
11. **Coffee (Brazil, Vietnam)** — frost / drought anomaly early warning.
12. **Cotton (US, India, Brazil)** — planted-acreage + boll-development.
13. **Palm (Indonesia, Malaysia)** — drought/ENSO stress into CPO and soy oil.
14. **Sugar (Brazil CS)** — cane yield nowcast into ICE No. 11.

### D. Cross-asset
15. **Commodity-currency FX overlay** — BRL / AUD / ARS / ZAR / RUB / UAH
    signals from the ag side.
16. **Dry-bulk freight** — Brazil + US Gulf grains exports drive C3/C5; our
    planted-acreage + harvest-progress nowcast is a leading indicator for
    cargo volumes.
17. **Ag-linked credit / equities** — Nutrien, CF, Yara, Mosaic, ADM, Bunge,
    Wilmar, JBS. A desk-level monthly note using our own numbers could
    anchor an analyst-driven credit trade or a cross-desk hand-off.

### E. Research / client-facing
18. **Weekly "Harvest Ground Truth" note** — 2-page internal PDF timed ahead
    of WASDE. Over time, build it into a client-facing product for corporate
    / ag hedger clients as a bundled service (Macquarie Ag Index style).
19. **Bespoke risk service for ag corporates** — insurance / crop-risk
    underwriting feed for CAT-linked and parametric products. Macquarie's
    structured-credit and commodities desks can jointly sell this.

---

## 5. Pragmatic next steps (30 / 60 / 90 days)

**Day 0–30 — Proof of concept on one region, one crop, one trade:**
- Spin up `openmapflow` + `presto` against US Corn Belt for the 2026 planting
  season (which starts now — mid-April).
- Back-test 10 m planted-corn estimates vs USDA NASS for 2019–2025.
- Generate one pre-NASS Acreage (28 June) internal note.
- **Cost:** < $2 k GCP + Earth Engine research tier + 1 quant's time.

**Day 30–60 — Build the planting-and-urea app (MVP):**
- Static calendar + GLAM indicators + urea-sink ranking.
- Screens 1 + 3 live; screens 2 + 4 stubbed.
- Delivered to desk as an internal URL. Daily cron.

**Day 60–90 — Scale to five priority regions:**
- US Corn Belt, Brazil (Safrinha + soy), Argentina (soy + corn), India (rice +
  wheat), Black Sea (wheat). Add Europe next.
- Integrate into desk's existing position / pricing tools.
- First client-facing teaser note for Macquarie ag-corporate coverage.

**Team size to do this realistically:** 1 senior quant + 1 GIS/ML engineer +
0.5 trader input. You do not need a full data science team. The repos do the
ML heavy lifting; the engineering work is pipeline, UI, and back-testing.

---

## 6. What NASA Harvest does not give you (set expectations)

- **No yield model out of the box.** The `yield` repo is a placeholder. You
  finetune `presto`/`galileo` on USDA/FAO historical yields yourself.
- **Coverage is biased to Africa + low-label regions.** For US/EU/LatAm,
  NASA Harvest is a toolkit, not a product. You build the country-specific
  models.
- **Latency is satellite-limited.** Sentinel-2 is ~5-day revisit with clouds;
  SAR (Sentinel-1) fills gaps but at coarser info content. The signal is
  ahead-of-consensus but not real-time.
- **Fertilizer application data** is not observed from space directly. The
  urea-sink logic relies on planting-window × fertilizer-use-intensity — not
  on literally seeing tractors spread urea. This is a model, not a
  measurement. The app should label it as such.
- **No commodity prices ship with any repo.** All price/freight data comes
  from Macquarie's existing Argus / Fertecon / Platts / CRU / Baltic feeds.

---

*Prepared for: Macquarie Agricultural Markets desk, analyst team.*
*Branch: `claude/nasa-harvest-ag-analysis-MxI9u`.*
