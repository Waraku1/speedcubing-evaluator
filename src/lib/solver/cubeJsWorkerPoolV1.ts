import { Worker } from "node:worker_threads";

import Cube from "cubejs";

import {
  CUBE_JS_SOLVER_WORKER_SOURCE_V1,
  type CubeJsWorkerDataV1,
  type CubeJsWorkerRequestV1,
  type CubeJsWorkerResponseV1,
} from "./cubeJsSolver.worker";
import { SolverV1Error } from "./solverErrorsV1";

const PRODUCTION_MAX_WORKERS = 2;
const PRODUCTION_MAX_QUEUE = 8;
const PRODUCTION_DEADLINE_MS = 8_000;

export type CubeJsWorkerFactoryV1 = () => Worker;

export type CubeJsWorkerPoolConfigurationV1 = {
  maxWorkers?: number;
  maxQueueLength?: number;
  deadlineMs?: number;
  workerFactory?: CubeJsWorkerFactoryV1;
};

type PendingJob = {
  jobId: string;
  facelets: string;
  resolve: (solution: unknown) => void;
  reject: (error: SolverV1Error) => void;
  timer: ReturnType<typeof setTimeout>;
  signal: AbortSignal | null;
  abortListener: (() => void) | null;
  state: "QUEUED" | "RUNNING" | "SETTLED";
};

type WorkerSlot = {
  worker: Worker;
  ready: boolean;
  retiring: boolean;
  activeJob: PendingJob | null;
};

export type CubeJsWorkerPoolStatsV1 = {
  workers: number;
  readyWorkers: number;
  activeJobs: number;
  queuedJobs: number;
  workersCreated: number;
  workerReplacements: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function defaultWorkerFactory(): Worker {
  // Keep a static external dependency for Next's package tracer, while all
  // initialization and solving remain confined to the worker thread.
  if (typeof Cube.initSolver !== "function") {
    throw new SolverV1Error("SOLVER_UNAVAILABLE");
  }

  const workerData: CubeJsWorkerDataV1 = {
    expectedVersion: "1.3.2",
  };

  return new Worker(CUBE_JS_SOLVER_WORKER_SOURCE_V1, {
    eval: true,
    workerData,
  });
}

export class CubeJsWorkerPoolV1 {
  readonly maxWorkers: number;
  readonly maxQueueLength: number;
  readonly deadlineMs: number;

  private readonly workerFactory: CubeJsWorkerFactoryV1;
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private jobCounter = 0;
  private desiredWorkerCount = 0;
  private workersCreated = 0;
  private workerReplacements = 0;
  private closed = false;

  constructor(configuration: CubeJsWorkerPoolConfigurationV1 = {}) {
    this.maxWorkers = boundedInteger(
      configuration.maxWorkers,
      PRODUCTION_MAX_WORKERS,
      1,
      PRODUCTION_MAX_WORKERS
    );
    this.maxQueueLength = boundedInteger(
      configuration.maxQueueLength,
      PRODUCTION_MAX_QUEUE,
      1,
      PRODUCTION_MAX_QUEUE
    );
    this.deadlineMs = boundedInteger(
      configuration.deadlineMs,
      PRODUCTION_DEADLINE_MS,
      1,
      PRODUCTION_DEADLINE_MS
    );
    this.workerFactory = configuration.workerFactory ?? defaultWorkerFactory;
  }

  stats(): CubeJsWorkerPoolStatsV1 {
    return {
      workers: this.slots.length,
      readyWorkers: this.slots.filter((slot) => slot.ready).length,
      activeJobs: this.slots.filter((slot) => slot.activeJob !== null).length,
      queuedJobs: this.queue.length,
      workersCreated: this.workersCreated,
      workerReplacements: this.workerReplacements,
    };
  }

  solve(facelets: string, signal?: AbortSignal): Promise<unknown> {
    if (this.closed || signal?.aborted) {
      return Promise.reject(new SolverV1Error("SOLVER_UNAVAILABLE"));
    }

    const immediatelyAvailable = this.slots.some(
      (slot) => slot.ready && slot.activeJob === null
    );

    if (
      !immediatelyAvailable &&
      this.queue.length >= this.maxQueueLength
    ) {
      return Promise.reject(new SolverV1Error("SOLVER_UNAVAILABLE"));
    }

    return new Promise<unknown>((resolve, reject) => {
      const jobId = `solver-job-${this.jobCounter}`;
      this.jobCounter += 1;

      const job: PendingJob = {
        jobId,
        facelets,
        resolve,
        reject,
        timer: setTimeout(
          () => this.cancelJob(job, "SOLVER_TIMEOUT"),
          this.deadlineMs
        ),
        signal: signal ?? null,
        abortListener: null,
        state: "QUEUED",
      };

      if (signal) {
        job.abortListener = () =>
          this.cancelJob(job, "SOLVER_UNAVAILABLE");
        signal.addEventListener("abort", job.abortListener, { once: true });
      }

      this.queue.push(job);

      if (signal?.aborted) {
        this.cancelJob(job, "SOLVER_UNAVAILABLE");
        return;
      }

      this.ensureCapacity();
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    for (const job of [...this.queue]) {
      this.settleJob(job, new SolverV1Error("SOLVER_UNAVAILABLE"));
    }
    this.queue.length = 0;

    const terminations = this.slots.map((slot) => {
      slot.retiring = true;
      if (slot.activeJob) {
        this.settleJob(
          slot.activeJob,
          new SolverV1Error("SOLVER_UNAVAILABLE")
        );
        slot.activeJob = null;
      }
      return slot.worker.terminate();
    });

    this.slots.length = 0;
    await Promise.allSettled(terminations);
  }

  private ensureCapacity(): void {
    const activeJobs = this.slots.filter(
      (slot) => slot.activeJob !== null
    ).length;
    const required = Math.min(
      this.maxWorkers,
      Math.max(1, activeJobs + this.queue.length)
    );

    this.desiredWorkerCount = Math.max(this.desiredWorkerCount, required);

    while (
      !this.closed &&
      this.slots.length < this.desiredWorkerCount
    ) {
      if (!this.createSlot(false)) {
        break;
      }
    }
  }

  private createSlot(replacement: boolean): boolean {
    let worker: Worker;

    try {
      worker = this.workerFactory();
    } catch {
      this.rejectQueuedAsUnavailable();
      this.desiredWorkerCount = this.slots.length;
      return false;
    }

    const slot: WorkerSlot = {
      worker,
      ready: false,
      retiring: false,
      activeJob: null,
    };

    this.slots.push(slot);
    this.workersCreated += 1;
    if (replacement) {
      this.workerReplacements += 1;
    }

    worker.on("message", (message: unknown) =>
      this.onWorkerMessage(slot, message)
    );
    worker.on("error", () => this.onWorkerCrash(slot));
    worker.on("exit", (code) => {
      if (code !== 0) {
        this.onWorkerCrash(slot);
      }
    });

    return true;
  }

  private onWorkerMessage(slot: WorkerSlot, message: unknown): void {
    if (
      slot.retiring ||
      typeof message !== "object" ||
      message === null ||
      !("type" in message)
    ) {
      return;
    }

    const response = message as CubeJsWorkerResponseV1;

    if (response.type === "READY") {
      slot.ready = true;
      this.dispatch();
      return;
    }

    if (response.type === "INIT_FAILED") {
      this.retireSlot(slot, false);
      this.rejectQueuedAsUnavailable();
      return;
    }

    const job = slot.activeJob;

    if (!job || response.jobId !== job.jobId) {
      return;
    }

    slot.activeJob = null;

    if (response.type === "SOLVED") {
      this.settleJob(job, null, response.solution);
    } else {
      this.settleJob(job, new SolverV1Error("SOLVER_UNAVAILABLE"));
    }

    this.dispatch();
  }

  private onWorkerCrash(slot: WorkerSlot): void {
    if (slot.retiring || !this.slots.includes(slot)) {
      return;
    }

    const activeJob = slot.activeJob;
    this.retireSlot(slot, false);

    if (activeJob) {
      this.settleJob(activeJob, new SolverV1Error("SOLVER_UNAVAILABLE"));
    }

    if (!this.closed && this.slots.length < this.desiredWorkerCount) {
      this.createSlot(true);
    }

    this.dispatch();
  }

  private dispatch(): void {
    if (this.closed) {
      return;
    }

    for (const slot of this.slots) {
      if (!slot.ready || slot.activeJob || this.queue.length === 0) {
        continue;
      }

      const job = this.queue.shift();

      if (!job || job.state !== "QUEUED") {
        continue;
      }

      job.state = "RUNNING";
      slot.activeJob = job;

      const request: CubeJsWorkerRequestV1 = {
        type: "SOLVE",
        jobId: job.jobId,
        facelets: job.facelets,
      };

      try {
        slot.worker.postMessage(request);
      } catch {
        slot.activeJob = null;
        this.settleJob(job, new SolverV1Error("SOLVER_UNAVAILABLE"));
        this.retireSlot(slot, true);
      }
    }

    this.ensureCapacity();
  }

  private cancelJob(
    job: PendingJob,
    code: "SOLVER_TIMEOUT" | "SOLVER_UNAVAILABLE"
  ): void {
    if (job.state === "SETTLED") {
      return;
    }

    if (job.state === "QUEUED") {
      const queueIndex = this.queue.indexOf(job);
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1);
      }
      this.settleJob(job, new SolverV1Error(code));
      return;
    }

    const slot = this.slots.find(
      (candidate) => candidate.activeJob === job
    );

    if (slot) {
      slot.activeJob = null;
      this.settleJob(job, new SolverV1Error(code));
      this.retireSlot(slot, true);
      this.dispatch();
      return;
    }

    this.settleJob(job, new SolverV1Error(code));
  }

  private settleJob(
    job: PendingJob,
    error: SolverV1Error | null,
    solution?: unknown
  ): void {
    if (job.state === "SETTLED") {
      return;
    }

    job.state = "SETTLED";
    clearTimeout(job.timer);

    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
    }

    if (error) {
      job.reject(error);
    } else {
      job.resolve(solution);
    }
  }

  private retireSlot(slot: WorkerSlot, replace: boolean): void {
    if (slot.retiring) {
      return;
    }

    slot.retiring = true;
    const index = this.slots.indexOf(slot);
    if (index >= 0) {
      this.slots.splice(index, 1);
    }
    void slot.worker.terminate();

    if (
      replace &&
      !this.closed &&
      this.slots.length < this.desiredWorkerCount
    ) {
      this.createSlot(true);
    }
  }

  private rejectQueuedAsUnavailable(): void {
    for (const job of [...this.queue]) {
      this.settleJob(job, new SolverV1Error("SOLVER_UNAVAILABLE"));
    }
    this.queue.length = 0;
  }
}
