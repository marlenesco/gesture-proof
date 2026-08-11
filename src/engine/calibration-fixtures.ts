import type { HandObservation, ObservationFrame } from './contracts';
import { fixtureFrameAt } from './fixtures';
import { palmScale } from './geometry';
import { shapePinch } from './pinch-fixtures';

export const CALIBRATION_FIXTURE_SCENARIOS = [
  'standard-range',
  'personal-range',
  'threshold-jitter',
  'short-hold',
  'dropout',
  'left-mirrored',
] as const;

export type CalibrationFixtureScenario =
  (typeof CALIBRATION_FIXTURE_SCENARIOS)[number];
export type CalibrationFixtureReference = 'open' | 'pinch' | 'fist';
export type CalibrationGesture = 'pinch' | 'fist';

export interface CalibrationFixtureState {
  readonly frame: ObservationFrame;
  readonly reference?: CalibrationFixtureReference;
  readonly evaluationStarted: boolean;
  readonly expected: Readonly<Record<CalibrationGesture, boolean | undefined>>;
}

const FRAME_INTERVAL_MS = 20;
const CALIBRATION_DURATION_MS = 2100;
const EVALUATION_START_MS = 2400;
const EVALUATION_CYCLE_MS = 4400;

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, progress));
}

export function shapeFist(
  hand: HandObservation,
  closure: number,
  timestampMs: number,
): HandObservation {
  const scale = palmScale(hand.landmarks);
  const wrist = hand.landmarks[0];
  if (!scale || !wrist) return hand;
  const target = hand.landmarks.map((point) => ({ ...point }));
  for (const [mcpIndex, pipIndex, dipIndex, tipIndex] of [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ] as const) {
    const mcp = hand.landmarks[mcpIndex];
    if (!mcp) continue;
    const direction = Math.sign(wrist.x - mcp.x) || 1;
    target[pipIndex] = {
      ...target[pipIndex],
      x: mcp.x + direction * scale * 0.02,
      y: mcp.y - scale * 0.4,
    };
    target[dipIndex] = {
      ...target[dipIndex],
      x: mcp.x + direction * scale * 0.22,
      y: mcp.y - scale * 0.06,
    };
    target[tipIndex] = {
      ...target[tipIndex],
      x: mcp.x + direction * scale * 0.12,
      y: mcp.y - scale * 0.28,
    };
  }
  return {
    ...hand,
    timestampMs,
    landmarks: hand.landmarks.map((point, index) => {
      const closed = target[index] ?? point;
      return {
        ...point,
        x: mix(point.x, closed.x, closure),
        y: mix(point.y, closed.y, closure),
      };
    }),
  };
}

function mirroredLeft(
  hand: HandObservation,
  timestampMs: number,
): HandObservation {
  return {
    ...hand,
    id: 'fixture-left',
    handedness: 'left',
    timestampMs,
    landmarks: hand.landmarks.map((point) => ({ ...point, x: 1 - point.x })),
  };
}

function referenceAt(
  timestampMs: number,
): CalibrationFixtureReference | undefined {
  if (timestampMs < 700) return 'open';
  if (timestampMs < 1400) return 'pinch';
  if (timestampMs < CALIBRATION_DURATION_MS) return 'fist';
  return undefined;
}

interface PoseState {
  readonly pinchRatio: number;
  readonly fistClosure: number;
  readonly expectedPinch?: boolean;
  readonly expectedFist?: boolean;
  readonly dropout?: boolean;
}

function evaluationPose(
  scenario: CalibrationFixtureScenario,
  elapsedMs: number,
): PoseState {
  const cycle = elapsedMs % EVALUATION_CYCLE_MS;
  const personal = scenario === 'personal-range';
  const activePinch = personal ? 0.42 : 0.25;
  const activeFist = personal ? 0.55 : 1;

  if (scenario === 'threshold-jitter') {
    if (cycle >= 700 && cycle < 1900) {
      const pattern = [0.32, 0.37, 0.33, 0.36] as const;
      return {
        pinchRatio:
          pattern[Math.floor((cycle - 700) / 60) % pattern.length] ?? 0.5,
        fistClosure: 0,
        expectedPinch: false,
        expectedFist: false,
      };
    }
    return {
      pinchRatio: 0.86,
      fistClosure: 0,
      expectedPinch: false,
      expectedFist: false,
    };
  }

  if (scenario === 'short-hold') {
    const pinchShort = cycle >= 900 && cycle < 980;
    const fistShort = cycle >= 2800 && cycle < 2880;
    return {
      pinchRatio: pinchShort ? activePinch : 0.86,
      fistClosure: fistShort ? activeFist : 0,
      expectedPinch: false,
      expectedFist: false,
    };
  }

  if (cycle < 600) {
    return {
      pinchRatio: 0.86,
      fistClosure: 0,
      expectedPinch: false,
      expectedFist: false,
    };
  }
  if (cycle < 900) {
    return {
      pinchRatio: mix(0.86, activePinch, (cycle - 600) / 300),
      fistClosure: 0,
    };
  }
  if (cycle < 1500) {
    return {
      pinchRatio: activePinch,
      fistClosure: 0,
      expectedPinch: true,
      expectedFist: false,
      dropout: scenario === 'dropout' && cycle >= 1100 && cycle < 1280,
    };
  }
  if (cycle < 1900) {
    return {
      pinchRatio: mix(activePinch, 0.86, (cycle - 1500) / 400),
      fistClosure: 0,
    };
  }
  if (cycle < 2400) {
    return {
      pinchRatio: 0.86,
      fistClosure: 0,
      expectedPinch: false,
      expectedFist: false,
    };
  }
  if (cycle < 2700) {
    return {
      pinchRatio: 0.86,
      fistClosure: mix(0, activeFist, (cycle - 2400) / 300),
    };
  }
  if (cycle < 3300) {
    return {
      pinchRatio: 0.86,
      fistClosure: activeFist,
      expectedPinch: false,
      expectedFist: true,
      dropout: scenario === 'dropout' && cycle >= 2900 && cycle < 3080,
    };
  }
  if (cycle < 3700) {
    return {
      pinchRatio: 0.86,
      fistClosure: mix(activeFist, 0, (cycle - 3300) / 400),
    };
  }
  return {
    pinchRatio: 0.86,
    fistClosure: 0,
    expectedPinch: false,
    expectedFist: false,
  };
}

function calibrationPose(
  scenario: CalibrationFixtureScenario,
  reference: CalibrationFixtureReference,
): PoseState {
  const personal = scenario === 'personal-range';
  switch (reference) {
    case 'open':
      return { pinchRatio: 0.86, fistClosure: 0 };
    case 'pinch':
      return { pinchRatio: personal ? 0.4 : 0.25, fistClosure: 0 };
    case 'fist':
      return { pinchRatio: 0.86, fistClosure: personal ? 0.55 : 1 };
  }
}

export function calibrationFixtureAt(
  scenario: CalibrationFixtureScenario,
  elapsedMs: number,
): CalibrationFixtureState {
  const frameIndex = Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS);
  const timestampMs = frameIndex * FRAME_INTERVAL_MS;
  const reference = referenceAt(timestampMs);
  const evaluationStarted = timestampMs >= EVALUATION_START_MS;
  const pose = reference
    ? calibrationPose(scenario, reference)
    : evaluationStarted
      ? evaluationPose(scenario, timestampMs - EVALUATION_START_MS)
      : { pinchRatio: 0.86, fistClosure: 0 };
  const stable = fixtureFrameAt('stable', timestampMs);
  let hand = stable.observations[0];
  if (!hand) {
    return {
      frame: stable,
      reference,
      evaluationStarted,
      expected: { pinch: pose.expectedPinch, fist: pose.expectedFist },
    };
  }
  if (scenario === 'left-mirrored') hand = mirroredLeft(hand, timestampMs);
  hand = shapePinch(hand, pose.pinchRatio, timestampMs);
  hand = shapeFist(hand, pose.fistClosure, timestampMs);
  const frame: ObservationFrame = {
    ...stable,
    timestampMs,
    sourceMirrored: scenario === 'left-mirrored',
    observations: pose.dropout ? [] : [hand],
  };
  return {
    frame,
    reference,
    evaluationStarted,
    expected: { pinch: pose.expectedPinch, fist: pose.expectedFist },
  };
}

export class CalibrationFixturePlayer {
  private startedAtMs = 0;
  private scenario: CalibrationFixtureScenario;

  constructor(scenario: CalibrationFixtureScenario = 'standard-range') {
    this.scenario = scenario;
  }

  select(scenario: CalibrationFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): CalibrationFixtureState {
    return calibrationFixtureAt(this.scenario, timestampMs - this.startedAtMs);
  }
}
