import type { HandObservation, ObservationFrame } from './contracts';
import { shapeFist } from './calibration-fixtures';
import { fixtureFrameAt } from './fixtures';
import { shapePinch } from './pinch-fixtures';
import type { MatrixGesture } from '../gesture/gesture-state-matrix';

export const STATE_MATRIX_FIXTURE_SCENARIOS = [
  'gesture-sequence',
  'competitive-evidence',
  'short-holds',
  'direct-handoff',
  'dropout',
  'left-mirrored',
  'crossing',
] as const;

export type StateMatrixFixtureScenario =
  (typeof STATE_MATRIX_FIXTURE_SCENARIOS)[number];

export interface StateMatrixFixtureState {
  readonly frame: ObservationFrame;
  readonly expected?: MatrixGesture;
  readonly label: string;
}

const FRAME_INTERVAL_MS = 20;
const SEQUENCE_DURATION_MS = 6000;

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
  flipShape = false,
): HandObservation {
  const wrist = hand.landmarks[0];
  if (!wrist) return hand;
  const deltaX = wristX - wrist.x;
  return {
    ...hand,
    id,
    handedness,
    timestampMs,
    landmarks: hand.landmarks.map((point) => ({
      ...point,
      x: flipShape ? wristX - (point.x - wrist.x) : point.x + deltaX,
    })),
  };
}

export function shapePoint(
  hand: HandObservation,
  timestampMs: number,
): HandObservation {
  const fist = shapeFist(hand, 1, timestampMs);
  return {
    ...fist,
    landmarks: fist.landmarks.map((point, index) =>
      index <= 8 ? { ...(hand.landmarks[index] ?? point) } : point,
    ),
  };
}

function neutralHand(
  hand: HandObservation,
  timestampMs: number,
): HandObservation {
  return shapeFist(hand, 0.48, timestampMs);
}

function poseHand(
  hand: HandObservation,
  gesture: Exclude<MatrixGesture, 'two-hand-span'> | undefined,
  timestampMs: number,
): HandObservation {
  switch (gesture) {
    case 'pinch':
      return shapePinch(hand, 0.22, timestampMs);
    case 'fist':
      return shapeFist(hand, 1, timestampMs);
    case 'open-palm':
      return { ...hand, timestampMs };
    case 'point':
      return shapePoint(hand, timestampMs);
    case undefined:
      return neutralHand(hand, timestampMs);
  }
}

function spanHands(
  hand: HandObservation,
  timestampMs: number,
  separation: number,
): readonly HandObservation[] {
  return [
    cloneAt(
      hand,
      'fixture-left',
      'left',
      0.5 - separation / 2,
      timestampMs,
      true,
    ),
    cloneAt(hand, 'fixture-right', 'right', 0.5 + separation / 2, timestampMs),
  ];
}

function sequencePose(cycleMs: number): {
  readonly gesture?: MatrixGesture;
  readonly label: string;
} {
  if (cycleMs < 500) return { label: 'Neutral release' };
  if (cycleMs < 1150) return { gesture: 'pinch', label: 'Pinch evidence' };
  if (cycleMs < 1500) return { label: 'Neutral release' };
  if (cycleMs < 2150) return { gesture: 'fist', label: 'Fist evidence' };
  if (cycleMs < 2500) return { label: 'Neutral release' };
  if (cycleMs < 3150) {
    return { gesture: 'open-palm', label: 'Open-palm evidence' };
  }
  if (cycleMs < 3500) return { label: 'Neutral release' };
  if (cycleMs < 4150) return { gesture: 'point', label: 'Point evidence' };
  if (cycleMs < 4500) return { label: 'Neutral release' };
  if (cycleMs < 5300) {
    return { gesture: 'two-hand-span', label: 'Two-hand span evidence' };
  }
  return { label: 'Neutral release' };
}

export function stateMatrixFixtureAt(
  scenario: StateMatrixFixtureScenario,
  elapsedMs: number,
): StateMatrixFixtureState {
  const timestampMs = quantize(elapsedMs);
  const stable = fixtureFrameAt('stable', timestampMs);
  const base = stable.observations[0];
  if (!base) return { frame: stable, label: 'No fixture hand' };

  if (scenario === 'crossing') {
    return {
      frame: fixtureFrameAt('crossing', timestampMs),
      label: 'Crossing identity stress',
    };
  }

  const cycleMs = timestampMs % SEQUENCE_DURATION_MS;
  let gesture: MatrixGesture | undefined;
  let label = 'Neutral release';
  let observations: readonly HandObservation[];

  if (scenario === 'short-holds') {
    const shortIndex = Math.floor(cycleMs / 600);
    const shortGesture = [
      'pinch',
      'fist',
      'open-palm',
      'point',
      'two-hand-span',
    ][shortIndex % 5] as MatrixGesture;
    const insideShortHold = cycleMs % 600 >= 220 && cycleMs % 600 < 320;
    gesture = insideShortHold ? shortGesture : undefined;
    label = insideShortHold ? `Short ${shortGesture}` : 'Neutral release';
  } else if (scenario === 'direct-handoff') {
    if (cycleMs < 500) {
      gesture = undefined;
    } else if (cycleMs < 1300) {
      gesture = 'pinch';
      label = 'Pinch without neutral exit';
    } else if (cycleMs < 2300) {
      gesture = 'fist';
      label = 'Direct fist handoff attempt';
    }
  } else if (scenario === 'competitive-evidence') {
    const progress = (cycleMs % 1800) / 1800;
    const separation = 0.38 + Math.sin(progress * Math.PI * 2) * 0.025;
    observations = spanHands(base, timestampMs, separation);
    return {
      frame: { ...stable, timestampMs, observations },
      label: 'Open palm versus span boundary',
    };
  } else {
    ({ gesture, label } = sequencePose(cycleMs));
  }

  if (gesture === 'two-hand-span') {
    observations = spanHands(base, timestampMs, 0.58);
  } else {
    const hand = poseHand(base, gesture, timestampMs);
    observations = [
      scenario === 'left-mirrored'
        ? {
            ...cloneAt(hand, 'fixture-left', 'left', 0.5, timestampMs, true),
          }
        : hand,
    ];
  }

  if (scenario === 'dropout' && cycleMs >= 2760 && cycleMs < 2840) {
    observations = [];
    label = 'Short active dropout';
  }
  if (scenario === 'dropout' && cycleMs >= 2940 && cycleMs < 3180) {
    observations = [];
    label = 'Long active dropout';
  }

  return {
    frame: {
      ...stable,
      timestampMs,
      sourceMirrored: scenario === 'left-mirrored',
      observations,
    },
    expected: scenario === 'short-holds' ? undefined : gesture,
    label,
  };
}

export class StateMatrixFixturePlayer {
  private startedAtMs = 0;
  private scenario: StateMatrixFixtureScenario = 'gesture-sequence';

  select(scenario: StateMatrixFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): StateMatrixFixtureState {
    return stateMatrixFixtureAt(this.scenario, timestampMs - this.startedAtMs);
  }
}
