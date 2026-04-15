# Data, Legal & Cost Notes

Quick reference for the desk before we build. Not a legal opinion — route
through Macquarie Legal & Compliance before any external distribution.

---

## 1. Licences on the NASA Harvest side

Every repo reviewed (`crop-mask`, `cropharvest`, `openmapflow`, `presto`,
`galileo`, `glam-api`, `crop-maml`, `us-inseason-phenorm`, `dora`, `octvi`,
`timl`, `kenya-crop-mask`, `togo-crop-mask`) carries a **permissive licence
(MIT or similar)**. We can fork, modify, use internally, and use outputs
for proprietary trading.

**Action:** document every repo we depend on, pin to a Macquarie fork,
record licence text in a `THIRD_PARTY_LICENSES` file alongside the app.

---

## 2. Satellite data licences (this is where the risk lives)

### 2.1 Copernicus Sentinel-1 / Sentinel-2 / Sentinel-3
- Free and open, Copernicus-licensed. Commercial use **permitted**, including
  proprietary derivatives.
- **OK for trading alpha.**

### 2.2 NASA MODIS / Landsat / SMAP
- US Government data, public-domain-equivalent.
- **OK for trading alpha.**

### 2.3 Google Earth Engine (GEE)
- The easy path, but the licence matters. Two tiers:
  - **Non-commercial / research** — free, but explicitly **not for
    commercial use**. If we are using GEE-produced outputs to size a
    proprietary trade, that is almost certainly commercial use.
  - **Commercial** — paid tier. Pricing is usage-based; a mid-size desk
    workload lands in the low-to-mid five figures annually.
- **Action:** Legal must sign off on commercial tier before go-live; plan B
  is to self-host via AWS Open Data Sentinel/Landsat buckets + Sentinel Hub
  (commercial-friendly licence).

### 2.4 ERA5 climate (Copernicus Climate Data Store)
- Free for commercial use under the Copernicus licence. OK.

### 2.5 CHIRPS rainfall, SRTM elevation, Dynamic World landcover
- All permissive. OK.

### 2.6 Planet / Airbus / Maxar (if we ever add them)
- Commercial, expensive. Out of v1 scope.

**Bottom line:** the cheapest compliant stack is **self-hosted AWS Open
Data + Sentinel Hub + ECMWF** with Earth Engine only as a back-up. Slightly
more engineering, but avoids a legal cliff-edge.

---

## 3. Ground-truth data licences

### 3.1 `cropharvest` dataset
- MIT-licensed labels + satellite features pairings. OK for commercial.

### 3.2 USDA NASS CDL (Cropland Data Layer)
- US public-domain. OK.

### 3.3 EU EUCROPMAP
- CC-BY. OK with attribution.

### 3.4 Brazil MapBiomas
- CC-BY. OK with attribution.

### 3.5 Ukraine / Russia ag-ministry data
- No blanket licence. Scraping public PDFs for internal modelling is
  low-risk but should be reviewed given sanctions-adjacent considerations.

---

## 4. Fertilizer / commodity data (the other side)

These are **not** in the NASA Harvest stack — we wire them in from Macquarie's
existing subscriptions:
- **Argus Fertecon** — urea / UAN / ammonia / potash / phosphate prices.
- **CRU Nitrogen / Phosphates / Potash** — alternative price feed.
- **Platts Fertilizer** — alternative price feed.
- **Kpler** — seaborne vessel movements + fertilizer cargo tracking.
- **Baltic Exchange** — freight rates.
- **Refinitiv Eikon** — customs data (India, Brazil, China).
- **IFA IFASTAT** — country-level N/P/K consumption. Free tier adequate.
- **FAO FertiStat** — historical fertilizer use. Free.

All redistribution-restricted. The app shows these to entitled desk users
only; no external distribution without vendor sign-off.

---

## 5. Compute cost — back-of-envelope

### 5.1 First region (US Corn Belt) pilot
- GEE / Sentinel Hub: $0–$1.5 k depending on licence choice.
- GCP small VM (e4, 4 vCPU) running cron: ~$60/mo.
- Storage (DuckDB + parquet): <$10/mo.
- **Total: < $2 k for the 90-day pilot.**

### 5.2 Five-region production
- Sentinel Hub commercial or GEE commercial: $30–100 k/yr (choose lower).
- GCE VM: ~$150/mo.
- Storage: ~$50/mo.
- Engineer time: 1 FTE senior quant/ML + 0.25 FTE GIS engineer.
- **Total ex-headcount: $40–110 k/yr.**

### 5.3 Scaled global product
- Commercial satellite tier + commercial climate API + extra compute for
  daily full-global runs: $150–300 k/yr ex-headcount.
- Justified by P&L after year 1.

---

## 6. Compliance / governance checklist

Run through this before any NASA-Harvest-derived number is used to size a
live position:

- [ ] All NASA Harvest repos forked to internal Macquarie GitHub and pinned.
- [ ] Licences documented.
- [ ] Earth Engine tier confirmed (commercial if used for alpha).
- [ ] Sentinel Hub contract signed (if chosen as primary).
- [ ] Memo from Legal confirming the data-and-model chain is fit for
      proprietary trading.
- [ ] Model governance: signed off by Risk under the desk's model-inventory
      process. Versioned. Back-test report on file.
- [ ] Position tagging in OMS so P&L attribution is traceable.
- [ ] 90-day paper-trade period before live sizing.
- [ ] External distribution gate: no research note leaves the desk without
      compliance sign-off.

---

## 7. Known unknowns

1. **Whether GEE non-commercial is defensible for alpha generation.** We
   need a clear Legal view; default assumption is "no, use commercial or
   self-host."
2. **Kpler cargo-tracking data redistribution** inside the app — need
   vendor confirmation that internal desk access with price display is OK
   under existing contract.
3. **Russia-origin satellite labels** if we end up using any — sanctions
   review.
4. **Client-facing product down the line** triggers a separate compliance
   flow (research-publication rules, testimonial rules, jurisdictional
   distribution lists).
