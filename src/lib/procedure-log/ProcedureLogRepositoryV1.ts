import type { MoveV1 } from "../../types/solver-v1";

export type ProcedureLogRecordV1 = Readonly<{
  id: string;
  ownerId: string;
  schemaVersion: "1.0";
  label?: string;
  cubeFormat: "URFDLB_FACELETS_V1";
  cubeFacelets: string;
  cubeStateId: string;
  moves: readonly MoveV1[];
  htm: number;
  qtm: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ProcedureLogCreateRecordV1 = ProcedureLogRecordV1;

export type ProcedureLogListRecordV1 = Readonly<{
  id: string;
  ownerId: string;
  schemaVersion: "1.0";
  label?: string;
  cubeFormat: "URFDLB_FACELETS_V1";
  cubeStateId: string;
  htm: number;
  qtm: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ProcedureLogCursorV1 = Readonly<{
  createdAt: string;
  id: string;
}>;

export type ProcedureLogListQueryV1 = Readonly<{
  limit: number;
  cursor?: ProcedureLogCursorV1;
}>;

export type ProcedureLogRecordPageV1 = Readonly<{
  records: readonly ProcedureLogListRecordV1[];
  nextCursor?: ProcedureLogCursorV1;
}>;

export interface ProcedureLogRepositoryV1 {
  create(record: ProcedureLogCreateRecordV1): Promise<ProcedureLogRecordV1>;
  listByOwner(
    ownerId: string,
    query: ProcedureLogListQueryV1,
  ): Promise<ProcedureLogRecordPageV1>;
  findByOwnerAndId(
    ownerId: string,
    id: string,
  ): Promise<ProcedureLogRecordV1 | null>;
  deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean>;
}
