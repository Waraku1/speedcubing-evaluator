import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { chromium } from "@playwright/test";

import { PERFORMANCE_BUDGETS, type EvidenceClass, type PerfDecision, type PerfMeasurement } from "./contracts";
import type { PerfArgs } from "./args";
import { createMeasurement, exitCodeFor, localEnvironment, printSummary, writeEvidence } from "./evidence";
import { fixedLegalCubeStates } from "./fixtures";
import { parsePsRss, processTreeRows, totalRssBytes } from "./processRss";
import { percentile } from "./statistics";

type VitalState = { lcp: number; cls: number; events: number[] };

function requiredDecision(args: PerfArgs, minimumSessions = 1): PerfDecision | undefined {
  return args.target && args.baseUrl !== undefined && (args.sessions ?? 0) >= minimumSessions
    ? undefined
    : "HARNESS_READY_TARGET_HOST_REQUIRED";
}

function finalEnvironment(args: PerfArgs, browser?: { name: string; version: string }) {
  const evidenceClass: EvidenceClass = args.target ? "TARGET_HOST" : "LOCAL_BASELINE";
  return localEnvironment(evidenceClass, {
    hostClass: args.target ? "configured-target-host" : "local-production-artifact",
    ...(browser ? { browser: browser.name, browserVersion: browser.version } : {}),
  });
}

export async function runWebVitalsBenchmark(args: PerfArgs): Promise<number> {
  if (!args.baseUrl) {
    const measurements = vitalMeasurements([], [], [], "HARNESS_READY_TARGET_HOST_REQUIRED");
    return finish("web-vitals", args, measurements, finalEnvironment(args));
  }
  const sessions = args.sessions ?? (args.target ? 20 : 1);
  const browser = await chromium.launch();
  const lcp: number[] = [];
  const inp: number[] = [];
  const cls: number[] = [];
  const nonSolvedStates = fixedLegalCubeStates(sessions);
  try {
    for (let session = 0; session < sessions; session += 1) {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        const target = window as typeof window & { __perfVitals: VitalState };
        target.__perfVitals = { lcp: 0, cls: 0, events: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) target.__perfVitals.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!shift.hadRecentInput) target.__perfVitals.cls += shift.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const event = entry as PerformanceEventTiming & { interactionId: number };
            if (event.interactionId > 0) target.__perfVitals.events.push(event.duration);
          }
        }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
      });
      const page = await context.newPage();
      page.on("dialog", (dialog) => dialog.accept());
      await page.goto(args.baseUrl, { waitUntil: "networkidle" });

      const firstSticker = page.locator('[data-sticker-editable="true"]').first();
      for (let interaction = 0; interaction < 20; interaction += 1) {
        await page.getByRole("radio", { name: interaction % 2 === 0 ? /R Red/ : /B Blue/ }).check();
        await firstSticker.click();
      }
      await page.getByRole("button", { name: "Reset cube" }).click();
      await page.getByRole("button", { name: "Load solved example" }).click();
      await page.getByRole("button", { name: "Run evaluation" }).click();
      await page.getByRole("heading", { name: "Evaluation result", level: 2 }).waitFor({ timeout: 12_000 });

      await page.getByRole("button", { name: "Reset cube" }).click();
      const facelets = nonSolvedStates[session].facelets;
      for (const token of ["U", "R", "F", "D", "L", "B"] as const) {
        await page.getByRole("radio", { name: new RegExp(`^${token} `) }).check();
        for (let index = 0; index < facelets.length; index += 1) {
          if (index % 9 !== 4 && facelets[index] === token) {
            await page.locator(`[data-sticker-index="${index}"]`).click();
          }
        }
      }
      await page.getByRole("button", { name: "Run evaluation" }).click();
      await page.getByRole("heading", { name: "Evaluation result", level: 2 }).waitFor({ timeout: 12_000 });
      const interactiveButtons = page.locator('[data-testid="result-shell"] button');
      const buttonCount = await interactiveButtons.count();
      for (let interaction = 0; interaction < 20 && buttonCount > 0; interaction += 1) {
        await interactiveButtons.first().click();
      }
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const observed = await page.evaluate(() =>
        (window as typeof window & { __perfVitals: VitalState }).__perfVitals
      );
      lcp.push(observed.lcp);
      cls.push(observed.cls);
      inp.push(observed.events.length > 0 ? percentile(observed.events, 98) : 0);
      await context.close();
    }
    const decision = requiredDecision({ ...args, sessions }, 20);
    const measurements = vitalMeasurements(lcp, inp, cls, decision);
    return finish("web-vitals", args, measurements, finalEnvironment(args, { name: "chromium", version: browser.version() }));
  } finally {
    await browser.close();
  }
}

function vitalMeasurements(
  lcp: readonly number[],
  inp: readonly number[],
  cls: readonly number[],
  decision: PerfDecision | undefined
): PerfMeasurement[] {
  const spec = [
    ["web-vitals-lcp", "PB-01", lcp, PERFORMANCE_BUDGETS.lcpP75Ms, "LCP p75", "milliseconds"],
    ["web-vitals-inp", "PB-02", inp, PERFORMANCE_BUDGETS.inpP75Ms, "INP p75", "milliseconds"],
    ["web-vitals-cls", "PB-03", cls, PERFORMANCE_BUDGETS.clsMax, "CLS max", "ratio"],
  ] as const;
  return spec.map(([measurementId, pbGateId, samples, limit, metric, units]) => createMeasurement({
    measurementId,
    pbGateId,
    scenario: "manual idle/root, editing, solved/status-only result, and trace interactions",
    rawSamples: samples,
    units,
    warmupCount: 0,
    threshold: samples.length > 0 ? [{ metric, operator: "<=", limit, observed: pbGateId === "PB-03" ? Math.max(...samples) : percentile(samples, 75), unit: units }] : [],
    decision,
    notes: ["Uses buffered browser PerformanceObserver LCP, LayoutShift, and Event Timing entries; no load-event proxy."],
  }));
}

async function postEvaluation(baseUrl: string, facelets: string): Promise<{ duration: number; ok: boolean; cacheHit: boolean }> {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: "1.0", cubeState: { format: "URFDLB_FACELETS_V1", facelets } }),
    });
    const json = await response.json() as { result?: { solution?: { solver?: { cacheHit?: boolean } } } };
    return { duration: performance.now() - start, ok: response.ok && json.result !== undefined, cacheHit: json.result?.solution?.solver?.cacheHit === true };
  } catch {
    return { duration: performance.now() - start, ok: false, cacheHit: false };
  }
}

async function postControlledFault(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    return response.status >= 400 && response.status < 500;
  } catch {
    return false;
  }
}

export async function runApiBenchmark(args: PerfArgs): Promise<number> {
  if (!args.baseUrl) {
    const measurements = apiRequiredMeasurements();
    return finish("api", args, measurements, finalEnvironment(args));
  }
  const missCount = args.target ? 300 : 5;
  const hitCount = args.target ? 100 : 5;
  const states = fixedLegalCubeStates(missCount + 1);
  const misses = [];
  const missFailures: { code: string; sampleIndex?: number }[] = [];
  const hitFailures: { code: string; sampleIndex?: number }[] = [];
  for (const [index, state] of states.slice(0, missCount).entries()) {
    const result = await postEvaluation(args.baseUrl, state.facelets);
    misses.push(result.duration);
    if (!result.ok) missFailures.push({ code: "API_REQUEST_FAILED", sampleIndex: index });
    if (result.cacheHit) missFailures.push({ code: "API_MISS_NOT_OBSERVED", sampleIndex: index });
  }
  await postEvaluation(args.baseUrl, states[missCount].facelets);
  const hits = [];
  for (let index = 0; index < hitCount; index += 1) {
    const result = await postEvaluation(args.baseUrl, states[missCount].facelets);
    hits.push(result.duration);
    if (!result.ok || !result.cacheHit) hitFailures.push({ code: "API_HIT_NOT_OBSERVED", sampleIndex: index });
  }

  const coldUrls = (process.env.PERF_COLD_URLS ?? "").split(",").map((url) => url.trim()).filter(Boolean);
  const cold = [];
  for (const url of coldUrls.slice(0, 20)) cold.push((await postEvaluation(url, states[0].facelets)).duration);
  const paintCount = args.target ? 20 : 1;
  const paints: number[] = [];
  const browser = await chromium.launch();
  try {
    for (let index = 0; index < paintCount; index += 1) {
      const page = await browser.newPage();
      await page.goto(args.baseUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Load solved example" }).click();
      const start = performance.now();
      await page.getByRole("button", { name: "Run evaluation" }).click();
      await page.getByRole("heading", { name: "Evaluation result", level: 2 }).waitFor({ timeout: 12_000 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      paints.push(performance.now() - start);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const targetReady = args.target && misses.length === 300 && hits.length === 100 && paints.length === 20;
  const measurements: PerfMeasurement[] = [
    createMeasurement({
      measurementId: "api-warm-miss",
      pbGateId: "PB-15",
      scenario: "deterministic unique synthetic cube requests",
      rawSamples: misses,
      units: "milliseconds",
      failures: missFailures,
      threshold: [{ metric: "miss p95", operator: "<=", limit: PERFORMANCE_BUDGETS.apiMissP95Ms, observed: percentile(misses, 95), unit: "milliseconds" }],
      decision: targetReady ? undefined : "HARNESS_READY_TARGET_HOST_REQUIRED",
    }),
    createMeasurement({
      measurementId: "api-cache-hit",
      pbGateId: "PB-15",
      scenario: "repeat request with response cache-hit evidence",
      rawSamples: hits,
      units: "milliseconds",
      failures: hitFailures,
      threshold: [{ metric: "hit max", operator: "<=", limit: PERFORMANCE_BUDGETS.apiHitMaxMs, observed: Math.max(...hits), unit: "milliseconds" }],
      decision: targetReady ? undefined : "HARNESS_READY_TARGET_HOST_REQUIRED",
    }),
    createMeasurement({
      measurementId: "api-cold",
      pbGateId: "PB-15",
      scenario: "20 independently cold target URLs",
      rawSamples: cold,
      units: "milliseconds",
      threshold: cold.length > 0 ? [{ metric: "cold max", operator: "<=", limit: PERFORMANCE_BUDGETS.apiColdMaxMs, observed: Math.max(...cold), unit: "milliseconds" }] : [],
      decision: args.target && cold.length === 20 ? undefined : "HARNESS_READY_TARGET_HOST_REQUIRED",
      notes: ["Set PERF_COLD_URLS to 20 comma-separated independently cold deployment URLs."],
    }),
    createMeasurement({
      measurementId: "browser-result-paint",
      pbGateId: "PB-15",
      scenario: "submit through visible committed result and next animation frame",
      rawSamples: paints,
      units: "milliseconds",
      threshold: [{ metric: "paint max", operator: "<=", limit: PERFORMANCE_BUDGETS.browserPaintMaxMs, observed: Math.max(...paints), unit: "milliseconds" }],
      decision: targetReady ? undefined : "HARNESS_READY_TARGET_HOST_REQUIRED",
    }),
  ];
  return finish("api", args, measurements, finalEnvironment(args, { name: "chromium", version: browser.version() }));
}

function apiRequiredMeasurements(): PerfMeasurement[] {
  return ["api-warm-miss", "api-cache-hit", "api-cold", "browser-result-paint"].map((measurementId) => createMeasurement({
    measurementId,
    pbGateId: "PB-15",
    scenario: "target-host API and browser collector",
    units: "milliseconds",
    decision: "HARNESS_READY_TARGET_HOST_REQUIRED",
    notes: ["Provide --base-url and --target for final sampling."],
  }));
}

function rssForTree(rootPid: number): { bytes: number; processIds: number[] } {
  const output = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" });
  const rows = processTreeRows(parsePsRss(output), rootPid);
  if (rows.length === 0) throw new Error("Server process tree was not found.");
  return { bytes: totalRssBytes(rows), processIds: rows.map((row) => row.pid) };
}

export async function runRssBenchmark(args: PerfArgs): Promise<number> {
  if (!args.serverPid) {
    const measurement = createMeasurement({
      measurementId: "server-process-tree-rss",
      pbGateId: "PB-18",
      scenario: "30-minute, <=2-client, >=100 fault/recovery cycle collector",
      units: "bytes",
      decision: "HARNESS_READY_TARGET_HOST_REQUIRED",
      notes: ["Provide the exact pnpm start PID with --server-pid."],
    });
    return finish("rss", args, [measurement], finalEnvironment(args));
  }
  process.kill(args.serverPid, 0);
  const durationSeconds = args.durationSeconds ?? (args.target ? 1_800 : 3);
  const cycles = args.target ? 100 : 5;
  const baseline = rssForTree(args.serverPid);
  const rssSamples = [baseline.bytes];
  const processIds = new Set(baseline.processIds);
  const started = performance.now();
  const workloadStates = fixedLegalCubeStates(cycles);
  const workloadFailures: { code: string; sampleIndex?: number }[] = [];
  let nextCycle = 0;
  const cycleIntervalMs = durationSeconds * 1_000 / Math.ceil(cycles / 2);
  const workload = args.baseUrl
    ? Promise.all(Array.from({ length: 2 }, async () => {
        while (nextCycle < cycles) {
          const index = nextCycle;
          nextCycle += 1;
          const cycleStarted = performance.now();
          const faultObserved = await postControlledFault(args.baseUrl as string);
          const recovery = await postEvaluation(args.baseUrl as string, workloadStates[index].facelets);
          if (!faultObserved || !recovery.ok) {
            workloadFailures.push({ code: "FAULT_RECOVERY_CYCLE_FAILED", sampleIndex: index });
          }
          const remaining = cycleIntervalMs - (performance.now() - cycleStarted);
          if (remaining > 0 && nextCycle < cycles) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
        }
      }))
    : Promise.resolve([]);
  while (performance.now() - started < durationSeconds * 1_000) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const sample = rssForTree(args.serverPid);
    rssSamples.push(sample.bytes);
    sample.processIds.forEach((pid) => processIds.add(pid));
  }
  await workload;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const settled = rssForTree(args.serverPid);
  rssSamples.push(settled.bytes);
  settled.processIds.forEach((pid) => processIds.add(pid));
  const peak = Math.max(...rssSamples);
  const delta = Math.max(0, settled.bytes - baseline.bytes);
  const authoritative = args.target && durationSeconds >= 1_800 && cycles >= 100;
  const measurement = createMeasurement({
    measurementId: "server-process-tree-rss",
    pbGateId: "PB-18",
    scenario: `${durationSeconds}s, <=2 clients, ${cycles} controlled request cycles`,
    rawSamples: rssSamples,
    units: "bytes",
    threshold: [
      { metric: "peak RSS", operator: "<=", limit: PERFORMANCE_BUDGETS.serverPeakRssBytes, observed: peak, unit: "bytes" },
      { metric: "settled delta", operator: "<=", limit: PERFORMANCE_BUDGETS.serverSettledDeltaBytes, observed: delta, unit: "bytes" },
    ],
    failures: workloadFailures,
    decision: authoritative ? undefined : "HARNESS_READY_TARGET_HOST_REQUIRED",
    memory: {
      baselineBytes: baseline.bytes,
      peakBytes: peak,
      settledBytes: settled.bytes,
      deltaBytes: delta,
      samplingIntervalMs: 500,
      processIds: [...processIds],
    },
    notes: [`exact root server PID=${args.serverPid}; browser processes are excluded`],
  });
  return finish("rss", args, [measurement], finalEnvironment(args));
}

function finish(
  label: string,
  args: PerfArgs,
  measurements: readonly PerfMeasurement[],
  environment = finalEnvironment(args)
): number {
  const pathname = writeEvidence(label, environment, measurements, args.evidenceDirectory);
  printSummary(pathname, measurements);
  return exitCodeFor(measurements);
}
