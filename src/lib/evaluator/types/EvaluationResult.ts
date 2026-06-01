export type EvaluationResult = {
  ergonomicsScore: number;

  flowScore: number;
  gripScore: number;
  rotationScore: number;
  lookaheadScore: number;

  reachabilityEntropy: number;
  gripEntropy: number;
  momentumEntropy: number;
  orientationEntropy: number;

  transitionCount: number;

  breakdown: {
    flow: number;
    grip: number;
    rotation: number;
    lookahead: number;
  };
};