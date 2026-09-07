import type { MoveV1 } from "../../types/solver-v1";

export type CachedVerifiedSolutionV1 = {
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
  verified: true;
};

export interface SolverCacheV1Port {
  get(key: string): CachedVerifiedSolutionV1 | null;
  set(key: string, value: CachedVerifiedSolutionV1): void;
  delete(key: string): boolean;
  clear(): void;
}

type CacheEntry = {
  value: CachedVerifiedSolutionV1;
  expiresAt: number;
};

function immutableCopy(
  value: CachedVerifiedSolutionV1
): CachedVerifiedSolutionV1 {
  return Object.freeze({
    moves: Object.freeze([...value.moves]),
    htm: value.htm,
    qtm: value.qtm,
    verified: true as const,
  });
}

export class SolverCacheV1 implements SolverCacheV1Port {
  static readonly MAX_ENTRIES = 500;
  static readonly TTL_MS = 30 * 60 * 1000;

  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly now: () => number = Date.now
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): CachedVerifiedSolutionV1 | null {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);

    return immutableCopy(entry.value);
  }

  set(key: string, value: CachedVerifiedSolutionV1): void {
    const entry: CacheEntry = {
      value: immutableCopy(value),
      expiresAt: this.now() + SolverCacheV1.TTL_MS,
    };

    this.entries.delete(key);
    this.entries.set(key, entry);

    while (this.entries.size > SolverCacheV1.MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string;
      this.entries.delete(oldestKey);
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
