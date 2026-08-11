import type { HandObservation, NormalizedPoint } from '../engine/contracts';
import {
  jointAngleDegrees,
  palmScale,
  scaleIndependentDistance,
} from '../engine/geometry';

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function plausible(point: NormalizedPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= -0.25 &&
    point.x <= 1.25 &&
    point.y >= -0.25 &&
    point.y <= 1.25
  );
}

export function fistOpenness(hand: HandObservation): number | undefined {
  const wrist = hand.landmarks[0];
  const scale = palmScale(hand.landmarks);
  if (!wrist || !plausible(wrist) || !scale || scale < 0.02) return undefined;

  let total = 0;
  for (const [mcpIndex, pipIndex, dipIndex, tipIndex] of FINGERS) {
    const mcp = hand.landmarks[mcpIndex];
    const pip = hand.landmarks[pipIndex];
    const dip = hand.landmarks[dipIndex];
    const tip = hand.landmarks[tipIndex];
    if (!mcp || !pip || !dip || !tip) return undefined;
    if (![mcp, pip, dip, tip].every(plausible)) return undefined;

    const pipAngle = jointAngleDegrees(mcp, pip, dip);
    const dipAngle = jointAngleDegrees(pip, dip, tip);
    const reach = scaleIndependentDistance(wrist, tip, hand.landmarks);
    if (
      pipAngle === undefined ||
      dipAngle === undefined ||
      reach === undefined ||
      reach > 4
    ) {
      return undefined;
    }

    const angleEvidence =
      (clamp01((pipAngle - 65) / 105) + clamp01((dipAngle - 65) / 105)) / 2;
    const reachEvidence = clamp01((reach - 0.75) / 1.65);
    total += angleEvidence * 0.72 + reachEvidence * 0.28;
  }

  return total / FINGERS.length;
}
