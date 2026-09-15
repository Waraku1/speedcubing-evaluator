import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  createC6ErrorFixture,
  createC6LargeTraceFixture,
  createC6NonSolvedFixture,
  createC6SolvedFixture,
} from "../fixtures/c6PresentationFixtures";
import {
  completeTwoPoseScan,
  installEvaluationFixture,
  installScannerStateMock,
  loadSolvedExample,
  expectNoDocumentOverflow,
  runFixtureEvaluation,
  startReadyScanner,
} from "./helpers/c7c2";

const CANDIDATE_HEAD = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const BASE_URL = "http://localhost:3000";
const OUTPUT_DIRECTORY = path.resolve(
  process.cwd(),
  "artifacts/visual-signoff/c7-c2"
);
const VIEWPORTS = [
  { label: "360x800", width: 360, height: 800 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1440x900", width: 1440, height: 900 },
] as const;

type Viewport = (typeof VIEWPORTS)[number];
type EvidenceRecord = Readonly<{
  index: number;
  surface: "workbench" | "scanner";
  state: string;
  viewport: string;
  file: string;
  sha256: string;
}>;

async function screenshot(
  page: Page,
  index: number,
  surface: EvidenceRecord["surface"],
  state: string,
  viewport: Viewport
): Promise<EvidenceRecord> {
  const file = `${String(index).padStart(2, "0")}-${surface}-${state}-${viewport.label}.png`;
  const absolutePath = path.join(OUTPUT_DIRECTORY, file);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: absolutePath,
  });
  const sha256 = createHash("sha256")
    .update(await readFile(absolutePath))
    .digest("hex");
  return { index, surface, state, viewport: viewport.label, file, sha256 };
}

async function workbenchPage(
  browser: Browser,
  viewport: Viewport,
  state:
    | "empty"
    | "ready"
    | "solved"
    | "non-solved"
    | "status-only-demand"
    | "trace-l2"
    | "trace-l3"
    | "api-error"
): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  const page = await context.newPage();

  if (state === "empty") {
    await page.goto("/");
  } else if (state === "ready") {
    await page.goto("/");
    await loadSolvedExample(page);
  } else if (state === "api-error") {
    await installEvaluationFixture(page, createC6ErrorFixture(), 503);
    await page.goto("/");
    await loadSolvedExample(page);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByTestId("error-summary")).toBeFocused();
  } else {
    const fixture =
      state === "non-solved"
        ? createC6NonSolvedFixture()
        : state === "trace-l2" || state === "trace-l3"
          ? createC6LargeTraceFixture()
          : createC6SolvedFixture();
    await installEvaluationFixture(page, fixture);
    await page.goto("/");
    await runFixtureEvaluation(page);

    if (state === "status-only-demand") {
      await page
        .getByRole("heading", { name: "Domain Demand" })
        .scrollIntoViewIfNeeded();
    } else if (state === "trace-l2" || state === "trace-l3") {
      await page
        .getByRole("button", { name: "Show Trace Level 2 identifiers" })
        .click();
      if (state === "trace-l3") {
        await page
          .getByRole("button", { name: /View technical details/ })
          .first()
          .click();
        await page.getByTestId("trace-level-3").scrollIntoViewIfNeeded();
      } else {
        await page
          .getByRole("heading", { name: /Trace Level 2/ })
          .scrollIntoViewIfNeeded();
      }
    }
  }

  return { context, page };
}

async function scannerPage(
  browser: Browser,
  viewport: Viewport,
  state:
    | "before-start"
    | "permission-loading"
    | "pose-1"
    | "pose-2"
    | "review-with-n"
    | "manual-correction"
    | "error-recovery"
    | "handoff-ready"
): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  const page = await context.newPage();
  const reviewHasUnknown =
    state === "review-with-n" || state === "manual-correction";
  await installScannerStateMock(page, {
    mode:
      state === "permission-loading"
        ? "MODEL_PENDING"
        : state === "error-recovery"
          ? "CAMERA_DENIED"
          : "READY",
    reviewHasUnknown,
  });
  await page.goto("/detect");

  if (state === "permission-loading") {
    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="MODEL_LOADING"]')).toBeVisible();
  } else if (state === "pose-1") {
    await startReadyScanner(page);
  } else if (state === "pose-2") {
    await startReadyScanner(page);
    await page.getByRole("button", { name: "Capture pose 1" }).click();
    await expect(page.getByRole("button", { name: "Capture pose 2" })).toBeVisible();
  } else if (
    state === "review-with-n" ||
    state === "manual-correction" ||
    state === "handoff-ready"
  ) {
    await completeTwoPoseScan(page);
    if (state === "manual-correction") {
      await page.getByRole("radio", { name: /White/ }).click();
      const unknownSticker = page
        .locator('[data-sticker-editable="true"][data-token="N"]')
        .first();
      const stickerIndex = await unknownSticker.getAttribute("data-sticker-index");
      expect(stickerIndex).not.toBeNull();
      await unknownSticker.click();
      await expect(page.locator(`[data-sticker-index="${stickerIndex}"]`)).toHaveAttribute(
        "data-token",
        "U"
      );
      await expect(
        page.locator('[data-sticker-editable="true"][data-token="N"]')
      ).toHaveCount(1);
    }
    if (state === "handoff-ready") {
      await page
        .getByRole("button", { name: "Use reviewed draft in evaluator" })
        .scrollIntoViewIfNeeded();
    }
  } else if (state === "error-recovery") {
    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.locator('[data-scanner-state="ERROR"]')).toBeVisible();
  }

  await expectNoDocumentOverflow(page);

  return { context, page };
}

test("captures the indexed C7-C2 visual sign-off matrix", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const evidence: EvidenceRecord[] = [];
  let index = 1;
  const workbenchStates = [
    "empty",
    "ready",
    "solved",
    "non-solved",
    "status-only-demand",
    "trace-l2",
    "trace-l3",
    "api-error",
  ] as const;
  const scannerStates = [
    "before-start",
    "permission-loading",
    "pose-1",
    "pose-2",
    "review-with-n",
    "manual-correction",
    "error-recovery",
    "handoff-ready",
  ] as const;

  for (const viewport of VIEWPORTS) {
    for (const state of workbenchStates) {
      const capture = await workbenchPage(browser, viewport, state);
      try {
        evidence.push(
          await screenshot(capture.page, index, "workbench", state, viewport)
        );
        index += 1;
      } finally {
        await capture.context.close();
      }
    }
    for (const state of scannerStates) {
      const capture = await scannerPage(browser, viewport, state);
      try {
        evidence.push(
          await screenshot(capture.page, index, "scanner", state, viewport)
        );
        index += 1;
      } finally {
        await capture.context.close();
      }
    }
  }

  expect(evidence).toHaveLength(48);
  await writeFile(
    path.join(OUTPUT_DIRECTORY, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1.0",
        candidateSha: CANDIDATE_HEAD,
        browser: "chromium",
        classification: "AUTOMATED_VISUAL_SIGNOFF",
        evidence,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
});
