// /src/components/excelParse/csvDataService.js
import ExcelJS from "exceljs/dist/exceljs.min.js";

/* =========================
 *         STATE
 * ========================= */
let listeners = [];
let timer = null;

// Path to your local workbook (must be in /public folder)
export let RUN_FILE = "fabsim_output_data_example.xlsx";
export const setRunFile = (path) => {
  RUN_FILE = path;
  console.log("[DEBUG] RUN_FILE updated:", RUN_FILE);
};

console.log("[DEBUG] RUN_FILE value at startup:", RUN_FILE);
if (!RUN_FILE) {
  console.warn("[DEBUG] RUN_FILE is empty or undefined!");
} else {
  // Optional: probe reachability from the browser
  fetch(RUN_FILE, { method: "HEAD" })
    .then((resp) => {
      console.log("[DEBUG] HEAD request status for RUN_FILE:", resp.status);
      if (!resp.ok) {
        console.error("[DEBUG] RUN_FILE is set, but the file may not be reachable from the browser!");
      }
    })
    .catch((err) => console.error("[DEBUG] Error checking RUN_FILE:", err));
}

// Timeline + one-off summary values
let startDateUTC = null;
let endDateUTC = null;
let nDays = 0;
let waferStarts = 0;

// Series store (per metric arrays)
let SERIES_STORE = null;
let SERIES_READY = false;

// Optional one-off KPI container for easy access
const SUMMARY = {
  waferStarts: null,
};

/* =========================
 *        UTILS
 * ========================= */
function normalizeTs(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  if (typeof v === "number") {
    // Excel serial date
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  if (typeof v === "object" && v !== null) {
    if (v.result != null) return normalizeTs(v.result);
    if (v.text != null) return normalizeTs(v.text);
    if (v.value != null) return normalizeTs(v.value);
  }
  return null;
}

function normalizeToDayUTC(d) {
  if (!(d instanceof Date)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function headersFromWorksheet(ws) {
  const headerRow = ws.getRow(1);
  const vals = headerRow?.values ?? [];
  const headers = [];
  for (let i = 1; i < vals.length; i++) {
    const name = String(vals[i] ?? `col_${i}`).trim();
    headers.push(name || `col_${i}`);
  }
  return headers;
}

function cellToValue(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (v.result != null) return v.result;
  if (v.text != null) return v.text;
  return v;
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function findColIndex(headers, candidates) {
  // candidates can be strings or regex; return first match index, else -1
  for (const cand of candidates) {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || "").trim();
      if (cand instanceof RegExp) {
        if (cand.test(h)) return i;
      } else {
        if (h.toLowerCase() === String(cand).toLowerCase()) return i;
      }
    }
  }
  return -1;
}

/* =========================
 *   SERIES CONFIG (edit me)
 * =========================
 * Row index == day index (no date columns needed).
 * Add/adjust valueCol candidates to match your headers.
 */
const SERIES_SPEC = {
  // --- Daily M/I Ratio ---
  moi: {
    sheet: "Daily_M_Over_I",
    valueCol: ["m_over_i_daily"],
  },
  moiInspect: {
    sheet: "Daily_M_Over_I",
    valueCol: ["m_over_i_inspection_daily"],
  },
  // --- Capacity_Daily ---
  wipSize: {
    sheet: "Capacity_Daily",
    valueCol: ["wip_size"],
  },
  startedWip: {
    sheet: "Capacity_Daily",
    valueCol: ["starts"],
  },
  exitedWip: {
    sheet: "Capacity_Daily",
    valueCol: ["exits"],
  },
  wipSizeAvg: {
    sheet: "Capacity_Daily",
    valueCol: ["wip_size_avg"],
  },
  wipMin: {
    sheet: "Capacity_Daily",
    valueCol: ["wip_min"],
  },
  wipMax: {
    sheet: "Capacity_Daily",
    valueCol: ["wip_max"],
  },
  unstartedLots: {
    sheet: "Capacity_Daily",
    valueCol: ["unstarted_lots"],
  },
};

function initSeriesStore(len) {
  const store = {};
  for (const key of Object.keys(SERIES_SPEC)) {
    store[key] = new Array(len).fill(null);
  }
  return store;
}

/* =========================
 *   CORE LOAD/BUILD LOGIC
 * ========================= */
async function fetchWorkbookBuffer() {
  console.log("[DEBUG] Loading workbook:", RUN_FILE);
  const resp = await fetch(RUN_FILE);
  if (!resp.ok) throw new Error(`Failed to fetch ${RUN_FILE}: ${resp.status}`);
  return await resp.arrayBuffer();
}

function parseSimulationWindow(wb) {
  const ws = wb.getWorksheet("Simulation_Summary");
  if (!ws) throw new Error("Simulation_Summary not found");

  const hdrVals = ws.getRow(1)?.values ?? [];

  // ExcelJS is 1-based → keep index as-is
  const varColIdx = hdrVals.findIndex(v => String(v || "").trim().toLowerCase() === "variable");
  const valColIdx = hdrVals.findIndex(v => String(v || "").trim().toLowerCase() === "value");
  if (varColIdx < 1 || valColIdx < 1) {
    throw new Error("Simulation_Summary must have 'variable' and 'value' headers");
  }

  let startTime = null;
  let endTime = null;
  let wafers_started = null;

  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return; // skip header
    const rawVar = cellToValue(row.getCell(varColIdx));
    const varName = String(rawVar || "").trim().toLowerCase();
    const value = cellToValue(row.getCell(valColIdx));

    if (varName === "start_time") {
      startTime = normalizeTs(value);
    } else if (varName === "end_time") {
      endTime = normalizeTs(value);
    } else if (varName === "wafers_starts") {
      // accept numeric, numeric as string, or Excel numbers
      const asNum = toNumberOrNull(value);
      wafers_started = asNum != null ? asNum : 0;
    }
  });

  if (!startTime || !endTime) {
    throw new Error("Missing start_time or end_time in Simulation_Summary");
  }

  const s = normalizeToDayUTC(startTime);
  const e = normalizeToDayUTC(endTime);
  if (!s || !e || s > e) throw new Error("Invalid start/end dates");

  const days = Math.round((e - s) / 86400000) + 1;
  return { startDateUTC: s, endDateUTC: e, nDays: days, waferStarts: wafers_started ?? 0 };
}

function fillSeriesFromSheet(wb, nDays, store, key) {
  const spec = SERIES_SPEC[key];
  const ws = wb.getWorksheet(spec.sheet);
  if (!ws) {
    console.warn(`[series] Sheet not found for ${key}: ${spec.sheet}`);
    return;
  }

  const headers = headersFromWorksheet(ws);
  const valueIdx0 = findColIndex(headers, spec.valueCol);
  if (valueIdx0 < 0) {
    console.warn(`[series] Value column not found in sheet ${spec.sheet} for ${key}. Headers:`, headers);
    return;
  }
  const valueIdx = valueIdx0 + 1; // ExcelJS 1-based

  // Row 1 is headers, so row 2 corresponds to day 0
  for (let day = 0; day < nDays; day++) {
    const rowNumber = 2 + day;
    const row = ws.getRow(rowNumber);
    if (!row || row.number !== rowNumber) continue;
    const raw = cellToValue(row.getCell(valueIdx));
    const val = toNumberOrNull(raw);
    store[key][day] = val != null ? val : null;
  }

  if (typeof spec.post === "function") {
    spec.post(store[key], { wb, nDays });
  }
}

/**
 * Build the per-metric series, plus SUMMARY one-offs.
 */
async function buildSeriesStore() {
  const buf = await fetchWorkbookBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  console.log("[DEBUG] Workbook loaded. Sheets:", wb.worksheets.map(ws => ws.name));

  // 1) Simulation window
  const win = parseSimulationWindow(wb);
  startDateUTC = win.startDateUTC;
  endDateUTC = win.endDateUTC;
  nDays = win.nDays;
  waferStarts = win.waferStarts;

  // cache in SUMMARY for easy UI access
  SUMMARY.waferStarts = waferStarts;

  console.log(
    "[DEBUG] Sim window:",
    startDateUTC.toISOString(),
    "→",
    endDateUTC.toISOString(),
    "nDays:", nDays,
    "waferStarts:", waferStarts
  );

  // 2) Init store
  SERIES_STORE = initSeriesStore(nDays);

  // 3) Fill each series: row index == day index
  for (const key of Object.keys(SERIES_SPEC)) {
    fillSeriesFromSheet(wb, nDays, SERIES_STORE, key);
  }

  SERIES_READY = true;
  return { startDateUTC, endDateUTC, nDays, series: SERIES_STORE, waferStarts };
}

/* =========================
 *        PUBLIC API
 * ========================= */
export function getSeriesStore() {
  if (!SERIES_READY) {
    console.warn("[series] getSeriesStore() called before series are ready");
  }
  return SERIES_STORE;
}

// Include waferStarts here so any code already calling getWindow() can see it.
export function getWindow() {
  return { startDateUTC, endDateUTC, nDays, waferStarts };
}

// Optional: explicit getter for one-off KPIs
export function getSummary() {
  return { ...SUMMARY };
}

/**
 * Subscribe to streaming updates.
 * Each tick emits: { tick, simDate, formatted, series, waferStarts, window }
 * - waferStarts stays constant; series arrays are fixed; tick/simDate advance.
 */
export function subscribe(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((f) => f !== cb);
  };
}

/**
 * Start streaming. 1 second = 1 day? Set intervalMs=1000.
 * Emits the *same* series object each time, with a changing tick/simDate.
 */
export async function startExcelStream(intervalMs = 1000) {
  if (timer) return;
  console.log("[DEBUG] Starting Excel stream with interval:", intervalMs);

  if (!SERIES_READY) {
    await buildSeriesStore();
  }
  if (!SERIES_STORE || !nDays) {
    console.warn("[DEBUG] Series not built or nDays=0");
    return;
  }

  let tick = 0;
  timer = setInterval(() => {
    // 1 tick = 1 day
    const simDate = new Date(startDateUTC.getTime() + tick * 86400000);

    // Add a random time (hours: 0–23, minutes: 0–59)
    const randHours = Math.floor(Math.random() * 24);
    const randMinutes = Math.floor(Math.random() * 60);
    simDate.setHours(randHours, randMinutes, 0, 0);

    const formatted = {
      date: simDate.toLocaleDateString("en-US"),
      time: simDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const payload = {
      tick,
      simDate,
      formatted,
      series: SERIES_STORE,
      waferStarts,                  // <<< constant, from Simulation_Summary
      window: getWindow(),          // convenience bundle (includes waferStarts)
      summary: getSummary(),        // optional: for KPI tiles
    };

    listeners.forEach((cb) => cb(payload));
    tick++;
    if (tick >= nDays) tick = 0; // optional wraparound
  }, intervalMs);
}

export async function startRandomBindingsStream(
  intervalMs = 1000,
  bindings = null,
  { maxTicks = 100, startDate = null } = {}
) {
  if (timer) return;

  // local helpers (scoped, won't collide)
  const rBetween = (min, max, dec = 2) => +((Math.random() * (max - min)) + min).toFixed(dec);
  const rInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // choose a sensible base date:
  // - prefer the workbook start date if present
  // - else use provided startDate
  // - else today at 00:00 UTC
  const baseDate =
    startDateUTC instanceof Date
      ? new Date(startDateUTC.getTime())
      : (startDate instanceof Date ? new Date(startDate.getTime()) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())));

  let tick = 0;

  timer = setInterval(() => {
    // date/time: advance by whole days; keep time readable but stable-ish
    const simDate = new Date(baseDate.getTime() + tick * 86400000);
    simDate.setHours(rInt(7, 17), rInt(0, 59), 0, 0); // daytime window

    const formatted = {
      date: simDate.toLocaleDateString("en-US"),
      time: simDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };

    // ---- RANDOM VALUES (reasonable ops ranges) ----
    const availability = rBetween(0.70, 0.98, 3);
    const performance  = rBetween(0.80, 0.98, 3);
    const quality      = rBetween(0.92, 0.995, 3);
    const oeePct       = +((availability * performance * quality) * 100).toFixed(2);

    const wipSize  = rInt(40, 140);
    const wipMin   = rInt(20, Math.max(25, Math.floor(wipSize * 0.3)));
    const wipMax   = rInt(Math.max(wipMin + 5, Math.floor(wipSize * 0.8)), Math.max(wipMin + 10, wipSize + 40));
    const wipAdd   = rInt(0, 20);

    const toolTop  = rInt(0, 50);
    const toolBot  = rInt(0, 50);
    const active   = toolTop + toolBot;
    const activePct = clamp(active / 100, 0, 1) * 100;

    const lotsIdle = Math.round(wipSize * rBetween(0.15, 0.35));
    const lotsQ    = Math.round(wipSize * rBetween(0.10, 0.25));
    const lotsProd = Math.max(0, wipSize - lotsIdle - lotsQ);

    const started  = rInt(10, 60);
    const exited   = rInt(10, 50);
    const miw      = rBetween(0.6, 6.3);  // “MIW”
    const mii      = rBetween(0.05, 7.3);  // “MII”
    const mir      = clamp(started ? exited / started : 1, 0, 2);

    const capacity = rBetween(0, 40);
    const capacity2 = rBetween(0, 40);
    const target   = rBetween(60, 120);
    const ordersDone = rInt(0, 10);
    const avgEta   = rInt(5, 24);

// ---- BINDINGS (only if provided) ----
if (bindings) {
  bindings.setDate?.(formatted.date);
  bindings.setTime?.(formatted.time);

  // OEE family
  bindings.setAvailability?.(+(availability * 100).toFixed(2));
  bindings.setPerformance?.(+(performance * 100).toFixed(2));
  bindings.setQuality?.(+(quality * 100).toFixed(2));
  bindings.setOEE?.(oeePct);
  bindings.setPctOEE?.(oeePct);

  // WIP & capacity
  bindings.setWipSize?.(wipSize);
  bindings.setWipMin?.(wipMin);
  bindings.setWipMax?.(wipMax);
  bindings.setWipLots?.(wipSize);
  bindings.setWipLotsAdd?.(wipAdd);
  bindings.setCapacity?.(+capacity.toFixed(2));
  bindings.setCapacity2?.(+capacity2.toFixed(2));
  bindings.setTarget?.(+target.toFixed(2));

  // M/I
  bindings.setWeeklyAvg?.(miw);
  bindings.setInspect?.(mii);
  bindings.setRatio?.(+mir.toFixed(2));

  // Tools
  bindings.setToolTop?.(toolTop);
  bindings.setToolBottom?.(toolBot);
  bindings.setActiveTools?.(active);
  bindings.setActiveToolsPercent?.(+activePct.toFixed(2));

  // Lots split
  bindings.setLotsIdle?.(lotsIdle);
  bindings.setLotsInQueue?.(lotsQ);
  bindings.setLotsInProd?.(lotsProd);

  // Orders / ETA
  bindings.setOrdersDone?.(ordersDone);
  bindings.setAvgEta?.(avgEta);

  // Total lots/WIPCount tile
  bindings.setTotalLots?.(wipSize);

    }

    // Also emit a payload to existing subscribers (keeps subscribe() compatible)
    const payload = {
      tick,
      simDate,
      formatted,
      series: {},            // empty in random mode (so existing code won't crash)
      waferStarts: 0,        // not used in random mode
      window: { startDateUTC: baseDate, endDateUTC: null, nDays: maxTicks, waferStarts: 0 },
      summary: { waferStarts: 0 },
      random: true,          // marker: this payload came from random mode
    };
    listeners.forEach((cb) => cb(payload));

    tick++;
    if (tick >= maxTicks) {
      // auto-stop after maxTicks to avoid runaway demo loops
      clearInterval(timer);
      timer = null;
    }
  }, intervalMs);
}




export function stopStream() {
  if (timer) clearInterval(timer);
  timer = null;
  listeners = [];
  console.log("[DEBUG] Stream stopped and listeners cleared.");
}
