# RC performance automation

These commands measure the canonical `pnpm build` / `pnpm start` artifact and write timestamped, non-overwriting JSON under the ignored `artifacts/rc-evidence/` directory. Override that directory with `--evidence-dir <directory>` or `PERF_EVIDENCE_DIR`. Raw evidence contains deterministic synthetic cube inputs only; it must never contain camera frames, user facelets, cookies, credentials, stack traces, or private paths.

## Local/CI measurement

Build once, start that exact artifact, and run the individual browser commands against it:

```sh
pnpm build
pnpm start
pnpm perf:bundle -- --base-url http://127.0.0.1:3000
pnpm perf:web-vitals -- --base-url http://127.0.0.1:3000 --local --sessions 1
pnpm perf:api -- --base-url http://127.0.0.1:3000 --local
pnpm perf:rss -- --base-url http://127.0.0.1:3000 --local --server-pid <exact-pnpm-start-pid> --duration-seconds 3
```

The Node/Linux-capable commands need no HTTP server:

```sh
pnpm perf:solver
pnpm perf:demand
pnpm perf:service
pnpm perf:queue
```

`pnpm perf:all:local` starts one already-built production artifact, runs all local collectors, and stops the server process group. Applicable PB-04/05/08/12/13/14/16/19 threshold failures exit nonzero. A missing target host or device produces the explicit environment-required decision and exits successfully; it is never converted into a release pass.

## Final target-host protocol

Use exactly 20 browser sessions, 300 cache misses, 100 hits, 20 independently cold URLs, and 20 paint samples:

```sh
pnpm perf:web-vitals -- --target --base-url https://target.example --sessions 20
PERF_COLD_URLS=https://cold-01.example,...,https://cold-20.example pnpm perf:api -- --target --base-url https://target.example
pnpm perf:rss -- --target --base-url https://target.example --server-pid <exact-server-pid> --duration-seconds 1800
```

The web-vitals collector uses actual buffered `PerformanceObserver` LCP, LayoutShift, and Event Timing entries and executes at least 20 editing plus 20 result/trace interactions per session. The RSS collector samples only the exact supplied server PID and descendants every 500 ms; the authoritative run lasts 30 minutes with at least 100 controlled cycles and at most two clients.

## Physical-device handoff

On the accepted browser/device profile with camera permission, run:

```sh
pnpm perf:bundle -- --physical --base-url https://target.example --sessions 20
```

The browser collector observes actual scanner Worker construction/termination, `INFER` request/response timing, maximum concurrency, inference start timestamps, model/ORT transfers, Start-to-ready time, and Cancel cleanup. C7-C1 deliberately labels PB-06/07/09/10/11/17 as `HARNESS_READY_PHYSICAL_DEVICE_REQUIRED`; C7-C3 consumes accepted-device raw samples before assigning any final physical result. It never substitutes the local camera shim for physical evidence and never captures camera frames.

## Evidence and statistics contract

[`evidence.schema.json`](./evidence.schema.json) is the portable JSON shape; [`contracts.ts`](./contracts.ts) is the typed threshold source. All summaries use the single implementation in [`statistics.ts`](./statistics.ts): Hyndman–Fan type 7 interpolation with zero-based rank `(n - 1) * p`, including endpoints. Empty, non-finite, and invalid negative samples are rejected. Successful slow samples and failure samples are retained.

Each measurement uses exactly one decision: `PASS_MEASURED`, `FAIL_MEASURED`, `HARNESS_READY_TARGET_HOST_REQUIRED`, `HARNESS_READY_PHYSICAL_DEVICE_REQUIRED`, or `NOT_APPLICABLE_TO_THIS_INCREMENT`. Localhost web-vitals, API, and RSS data are `LOCAL_BASELINE`, never final target-host proof.
