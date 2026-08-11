import type { HandObservation, ObservationFrame } from './contracts';
import { fixtureFrameAt } from './fixtures';
import { palmScale } from './geometry';

export const PINCH_FIXTURE_SCENARIOS = [
  'clean-pinch',
  'near-miss',
  'threshold-jitter',
  'short-tap',
  'slow-release',
  'short-dropout',
  'long-dropout',
  'left-hand',
  'mirrored',
] as const;

export type PinchFixtureScenario = (typeof PINCH_FIXTURE_SCENARIOS)[number];

const FRAME_INTERVAL_MS = 20;
const CYCLE_DURATION_MS = 4200;

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * clampProgress(progress);
}

function cleanRatio(timestampMs: number): number {
  const cycle = timestampMs % CYCLE_DURATION_MS;
  if (cycle < 600) return 0.9;
  if (cycle < 1000) return mix(0.9, 0.25, (cycle - 600) / 400);
  if (cycle < 2400) return 0.25;
  if (cycle < 2800) return mix(0.25, 0.82, (cycle - 2400) / 400);
  return 0.82;
}

function ratioForScenario(
  scenario: PinchFixtureScenario,
  timestampMs: number,
): number {
  const cycle = timestampMs % CYCLE_DURATION_MS;
  switch (scenario) {
    case 'near-miss':
      return cycle >= 700 && cycle < 2300 ? 0.38 : 0.86;
    case 'threshold-jitter': {
      if (cycle < 700 || cycle >= 2300) return 0.84;
      const pattern = [0.32, 0.37, 0.33, 0.36] as const;
      return pattern[Math.floor((cycle - 700) / 60) % pattern.length] ?? 0.4;
    }
    case 'short-tap':
      return cycle >= 800 && cycle < 880 ? 0.24 : 0.86;
    case 'slow-release':
      if (cycle < 600) return 0.86;
      if (cycle < 900) return mix(0.86, 0.25, (cycle - 600) / 300);
      if (cycle < 1900) return 0.25;
      if (cycle < 3100) return mix(0.25, 0.72, (cycle - 1900) / 1200);
      return 0.78;
    default:
      return cleanRatio(timestampMs);
  }
}

function shapePinch(
  hand: HandObservation,
  targetRatio: number,
  timestampMs: number,
): HandObservation {
  const indexTip = hand.landmarks[8];
  const oldThumbTip = hand.landmarks[4];
  const oldThumbIp = hand.landmarks[3];
  const scale = palmScale(hand.landmarks);
  if (!indexTip || !oldThumbTip || !oldThumbIp || !scale) return hand;

  const direction = hand.handedness === 'left' ? 1 : -1;
  const thumbTip = {
    ...oldThumbTip,
    x: indexTip.x + direction * targetRatio * scale,
    y: indexTip.y + targetRatio * scale * 0.08,
  };
  const thumbIp = {
    ...oldThumbIp,
    x: mix(oldThumbIp.x, thumbTip.x, 0.52),
    y: mix(oldThumbIp.y, thumbTip.y, 0.52),
  };
  const landmarks = hand.landmarks.map((point, index) =>
    index === 4 ? thumbTip : index === 3 ? thumbIp : point,
  );
  return { ...hand, timestampMs, landmarks };
}

function leftHand(hand: HandObservation, timestampMs: number): HandObservation {
  return {
    ...hand,
    id: 'fixture-left',
    handedness: 'left',
    timestampMs,
    landmarks: hand.landmarks.map((point) => ({ ...point, x: 1 - point.x })),
  };
}

export function pinchFixtureFrameAt(
  scenario: PinchFixtureScenario,
  elapsedMs: number,
): ObservationFrame {
  const frameIndex = Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS);
  const timestampMs = frameIndex * FRAME_INTERVAL_MS;
  const stable = fixtureFrameAt('stable', timestampMs);
  const sourceHand = stable.observations[0];
  if (!sourceHand) return stable;
  const cycle = timestampMs % CYCLE_DURATION_MS;

  if (
    (scenario === 'short-dropout' && cycle >= 1600 && cycle < 1680) ||
    (scenario === 'long-dropout' && cycle >= 1500 && cycle < 1840)
  ) {
    return { ...stable, observations: [], timestampMs };
  }

  const orientedHand =
    scenario === 'left-hand' || scenario === 'mirrored'
      ? leftHand(sourceHand, timestampMs)
      : { ...sourceHand, timestampMs };
  const hand = shapePinch(
    orientedHand,
    ratioForScenario(scenario, timestampMs),
    timestampMs,
  );

  return {
    ...stable,
    observations: [hand],
    timestampMs,
    sourceMirrored: scenario === 'mirrored',
  };
}

export class PinchFixturePlayer {
  private startedAtMs = 0;
  private scenario: PinchFixtureScenario;

  constructor(scenario: PinchFixtureScenario = 'clean-pinch') {
    this.scenario = scenario;
  }

  start(timestampMs: number): void {
    this.startedAtMs = timestampMs;
  }

  select(scenario: PinchFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.start(timestampMs);
  }

  frame(timestampMs: number): ObservationFrame {
    return pinchFixtureFrameAt(this.scenario, timestampMs - this.startedAtMs);
  }
}
