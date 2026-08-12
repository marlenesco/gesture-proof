import type {
  HandObservation,
  NormalizedPoint,
  ObservationFrame,
} from './contracts';
import { shapeFist } from './calibration-fixtures';
import {
  fixtureElapsedAt,
  fixtureFrameAt,
  FIXTURE_HAND_SCALE,
  scaleFixtureHand,
  TWO_HAND_FIXTURE_SCALE,
} from './fixtures';
import { palmScale } from './geometry';

export const APERTURE_FIXTURE_SCENARIOS = [
  'steady-aperture',
  'small-aperture',
  'jitter',
  'dropout',
  'crossing',
  'pinch-corner',
  'left-mirrored',
] as const;

export type ApertureFixtureScenario =
  (typeof APERTURE_FIXTURE_SCENARIOS)[number];

export interface ApertureFixtureState {
  readonly frame: ObservationFrame;
  readonly label: string;
}

const FRAME_INTERVAL_MS = 20;
const CYCLE_MS = 5600;

interface Direction2D {
  readonly x: number;
  readonly y: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * clamp01(progress);
}

function easeInOut(progress: number): number {
  const clamped = clamp01(progress);
  return clamped * clamped * (3 - 2 * clamped);
}

function direction(
  from: NormalizedPoint,
  to: NormalizedPoint,
): Direction2D | undefined {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  if (length <= Number.EPSILON) return undefined;
  return { x: x / length, y: y / length };
}

function quantize(elapsedMs: number): number {
  return (
    Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS) * FRAME_INTERVAL_MS
  );
}

function cloneAt(
  hand: HandObservation,
  id: string,
  handedness: 'left' | 'right',
  wristX: number,
  timestampMs: number,
  mirror = false,
): HandObservation {
  const wrist = hand.landmarks[0];
  if (!wrist) return hand;
  return {
    ...hand,
    id,
    handedness,
    timestampMs,
    landmarks: hand.landmarks.map((point) => ({
      ...point,
      x: mirror ? wristX - (point.x - wrist.x) : wristX + point.x - wrist.x,
    })),
  };
}

/** Builds an index-and-thumb L over a closed middle, ring, and pinky. */
function shapeLHand(
  hand: HandObservation,
  openness: number,
  timestampMs: number,
): HandObservation {
  const closed = shapeFist(hand, 1, timestampMs);
  const indexMcp = hand.landmarks[5];
  const pinkyMcp = hand.landmarks[17];
  const indexTip = hand.landmarks[8];
  const thumbIp = hand.landmarks[3];
  const thumbTip = hand.landmarks[4];
  const scale = palmScale(hand.landmarks);
  if (!indexMcp || !pinkyMcp || !indexTip || !thumbIp || !thumbTip || !scale) {
    return closed;
  }
  const acrossPalm = direction(indexMcp, pinkyMcp);
  const alongIndex = direction(indexMcp, indexTip);
  if (!acrossPalm || !alongIndex) return closed;

  const thumbSide = { x: -acrossPalm.x, y: -acrossPalm.y };
  const target = hand.landmarks.map((point) => ({ ...point }));
  target[3] = {
    ...thumbIp,
    x: indexMcp.x + thumbSide.x * scale * 0.46 + alongIndex.x * scale * 0.08,
    y: indexMcp.y + thumbSide.y * scale * 0.46 + alongIndex.y * scale * 0.08,
  };
  target[4] = {
    ...thumbTip,
    x: indexMcp.x + thumbSide.x * scale * 0.9 + alongIndex.x * scale * 0.06,
    y: indexMcp.y + thumbSide.y * scale * 0.9 + alongIndex.y * scale * 0.06,
  };
  return {
    ...closed,
    timestampMs,
    landmarks: closed.landmarks.map((point, index) => {
      const open = target[index] ?? point;
      const preserveIndex = index >= 5 && index <= 8;
      const preserveThumb = index === 3 || index === 4;
      if (!preserveIndex && !preserveThumb) return point;
      return {
        ...point,
        x: mix(point.x, open.x, openness),
        y: mix(point.y, open.y, openness),
      };
    }),
  };
}

function rotateAroundWrist(
  hand: HandObservation,
  radians: number,
): HandObservation {
  const wrist = hand.landmarks[0];
  if (!wrist) return hand;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    ...hand,
    landmarks: hand.landmarks.map((point) => {
      const x = point.x - wrist.x;
      const y = point.y - wrist.y;
      return {
        ...point,
        x: wrist.x + x * cosine - y * sine,
        y: wrist.y + x * sine + y * cosine,
      };
    }),
  };
}

function pinchIndexToThumb(hand: HandObservation): HandObservation {
  const thumb = hand.landmarks[4];
  const index = hand.landmarks[8];
  if (!thumb || !index) return hand;
  const contact = {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
  };
  return {
    ...hand,
    landmarks: hand.landmarks.map((point, index) => {
      if (index !== 4 && index !== 8) return point;
      return { ...point, ...contact };
    }),
  };
}

function lPoseProgress(cycleMs: number): number {
  if (cycleMs < 360) return 0;
  if (cycleMs < 1160) return easeInOut((cycleMs - 360) / 800);
  const breath = 0.035 * Math.sin((cycleMs - 1160) / 440);
  return clamp01(0.94 + breath);
}

function apertureHands(
  hand: HandObservation,
  timestampMs: number,
  separation: number,
  openness: number,
  jitter = 0,
): readonly HandObservation[] {
  const compactSeparation =
    separation * FIXTURE_HAND_SCALE * TWO_HAND_FIXTURE_SCALE;
  return [
    shapeLHand(
      scaleFixtureHand(
        cloneAt(
          hand,
          'aperture-left',
          'left',
          0.5 - compactSeparation / 2 + jitter,
          timestampMs,
          true,
        ),
        TWO_HAND_FIXTURE_SCALE,
      ),
      openness,
      timestampMs,
    ),
    shapeLHand(
      scaleFixtureHand(
        cloneAt(
          hand,
          'aperture-right',
          'right',
          0.5 + compactSeparation / 2 - jitter,
          timestampMs,
        ),
        TWO_HAND_FIXTURE_SCALE,
      ),
      openness,
      timestampMs,
    ),
  ];
}

export function apertureFixtureAt(
  scenario: ApertureFixtureScenario,
  elapsedMs: number,
): ApertureFixtureState {
  const timestampMs = quantize(elapsedMs);
  const stable = fixtureFrameAt('stable', timestampMs);
  const hand = stable.observations[0];
  if (!hand) return { frame: stable, label: 'No aperture evidence' };
  const cycle = timestampMs % CYCLE_MS;
  const separation = scenario === 'small-aperture' ? 0.12 : 0.56;
  const jitter = scenario === 'jitter' ? Math.sin(timestampMs / 55) * 0.012 : 0;
  const observations = apertureHands(
    hand,
    timestampMs,
    separation,
    lPoseProgress(cycle),
    jitter,
  );
  let frameObservations = observations;
  let label =
    scenario === 'small-aperture'
      ? 'Area below activation'
      : 'Closed fist to L-pose aperture';

  if (scenario === 'crossing') {
    const crossing = easeInOut(((cycle + 600) % CYCLE_MS) / CYCLE_MS);
    const right = frameObservations[1];
    if (right)
      frameObservations = [
        frameObservations[0]!,
        rotateAroundWrist(right, Math.PI * crossing),
      ];
    label = 'Crossing L-pose: ordered bow-tie field';
  }
  if (scenario === 'pinch-corner') {
    const left = frameObservations[0];
    if (left)
      frameObservations = [pinchIndexToThumb(left), frameObservations[1]!];
    label = 'Left pinch contact: triangular field';
  }
  if (scenario === 'dropout' && cycle >= 2600 && cycle < 2740) {
    frameObservations = [];
    label = 'Short aperture dropout';
  }
  if (scenario === 'dropout' && cycle >= 3240 && cycle < 3600) {
    frameObservations = [];
    label = 'Long aperture dropout';
  }
  if (scenario === 'left-mirrored') {
    frameObservations = frameObservations.map((fixtureHand) => ({
      ...fixtureHand,
      landmarks: fixtureHand.landmarks.map((point) => ({
        ...point,
        x: 1 - point.x,
      })),
    }));
    label = 'Mirrored L-pose aperture';
  }
  return {
    frame: {
      ...stable,
      timestampMs,
      sourceMirrored: scenario === 'left-mirrored',
      observations: frameObservations,
    },
    label,
  };
}

export class ApertureFixturePlayer {
  private startedAtMs = 0;
  private scenario: ApertureFixtureScenario = 'steady-aperture';

  select(scenario: ApertureFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): ApertureFixtureState {
    return apertureFixtureAt(
      this.scenario,
      fixtureElapsedAt(this.startedAtMs, timestampMs),
    );
  }
}
