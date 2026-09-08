import { describe, expect, it } from "vitest";

import {
  CUBE_DRAFT_CENTER_INDEXES_V1,
  CUBE_DRAFT_FACES_V1,
  SOLVED_CUBE_DRAFT_FACELETS_V1,
  createEmptyCubeDraftV1,
  createSolvedCubeDraftV1,
  serializeCubeDraftV1,
  updateCubeDraftTokenV1,
  validateCubeDraftV1,
  type CubeDraftTokenV1,
} from "../../src/lib/ui/cubeDraftV1";

describe("C4 CubeDraftV1", () => {
  it("C4-01 creates 48 unknown stickers and six canonical centers", () => {
    const draft = createEmptyCubeDraftV1();

    expect(draft).toHaveLength(54);
    expect(draft.filter((token) => token === "N")).toHaveLength(48);
    for (const face of CUBE_DRAFT_FACES_V1) {
      expect(draft[CUBE_DRAFT_CENTER_INDEXES_V1[face]]).toBe(face);
    }
  });

  it("C4-02 serializes in exact U, R, F, D, L, B face order", () => {
    expect(serializeCubeDraftV1(createSolvedCubeDraftV1())).toBe(
      SOLVED_CUBE_DRAFT_FACELETS_V1
    );
  });

  it("C4-03 keeps every center immutable while editing non-centers", () => {
    const initial = createEmptyCubeDraftV1();

    for (const face of CUBE_DRAFT_FACES_V1) {
      expect(
        updateCubeDraftTokenV1(
          initial,
          CUBE_DRAFT_CENTER_INDEXES_V1[face],
          "N"
        )
      ).toBe(initial);
    }

    const edited = updateCubeDraftTokenV1(initial, 0, "R");
    expect(edited).not.toBe(initial);
    expect(edited[0]).toBe("R");
    expect(initial[0]).toBe("N");
  });

  it("C4-04 distinguishes EMPTY, INCOMPLETE, INVALID, and READY", () => {
    const empty = createEmptyCubeDraftV1();
    expect(validateCubeDraftV1(empty).state).toBe("EMPTY");

    const incomplete = updateCubeDraftTokenV1(empty, 0, "U");
    expect(validateCubeDraftV1(incomplete)).toMatchObject({
      state: "INCOMPLETE",
      unknownCount: 47,
    });

    expect(validateCubeDraftV1(empty.slice(1)).state).toBe("INVALID");
    expect(
      validateCubeDraftV1(
        empty.map((token, index) => (index === 0 ? "X" : token))
      ).state
    ).toBe("INVALID");
    expect(
      validateCubeDraftV1(
        empty.map((token, index) => (index === 4 ? "R" : token))
      ).state
    ).toBe("INVALID");

    const tooManyU = [...empty] as CubeDraftTokenV1[];
    for (const index of [0, 1, 2, 3, 5, 6, 7, 8, 9]) {
      tooManyU[index] = "U";
    }
    expect(validateCubeDraftV1(tooManyU).state).toBe("INVALID");
    expect(validateCubeDraftV1(createSolvedCubeDraftV1())).toMatchObject({
      state: "READY",
      message: "Ready for server validation",
      unknownCount: 0,
    });
  });

  it("C4-05 reports known token counts without converting unknowns", () => {
    const draft = updateCubeDraftTokenV1(createEmptyCubeDraftV1(), 0, "R");
    const validation = validateCubeDraftV1(draft);

    expect(validation.counts).toEqual({
      U: 1,
      R: 2,
      F: 1,
      D: 1,
      L: 1,
      B: 1,
    });
    expect(validation.unknownCount).toBe(47);
  });

  it("C4-06 loads the canonical solved example as READY", () => {
    const example = createSolvedCubeDraftV1();

    expect(Object.isFrozen(example)).toBe(true);
    expect(serializeCubeDraftV1(example)).toBe(
      SOLVED_CUBE_DRAFT_FACELETS_V1
    );
    expect(validateCubeDraftV1(example).state).toBe("READY");
  });
});
