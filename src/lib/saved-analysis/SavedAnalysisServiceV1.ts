import { randomUUID } from "node:crypto";

import {
  CFOP_INPUT_MODE_V1,
  CFOP_SCHEMA_VERSION_V1,
  type CFOPRequestV1,
  type CFOPResultV1,
} from "../../types/cfop-v1";
import {
  EVALUATE_SCHEMA_VERSION_V1,
  type EvaluateRequestV1,
  type EvaluateResultV1,
} from "../../types/evaluate-v1";
import type { SaveAnalysisRequestV1 } from "../../types/saved-analysis-v1";
import {
  atomicDemandStopServiceV1,
  type AtomicDemandStopServiceV1,
} from "../integration/AtomicDemandStopServiceV1";
import {
  cfopServiceV1,
  type CFOPServiceV1,
} from "../integration/CFOPServiceV1";
import { isCFOPV1Error } from "../integration/cfopErrorsV1";
import { isEvaluateV1Error } from "../integration/evaluateErrorsV1";
import type {
  SavedAnalysisListQueryV1,
  SavedAnalysisRecordPageV1,
  SavedAnalysisRecordV1,
  SavedAnalysisRepositoryV1,
} from "./SavedAnalysisRepositoryV1";
import { SavedAnalysisV1Error } from "./savedAnalysisErrorsV1";

export type SavedAnalysisEvaluateApiPortV1 = Pick<
  AtomicDemandStopServiceV1,
  "execute"
>;
export type SavedAnalysisCFOPPortV1 = Pick<CFOPServiceV1, "execute">;

export type SavedAnalysisServiceDependenciesV1 = Readonly<{
  repository: SavedAnalysisRepositoryV1;
  evaluateApi?: SavedAnalysisEvaluateApiPortV1;
  cfop?: SavedAnalysisCFOPPortV1;
  idFactory?: () => string;
  now?: () => Date;
}>;

function assertOwnerId(ownerId: string): void {
  if (!/^github:\d{1,20}$/.test(ownerId)) {
    throw new SavedAnalysisV1Error("UNAUTHORIZED");
  }
}

function mapEvaluateApiFailure(error: unknown): SavedAnalysisV1Error {
  if (isEvaluateV1Error(error)) {
    if (
      error.code === "INVALID_CUBE_STATE" ||
      error.code === "UNSOLVABLE_CUBE"
    ) {
      return new SavedAnalysisV1Error(error.code);
    }
  }
  return new SavedAnalysisV1Error("ANALYSIS_FAILED");
}

function mapCFOPFailure(error: unknown): SavedAnalysisV1Error {
  if (isCFOPV1Error(error)) {
    if (
      error.code === "INVALID_CUBE_STATE" ||
      error.code === "UNSOLVABLE_CUBE"
    ) {
      return new SavedAnalysisV1Error(error.code);
    }
  }
  return new SavedAnalysisV1Error("CFOP_FAILED");
}

export class SavedAnalysisServiceV1 {
  private readonly repository: SavedAnalysisRepositoryV1;
  private readonly evaluateApi: SavedAnalysisEvaluateApiPortV1;
  private readonly cfop: SavedAnalysisCFOPPortV1;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(dependencies: SavedAnalysisServiceDependenciesV1) {
    this.repository = dependencies.repository;
    this.evaluateApi = dependencies.evaluateApi ?? atomicDemandStopServiceV1;
    this.cfop = dependencies.cfop ?? cfopServiceV1;
    this.idFactory = dependencies.idFactory ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  async create(
    ownerId: string,
    intent: SaveAnalysisRequestV1,
    signal?: AbortSignal
  ): Promise<SavedAnalysisRecordV1> {
    assertOwnerId(ownerId);
    const evaluateApiRequest: EvaluateRequestV1 = Object.freeze({
      schemaVersion: EVALUATE_SCHEMA_VERSION_V1,
      cubeState: intent.cubeState,
    });

    let analysisSnapshot: EvaluateResultV1;
    try {
      analysisSnapshot = await this.evaluateApi.execute(evaluateApiRequest, {
        signal,
      });
    } catch (error) {
      throw mapEvaluateApiFailure(error);
    }

    let cfopResult: CFOPResultV1 | undefined;
    if (intent.includeCfop) {
      const cfopRequest: CFOPRequestV1 = Object.freeze({
        schemaVersion: CFOP_SCHEMA_VERSION_V1,
        inputMode: CFOP_INPUT_MODE_V1,
        cubeState: intent.cubeState,
      });
      try {
        cfopResult = await this.cfop.execute(cfopRequest, { signal });
      } catch (error) {
        throw mapCFOPFailure(error);
      }
    }

    if (
      analysisSnapshot.cubeState.format !== intent.cubeState.format ||
      (cfopResult !== undefined &&
        (cfopResult.input.stateId !== analysisSnapshot.cubeState.stateId ||
          cfopResult.input.format !== intent.cubeState.format))
    ) {
      throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
    }

    const timestamp = this.now().toISOString();
    const created = await this.repository.create(
      Object.freeze({
        id: this.idFactory(),
        ownerId,
        schemaVersion: "1.0" as const,
        ...(intent.label === undefined ? {} : { label: intent.label }),
        cubeFormat: intent.cubeState.format,
        cubeFacelets: intent.cubeState.facelets,
        cubeStateId: analysisSnapshot.cubeState.stateId,
        evaluateApiSchemaVersion: EVALUATE_SCHEMA_VERSION_V1,
        analysisSnapshot,
        ...(cfopResult === undefined
          ? {}
          : {
              cfopSchemaVersion: CFOP_SCHEMA_VERSION_V1,
              cfopResult,
            }),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
    if (created.ownerId !== ownerId) {
      throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
    }
    return created;
  }

  async list(
    ownerId: string,
    query: SavedAnalysisListQueryV1
  ): Promise<SavedAnalysisRecordPageV1> {
    assertOwnerId(ownerId);
    const page = await this.repository.listByOwner(ownerId, query);
    if (page.records.some((record) => record.ownerId !== ownerId)) {
      throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
    }
    return page;
  }

  async find(ownerId: string, id: string): Promise<SavedAnalysisRecordV1> {
    assertOwnerId(ownerId);
    const record = await this.repository.findByOwnerAndId(ownerId, id);
    if (record === null) throw new SavedAnalysisV1Error("NOT_FOUND");
    if (record.ownerId !== ownerId) {
      throw new SavedAnalysisV1Error("INTERNAL_FAILURE");
    }
    return record;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    assertOwnerId(ownerId);
    if (!(await this.repository.deleteByOwnerAndId(ownerId, id))) {
      throw new SavedAnalysisV1Error("NOT_FOUND");
    }
  }
}
