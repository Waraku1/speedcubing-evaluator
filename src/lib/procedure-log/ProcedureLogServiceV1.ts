import { randomUUID } from "node:crypto";

import type { CreateProcedureLogRequestV1 } from "../../types/procedure-log-v1";
import { MOVE_V1_TOKENS } from "../../types/solver-v1";
import { applyMoves, countHTM, countQTM, SOLVED_STATE } from "../cube/moves";
import { createCubeFaceletStateV1 } from "../cube/cubeStateV1";
import type {
  ProcedureLogListQueryV1,
  ProcedureLogRecordPageV1,
  ProcedureLogRecordV1,
  ProcedureLogRepositoryV1,
} from "./ProcedureLogRepositoryV1";
import { ProcedureLogV1Error } from "./procedureLogErrorsV1";

export type ProcedureLogServiceDependenciesV1 = Readonly<{
  repository: ProcedureLogRepositoryV1;
  idFactory?: () => string;
  now?: () => Date;
}>;

const MOVE_TOKENS = new Set<string>(MOVE_V1_TOKENS);

function assertOwnerId(ownerId: string): void {
  if (!/^github:\d{1,20}$/.test(ownerId)) {
    throw new ProcedureLogV1Error("UNAUTHORIZED");
  }
}

export class ProcedureLogServiceV1 {
  private readonly repository: ProcedureLogRepositoryV1;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(dependencies: ProcedureLogServiceDependenciesV1) {
    this.repository = dependencies.repository;
    this.idFactory = dependencies.idFactory ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(
    ownerId: string,
    intent: CreateProcedureLogRequestV1,
  ): Promise<ProcedureLogRecordV1> {
    assertOwnerId(ownerId);

    let cube: ReturnType<typeof createCubeFaceletStateV1>;
    try {
      cube = createCubeFaceletStateV1(intent.cubeState.facelets);
    } catch {
      throw new ProcedureLogV1Error("INVALID_CUBE_STATE");
    }

    if (
      intent.moves.length > 512 ||
      !intent.moves.every((move) => MOVE_TOKENS.has(move))
    ) {
      throw new ProcedureLogV1Error("INVALID_MOVE_SEQUENCE");
    }

    let finalState: string;
    try {
      finalState = applyMoves(cube.facelets, intent.moves);
    } catch {
      throw new ProcedureLogV1Error("INVALID_MOVE_SEQUENCE");
    }
    if (finalState !== SOLVED_STATE) {
      throw new ProcedureLogV1Error("PROCEDURE_DOES_NOT_SOLVE");
    }

    const timestamp = this.now().toISOString();
    const created = await this.repository.create(Object.freeze({
      id: this.idFactory(),
      ownerId,
      schemaVersion: "1.0" as const,
      ...(intent.label === undefined ? {} : { label: intent.label }),
      cubeFormat: cube.format,
      cubeFacelets: cube.facelets,
      cubeStateId: cube.stateId,
      moves: Object.freeze([...intent.moves]),
      htm: countHTM(intent.moves),
      qtm: countQTM(intent.moves),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    if (created.ownerId !== ownerId) {
      throw new ProcedureLogV1Error("INTERNAL_FAILURE");
    }
    return created;
  }

  async list(
    ownerId: string,
    query: ProcedureLogListQueryV1,
  ): Promise<ProcedureLogRecordPageV1> {
    assertOwnerId(ownerId);
    const page = await this.repository.listByOwner(ownerId, query);
    if (page.records.some((record) => record.ownerId !== ownerId)) {
      throw new ProcedureLogV1Error("INTERNAL_FAILURE");
    }
    return page;
  }

  async find(ownerId: string, id: string): Promise<ProcedureLogRecordV1> {
    assertOwnerId(ownerId);
    const record = await this.repository.findByOwnerAndId(ownerId, id);
    if (record === null) throw new ProcedureLogV1Error("NOT_FOUND");
    if (record.ownerId !== ownerId) {
      throw new ProcedureLogV1Error("INTERNAL_FAILURE");
    }
    return record;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    assertOwnerId(ownerId);
    if (!(await this.repository.deleteByOwnerAndId(ownerId, id))) {
      throw new ProcedureLogV1Error("NOT_FOUND");
    }
  }
}
