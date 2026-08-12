import type { HandObservation, ObservationFrame } from './contracts';
import { shapeFist } from './calibration-fixtures';
import {
  fixtureElapsedAt,
  fixtureFrameAt,
  FIXTURE_HAND_SCALE,
  scaleFixtureHand,
  TWO_HAND_FIXTURE_SCALE,
} from './fixtures';
import { shapePinch } from './pinch-fixtures';

export const OBJECT_BENCH_FIXTURE_SCENARIOS = [
  'full-sequence',
  'translate',
  'rotate',
  'scale',
  'dropout',
  'neutral',
  'left-mirrored',
] as const;

export type ObjectBenchFixtureScenario =
  (typeof OBJECT_BENCH_FIXTURE_SCENARIOS)[number];

export interface ObjectBenchFixtureState {
  readonly frame: ObservationFrame;
  readonly label: string;
}

const FRAME_INTERVAL_MS = 20;
const CYCLE_MS = 6200;

function quantize(elapsedMs: number): number {
  return (
    Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS) * FRAME_INTERVAL_MS
  );
}

function triangle(value: number): number {
  const wrapped = value - Math.floor(value);
  return wrapped < 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
}

function cloneAt(
  hand: HandObservation,
  id: string,
  handedness: 'left' | 'right',
  wristX: number,
  wristY: number,
  timestampMs: number,
  flipShape = false,
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
      x: flipShape
        ? wristX - (point.x - wrist.x)
        : wristX + (point.x - wrist.x),
      y: wristY + (point.y - wrist.y),
    })),
  };
}

function movingPose(
  base: HandObservation,
  pose: 'pinch' | 'fist',
  timestampMs: number,
  progress: number,
  left = false,
): HandObservation {
  const shaped =
    pose === 'pinch'
      ? shapePinch(base, 0.22, timestampMs)
      : shapeFist(base, 1, timestampMs);
  const x = 0.37 + progress * 0.28;
  const y = 0.6 - Math.sin(progress * Math.PI) * 0.12;
  return cloneAt(
    shaped,
    left ? 'fixture-left' : 'fixture-right',
    left ? 'left' : 'right',
    left ? 1 - x : x,
    y,
    timestampMs,
    left,
  );
}

function spanHands(
  base: HandObservation,
  timestampMs: number,
  separation: number,
): readonly HandObservation[] {
  const compactSeparation =
    separation * FIXTURE_HAND_SCALE * TWO_HAND_FIXTURE_SCALE;
  return [
    scaleFixtureHand(
      cloneAt(
        base,
        'fixture-left',
        'left',
        0.5 - compactSeparation / 2,
        0.61,
        timestampMs,
        true,
      ),
      TWO_HAND_FIXTURE_SCALE,
    ),
    scaleFixtureHand(
      cloneAt(
        base,
        'fixture-right',
        'right',
        0.5 + compactSeparation / 2,
        0.61,
        timestampMs,
      ),
      TWO_HAND_FIXTURE_SCALE,
    ),
  ];
}

function sequenceSegment(cycleMs: number): {
  readonly action: 'translate' | 'rotate' | 'scale' | 'neutral';
  readonly localMs: number;
} {
  if (cycleMs < 500) return { action: 'neutral', localMs: cycleMs };
  if (cycleMs < 1800) return { action: 'translate', localMs: cycleMs - 500 };
  if (cycleMs < 2300) return { action: 'neutral', localMs: cycleMs - 1800 };
  if (cycleMs < 3600) return { action: 'rotate', localMs: cycleMs - 2300 };
  if (cycleMs < 4100) return { action: 'neutral', localMs: cycleMs - 3600 };
  if (cycleMs < 5600) return { action: 'scale', localMs: cycleMs - 4100 };
  return { action: 'neutral', localMs: cycleMs - 5600 };
}

export function objectBenchFixtureAt(
  scenario: ObjectBenchFixtureScenario,
  elapsedMs: number,
): ObjectBenchFixtureState {
  const timestampMs = quantize(elapsedMs);
  const stable = fixtureFrameAt('stable', timestampMs);
  const base = stable.observations[0];
  if (!base) return { frame: stable, label: 'No fixture hand' };
  const cycleMs = timestampMs % CYCLE_MS;
  let action: 'translate' | 'rotate' | 'scale' | 'neutral';
  let localMs: number;
  if (scenario === 'full-sequence' || scenario === 'dropout') {
    ({ action, localMs } = sequenceSegment(cycleMs));
  } else if (scenario === 'translate' || scenario === 'left-mirrored') {
    action = cycleMs < 400 || cycleMs > 2300 ? 'neutral' : 'translate';
    localMs = Math.max(0, cycleMs - 400);
  } else if (scenario === 'rotate') {
    action = cycleMs < 400 || cycleMs > 2300 ? 'neutral' : 'rotate';
    localMs = Math.max(0, cycleMs - 400);
  } else if (scenario === 'scale') {
    action = cycleMs < 400 || cycleMs > 2500 ? 'neutral' : 'scale';
    localMs = Math.max(0, cycleMs - 400);
  } else {
    action = 'neutral';
    localMs = cycleMs;
  }

  let observations: readonly HandObservation[];
  let label: string;
  if (action === 'translate' || action === 'rotate') {
    const duration =
      scenario === 'full-sequence' || scenario === 'dropout' ? 1300 : 1900;
    const progress = triangle(localMs / (duration * 2));
    observations = [
      movingPose(
        base,
        action === 'translate' ? 'pinch' : 'fist',
        timestampMs,
        progress,
        scenario === 'left-mirrored',
      ),
    ];
    label = action === 'translate' ? 'Pinch translation' : 'Fist rotation';
  } else if (action === 'scale') {
    const progress = triangle(localMs / 2600);
    observations = spanHands(base, timestampMs, 0.54 + progress * 0.13);
    label = 'Two-hand span scale';
  } else {
    observations = [shapeFist(base, 0.65, timestampMs)];
    label = 'Neutral release';
  }

  if (
    scenario === 'dropout' &&
    ((cycleMs >= 1040 && cycleMs < 1120) || (cycleMs >= 1360 && cycleMs < 1600))
  ) {
    observations = [];
    label =
      cycleMs < 1120 ? 'Short transform dropout' : 'Long transform dropout';
  }

  return {
    frame: {
      ...stable,
      timestampMs,
      sourceMirrored: scenario === 'left-mirrored',
      observations,
    },
    label,
  };
}

export class ObjectBenchFixturePlayer {
  private startedAtMs = 0;
  private scenario: ObjectBenchFixtureScenario = 'full-sequence';

  select(scenario: ObjectBenchFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): ObjectBenchFixtureState {
    return objectBenchFixtureAt(
      this.scenario,
      fixtureElapsedAt(this.startedAtMs, timestampMs),
    );
  }
}
