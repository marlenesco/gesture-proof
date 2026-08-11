# Roadmap

Current position: Experiments 001–003 are implemented. Experiment 003 compares
fixed, filtered, and session-calibrated pinch/fist evidence. Physical-camera,
lighting, occlusion, diversity, and device measurements remain required before
the studies can be concluded.

## Phase 0 — Foundation

- repository rules and project context
- strict TypeScript scaffold
- geometry contracts and unit tests
- explicit model download
- placeholder visual thesis

Exit: `pnpm check` passes and repository contains no runtime camera request.

## Phase 1 — See the signal

- Experiment 001: Landmark Explorer
- camera, image, and deterministic fixture inputs
- observable coordinate and timing pipeline
- lifecycle and permission states

Exit: tracking behavior can be inspected without any expressive effect.

## Phase 2 — Name the movement

- Experiment 002: Intent Gate — temporal, palm-normalized pinch contract
- Experiment 003: Gesture Calibration Bench — fixed, filtered, and local
  pinch/fist thresholds
- compare pinch, point, open palm, rotation, velocity, and two-hand span
- temporal gesture state machines
- false-positive matrix
- gesture recorder and deterministic playback

Exit: choose two signals that feel controllable across diverse conditions.

## Phase 3 — Make movement material

- three small effects, each proving a different signal quality
- still-image and live-video paths
- effect performance comparison

Exit: select one interaction with original expressive value.

## Phase 4 — Build the showcase

- portfolio narrative and final identity
- full-bleed flagship experience
- readable technical breakdown
- failure and privacy explanation
- mobile and no-camera fallback

Exit: visitor understands promise within ten seconds and can experience or replay
the interaction without developer help.

## Phase 5 — Publish deliberately

- choose license
- verify third-party notices
- add CI and deployment ADR
- run performance, accessibility, browser, and privacy checks
- publish only approved assets and fixtures

Exit: public URL, reproducible build, documented limitations.
