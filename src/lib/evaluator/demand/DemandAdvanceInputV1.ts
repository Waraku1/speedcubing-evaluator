import type { Transition } from "../transition/Transition";
import { stableIdentity } from "./StableIdentity";

export const HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1 =
  "HUMAN_STATE_SOURCE_NOT_PROVIDED" as const;

export const UNOBSERVED_HUMAN_STATE_SOURCE_VERSION_ID_V1 = stableIdentity(
  "source-version",
  {
    sourceName: "HumanStateObservationBoundaryV1",
    sourceVersion: "1.0",
  }
);

export type UnobservedHumanStateBoundaryV1 = Readonly<{
  boundaryId: string;
  ordinal: number;
  status: "NOT_OBSERVED";
  reason: typeof HUMAN_STATE_SOURCE_NOT_PROVIDED_REASON_V1;
  sourceVersionId: string;
}>;

export type UnobservedDemandEpisodeV1 = Readonly<{
  kind: "UNOBSERVED_HUMAN_STATE";
  executionId: string;
  solutionTraceId: string;
  solutionTransitionIds: readonly string[];
  humanStateBoundaries: readonly UnobservedHumanStateBoundaryV1[];
}>;

export type DemandAdvanceInputV1 =
  | Readonly<{
      kind: "GOVERNED_TRANSITIONS";
      transitions: readonly Transition[];
    }>
  | UnobservedDemandEpisodeV1;
