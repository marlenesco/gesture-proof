# Gesture Proof

Private, on-device motion experiments for learning how hand landmarks and
gestures can drive effects on live video, recorded video, and still images.

This repository starts as an experiment system, not a fixed product. Each study
must answer one clear question, expose its signal, and leave reusable parts for
the eventual portfolio experience.

## Current state

- Experiments 001, 002, and 003 are implemented as separate, linkable routes;
  physical-camera studies remain pending.
- Camera, image, and deterministic tracking or pinch fixture paths are
  available.
- Camera permission is requested only after the explicit Start camera action.
- Landmark inspection, temporal pinch intent, and local pinch/fist calibration
  comparisons are implemented with recoverable failure states.
- No frame, photo, landmark, or telemetry data leaves the browser.

## Start

Requirements: Node.js 24+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

- `/` — experiment index
- `/experiments/001-landmark-explorer/` — tracking signal inspector
- `/experiments/002-intent-gate/` — pinch evidence and intent state machine
- `/experiments/003-gesture-calibration-bench/` — fixed, filtered, and locally
  calibrated pinch/fist comparison

For a GitHub project page build, set `VITE_BASE_PATH` to repository path:

```bash
VITE_BASE_PATH=/repository-name/ pnpm build
```

Navigation, generated assets, and local model path then share same deployment
base. Manual Pages workflow downloads model before building; it does not run
until explicitly dispatched.

Before implementing hand tracking, download the official MediaPipe model:

```bash
pnpm models:fetch
```

The model is kept out of Git to avoid silently redistributing a large binary.

## Useful commands

```bash
pnpm dev          # local development server
pnpm test:unit    # deterministic geometry tests
pnpm test:browser # browser lifecycle, privacy, model, and accessibility tests
pnpm build        # type-check and production build
pnpm check        # formatting, lint, unit tests, build
pnpm format       # format repository files
```

## Read first

1. [`project-context.md`](./project-context.md)
2. [`AGENTS.md`](./AGENTS.md)
3. [`KICKOFF_PROMPT.md`](./KICKOFF_PROMPT.md)
4. [`docs/experiments/001-landmark-explorer.md`](./docs/experiments/001-landmark-explorer.md)
5. [`docs/experiments/002-intent-gate.md`](./docs/experiments/002-intent-gate.md)
6. [`docs/experiments/003-gesture-calibration-bench.md`](./docs/experiments/003-gesture-calibration-bench.md)
7. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## Repository map

```text
experiments/             Independently linkable experiment HTML entry points
src/input/               Ephemeral camera lifecycle ownership
src/tracking/            Model adapter and decoupled video-frame scheduler
src/gesture/             Pure temporal gesture recognizers
src/effects/             Renderers consuming gesture signals
src/experience/          Experiment orchestration and UI state
src/engine/              Reusable contracts, geometry, fixtures, and measurements
docs/experiments/       One brief and result log per experiment
docs/decisions/         Architecture decision records
docs/research/          External research and source notes
public/models/          Locally downloaded ML models, ignored by Git
scripts/                Explicit setup utilities
```

## Publication status

No project license has been selected yet. Keep the repository local until that
decision is recorded. External inspiration is cited; its source code must not be
copied unless its license explicitly permits that use.
