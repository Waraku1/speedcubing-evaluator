import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import {
  MOVE_V1_TOKENS,
  type MoveV1,
} from "../../types/solver-v1";
import { countQTM } from "../cube/moves";
import type {
  ProcedureLogCreateRecordV1,
  ProcedureLogListQueryV1,
  ProcedureLogListRecordV1,
  ProcedureLogRecordPageV1,
  ProcedureLogRecordV1,
  ProcedureLogRepositoryV1,
} from "./ProcedureLogRepositoryV1";
import { ProcedureLogV1Error } from "./procedureLogErrorsV1";

type QueryPortV1 = Pick<NeonQueryFunction<false, false>, "query">;
type DatabaseRowV1 = Readonly<Record<string, unknown>>;
type EnvironmentSourceV1 = Readonly<Record<string, string | undefined>>;

const OWNER_ID_PATTERN = /^github:\d{1,20}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_ID_PATTERN = /^[a-f0-9]{64}$/;
const MOVE_TOKENS = new Set<string>(MOVE_V1_TOKENS);

const SNAPSHOT_COLUMNS = `
  id,
  owner_id,
  schema_version,
  label,
  cube_format,
  cube_facelets,
  cube_state_id,
  moves_json,
  htm,
  qtm,
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
  htm,
  qtm,
  created_at,
  updated_at
`;

function requiredString(row: DatabaseRowV1, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  return value;
}

function requiredInteger(row: DatabaseRowV1, key: string): number {
  const value = row[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  return parsed;
}

function timestamp(row: DatabaseRowV1, key: string): string {
  const value = row[key];
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  return parsed.toISOString();
}

function movesValue(value: unknown): readonly MoveV1[] {
  let parsed = value;
  try {
    if (typeof value === "string") parsed = JSON.parse(value) as unknown;
  } catch {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 512 ||
    !parsed.every((move) => typeof move === "string" && MOVE_TOKENS.has(move))
  ) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  return Object.freeze([...parsed]) as readonly MoveV1[];
}

function mapMetadata(row: DatabaseRowV1): ProcedureLogListRecordV1 {
  const id = requiredString(row, "id");
  const ownerId = requiredString(row, "owner_id");
  const schemaVersion = requiredString(row, "schema_version");
  const cubeFormat = requiredString(row, "cube_format");
  const cubeStateId = requiredString(row, "cube_state_id");
  const htm = requiredInteger(row, "htm");
  const qtm = requiredInteger(row, "qtm");
  const rawLabel = row.label;
  const createdAt = timestamp(row, "created_at");
  const updatedAt = timestamp(row, "updated_at");

  if (
    !UUID_PATTERN.test(id) ||
    !OWNER_ID_PATTERN.test(ownerId) ||
    schemaVersion !== "1.0" ||
    cubeFormat !== "URFDLB_FACELETS_V1" ||
    !STATE_ID_PATTERN.test(cubeStateId) ||
    (rawLabel !== null &&
      rawLabel !== undefined &&
      (typeof rawLabel !== "string" ||
        Array.from(rawLabel).length < 1 ||
        Array.from(rawLabel).length > 120)) ||
    htm > 512 ||
    qtm < htm ||
    qtm > 1024 ||
    new Date(updatedAt).getTime() < new Date(createdAt).getTime()
  ) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }

  return Object.freeze({
    id,
    ownerId,
    schemaVersion,
    ...(typeof rawLabel === "string" ? { label: rawLabel } : {}),
    cubeFormat,
    cubeStateId,
    htm,
    qtm,
    createdAt,
    updatedAt,
  });
}

function mapSnapshot(row: DatabaseRowV1): ProcedureLogRecordV1 {
  const metadata = mapMetadata(row);
  const cubeFacelets = requiredString(row, "cube_facelets");
  const moves = movesValue(row.moves_json);
  if (
    !/^[URFDLB]{54}$/.test(cubeFacelets) ||
    moves.length !== metadata.htm ||
    countQTM(moves) !== metadata.qtm
  ) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
  return Object.freeze({
    ...metadata,
    cubeFacelets,
    moves,
  });
}

function assertOwnerId(ownerId: string): void {
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
}

function assertId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new ProcedureLogV1Error("INTERNAL_FAILURE");
  }
}

async function storageQuery(
  query: QueryPortV1,
  text: string,
  values: readonly unknown[],
): Promise<readonly DatabaseRowV1[]> {
  try {
    return (await query.query(text, [...values])) as readonly DatabaseRowV1[];
  } catch {
    throw new ProcedureLogV1Error("STORAGE_UNAVAILABLE");
  }
}

export class PostgresProcedureLogRepositoryV1
  implements ProcedureLogRepositoryV1
{
  constructor(private readonly query: QueryPortV1) {}

  async create(
    record: ProcedureLogCreateRecordV1,
  ): Promise<ProcedureLogRecordV1> {
    assertOwnerId(record.ownerId);
    assertId(record.id);
    const rows = await storageQuery(
      this.query,
      `INSERT INTO procedure_logs (
        id, owner_id, schema_version, label, cube_format, cube_facelets,
        cube_state_id, moves_json, htm, qtm, created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6,
        $7, $8::jsonb, $9::integer, $10::integer,
        $11::timestamptz, $12::timestamptz
      ) RETURNING ${SNAPSHOT_COLUMNS}`,
      [
        record.id,
        record.ownerId,
        record.schemaVersion,
        record.label ?? null,
        record.cubeFormat,
        record.cubeFacelets,
        record.cubeStateId,
        JSON.stringify(record.moves),
        record.htm,
        record.qtm,
        record.createdAt,
        record.updatedAt,
      ],
    );
    if (rows.length !== 1) {
      throw new ProcedureLogV1Error("STORAGE_UNAVAILABLE");
    }
    return mapSnapshot(rows[0]);
  }

  async listByOwner(
    ownerId: string,
    query: ProcedureLogListQueryV1,
  ): Promise<ProcedureLogRecordPageV1> {
    assertOwnerId(ownerId);
    const rowLimit = query.limit + 1;
    const rows = query.cursor === undefined
      ? await storageQuery(
          this.query,
          `SELECT ${LIST_COLUMNS}
           FROM procedure_logs
           WHERE owner_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2::integer`,
          [ownerId, rowLimit],
        )
      : await storageQuery(
          this.query,
          `SELECT ${LIST_COLUMNS}
           FROM procedure_logs
           WHERE owner_id = $1
             AND (created_at, id) < ($2::timestamptz, $3::uuid)
           ORDER BY created_at DESC, id DESC
           LIMIT $4::integer`,
          [ownerId, query.cursor.createdAt, query.cursor.id, rowLimit],
        );
    const records = rows.slice(0, query.limit).map(mapMetadata);
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
    id: string,
  ): Promise<ProcedureLogRecordV1 | null> {
    assertOwnerId(ownerId);
    assertId(id);
    const rows = await storageQuery(
      this.query,
      `SELECT ${SNAPSHOT_COLUMNS}
       FROM procedure_logs
       WHERE owner_id = $1 AND id = $2::uuid
       LIMIT 1`,
      [ownerId, id],
    );
    return rows.length === 0 ? null : mapSnapshot(rows[0]);
  }

  async deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean> {
    assertOwnerId(ownerId);
    assertId(id);
    const rows = await storageQuery(
      this.query,
      `DELETE FROM procedure_logs
       WHERE owner_id = $1 AND id = $2::uuid
       RETURNING id`,
      [ownerId, id],
    );
    return rows.length === 1;
  }
}

export function createPostgresProcedureLogRepositoryV1(
  source: EnvironmentSourceV1 = process.env,
): ProcedureLogRepositoryV1 {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ProcedureLogV1Error("STORAGE_UNAVAILABLE");
  }
  try {
    return new PostgresProcedureLogRepositoryV1(neon(databaseUrl));
  } catch {
    throw new ProcedureLogV1Error("STORAGE_UNAVAILABLE");
  }
}
