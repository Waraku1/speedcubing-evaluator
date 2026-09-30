import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import type { CFOPResultV1 } from "../../types/cfop-v1";
import type { EvaluateResultV1 } from "../../types/evaluate-v1";
import type {
  SavedAnalysisCreateRecordV1,
  SavedAnalysisListRecordV1,
  SavedAnalysisRecordPageV1,
  SavedAnalysisRecordV1,
  SavedAnalysisRepositoryV1,
  SavedAnalysisListQueryV1,
} from "./SavedAnalysisRepositoryV1";
import { SavedAnalysisV1Error } from "./savedAnalysisErrorsV1";

type QueryPortV1 = Pick<NeonQueryFunction<false, false>, "query">;
type DatabaseRowV1 = Readonly<Record<string, unknown>>;
type EnvironmentSourceV1 = Readonly<Record<string, string | undefined>>;

const OWNER_ID_PATTERN = /^github:\d{1,20}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SNAPSHOT_COLUMNS = `
  id,
  owner_id,
  schema_version,
  label,
  cube_format,
  cube_facelets,
  cube_state_id,
  evaluate_api_schema_version,
  analysis_json,
  cfop_schema_version,
  cfop_json,
  created_at,
  updated_at
`;

const LIST_COLUMNS = `
  id,
  owner_id,
  schema_version,
  label,
  cube_format,
  cube_state_id,
  cfop_schema_version,
  created_at,
  updated_at
`;

function requiredString(row: DatabaseRowV1, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
  return value;
}

function timestamp(row: DatabaseRowV1, key: string): string {
  const value = row[key];
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
  return parsed.toISOString();
}

function jsonValue<T>(value: unknown): T {
  try {
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  } catch {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
}

function baseMetadata(row: DatabaseRowV1): SavedAnalysisListRecordV1 {
  const schemaVersion = requiredString(row, "schema_version");
  const cubeFormat = requiredString(row, "cube_format");
  const rawLabel = row.label;
  const rawCfopVersion = row.cfop_schema_version;
  if (
    schemaVersion !== "1.0" ||
    cubeFormat !== "URFDLB_FACELETS_V1" ||
    (rawLabel !== null &&
      rawLabel !== undefined &&
      typeof rawLabel !== "string") ||
    (rawCfopVersion !== null &&
      rawCfopVersion !== undefined &&
      rawCfopVersion !== "1.0")
  ) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }

  return Object.freeze({
    id: requiredString(row, "id"),
    ownerId: requiredString(row, "owner_id"),
    schemaVersion,
    ...(typeof rawLabel === "string" ? { label: rawLabel } : {}),
    cubeFormat,
    cubeStateId: requiredString(row, "cube_state_id"),
    ...(rawCfopVersion === "1.0" ? { cfopSchemaVersion: rawCfopVersion } : {}),
    createdAt: timestamp(row, "created_at"),
    updatedAt: timestamp(row, "updated_at"),
  });
}

function mapSnapshotRow(row: DatabaseRowV1): SavedAnalysisRecordV1 {
  const metadata = baseMetadata(row);
  const evaluateApiSchemaVersion = requiredString(
    row,
    "evaluate_api_schema_version"
  );
  const rawCfop = row.cfop_json;
  if (
    evaluateApiSchemaVersion !== "1.0" ||
    ((metadata.cfopSchemaVersion === undefined) !==
      (rawCfop === null || rawCfop === undefined))
  ) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }

  return Object.freeze({
    ...metadata,
    cubeFacelets: requiredString(row, "cube_facelets"),
    evaluateApiSchemaVersion,
    analysisSnapshot: jsonValue<EvaluateResultV1>(row.analysis_json),
    ...(metadata.cfopSchemaVersion === "1.0"
      ? { cfopResult: jsonValue<CFOPResultV1>(rawCfop) }
      : {}),
  });
}

function assertOwnerId(ownerId: string): void {
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
}

function assertId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
  }
}

async function storageQuery(
  query: QueryPortV1,
  text: string,
  values: readonly unknown[]
): Promise<readonly DatabaseRowV1[]> {
  try {
    return (await query.query(text, [...values])) as readonly DatabaseRowV1[];
  } catch {
    throw new SavedAnalysisV1Error("STORAGE_UNAVAILABLE");
  }
}

export class PostgresSavedAnalysisRepositoryV1
  implements SavedAnalysisRepositoryV1
{
  constructor(private readonly query: QueryPortV1) {}

  async create(
    record: SavedAnalysisCreateRecordV1
  ): Promise<SavedAnalysisRecordV1> {
    assertOwnerId(record.ownerId);
    assertId(record.id);
    const rows = await storageQuery(
      this.query,
      `INSERT INTO saved_analyses (
        id, owner_id, schema_version, label, cube_format, cube_facelets,
        cube_state_id, evaluate_api_schema_version, analysis_json,
        cfop_schema_version, cfop_json, created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6,
        $7, $8, $9::jsonb, $10, $11::jsonb, $12::timestamptz, $13::timestamptz
      ) RETURNING ${SNAPSHOT_COLUMNS}`,
      [
        record.id,
        record.ownerId,
        record.schemaVersion,
        record.label ?? null,
        record.cubeFormat,
        record.cubeFacelets,
        record.cubeStateId,
        record.evaluateApiSchemaVersion,
        JSON.stringify(record.analysisSnapshot),
        record.cfopSchemaVersion ?? null,
        record.cfopResult === undefined
          ? null
          : JSON.stringify(record.cfopResult),
        record.createdAt,
        record.updatedAt,
      ]
    );
    if (rows.length !== 1) {
      throw new SavedAnalysisV1Error("STORAGE_UNAVAILABLE");
    }
    return mapSnapshotRow(rows[0]);
  }

  async listByOwner(
    ownerId: string,
    query: SavedAnalysisListQueryV1
  ): Promise<SavedAnalysisRecordPageV1> {
    assertOwnerId(ownerId);
    const rowLimit = query.limit + 1;
    const rows =
      query.cursor === undefined
        ? await storageQuery(
            this.query,
            `SELECT ${LIST_COLUMNS}
             FROM saved_analyses
             WHERE owner_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2::integer`,
            [ownerId, rowLimit]
          )
        : await storageQuery(
            this.query,
            `SELECT ${LIST_COLUMNS}
             FROM saved_analyses
             WHERE owner_id = $1
               AND (created_at, id) < ($2::timestamptz, $3::uuid)
             ORDER BY created_at DESC, id DESC
             LIMIT $4::integer`,
            [ownerId, query.cursor.createdAt, query.cursor.id, rowLimit]
          );
    const records = rows.slice(0, query.limit).map(baseMetadata);
    const last = records.at(-1);
    return Object.freeze({
      records: Object.freeze(records),
      ...(rows.length > query.limit && last !== undefined
        ? { nextCursor: Object.freeze({ createdAt: last.createdAt, id: last.id }) }
        : {}),
    });
  }

  async findByOwnerAndId(
    ownerId: string,
    id: string
  ): Promise<SavedAnalysisRecordV1 | null> {
    assertOwnerId(ownerId);
    assertId(id);
    const rows = await storageQuery(
      this.query,
      `SELECT ${SNAPSHOT_COLUMNS}
       FROM saved_analyses
       WHERE owner_id = $1 AND id = $2::uuid
       LIMIT 1`,
      [ownerId, id]
    );
    return rows.length === 0 ? null : mapSnapshotRow(rows[0]);
  }

  async deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean> {
    assertOwnerId(ownerId);
    assertId(id);
    const rows = await storageQuery(
      this.query,
      `DELETE FROM saved_analyses
       WHERE owner_id = $1 AND id = $2::uuid
       RETURNING id`,
      [ownerId, id]
    );
    return rows.length === 1;
  }
}

export function createPostgresSavedAnalysisRepositoryV1(
  source: EnvironmentSourceV1 = process.env
): SavedAnalysisRepositoryV1 {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new SavedAnalysisV1Error("STORAGE_UNAVAILABLE");
  }
  return new PostgresSavedAnalysisRepositoryV1(neon(databaseUrl));
}
