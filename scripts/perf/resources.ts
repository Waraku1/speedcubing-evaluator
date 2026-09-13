import type { PerfResource } from "./contracts";

export type ResourceObservation = Readonly<{
  url: string;
  resourceType: string;
  encodedBytes: number;
  decodedBytes: number;
  transferBytes: number;
  responseBody?: string;
}>;

const NON_NEGATIVE_FIELDS = [
  "encodedBytes",
  "decodedBytes",
  "transferBytes",
] as const;

export function sanitizedResourceUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return rawUrl.split(/[?#]/, 1)[0];
  }
}

export function classifyResource(
  observation: ResourceObservation
): PerfResource["category"] {
  const searchable = `${observation.url}\n${observation.responseBody ?? ""}`;

  if (/cube_pose(?:\.[a-f0-9]+)?\.onnx(?:\?|$)/i.test(observation.url)) {
    return "ONNX_MODEL";
  }
  if (/\.wasm(?:\?|$)/i.test(observation.url) || /onnxruntime/i.test(searchable)) {
    return "ORT_WASM";
  }
  if (
    /\/detect\/.*\.js(?:\?|$)/i.test(observation.url) ||
    (/(?:scannerWorkerV1|hca-cube-scanner)/i.test(searchable) &&
      /(?:LOAD_MODEL|MODEL_READY|INFER)/.test(searchable))
  ) {
    return "SCANNER_CHUNK";
  }
  if (/getUserMedia|mediaDevices|CameraViewport|scannerRuntimeV1/i.test(searchable)) {
    return "CAMERA_RUNTIME";
  }
  if (/CubeJsWorkerPoolV1|CubeJsSolverV1|SolverV1/i.test(searchable)) {
    return "CLIENT_SOLVER";
  }
  if (/EvaluatorPipeline|StatusOnlyDomainDemandProducerV1|TransitionDemandExtractor/i.test(searchable)) {
    return "EVALUATOR_PRODUCER";
  }
  if (/\/_next\/static\/chunks\//.test(observation.url)) {
    return "ROOT_APPLICATION";
  }
  return "OTHER";
}

export function normalizeResource(
  observation: ResourceObservation
): PerfResource {
  for (const field of NON_NEGATIVE_FIELDS) {
    if (
      !Number.isFinite(observation[field]) ||
      observation[field] < 0
    ) {
      throw new TypeError(`${field} must be a non-negative finite number.`);
    }
  }

  return Object.freeze({
    url: sanitizedResourceUrl(observation.url),
    category: classifyResource(observation),
    resourceType: observation.resourceType,
    encodedBytes: observation.encodedBytes,
    decodedBytes: observation.decodedBytes,
    transferBytes: observation.transferBytes,
  });
}

export function aggregateResources(
  resources: readonly PerfResource[],
  predicate: (resource: PerfResource) => boolean = () => true
): Readonly<{
  count: number;
  encodedBytes: number;
  decodedBytes: number;
  transferBytes: number;
}> {
  return resources.filter(predicate).reduce(
    (aggregate, resource) => ({
      count: aggregate.count + 1,
      encodedBytes: aggregate.encodedBytes + resource.encodedBytes,
      decodedBytes: aggregate.decodedBytes + resource.decodedBytes,
      transferBytes: aggregate.transferBytes + resource.transferBytes,
    }),
    { count: 0, encodedBytes: 0, decodedBytes: 0, transferBytes: 0 }
  );
}

export function forbiddenRootResources(
  resources: readonly PerfResource[]
): PerfResource[] {
  const forbidden = new Set<PerfResource["category"]>([
    "SCANNER_CHUNK",
    "ONNX_MODEL",
    "ORT_WASM",
    "CAMERA_RUNTIME",
    "CLIENT_SOLVER",
    "EVALUATOR_PRODUCER",
  ]);
  return resources.filter((resource) => forbidden.has(resource.category));
}
