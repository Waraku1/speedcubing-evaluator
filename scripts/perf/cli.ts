import { spawn } from "node:child_process";

import { parsePerfArgs, type PerfArgs } from "./args";
import { runBundleBenchmark } from "./browserBenchmarks";
import { runDemandBenchmark, runQueueBenchmark, runServiceBenchmark, runSolverBenchmark } from "./nodeBenchmarks";
import { runApiBenchmark, runRssBenchmark, runWebVitalsBenchmark } from "./remoteBenchmarks";

type PerfCommand = "bundle" | "solver" | "demand" | "service" | "queue" | "web-vitals" | "api" | "rss" | "all-local";

async function dispatch(command: PerfCommand, args: PerfArgs): Promise<number> {
  switch (command) {
    case "bundle": return runBundleBenchmark(args);
    case "solver": return runSolverBenchmark(args);
    case "demand": return runDemandBenchmark(args);
    case "service": return runServiceBenchmark(args);
    case "queue": return runQueueBenchmark(args);
    case "web-vitals": return runWebVitalsBenchmark(args);
    case "api": return runApiBenchmark(args);
    case "rss": return runRssBenchmark(args);
    case "all-local": return runAllLocal(args);
  }
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production artifact did not start within 60 seconds.");
}

async function runAllLocal(args: PerfArgs): Promise<number> {
  const port = 3_107;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn("pnpm", ["start", "-p", String(port)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "inherit",
  });
  if (!child.pid) throw new Error("Could not start the production artifact.");
  let result = 0;
  try {
    await waitForServer(baseUrl);
    const localArgs: PerfArgs = { ...args, local: true, target: false, physical: false, baseUrl };
    for (const runner of [
      runBundleBenchmark,
      runSolverBenchmark,
      runDemandBenchmark,
      runServiceBenchmark,
      runQueueBenchmark,
      runApiBenchmark,
      runWebVitalsBenchmark,
    ]) {
      result = Math.max(result, await runner(localArgs));
    }
    result = Math.max(result, await runRssBenchmark({ ...localArgs, serverPid: child.pid, durationSeconds: args.durationSeconds ?? 3 }));
    return result;
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as PerfCommand | undefined;
  const commands = new Set<PerfCommand>(["bundle", "solver", "demand", "service", "queue", "web-vitals", "api", "rss", "all-local"]);
  if (!command || !commands.has(command)) {
    throw new TypeError("Usage: tsx scripts/perf/cli.ts <bundle|solver|demand|service|queue|web-vitals|api|rss|all-local> [options]");
  }
  process.exitCode = await dispatch(command, parsePerfArgs(process.argv.slice(3)));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown performance harness error.";
  console.error(`Performance harness failed: ${message}`);
  process.exitCode = 1;
});
