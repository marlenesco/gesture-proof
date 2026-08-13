import type { ObservationFrame } from './contracts';
import { apertureFixtureAt } from './aperture-fixtures';
import { objectBenchFixtureAt } from './object-bench-fixtures';
import { stateMatrixFixtureAt } from './state-matrix-fixtures';
import { fixtureElapsedAt, fixtureFrameAt } from './fixtures';

export const APERTURE_OBJECT_FIXTURE_SCENARIOS = [
  'set-sequence',
  'one-cube',
  'two-cubes',
  'empty-field',
  'open-palm-span',
  'span-scale',
  'open-palm-clear',
  'point-delete',
  'dropout',
] as const;

export type ApertureObjectFixtureScenario =
  (typeof APERTURE_OBJECT_FIXTURE_SCENARIOS)[number];

export interface ApertureObjectFixtureState {
  readonly frame: ObservationFrame;
  readonly label: string;
}

const FRAME_INTERVAL_MS = 20;
const CYCLE_MS = 8200;
const APERTURE_DURATION_MS = 1400;
const NEUTRAL_DURATION_MS = 900;

function quantize(elapsedMs: number): number {
  return (
    Math.floor(Math.max(0, elapsedMs) / FRAME_INTERVAL_MS) * FRAME_INTERVAL_MS
  );
}

function atTimestamp(
  frame: ObservationFrame,
  timestampMs: number,
): ObservationFrame {
  return {
    ...frame,
    timestampMs,
    observations: frame.observations.map((hand) => ({ ...hand, timestampMs })),
  };
}

function shiftFrame(frame: ObservationFrame, deltaX: number): ObservationFrame {
  return {
    ...frame,
    observations: frame.observations.map((hand) => ({
      ...hand,
      landmarks: hand.landmarks.map((point) => ({
        ...point,
        x: point.x + deltaX,
      })),
    })),
  };
}

function neutralFrame(timestampMs: number): ObservationFrame {
  const frame = fixtureFrameAt('stable', timestampMs);
  return { ...frame, timestampMs, observations: [] };
}

export function apertureObjectFixtureAt(
  scenario: ApertureObjectFixtureScenario,
  elapsedMs: number,
): ApertureObjectFixtureState {
  const timestampMs = quantize(elapsedMs);
  const cycleMs = timestampMs % CYCLE_MS;
  const apertureScenario =
    scenario === 'open-palm-span' ? 'open-palm-span' : 'steady-aperture';

  if (scenario === 'open-palm-span' || cycleMs < APERTURE_DURATION_MS) {
    const state = apertureFixtureAt(apertureScenario, timestampMs + 1200);
    const frame =
      scenario === 'empty-field' ? shiftFrame(state.frame, -0.32) : state.frame;
    return {
      frame: atTimestamp(frame, timestampMs),
      label:
        scenario === 'empty-field'
          ? 'Valid aperture: no complete cube inside'
          : scenario === 'open-palm-span'
            ? 'Open palms: span-like evidence rejected'
            : 'Aperture selection pass',
    };
  }
  if (cycleMs < APERTURE_DURATION_MS + NEUTRAL_DURATION_MS) {
    return {
      frame: neutralFrame(timestampMs),
      label: 'Neutral pause: selection commit arm',
    };
  }
  if (scenario === 'point-delete') {
    const state = stateMatrixFixtureAt(
      'gesture-sequence',
      3600 + ((cycleMs - APERTURE_DURATION_MS - NEUTRAL_DURATION_MS) % 650),
    );
    return {
      frame: atTimestamp(state.frame, timestampMs),
      label: 'Point hold: delete selected set',
    };
  }
  if (scenario === 'open-palm-clear') {
    const state = stateMatrixFixtureAt(
      'gesture-sequence',
      2600 + ((cycleMs - APERTURE_DURATION_MS - NEUTRAL_DURATION_MS) % 650),
    );
    return {
      frame: atTimestamp(state.frame, timestampMs),
      label: 'Open-palm hold: clear selected set',
    };
  }
  if (scenario === 'span-scale') {
    const state = objectBenchFixtureAt(
      'scale',
      cycleMs - APERTURE_DURATION_MS - NEUTRAL_DURATION_MS,
    );
    return {
      frame: atTimestamp(state.frame, timestampMs),
      label: 'Selected set: scale',
    };
  }
  const action =
    cycleMs < 3200 ? 'translate' : cycleMs < 4700 ? 'rotate' : 'scale';
  const state = objectBenchFixtureAt(
    action,
    cycleMs - APERTURE_DURATION_MS - NEUTRAL_DURATION_MS,
  );
  return {
    frame: atTimestamp(state.frame, timestampMs),
    label: `Selected set: ${action}`,
  };
}

export class ApertureObjectFixturePlayer {
  private startedAtMs = 0;
  private scenario: ApertureObjectFixtureScenario = 'set-sequence';

  select(scenario: ApertureObjectFixtureScenario, timestampMs: number): void {
    this.scenario = scenario;
    this.startedAtMs = timestampMs;
  }

  frame(timestampMs: number): ApertureObjectFixtureState {
    return apertureObjectFixtureAt(
      this.scenario,
      fixtureElapsedAt(this.startedAtMs, timestampMs),
    );
  }
}
