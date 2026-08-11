import type { HandObservation, ObservationFrame } from './contracts';
import { fixtureFrameAt } from './fixtures';

export const MOTION_FIELD_FIXTURE_SCENARIOS = [
  'horizontal-sweep',
  'speed-steps',
  'direction-change',
  'stillness',
  'dropout',
  'two-hand-owner',
  'left-mirrored',
] as const;

export type MotionFieldFixtureScenario =
  (typeof MOTION_FIELD_FIXTURE_SCENARIOS)[number];

export interface MotionFieldFixtureState {
  readonly frame: ObservationFrame;
  readonly label: string;
}

const FRAME_INTERVAL_MS = 20;
const CYCLE_MS = 4000;

function quantize(elapsedMs: number): number {
  return (
    Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS) * FRAME_INTERVAL_MS
  );
}

export function translateFixtureHand(
  hand: HandObservation,
  x: number,
  y: number,
  timestampMs: number,
  id = hand.id,
  handedness = hand.handedness,
): HandObservation {
  const wrist = hand.landmarks[0];
  if (!wrist) return hand;
  const deltaX = x - wrist.x;
  const deltaY = y - wrist.y;
  return {
    ...hand,
    id,
    handedness,
    timestampMs,
    landmarks: hand.landmarks.map((point) => ({
      ...point,
      x: point.x + deltaX,
      y: point.y + deltaY,
    })),
  };
}

function triangle(cycle: number): number {
  const phase = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  return phase;
}

export function motionFieldFixtureAt(
  scenario: MotionFieldFixtureScenario,
  elapsedMs: number,
): MotionFieldFixtureState {
  const timestampMs = quantize(elapsedMs);
  const stable = fixtureFrameAt('stable', timestampMs);
  const base = stable.observations[0];
  if (!base) return { frame: stable, label: 'No fixture hand' };
  const cycle = (timestampMs % CYCLE_MS) / CYCLE_MS;
  let x = 0.24 + triangle(cycle) * 0.5;
  let y = 0.58;
  let label = 'Horizontal sweep';

  if (scenario === 'speed-steps') {
    const segment = timestampMs % CYCLE_MS;
    if (segment < 800) {
      x = 0.25;
      label = 'Still acquisition';
    } else if (segment < 2400) {
      x = 0.25 + ((segment - 800) / 1600) * 0.22;
      label = 'Slow sweep';
    } else {
      x = 0.47 + ((segment - 2400) / 1600) * 0.27;
      label = 'Fast sweep';
    }
  }
  if (scenario === 'direction-change') {
    const angle = cycle * Math.PI * 2;
    x = 0.5 + Math.cos(angle) * 0.2;
    y = 0.56 + Math.sin(angle) * 0.16;
    label = 'Clockwise direction change';
  }
  if (scenario === 'stillness') {
    x = 0.5 + Math.sin(cycle * Math.PI * 2) * 0.001;
    y = 0.58 + Math.cos(cycle * Math.PI * 2) * 0.001;
    label = 'Sub-threshold stillness';
  }
  if (scenario === 'left-mirrored') {
    x = 1 - x;
    label = 'Left hand with mirrored display';
  }

  const primary = translateFixtureHand(
    base,
    x,
    y,
    timestampMs,
    scenario === 'left-mirrored' ? 'fixture-left' : 'fixture-right',
    scenario === 'left-mirrored' ? 'left' : 'right',
  );
  let observations: readonly HandObservation[] = [primary];

  if (scenario === 'two-hand-owner') {
    const secondary = {
      ...translateFixtureHand(
        base,
        0.76,
        0.56,
        timestampMs,
        'fixture-secondary',
        'left',
      ),
      confidence: 0.7,
    };
    observations = [{ ...primary, confidence: 0.98 }, secondary];
    label = 'Stable primary with second hand';
  }

  const segment = timestampMs % CYCLE_MS;
  if (
    scenario === 'dropout' &&
    ((segment >= 1000 && segment < 1080) || (segment >= 2200 && segment < 2480))
  ) {
    observations = [];
    label = segment < 1080 ? 'Short dropout' : 'Long dropout';
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

export class MotionFieldFixturePlayer {
  private startedAtMs = 0;
  private scenario: MotionFieldFixtureScenario = 'horizontal-sweep';

  select(scenario: MotionFieldFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): MotionFieldFixtureState {
    return motionFieldFixtureAt(this.scenario, timestampMs - this.startedAtMs);
  }
}
