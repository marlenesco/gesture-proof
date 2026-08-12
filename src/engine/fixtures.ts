import type {
  HandObservation,
  NormalizedPoint,
  ObservationFrame,
} from './contracts';

export const FIXTURE_SCENARIOS = [
  'stable',
  'jitter',
  'dropout',
  'crossing',
  'rapid-motion',
  'mirrored',
  'low-confidence',
] as const;

export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

const FRAME_INTERVAL_MS = 100;
const SOURCE_WIDTH = 1280;
const SOURCE_HEIGHT = 720;
export const FIXTURE_HAND_SCALE = 0.88;
export const TWO_HAND_FIXTURE_SCALE = 0.8;

// Playback is intentionally slower than fixture time. Recognizers still receive
// their original timestamp-driven contract; the public demo has room to show
// acquisition, release, and the neutral boundary between poses.
export const FIXTURE_PLAYBACK_RATE = 0.45;

export function fixtureElapsedAt(
  startedAtMs: number,
  timestampMs: number,
): number {
  return Math.max(0, timestampMs - startedAtMs) * FIXTURE_PLAYBACK_RATE;
}

const BASE_HAND: readonly NormalizedPoint[] = [
  { x: 0, y: 0.26, z: 0 },
  { x: -0.12, y: 0.17, z: -0.01 },
  { x: -0.18, y: 0.04, z: -0.02 },
  { x: -0.23, y: -0.08, z: -0.025 },
  { x: -0.28, y: -0.17, z: -0.03 },
  { x: -0.11, y: -0.02, z: -0.01 },
  { x: -0.13, y: -0.2, z: -0.02 },
  { x: -0.14, y: -0.33, z: -0.03 },
  { x: -0.15, y: -0.45, z: -0.04 },
  { x: -0.02, y: -0.05, z: -0.01 },
  { x: -0.02, y: -0.26, z: -0.025 },
  { x: -0.02, y: -0.4, z: -0.035 },
  { x: -0.02, y: -0.53, z: -0.045 },
  { x: 0.07, y: -0.03, z: -0.01 },
  { x: 0.08, y: -0.22, z: -0.02 },
  { x: 0.09, y: -0.35, z: -0.03 },
  { x: 0.1, y: -0.46, z: -0.04 },
  { x: 0.15, y: 0.02, z: -0.005 },
  { x: 0.18, y: -0.13, z: -0.015 },
  { x: 0.2, y: -0.23, z: -0.025 },
  { x: 0.22, y: -0.32, z: -0.03 },
];

function createHand(
  id: string,
  handedness: 'left' | 'right',
  timestampMs: number,
  centerX: number,
  centerY: number,
  scale: number,
  confidence = 0.96,
  flipShape = false,
  jitterX = 0,
  jitterY = 0,
): HandObservation {
  const fixtureScale = scale * FIXTURE_HAND_SCALE;
  const landmarks = BASE_HAND.map((point, index) => {
    const alternating = index % 2 === 0 ? 1 : -1;
    return {
      x:
        centerX +
        (flipShape ? -point.x : point.x) * fixtureScale +
        jitterX * alternating,
      y: centerY + point.y * fixtureScale + jitterY * -alternating,
      z: point.z === undefined ? undefined : point.z * fixtureScale,
    };
  });

  return { id, handedness, timestampMs, confidence, landmarks };
}

export function scaleFixtureHand(
  hand: HandObservation,
  factor: number,
): HandObservation {
  const wrist = hand.landmarks[0];
  if (!wrist) return hand;
  return {
    ...hand,
    landmarks: hand.landmarks.map((point) => ({
      ...point,
      x: wrist.x + (point.x - wrist.x) * factor,
      y: wrist.y + (point.y - wrist.y) * factor,
      z:
        point.z === undefined
          ? undefined
          : wrist.z === undefined
            ? point.z * factor
            : wrist.z + (point.z - wrist.z) * factor,
    })),
  };
}

function quantize(timestampMs: number): number {
  return Math.floor(Math.max(0, timestampMs) / FRAME_INTERVAL_MS);
}

function triangle(progress: number): number {
  const wrapped = progress - Math.floor(progress);
  return wrapped < 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
}

export function fixtureFrameAt(
  scenario: FixtureScenario,
  elapsedMs: number,
): ObservationFrame {
  const frameIndex = quantize(elapsedMs);
  const timestampMs = frameIndex * FRAME_INTERVAL_MS;
  let observations: readonly HandObservation[];
  let sourceMirrored = false;

  switch (scenario) {
    case 'stable':
      observations = [
        createHand('fixture-right', 'right', timestampMs, 0.52, 0.62, 0.56),
      ];
      break;
    case 'jitter': {
      const pattern = [0, 0.006, -0.004, 0.003, -0.007, 0.002] as const;
      const jitter = pattern[frameIndex % pattern.length] ?? 0;
      observations = [
        createHand(
          'fixture-right',
          'right',
          timestampMs,
          0.52,
          0.62,
          0.56,
          0.82,
          false,
          jitter,
          jitter / 2,
        ),
      ];
      break;
    }
    case 'dropout': {
      const cycleMs = timestampMs % 3000;
      observations =
        cycleMs >= 1100 && cycleMs < 1700
          ? []
          : [
              createHand(
                'fixture-right',
                'right',
                timestampMs,
                0.52,
                0.62,
                0.56,
                cycleMs >= 900 && cycleMs < 1900 ? 0.58 : 0.94,
              ),
            ];
      break;
    }
    case 'crossing': {
      const progress = triangle(timestampMs / 4000);
      observations = [
        createHand(
          'fixture-left',
          'left',
          timestampMs,
          0.27 + progress * 0.46,
          0.6,
          0.42,
          0.88,
          true,
        ),
        createHand(
          'fixture-right',
          'right',
          timestampMs,
          0.73 - progress * 0.46,
          0.64,
          0.42,
          0.9,
        ),
      ];
      break;
    }
    case 'rapid-motion': {
      const progress = triangle(timestampMs / 800);
      observations = [
        createHand(
          'fixture-right',
          'right',
          timestampMs,
          0.22 + progress * 0.56,
          0.62,
          0.48,
          0.7,
        ),
      ];
      break;
    }
    case 'mirrored': {
      const hand = createHand(
        'fixture-left',
        'left',
        timestampMs,
        0.36,
        0.62,
        0.54,
        0.93,
        true,
      );
      observations = [
        {
          ...hand,
          landmarks: hand.landmarks.map((point) => ({
            ...point,
            x: 1 - point.x,
          })),
        },
      ];
      sourceMirrored = true;
      break;
    }
    case 'low-confidence': {
      const confidence = 0.28 + triangle(timestampMs / 2200) * 0.4;
      observations = [
        createHand(
          'fixture-right',
          'right',
          timestampMs,
          0.52,
          0.62,
          0.56,
          confidence,
        ),
      ];
      break;
    }
  }

  return {
    observations,
    timestampMs,
    inferenceDurationMs: 0,
    sourceWidth: SOURCE_WIDTH,
    sourceHeight: SOURCE_HEIGHT,
    sourceMirrored,
  };
}

export class FixturePlayer {
  private startedAtMs = 0;
  private scenario: FixtureScenario;

  constructor(scenario: FixtureScenario = 'stable') {
    this.scenario = scenario;
  }

  start(timestampMs: number): void {
    this.startedAtMs = timestampMs;
  }

  select(scenario: FixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.start(timestampMs);
  }

  frame(timestampMs: number): ObservationFrame {
    return fixtureFrameAt(
      this.scenario,
      fixtureElapsedAt(this.startedAtMs, timestampMs),
    );
  }
}
