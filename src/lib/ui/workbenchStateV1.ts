import {
  createEmptyCubeDraftV1,
  createSolvedCubeDraftV1,
  updateCubeDraftTokenV1,
  validateCubeDraftV1,
  type CubeDraftTokenV1,
  type CubeDraftV1,
  type LocalCubeValidationV1,
} from "./cubeDraftV1";
import type {
  UiEvaluateResultV1,
  UiPublicErrorV1,
} from "./evaluateUiTypesV1";

export type WorkbenchPhaseV1 =
  | "IDLE"
  | "EDITING"
  | "READY"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR"
  | "CANCELLED";

export type WorkbenchStateV1 = Readonly<{
  draft: CubeDraftV1;
  draftRevision: number;
  activeStickerIndex: number;
  selectedToken: CubeDraftTokenV1;
  validation: LocalCubeValidationV1;
  requestEpoch: number;
  phase: WorkbenchPhaseV1;
  result: UiEvaluateResultV1 | null;
  error: UiPublicErrorV1 | null;
  resultDetailsExpanded: boolean;
}>;

export type WorkbenchActionV1 =
  | Readonly<{ type: "SELECT_TOKEN"; token: CubeDraftTokenV1 }>
  | Readonly<{ type: "SET_ACTIVE_STICKER"; index: number }>
  | Readonly<{
      type: "EDIT_STICKER";
      index: number;
      token: CubeDraftTokenV1;
    }>
  | Readonly<{ type: "LOAD_SOLVED" }>
  | Readonly<{ type: "RESET" }>
  | Readonly<{ type: "BEGIN_SUBMIT"; epoch: number }>
  | Readonly<{
      type: "RECEIVE_SUCCESS";
      epoch: number;
      result: UiEvaluateResultV1;
    }>
  | Readonly<{
      type: "RECEIVE_ERROR";
      epoch: number;
      error: UiPublicErrorV1;
    }>
  | Readonly<{ type: "CANCEL"; epoch: number }>
  | Readonly<{ type: "SET_RESULT_DETAILS"; expanded: boolean }>;

function phaseForValidation(
  validation: LocalCubeValidationV1
): WorkbenchPhaseV1 {
  return validation.state === "READY" ? "READY" : "EDITING";
}

function replaceDraft(
  state: WorkbenchStateV1,
  draft: CubeDraftV1,
  phase?: WorkbenchPhaseV1
): WorkbenchStateV1 {
  const validation = validateCubeDraftV1(draft);

  return Object.freeze({
    ...state,
    draft,
    draftRevision: state.draftRevision + 1,
    validation,
    requestEpoch: state.requestEpoch + 1,
    phase: phase ?? phaseForValidation(validation),
    result: null,
    error: null,
    resultDetailsExpanded: false,
  });
}

export function createInitialWorkbenchStateV1(): WorkbenchStateV1 {
  const draft = createEmptyCubeDraftV1();

  return Object.freeze({
    draft,
    draftRevision: 0,
    activeStickerIndex: 0,
    selectedToken: "U",
    validation: validateCubeDraftV1(draft),
    requestEpoch: 0,
    phase: "IDLE",
    result: null,
    error: null,
    resultDetailsExpanded: false,
  });
}

export function workbenchReducerV1(
  state: WorkbenchStateV1,
  action: WorkbenchActionV1
): WorkbenchStateV1 {
  switch (action.type) {
    case "SELECT_TOKEN":
      return state.phase === "SUBMITTING"
        ? state
        : Object.freeze({ ...state, selectedToken: action.token });

    case "SET_ACTIVE_STICKER":
      return Object.freeze({ ...state, activeStickerIndex: action.index });

    case "EDIT_STICKER": {
      if (state.phase === "SUBMITTING") {
        return state;
      }

      const draft = updateCubeDraftTokenV1(
        state.draft,
        action.index,
        action.token
      );
      return draft === state.draft ? state : replaceDraft(state, draft);
    }

    case "LOAD_SOLVED":
      return state.phase === "SUBMITTING"
        ? state
        : replaceDraft(state, createSolvedCubeDraftV1(), "READY");

    case "RESET":
      return state.phase === "SUBMITTING"
        ? state
        : replaceDraft(state, createEmptyCubeDraftV1(), "IDLE");

    case "BEGIN_SUBMIT":
      if (
        state.validation.state !== "READY" ||
        state.phase === "SUBMITTING" ||
        action.epoch <= state.requestEpoch
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        requestEpoch: action.epoch,
        phase: "SUBMITTING",
        result: null,
        error: null,
      });

    case "RECEIVE_SUCCESS":
      if (
        state.phase !== "SUBMITTING" ||
        action.epoch !== state.requestEpoch
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        phase: "SUCCESS",
        result: action.result,
        error: null,
      });

    case "RECEIVE_ERROR":
      if (
        state.phase !== "SUBMITTING" ||
        action.epoch !== state.requestEpoch
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        phase: "ERROR",
        result: null,
        error: action.error,
      });

    case "CANCEL":
      if (
        state.phase !== "SUBMITTING" ||
        action.epoch !== state.requestEpoch
      ) {
        return state;
      }
      return Object.freeze({
        ...state,
        requestEpoch: action.epoch + 1,
        phase: "CANCELLED",
        result: null,
        error: null,
      });

    case "SET_RESULT_DETAILS":
      return Object.freeze({
        ...state,
        resultDetailsExpanded: action.expanded,
      });
  }
}
