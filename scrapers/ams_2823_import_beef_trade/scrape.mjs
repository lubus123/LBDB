#!/usr/bin/env node
// Scraper for USDA AMS Market News report AMS_2823 = "Import Beef Trade"
// (internal slug NW_LS421, Des Moines, IA). Extracts the "Beef Trim, 0-15 Days"
// price series across every origin and trim grade, for the full text-file
// archive (~Jan 2019 - Apr 2023, before the report went PDF-only/weekly).
//
// Source: ESMIS archive https://esmis.nal.usda.gov/publication/import-beef-trade
// No API key required. TXT release URLs are content-addressed hashes, so they
// must be discovered by walking the paginated archive (they can't be constructed).
//
// Usage: node scrape.mjs   ->   writes ams_2823_beef_trim_0-15days.csv
//
// Output columns:
//   report_date, origin, product, trim_pct, delivery, region,
//   price_low, price_high, unit, basis, source_url

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://esmis.nal.usda.gov";
const LISTING = `${BASE}/publication/import-beef-trade`;
const UA = "duckGammon-research-scraper (contact: lubomirbotev2@gmail.com)";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "ams_2823_beef_trim_0-15days.csv");

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** i); // 1s, 2s, 4s, 8s
    }
  }
  throw new Error(`failed to fetch ${url}: ${lastErr?.message}`);
}

// Walk the paginated archive, collecting unique NW_LS421.TXT release URLs.
// Drupal clamps out-of-range ?page=N to the last page (repeats its content),
// so we stop when a page contributes zero NEW links.
async function discoverReleaseUrls() {
  const seen = new Set();
  const SAFETY_MAX_PAGES = 200;
  let pagesWalked = 0;
  for (let page = 0; page < SAFETY_MAX_PAGES; page++) {
    const html = await fetchText(`${LISTING}?page=${page}`);
    pagesWalked = page + 1;
    const matches = html.matchAll(/href="(\/sites\/default\/release-files\/[^"]*?NW_LS421\.TXT)"/gi);
    let added = 0;
    for (const m of matches) {
      const abs = BASE + m[1];
      if (!seen.has(abs)) { seen.add(abs); added++; }
    }
    process.stdout.write(`  page ${page}: +${added} new (total ${seen.size})\n`);
    if (added === 0) break;
    await sleep(150);
  }
  return { urls: [...seen], pagesWalked };
}

function parseReportDate(text) {
  // Header line e.g. "Des Moines, IA     Wed, Sep 22, 2021     USDA Market News"
  const m = text.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!m) return null;
  const mon = MONTHS[m[1]];
  if (!mon) return null;
  return `${m[3]}-${mon}-${String(m[2]).padStart(2, "0")}`;
}

// Pull ordered price columns from the part of a line after the row label.
// A column is either a range "192.00- 193.00" or a lone "220.00".
function parsePriceColumns(rest) {
  const cols = [];
  const re = /(\d+\.\d+)\s*-\s*(\d+\.\d+)|(\d+\.\d+)/g;
  let m;
  while ((m = re.exec(rest)) !== null) {
    if (m[3] !== undefined) cols.push({ low: m[3], high: m[3] });
    else cols.push({ low: m[1], high: m[2] });
  }
  return cols;
}

// Parse one report into rows of Beef Trim, 0-15 Days only.
function parseReport(text, sourceUrl) {
  const date = parseReportDate(text);
  const rows = [];
  let origin = null;
  // delivery: '0-15' while we're in a 0-15 context, '16-45' otherwise, null before any header
  let delivery = null;
  // mode: 'stacked' (separate 0-15 / 16-45 blocks, columns = East/West coast)
  //       'sidebyside' (0-15 and 16-45 are columns on the same rows)
  let mode = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");

    // New origin section, e.g. "AUSTRALIA AND NEW ZEALAND - FOB AND TIS"
    const om = line.match(/^([A-Z][A-Z0-9 .,/&'()-]+?)\s*-\s*FOB\b/);
    if (om) {
      origin = om[1].trim();
      delivery = null;
      mode = null;
      continue;
    }

    // Delivery-window header detection.
    const has015 = /0\s*-\s*15\s*Days/i.test(line);
    const has1645 = /16\s*-\s*45\s*Days/i.test(line);
    if (has015 && has1645) {
      mode = "sidebyside"; // both windows are columns on the same data rows
      delivery = "0-15";
      continue;
    } else if (has015) {
      mode = "stacked";
      delivery = "0-15";
      continue;
    } else if (has1645) {
      mode = "stacked";
      delivery = "16-45";
      continue;
    }

    // Beef Trim data row, e.g. "Beef Trim 85%    255.00- 259.00"
    const bm = line.match(/^\s*Beef\s+Trim\s+(\d+)\s*%?(.*)$/i);
    if (bm && origin && delivery === "0-15") {
      const trimPct = bm[1];
      const cols = parsePriceColumns(bm[2]);

      if (mode === "sidebyside") {
        // First column = 0-15 Days; ignore the rest (16-45). No coast split here.
        const c = cols[0];
        rows.push(mkRow(date, origin, trimPct, "", c, sourceUrl));
      } else {
        // Stacked: columns are East Coast then West Coast (both 0-15 Days).
        if (cols.length === 0) {
          rows.push(mkRow(date, origin, trimPct, "East Coast", undefined, sourceUrl));
        } else {
          rows.push(mkRow(date, origin, trimPct, "East Coast", cols[0], sourceUrl));
          if (cols[1]) rows.push(mkRow(date, origin, trimPct, "West Coast", cols[1], sourceUrl));
        }
      }
    }
  }
  return { date, rows };
}

function mkRow(date, origin, trimPct, region, col, sourceUrl) {
  return {
    report_date: date ?? "",
    origin,
    product: "Beef Trim",
    trim_pct: trimPct,
    delivery: "0-15 Days",
    region,
    price_low: col ? col.low : "",
    price_high: col ? col.high : "",
    unit: "USD/cwt",
    basis: "FOB/TIS",
    source_url: sourceUrl,
  };
}

const CSV_COLUMNS = [
  "report_date", "origin", "product", "trim_pct", "delivery",
  "region", "price_low", "price_high", "unit", "basis", "source_url",
];

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","));
  return lines.join("\n") + "\n";
}

async function main() {
  console.log("Discovering release files from ESMIS archive...");
  const { urls, pagesWalked } = await discoverReleaseUrls();
  console.log(`Found ${urls.length} report releases across ${pagesWalked} archive pages.\n`);

  const allRows = [];
  let parsed = 0;
  let noDate = 0;
  const failed = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = await fetchText(url);
      const { date, rows } = parseReport(text, url);
      if (!date) noDate++;
      if (rows.length > 0) parsed++;
      allRows.push(...rows);
    } catch (err) {
      failed.push({ url, err: err.message });
    }
    if ((i + 1) % 25 === 0) process.stdout.write(`  fetched ${i + 1}/${urls.length}\n`);
    await sleep(150);
  }

  // Sort by date, then origin, then descending trim grade for readability.
  allRows.sort((a, b) =>
    a.report_date.localeCompare(b.report_date) ||
    a.origin.localeCompare(b.origin) ||
    Number(b.trim_pct) - Number(a.trim_pct) ||
    a.region.localeCompare(b.region)
  );

  writeFileSync(OUT, toCsv(allRows));

  const dates = allRows.map((r) => r.report_date).filter(Boolean).sort();
  console.log("\n=== Summary ===");
  console.log(`Archive pages walked : ${pagesWalked}`);
  console.log(`Releases found       : ${urls.length}`);
  console.log(`Reports with data    : ${parsed}`);
  console.log(`Reports w/o a date   : ${noDate}`);
  console.log(`Fetch failures       : ${failed.length}`);
  if (failed.length) for (const f of failed) console.log(`   - ${f.url} (${f.err})`);
  console.log(`Date range           : ${dates[0]} -> ${dates[dates.length - 1]}`);
  console.log(`CSV rows written     : ${allRows.length}`);
  console.log(`Output               : ${OUT}`);
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
