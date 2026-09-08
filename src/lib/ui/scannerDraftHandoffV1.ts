import {
  CUBE_DRAFT_CENTER_INDEXES_V1,
  CUBE_DRAFT_FACES_V1,
  type CubeDraftTokenV1,
  type CubeDraftV1,
} from "./cubeDraftV1";

export const SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1 = "hca.scannerDraft.v1";
export const SCANNER_DRAFT_HANDOFF_MAX_BYTES_V1 = 1024;

export type ScannerDraftHandoffV1 = Readonly<{
  schemaId: "SCANNER_DRAFT_HANDOFF_V1";
  schemaVersion: "1.0";
  format: "URFDLB_DRAFT_V1";
  mappingVersion: "SCAN_POSE_V1";
  source: "SCANNER_OBSERVATION_HEURISTIC";
  tokens: string;
  reviewed: true;
}>;

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EXACT_KEYS = Object.freeze([
  "format",
  "mappingVersion",
  "reviewed",
  "schemaId",
  "schemaVersion",
  "source",
  "tokens",
]);

function hasCanonicalCenters(tokens: string): boolean {
  return CUBE_DRAFT_FACES_V1.every(
    (face) => tokens[CUBE_DRAFT_CENTER_INDEXES_V1[face]] === face
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function createScannerDraftHandoffV1(
  draft: readonly unknown[]
): ScannerDraftHandoffV1 {
  const tokens = draft.join("");
  if (!/^[URFDLBN]{54}$/.test(tokens) || !hasCanonicalCenters(tokens)) {
    throw new Error("Reviewed scanner draft is not a canonical 54-token draft.");
  }

  return Object.freeze({
    schemaId: "SCANNER_DRAFT_HANDOFF_V1",
    schemaVersion: "1.0",
    format: "URFDLB_DRAFT_V1",
    mappingVersion: "SCAN_POSE_V1",
    source: "SCANNER_OBSERVATION_HEURISTIC",
    tokens,
    reviewed: true,
  });
}

export function serializeScannerDraftHandoffV1(
  handoff: ScannerDraftHandoffV1
): string {
  const serialized = JSON.stringify(handoff);
  if (byteLength(serialized) > SCANNER_DRAFT_HANDOFF_MAX_BYTES_V1) {
    throw new Error("Scanner handoff exceeds its storage bound.");
  }
  return serialized;
}

export function parseScannerDraftHandoffV1(
  serialized: string
): ScannerDraftHandoffV1 | null {
  if (byteLength(serialized) > SCANNER_DRAFT_HANDOFF_MAX_BYTES_V1) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.length !== EXACT_KEYS.length ||
      keys.some((key, index) => key !== EXACT_KEYS[index]) ||
      record.schemaId !== "SCANNER_DRAFT_HANDOFF_V1" ||
      record.schemaVersion !== "1.0" ||
      record.format !== "URFDLB_DRAFT_V1" ||
      record.mappingVersion !== "SCAN_POSE_V1" ||
      record.source !== "SCANNER_OBSERVATION_HEURISTIC" ||
      record.reviewed !== true ||
      typeof record.tokens !== "string" ||
      !/^[URFDLBN]{54}$/.test(record.tokens) ||
      !hasCanonicalCenters(record.tokens)
    ) {
      return null;
    }

    return Object.freeze(record as ScannerDraftHandoffV1);
  } catch {
    return null;
  }
}

export function scannerHandoffToCubeDraftV1(
  handoff: ScannerDraftHandoffV1
): CubeDraftV1 {
  return Object.freeze(handoff.tokens.split("") as CubeDraftTokenV1[]);
}

export function writeScannerDraftHandoffV1(
  storage: StoragePort,
  draft: readonly unknown[]
): void {
  const handoff = createScannerDraftHandoffV1(draft);
  storage.setItem(
    SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1,
    serializeScannerDraftHandoffV1(handoff)
  );
}

/** Read once and delete before parsing so malformed payloads cannot replay. */
export function consumeScannerDraftHandoffV1(
  storage: StoragePort
): CubeDraftV1 | null {
  const serialized = storage.getItem(SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1);
  storage.removeItem(SCANNER_DRAFT_HANDOFF_STORAGE_KEY_V1);
  if (serialized === null) return null;

  const handoff = parseScannerDraftHandoffV1(serialized);
  return handoff === null ? null : scannerHandoffToCubeDraftV1(handoff);
}
