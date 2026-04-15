# Trade-Idea Menu — Achievable, Impressive, Backable with NASA-Harvest-Derived Signals

For the Macquarie ags desk. Ordered by combined (a) conversion to listed/OTC
P&L, (b) time-to-first-trade, and (c) defensibility vs competing desks running
Gro / Planet / Kayrros. Every idea lists the **NASA Harvest repo** that
produces the edge.

Price/freight feeds come from Macquarie's existing subscriptions (Argus
Fertecon, CRU, Platts, Baltic, Kpler, Refinitiv Eikon). We are not
redistributing them.

---

## Tier A — fast, high-P&L, low-build

### A1. US Corn Belt planted-acreage nowcast → CBOT corn/soy
- **Repos:** `us-inseason-phenorm`, `openmapflow`, `presto`.
- **Signal:** Weekly 10 m planted-corn vs planted-soy estimate across
  IA/IL/IN/NE/MN/OH from 1 May through late June.
- **Events:** USDA NASS Prospective Plantings (31 March),
  Planting Progress (weekly, Mondays), Acreage (30 June), WASDE (monthly).
- **Trades:** CZ / SX outrights, CN/CZ calendar, N/X corn-soy ratio,
  options around the June Acreage report.
- **Time-to-first-trade:** 4–6 weeks (back-test 2019–2025 first).
- **Size:** Mid-size; this is the single most-researched ag signal on earth
  so margin of edge is small. Compensate with volume and timing discipline.

### A2. Brazil safrinha corn condition → CBOT corn + CFR Brazil urea
- **Repos:** `glam-api`, `crop-mask`, `crop-maml` for MT/MS/GO/PR.
- **Signal:** Weekly NDVI + rainfall + GDD anomaly on safrinha-corn pixels
  Feb–May. Yield skew forecast vs CONAB baseline.
- **Trade A:** CBOT corn flat price + CN spreads in Feb–Apr.
- **Trade B (cross-sell):** Our planting-window app flags when safrinha
  area grows → more urea top-dress → size long CFR Brazil urea paper.
- **Time-to-first-trade:** 6 weeks.

### A3. India monsoon + kharif → CBOT soy, ICE cotton, CFR India urea
- **Repos:** `glam-api` (IMD rainfall + SMAP soil moisture), `crop-maml`.
- **Signal:** Monsoon onset timing + southwest progression; cumulative
  rainfall anomaly by district; soil moisture state before sowing window.
  Outputs: (i) kharif planted-area nowcast; (ii) implied urea tender size.
- **Trade A:** CBOT soy, CBOT soybean oil, palm via Bursa, ICE cotton.
- **Trade B:** Size urea length ahead of IPL / RCF tenders.
- **Time-to-first-trade:** 8 weeks (India pipeline slower due to cloud cover;
  need SAR fusion).

### A4. Black Sea wheat — winter dormancy + spring green-up
- **Repos:** `crop-maml` for low-label Russian/Ukrainian coverage, `glam-api`
  for temperature + soil moisture, `presto` for Sentinel-1 backscatter
  (SAR is key — Ukraine/Russia both cloudy in late winter).
- **Signal:** Winter-wheat dormancy-break timing + frost-kill probability +
  spring biomass accumulation vs 5-yr baseline.
- **Trade:** MATIF wheat, CBOT wheat, CBOT-MATIF arb, Black Sea dry-bulk
  freight.
- **Time-to-first-trade:** 10 weeks (hard; politically sensitive region).
- **Defensibility:** Highest on this list. SovEcon / APK-Inform / UkrAgroConsult
  are our only competition and their reads are paid, infrequent, and
  occasionally political. Our own feed is a moat.

### A5. Argentina soy pod-fill stress → CBOT soy complex
- **Repos:** `glam-api` ET deficit + LST, `presto` for crop-specific
  condition.
- **Signal:** Jan–Feb stress anomaly on BA / Córdoba / Santa Fe soy pixels.
- **Trade:** CBOT soy, soymeal / soyoil crush.
- **Time-to-first-trade:** 6 weeks.

---

## Tier B — Fertilizer / N-focused

### B1. CFR India urea tender sizing
- **Input from app:** pre-tender N-demand nowcast from kharif/rabi planting
  window × area × fert intensity.
- **Trade:** Paper CFR India urea vs FOB Arab Gulf / Egypt; size the length
  ahead of tender calls.

### B2. CFR Brazil urea seasonality vs safrinha planting shift
- **Input from app:** real-time phenology shift on MT/MS/GO first and second
  crop corn moves the urea application peak by ±1–3 weeks.
- **Trade:** Paper CFR Brazil urea vs FOB Egypt / AG / Baltic; dry-bulk
  handysize timing Paranaguá / Santos.

### B3. US nitrogen stack (UAN / ammonia / urea) arb
- **Input:** US Corn Belt planted-corn nowcast (A1) × regional N-mix by state
  (UAN in IA/IL, anhydrous ammonia in NE, urea elsewhere).
- **Trade:** Urea NOLA barge vs UAN NOLA vs Tampa ammonia spreads.

### B4. EU winter-wheat top-dress timing
- **Input:** France/Germany/Poland winter wheat green-up + GDD accumulation
  → top-dress 1 and top-dress 2 windows.
- **Trade:** ARAG urea / AN / CAN; MATIF wheat cross.

### B5. Egypt urea tender arb
- **Signal:** Egyptian (EBIC / Helwan) urea FOB prices tend to anchor global
  benchmarks. Our global N-demand map predicts net export call on Egypt vs
  AG vs Baltic.
- **Trade:** Basis spreads between the three origins; dry-bulk aframax
  implications.

### B6. Potash / phosphate cross-sell (future)
- Same skeleton extended to K and P application windows. More complex — P
  and K are basal (pre-plant) so the planting-calendar signal is tighter
  than for N.

---

## Tier C — Softs

### C1. West Africa cocoa area & condition
- **Repos:** `crop-maml` for cocoa plantation area (sparse labels), `glam-api`
  for rainfall + temperature on CI + Ghana.
- **Signal:** Main-crop + mid-crop output skew.
- **Trade:** ICE cocoa.
- **Note:** Cocoa is brutal on the short side after 2023–2024; size
  accordingly.

### C2. Brazil + Vietnam coffee frost / drought
- **Repos:** `dora` + `glam-api`.
- **Signal:** MG / ES / SP frost LST anomaly June–August; Vietnam Central
  Highlands drought.
- **Trade:** ICE arabica / robusta, short-dated calls in Brazilian winter.

### C3. Cotton (US / India / Brazil)
- **Repos:** `openmapflow` + `glam-api`.
- **Trade:** ICE cotton flat + spreads; some crossover with N-demand model.

### C4. CS Brazil sugar cane yield
- **Repos:** `glam-api` + custom cane model via `presto` finetune.
- **Signal:** Harvest-season ATR / sucrose content proxies from spectral
  indices. Cane area tracked separately.
- **Trade:** ICE No. 11 sugar, ethanol crush, Brazil hydrous vs anhydrous.

### C5. Indonesia / Malaysia palm + ENSO
- **Repos:** `glam-api` (ENSO-forced rainfall / drought proxies).
- **Trade:** Bursa CPO, crossover into CBOT soyoil and canola.

---

## Tier D — Cross-asset

### D1. Ag-currency overlay
- BRL, ARS, AUD, ZAR, RUB, UAH all have ag-export dependencies. Our crop
  nowcasts feed a FX overlay book — sized modestly, used as hedge /
  enhancement on the ag position.

### D2. Dry-bulk freight
- Good crop + strong export → C3 (Tubarão–Qingdao) + C5 (W Australia–China)
  + P2A (Atlantic Panamax) bid.
- Build freight signal from the planted-acreage × expected yield × export
  share model.

### D3. Ag-corporate credit / equities
- Nutrien, CF Industries, Yara, Mosaic, ICL, Incitec (for N/P/K exposure).
- ADM, Bunge, Cargill (COFCO via HK / Viterra), Wilmar, JBS, Minerva
  (processor exposure).
- Monthly note with our crop / fert reads feeds into cross-desk credit /
  equity calls — at Macquarie this is a valuable internal handoff even
  before any external product.

### D4. Insurance / parametric ag risk
- Macquarie has a structured-credit ag insurance book (sovereign
  food-security, crop-insurance reinsurance). Our condition + anomaly feed
  is a natural input to pricing and portfolio monitoring. Speak to the
  risk-solutions team early.

---

## Tier E — Client-facing research product

### E1. "Harvest Ground Truth" weekly note
- 2 pages, internal first, distribute to key ag clients after 6 months of
  desk-only validation.
- Anchors: a named view per region + one call to action.
- Frequency: weekly from planting through harvest, monthly in dormancy.

### E2. Desk-branded dashboards for key corporate-coverage clients
- Give our top 10 ag-corporate hedging clients a locked view of the
  planting-and-urea app (no derivative trades, no alpha signals — just
  condition indicators tied to their own book). Cheap relationship builder,
  hard for competitors to replicate without matching the stack.

### E3. Macquarie Ag Condition Index (aspirational, 12–18 months)
- A published, branded, dated monthly index — "MAI-Corn", "MAI-Wheat",
  "MAI-Soy", "MAI-N". Becomes the Macquarie equivalent of a Gro or ING
  commodity outlook. Takes time but is the biggest moat.

---

## Ranking matrix

| Idea | Build weeks | Conviction | Estimated annualised P&L (indicative, single-trader book) | Moat |
|---|---|---|---|---|
| A1 US corn/soy | 4–6 | High | Medium | Low–med (crowded) |
| A2 Safrinha | 6 | High | Medium–high | Medium |
| A3 India monsoon | 8 | Med | Medium–high | Medium |
| A4 Black Sea wheat | 10 | Med–high | Medium | **High** |
| A5 Arg soy | 6 | Med | Medium | Medium |
| B1 India urea | 4 (after A3) | High | Medium | High (fewer competitors in this niche vs grain desks) |
| B2 Brazil urea | 4 (after A2) | High | Medium | High |
| C1 Cocoa | 10 | Med | Small | **High** |
| D4 Insurance | 12 | — | Cross-desk P&L | **High** |
| E1 Research note | 2 (ongoing) | — | Relationship | Low |

Indicative P&L estimates are placeholders — replace with desk-specific
backtest numbers once the signals are live.

---

## Bottom-line recommendation

**Start with A1 + B2** (US Corn Belt + Brazil urea). Smallest build, biggest
two trades on the planet for our desk, exercises every layer of the
pipeline. If those two produce clean backtests, scale to A2/A3/A4 and the
fertilizer book B1/B3/B4 in parallel. Everything else defers.
