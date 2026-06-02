export type OrientationState = {
  x: number;

  y: number;

  z: number;

  /**
   * Human-relative orientation certainty.
   *
   * 1 = fully oriented
   * 0 = fully disoriented
   */
  certainty: number;
};