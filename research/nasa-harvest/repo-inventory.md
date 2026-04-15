# NASA Harvest GitHub Org — Repo-by-Repo Inventory

Source: `github.com/nasaharvest` (28 public repos, all MIT / permissive).
Investigated April 2026. **Trade-relevance score: ★★★ high, ★★ useful, ★ tangential.**

---

## Tier 1 — High trade relevance

### 1. `crop-mask` ★★★  (114⭐, Jupyter)
**What.** End-to-end pipeline to produce high-resolution cropland / non-cropland
maps. Two networks: a pixel classifier + a 12-month multi-spectral image
forecaster. Published maps on Google Earth Engine (GEE) + Zenodo.

**For us.** The skeleton for every cropland nowcast we would run. Public
trained examples so far: Kenya, Busia. For US/Brazil/Ukraine, you bring your
own labels (cheap — `cropharvest` + USDA CDL / MapBiomas / EUCROPMAP give you
millions for free).

**Trade hook.** Planted-acreage nowcast before USDA NASS / CONAB / Rosstat.

---

### 2. `cropharvest` ★★★  (231⭐, Jupyter)
**What.** 95,186 labelled geo-points worldwide, 21 source datasets merged.
74 % have matched Sentinel-1/2 + ERA5 + SRTM time-series. 35 % carry
crop-type labels (the rest binary crop/non-crop). Every label has
`planting_date` and `harvest_date` fields.

**For us.** The single most valuable free asset in the org. Those planting and
harvest dates power the **urea-sink app directly** — they are ground-truth for
calibrating the FAO planting calendar we use as the baseline. Also the
cleanest benchmark for any in-house crop-type classifier.

**Trade hook.** Training set for every downstream model. Phenology calibration.

---

### 3. `openmapflow` ★★★  (82⭐, Python)
**What.** Framework that productionises `crop-mask` — spin up a GitHub-Actions
CI/CD pipeline, labelled data loaded from GEE, model trained, inference map
deployed. Built on top of Earth Engine + GCP.

**For us.** The "paved road" to ship a country-specific crop nowcast in days.
Avoids reinventing the data pipeline. Dependency: we need a GCP project with
billing + an Earth Engine research/commercial licence. GEE commercial pricing
is a five-figure annual; research is free but not allowed for internal trading
alpha — legal review required (see `data-legal-costs.md`).

**Trade hook.** Turnkey country pipelines. First deployment: US Corn Belt.

---

### 4. `presto` ★★★  (267⭐, Jupyter)
**What.** Lightweight pretrained transformer for Sentinel-1/2/ERA5/SRTM/Dynamic
World time-series. ~0.4 M params. Ships a single-file inference module
(`single_file_presto.py`) and `Presto.load_pretrained()` works out of the box.

**For us.** The feature extractor. Replace hand-crafted NDVI / EVI / LAI
stacks with Presto embeddings → fine-tune a small head for our specific
tasks (yield, planting window shift, N-uptake proxy). Fast on CPU at
production scale.

**Trade hook.** The encoder behind the yield and planted-acreage models.

---

### 5. `galileo` ★★★  (179⭐, Python)
**What.** Newer (2025) family of pretrained remote-sensing models. Multiple
sizes hosted on HuggingFace (`nasaharvest/galileo`). Multi-modal: optical,
SAR, time bands. Supports "global and local features."

**For us.** The upgrade path from Presto when we need more capacity (e.g.
full-resolution 10 m per-pixel yield). A/B vs Presto on the same task. Heavier
compute; justify by back-tested P&L.

**Trade hook.** Larger-capacity replacement for Presto on alpha-critical
models.

---

### 6. `us-inseason-phenorm` ★★★  (2⭐, Python)
**What.** Phenology-normalised in-season crop-type mapping for US Corn Belt.
Exactly what the name says: classifies corn vs soy vs "other" **during the
growing season**, before harvest.

**For us.** Directly relevant: pre-NASS acreage trade. Low stars because it's
academic-only, but the code is the methodology for the most-traded regional
ag signal on Earth. Worth a focused clone + back-test against NASS 2019–2025.

**Trade hook.** CBOT corn / soy acreage nowcast.

---

### 7. `glam-api` + `glam-processing` + `glam_data_processing` + `octvi` ★★★  (combined)
**What.** Django backend / ingestion pipeline / Python utilities for the
NASA–UMD GLAM (Global Agriculture Monitoring) system. Serves NDVI, rainfall,
soil moisture, ET, LST at admin-unit granularity, same data behind GEOGLAM
Crop Monitor. `octvi` composits MODIS NDVI at 8-day cadence.

**For us.** The indicators stack. You do not need to re-implement NDVI /
rainfall / soil-moisture anomalies — this code already does it and conforms
to the USDA FAS workflow. The caveat is the public GLAM *endpoint* has
admin-1 granularity; field-level detail requires running the pipeline
ourselves on the underlying MODIS / Sentinel / ERA5 / SMAP / CHIRPS feeds.

**Trade hook.** Anomaly triggers → short-dated options; weekly condition
narrative backing desk calls.

---

## Tier 2 — Useful but specialised

### 8. `crop-maml` ★★  (20⭐, Python)
**What.** Meta-learning to build crop-type classifiers from sparse labels
(CVPR 2021). Designed for regions with tens–hundreds of ground-truth points.

**For us.** The answer for **Russia, Ukraine, Argentina, parts of Africa**
where labelled data is scarce or politically gated. You can bootstrap a
Russian winter-wheat classifier from ~200 labels we source internally.

**Trade hook.** Black Sea wheat nowcast; LatAm second-crop area.

---

### 9. `kenya-crop-mask` ★★  (26⭐, Python)
**What.** Finished example: annual + in-season cropland mapping for Kenya.

**For us.** Reference implementation. Handy for the emerging-markets ag
team when selling consulting / advisory into African sovereign-risk and
food-security customers.

---

### 10. `togo-crop-mask` ★★  (32⭐, Python)
**What.** LSTM-based crop mask for Togo (the original 2020 NASA Harvest
paper). Historical but instructive.

**For us.** Pedagogical. Shows the minimum viable pipeline.

---

### 11. `croptype-mapping-gsn` ★★  (8⭐, Jupyter)
**What.** Growth-stage normalisation for crop-type classification.

**For us.** Useful methodology when the same crop is planted at different
calendar dates across a region (India, Brazil safrinha). Fold into the
in-season nowcaster.

---

### 12. `timl` ★★  (21⭐, Python)
**What.** Task-informed meta-learning. Sister project to `crop-maml`.

**For us.** Research-grade. Keep an eye on for when scaling to many
country-crop pairs.

---

### 13. `dora` ★★  (13⭐, TeX)
**What.** Domain-agnostic outlier ranking. Takes a feature stack and
ranks pixels / regions by anomaly score.

**For us.** Plug directly on top of `glam-api` outputs for the early-warning
stress signal. Cheap to run; high conversion into short-dated options trades.

---

### 14. `ml-for-remote-sensing` ★★  (13⭐, HTML)
**What.** Teaching materials for remote-sensing ML.

**For us.** Onboarding content for the junior quants / analysts joining
the project.

---

### 15. `crop-mapping-course` ★★  (3⭐, HTML)
**What.** Teaching course materials.

**For us.** Same as above.

---

### 16. `mlhub` ★★  (4⭐, Jupyter)
**What.** Python client for `mlhub.earth` — Radiant Earth's training-data
hub (now partly wound down / migrated).

**For us.** Useful for sourcing extra labelled geospatial data. Check it's
still maintained before building a dependency.

---

## Tier 3 — Tangential

### 17. `yield` ★  (0⭐, Python)
**What.** Empty placeholder — three files (`.gitignore`, `LICENSE`, README).
Repo is scaffolding; no model.

**For us.** Do not wait for NASA Harvest to publish a yield model. Build
our own.

---

### 18. `street2sat` ★  (12⭐, Jupyter)
**What.** Geolocates ground-level farmer-uploaded photos and pairs them
with Sentinel imagery. Used by HarvestNow / Harvest2Market.

**For us.** Interesting if we build out a ground-truth-collection arm
(paying farmers / agronomists in key regions for photos). Low immediate
priority but high long-term moat.

---

### 19. `helmets-kenya` ★  (4⭐, Jupyter)
**What.** Likely a computer-vision project on motorbike-helmet detection
in Kenya — tangential to ag.

**For us.** Ignore.

---

### 20. `presto-embeddings` ★  (2⭐, HTML)
**What.** Pre-computed Presto embeddings, static site.

**For us.** Useful if the grid/region covers our interest — saves inference
compute.

---

### 21. `nasaharvest.github.io` ★  (2⭐, HTML)
**What.** Their project site.

---

### 22. `capacity-building` ★
Resources for training/outreach. Ignore.

### 23. `ckan` and `ckanext-harvestportal` ★
CKAN data portal infra. Ignore unless we spin up a Macquarie internal
geospatial data hub.

### 24. `spatialhadoop-example` ★
Java, 0 stars, ignore.

---

## Summary scoring

| Tier | Count | Typical effort to weaponise | Typical impact |
|---|---|---|---|
| ★★★ | 7 (counting GLAM stack as one) | 2–4 weeks each | Directly produces trade signals |
| ★★ | 9 | 1–2 weeks each | Methodology / specialised coverage |
| ★ | 12 | — | Ignore for now |

**Recommended starting bundle (Tier-1 minimum):**
`openmapflow` + `presto` + `cropharvest` + `us-inseason-phenorm` + `glam-api`.
That is five repos. Together they let one engineer stand up a US Corn Belt
planted-acreage nowcast and a global GLAM indicator feed inside a month.
