import type { NormalizedPoint, PixelPoint } from './contracts';

export interface DisplayTransform {
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly mirrorX: boolean;
}

export function distance2D(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizedToPixel(
  point: NormalizedPoint,
  width: number,
  height: number,
  mirrorX = false,
): PixelPoint {
  return {
    x: (mirrorX ? 1 - point.x : point.x) * width,
    y: point.y * height,
  };
}

export function createCoverTransform(
  inputWidth: number,
  inputHeight: number,
  displayWidth: number,
  displayHeight: number,
  mirrorX = false,
): DisplayTransform {
  const safeInputWidth = Math.max(inputWidth, 1);
  const safeInputHeight = Math.max(inputHeight, 1);
  const scale = Math.max(
    displayWidth / safeInputWidth,
    displayHeight / safeInputHeight,
  );

  return {
    inputWidth: safeInputWidth,
    inputHeight: safeInputHeight,
    displayWidth,
    displayHeight,
    scale,
    offsetX: (displayWidth - safeInputWidth * scale) / 2,
    offsetY: (displayHeight - safeInputHeight * scale) / 2,
    mirrorX,
  };
}

export function createContainTransform(
  inputWidth: number,
  inputHeight: number,
  displayWidth: number,
  displayHeight: number,
  mirrorX = false,
): DisplayTransform {
  const safeInputWidth = Math.max(inputWidth, 1);
  const safeInputHeight = Math.max(inputHeight, 1);
  const scale = Math.min(
    displayWidth / safeInputWidth,
    displayHeight / safeInputHeight,
  );

  return {
    inputWidth: safeInputWidth,
    inputHeight: safeInputHeight,
    displayWidth,
    displayHeight,
    scale,
    offsetX: (displayWidth - safeInputWidth * scale) / 2,
    offsetY: (displayHeight - safeInputHeight * scale) / 2,
    mirrorX,
  };
}

export function normalizedToDisplay(
  point: NormalizedPoint,
  transform: DisplayTransform,
): PixelPoint {
  const normalizedX = transform.mirrorX ? 1 - point.x : point.x;
  return {
    x: transform.offsetX + normalizedX * transform.inputWidth * transform.scale,
    y: transform.offsetY + point.y * transform.inputHeight * transform.scale,
  };
}

export function normalizedDistance(
  a: NormalizedPoint,
  b: NormalizedPoint,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function jointAngleDegrees(
  a: NormalizedPoint,
  vertex: NormalizedPoint,
  c: NormalizedPoint,
): number | undefined {
  const firstX = a.x - vertex.x;
  const firstY = a.y - vertex.y;
  const secondX = c.x - vertex.x;
  const secondY = c.y - vertex.y;
  const firstLength = Math.hypot(firstX, firstY);
  const secondLength = Math.hypot(secondX, secondY);

  if (firstLength === 0 || secondLength === 0) return undefined;

  const cosine = Math.min(
    1,
    Math.max(
      -1,
      (firstX * secondX + firstY * secondY) / (firstLength * secondLength),
    ),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function palmScale(
  landmarks: readonly NormalizedPoint[],
): number | undefined {
  const wrist = landmarks[0];
  const indexBase = landmarks[5];
  const pinkyBase = landmarks[17];
  if (!wrist || !indexBase || !pinkyBase) return undefined;

  return (
    (normalizedDistance(wrist, indexBase) +
      normalizedDistance(wrist, pinkyBase)) /
    2
  );
}

export function scaleIndependentDistance(
  a: NormalizedPoint,
  b: NormalizedPoint,
  landmarks: readonly NormalizedPoint[],
): number | undefined {
  const scale = palmScale(landmarks);
  if (!scale || scale <= Number.EPSILON) return undefined;
  return normalizedDistance(a, b) / scale;
}

export function polygonArea(points: readonly PixelPoint[]): number {
  if (points.length < 3) return 0;

  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    doubledArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(doubledArea / 2);
}
