# Gesture Proof

Private, on-device motion experiments for learning how hand landmarks and
gestures can drive effects on live video, recorded video, and still images.

This repository starts as an experiment system, not a fixed product. Each study
must answer one clear question, expose its signal, and leave reusable parts for
the eventual portfolio experience.

## Current state

- Experiments 001 through 007 are implemented as separate, linkable routes;
  physical-camera studies remain pending.
- Homepage turns Research Spine into a visual sequence from landmarks to material
  response, while keeping complete study index below it. It explicitly directs
  visitors to deterministic fixtures or a user-started device camera.
- A Research Spine connects studies by phase, current position, evidence record,
  and keep/revise/discard decision. Every study also has a camera-free,
  shareable `#method` technical view.
- Camera, image, and deterministic tracking or pinch fixture paths are
  available.
- Camera permission is requested only after the explicit Start camera action.
- Landmark inspection, temporal pinch intent, local pinch/fist calibration,
  five-family gesture competition, a velocity-driven particle field, and a
  bounded wireframe scene are implemented with recoverable failure states.
- No frame, photo, landmark, or telemetry data leaves the browser.

## Start

Requirements: Node.js 24+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

## Explore locally

Start `pnpm dev`, then use these links. Method links never request camera
permission.

| Study                           | Experience                                                               | Technical method                                                                  | Record                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Home                            | [Open homepage](http://127.0.0.1:4173/)                                  | [Landing direction](./docs/home-landing.md)                                       | [Research Spine decision](./docs/decisions/0004-research-spine-collection-and-records.md) |
| 001 — Landmark Explorer         | [Open](http://127.0.0.1:4173/experiments/001-landmark-explorer/)         | [Method](http://127.0.0.1:4173/experiments/001-landmark-explorer/#method)         | [Brief](./docs/experiments/001-landmark-explorer.md)                                      |
| 002 — Intent Gate               | [Open](http://127.0.0.1:4173/experiments/002-intent-gate/)               | [Method](http://127.0.0.1:4173/experiments/002-intent-gate/#method)               | [Brief](./docs/experiments/002-intent-gate.md)                                            |
| 003 — Gesture Calibration Bench | [Open](http://127.0.0.1:4173/experiments/003-gesture-calibration-bench/) | [Method](http://127.0.0.1:4173/experiments/003-gesture-calibration-bench/#method) | [Brief](./docs/experiments/003-gesture-calibration-bench.md)                              |
| 004 — Gesture State Matrix      | [Open](http://127.0.0.1:4173/experiments/004-gesture-state-matrix/)      | [Method](http://127.0.0.1:4173/experiments/004-gesture-state-matrix/#method)      | [Brief](./docs/experiments/004-gesture-state-matrix.md)                                   |
| 005 — Motion Field              | [Open](http://127.0.0.1:4173/experiments/005-motion-field/)              | [Method](http://127.0.0.1:4173/experiments/005-motion-field/#method)              | [Brief](./docs/experiments/005-motion-field.md)                                           |
| 006 — Object Manipulation Bench | [Open](http://127.0.0.1:4173/experiments/006-object-manipulation-bench/) | [Method](http://127.0.0.1:4173/experiments/006-object-manipulation-bench/#method) | [Brief](./docs/experiments/006-object-manipulation-bench.md)                              |
| 007 — Aperture Field            | [Open](http://127.0.0.1:4173/experiments/007-aperture-field/)            | [Method](http://127.0.0.1:4173/experiments/007-aperture-field/#method)            | [Brief](./docs/experiments/007-aperture-field.md)                                         |

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
3. [`docs/experiments/001-landmark-explorer.md`](./docs/experiments/001-landmark-explorer.md)
4. [`docs/experiments/002-intent-gate.md`](./docs/experiments/002-intent-gate.md)
5. [`docs/experiments/003-gesture-calibration-bench.md`](./docs/experiments/003-gesture-calibration-bench.md)
6. [`docs/experiments/004-gesture-state-matrix.md`](./docs/experiments/004-gesture-state-matrix.md)
7. [`docs/experiments/005-motion-field.md`](./docs/experiments/005-motion-field.md)
8. [`docs/experiments/006-object-manipulation-bench.md`](./docs/experiments/006-object-manipulation-bench.md)
9. [`docs/experiments/007-aperture-field.md`](./docs/experiments/007-aperture-field.md)
10. [`docs/home-landing.md`](./docs/home-landing.md)
11. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

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

Original project source code and documentation are licensed under the
[Apache License 2.0](./LICENSE). Third-party dependencies, models, and referenced
projects remain subject to their own licenses; see
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

Licensing does not itself authorize deployment or publication. Complete the
remaining Phase 5 checks and obtain explicit approval before either action.
