# Experiment 002 — Intent Gate

Status: implemented; deterministic and browser validation complete, physical
camera study pending.

## Question

Can a scale-independent pinch measurement plus temporal state machine produce a
controllable activation signal without flicker or single-frame false positives?

## Hypothesis

Palm-normalized thumb-to-index distance, hysteresis, 120 ms confirmation, a
release hold, and explicit dropout handling will separate deliberate pinches
from near misses and threshold jitter while keeping perceived activation delay
below 200 ms.

## Originality check

Pinch detection is common. This experiment contributes an inspectable evidence
gate: visitors see the continuous ratio, state transitions, rejected candidates,
dropout policy, and timing costs rather than a hidden boolean or copied signature
effect.

## Inputs

- live front-facing camera after explicit user action
- deterministic temporal landmark fixtures without camera or model
- one selected hand drives the recognizer; a second hand remains visible but
  cannot silently take ownership while the first hand is present
- still images are excluded because gesture intent requires elapsed-time evidence

## Gesture contract

- landmarks: wrist, index MCP, pinky MCP, thumb tip, and index tip
- measurement: thumb-tip to index-tip distance divided by palm scale
- activation threshold: ratio at or below `0.34`
- continuation threshold: ratio at or below `0.46`
- activation confirmation: `120 ms` continuously inside activation threshold
- release confirmation: `100 ms` continuously outside continuation threshold
- cooldown: `180 ms` after confirmed release and until fingers remain released
- dropout grace: preserve active evidence for at most `100 ms`, with decaying
  confidence; longer dropout becomes `unknown`
- recovery from `unknown` restarts at `idle`; old active intent is never inferred
- malformed observations, missing required landmarks, palm scale below `0.02`,
  non-finite ratios, and implausible ratios above `4` return `unknown`

State flow:

```text
idle → candidate → active → cooldown → idle
  ↘       ↘          ↘          ↘
               unknown
```

Threshold values are experiment hypotheses, not final product constants.

## Visual thesis

A signal gate under tension: a luminous vermilion aperture compresses against a
near-black tracking plane, making continuous distance and discrete intent feel
like two related but distinct materials.

## Content plan

- hero: Intent Gate name, one-sentence question, explicit Start camera action,
  and dominant aperture/hand plane
- support: camera/fixture switch, scenario selection, overlay and mirror controls
- detail: phase, ratio, thresholds, confidence, confirmation progress, reason,
  and recent transition timeline
- final action: reset experiment, return to experiment index, or inspect Landmark
  Explorer

## Interaction thesis

- continuous pinch ratio compresses the aperture without declaring intent
- confirmed activation locks a warm field into place; release visibly passes
  through cooldown rather than snapping to idle
- rejected candidates leave short timeline marks, revealing hysteresis and time
  as causal evidence

Reduced motion removes acquisition sweeps, pulsing, and interpolated aperture
motion while preserving every state and measurement.

## Test matrix

- clean confirmed pinch and clean release
- near miss above activation threshold
- jitter alternating around activation threshold
- tap shorter than confirmation time
- slow release across continuation threshold
- short dropout during active state and long dropout to `unknown`
- left and right hands, mirrored and unmirrored display
- second hand appearance without ownership theft
- partial frame exit and malformed geometry
- rapid motion, stillness, motion blur, low light, busy background, skin-tone,
  sleeves, and jewelry during physical-camera validation
- permission denied, unsupported camera, local model failure, reduced motion,
  keyboard-only operation, and media-track teardown

## Measurements

Record:

- activation and release delay
- false activations and rejected candidates
- active-state flicker count
- time spent in `unknown`
- input dimensions, inference/display rate, median/worst inference duration, and
  long tasks over 50 ms
- visible delay between physical pinch and locked aperture

## Privacy behavior

- no camera request before click
- frames, landmarks, gesture signals, and metrics stay in memory inside browser
- no backend, telemetry, persistence, recording, or remote inference
- camera tracks stop on mode switch, reset, page inactivity, model failure, and
  teardown
- fixture mode requires neither camera nor model

## Exit criteria

- clean fixture activates once and releases once at equivalent elapsed times
  across different fixture sampling rates
- near miss, jitter, and short tap never activate
- short dropout preserves active phase with reduced confidence; long dropout
  becomes `unknown`
- left/right and display mirroring do not change ratio or transition timing
- no media track survives mode switch, inactivity, reset, or teardown
- physical-camera matrix reports activation delay, false activations, flicker,
  and at least three reliable and three unreliable conditions

## Result log

Implemented:

- palm-normalized pinch geometry and pure timestamp-driven state machine
- activation/continuation hysteresis, confirmation, release, cooldown, bounded
  dropout grace, explicit `unknown`, and stable selected-hand ownership
- nine deterministic evidence fixtures covering positive, negative, timing,
  dropout, handedness, and mirroring cases
- separate experiment index, preserved Experiment 001 route, camera/fixture UI,
  transition timeline, and signal-only aperture effect
- shared camera lifecycle and adaptive video-frame scheduler reused by both
  experiments
- permission-denied, unavailable-camera, track-stop, no-camera fixture,
  reduced-motion, desktop, and narrow-mobile browser checks

Validation completed on 2026-08-11:

- `pnpm exec vitest run src/gesture/pinch-recognizer.test.ts` — 11 passed
- `pnpm check` — formatting, lint, 22 unit tests, type-check, and production
  multi-page build passed
- `pnpm test:browser` — 16 passed, including route separation, no premature
  permission, one/two/no-hand fixtures, keyboard focus, denied/unavailable
  camera, local model initialization, reduced motion, and track teardown
- in-app Chromium at 1440×900 and 390×844 — initial and active states rendered,
  no horizontal overflow, mobile control/status regions do not overlap, no
  console warnings or errors

Pending before a keep/revise/discard conclusion:

- physical camera: one/two/no hands, lighting, occlusion, motion blur, partial
  exits, skin tones, sleeves, jewelry, busy backgrounds, and device performance
- camera inactivity teardown in a physical permission session

Method view exposes the palm-normalized ratio, hysteresis, temporal gate,
rejection rules, and implementation map through the shareable `#method` hash.
It never starts camera capture.
