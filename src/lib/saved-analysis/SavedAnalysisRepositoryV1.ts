import type { CFOPResultV1 } from "../../types/cfop-v1";
import type { EvaluateResultV1 } from "../../types/evaluate-v1";

export type SavedAnalysisRecordV1 = Readonly<{
  id: string;
  ownerId: string;
  schemaVersion: "1.0";
  label?: string;
  cubeFormat: "URFDLB_FACELETS_V1";
  cubeFacelets: string;
  cubeStateId: string;
  evaluateApiSchemaVersion: "1.0";
  analysisSnapshot: EvaluateResultV1;
  cfopSchemaVersion?: "1.0";
  cfopResult?: CFOPResultV1;
  createdAt: string;
  updatedAt: string;
}>;

export type SavedAnalysisCreateRecordV1 = SavedAnalysisRecordV1;

export type SavedAnalysisListRecordV1 = Readonly<{
  id: string;
  ownerId: string;
  schemaVersion: "1.0";
  label?: string;
  cubeFormat: "URFDLB_FACELETS_V1";
  cubeStateId: string;
  cfopSchemaVersion?: "1.0";
  createdAt: string;
  updatedAt: string;
}>;

export type SavedAnalysisCursorV1 = Readonly<{
  createdAt: string;
  id: string;
}>;

export type SavedAnalysisListQueryV1 = Readonly<{
  limit: number;
  cursor?: SavedAnalysisCursorV1;
}>;

export type SavedAnalysisRecordPageV1 = Readonly<{
  records: readonly SavedAnalysisListRecordV1[];
  nextCursor?: SavedAnalysisCursorV1;
}>;

export interface SavedAnalysisRepositoryV1 {
  create(record: SavedAnalysisCreateRecordV1): Promise<SavedAnalysisRecordV1>;
  listByOwner(
    ownerId: string,
    query: SavedAnalysisListQueryV1
  ): Promise<SavedAnalysisRecordPageV1>;
  findByOwnerAndId(
    ownerId: string,
    id: string
  ): Promise<SavedAnalysisRecordV1 | null>;
  deleteByOwnerAndId(ownerId: string, id: string): Promise<boolean>;
}
