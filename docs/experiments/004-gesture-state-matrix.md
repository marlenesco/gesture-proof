# Experiment 004 — Gesture State Matrix

Status: deterministic implementation validated; physical-camera validation pending.

## Question

Can one timestamp-driven recognizer distinguish pinch, fist, open palm,
pointing, and two-hand span without direct gesture-to-gesture handoffs or
single-frame false activation?

## Hypothesis

Pose scores normalized to palm scale, a required winner margin, temporal
confirmation, hysteresis, and an explicit release boundary will keep five
gesture families legible while returning `unknown` when evidence overlaps or
hand ownership becomes unstable.

## Originality check

Multi-gesture classifiers are common. This experiment does not claim a new
classification model. It exposes competing scores, the winning margin, temporal
evidence, ownership, and rejected ambiguity so visitors can see why a gesture
was accepted instead of receiving an unexplained label.

## Inputs

- front-facing camera after explicit user action
- deterministic gesture sequence without camera or model
- one stable primary hand for pinch, fist, open palm, and pointing
- two stable hands for span
- maximum two hands; still images excluded because intent requires elapsed time

## Gesture contract

All pose scores are normalized to `[0, 1]`; higher means stronger evidence.

- **Pinch:** thumb-tip to index-tip distance divided by palm scale, mapped from
  released at `0.52` to fully pinched at `0.24`
- **Fist:** mean four-finger openness, mapped from released at `0.52` to fully
  closed at `0.20`
- **Open palm:** four-finger openness above `0.62`, gated by a released pinch
- **Point:** extended index plus curled middle, ring, and pinky, gated by a
  released pinch
- **Two-hand span:** palm-center distance divided by mean palm scale, mapped
  from released at `1.60` to fully extended at `2.90`
- activation requires score `>= 0.78`, at least `0.16` above the runner-up, for
  `140 ms`
- continuation requires current score `>= 0.58` and a winner margin of at least
  `0.08`
- release requires `100 ms` outside continuation evidence
- cooldown lasts `180 ms`; a different gesture cannot activate before release
- active dropout grace lasts at most `100 ms` with decaying confidence
- evidence gaps above `90 ms` restart candidates
- missing landmarks, palm scale below `0.02`, non-finite geometry, unstable
  ownership, or overlapping scores return `unknown`

State flow:

```text
unknown → idle → candidate → active → cooldown → idle
             ↘ ambiguous / missing evidence ↗
```

## Visual thesis

A dark spectral proof plane cut by five restrained evidence bands, where only
the gesture that survives competition and time heats to vermilion.

## Content plan

- hero: experiment name, question, explicit camera and fixture actions, dominant
  hand plane
- support: camera/fixture mode, fixture scenario, skeleton and mirror controls
- detail: five score bands, winner margin, phase, ownership, timer, and reason
- final action: reset, open experiment record, or continue to Motion Field

## Interaction thesis

- each score band changes width continuously, showing competition before a
  discrete decision
- candidate confirmation draws one timed acquisition line; activation locks the
  winning label into the visual plane
- ambiguity collapses the winner plane into `unknown` instead of animating a
  false handoff

Reduced motion removes interpolation and acquisition sweeps while preserving
every score, phase, reason, and focus transition.

## Test matrix

- confirmed pinch, fist, open palm, pointing, and two-hand span
- short holds and ambiguous open/pinch or point/fist mixtures
- direct gesture-to-gesture changes without release
- one hand, two hands, no hands, and second-hand arrival
- left/right and mirrored/unmirrored display
- partial exits, short/long dropout, and hand crossing
- rapid motion, stillness, motion blur, low light, busy background, different
  skin tones, sleeves, and jewelry during physical-camera validation
- permission denied, unavailable camera, local model failure, reduced motion,
  keyboard-only operation, reset, inactivity, and media-track teardown

## Measurements

- per-gesture activation and release latency
- rejected candidate and ambiguity counts
- false activation and direct-handoff counts
- time in `unknown` and ownership changes
- display/inference rate, median/worst inference duration, long tasks, and source
  dimensions

## Privacy behavior

- no camera request before click
- frames, landmarks, scores, state, and measurements remain in browser memory
- no backend, telemetry, recording, cookies, local storage, or persistence
- camera tracks stop on mode switch, reset, inactivity, model failure, and
  teardown
- fixture mode requires neither camera nor model

## Exit criteria

- each deterministic gesture activates exactly once after temporal confirmation
- short holds and ambiguous mixtures never activate
- direct gesture changes require confirmed release and cooldown
- span requires two stable hands; one-hand evidence cannot fabricate it
- left/right and display mirroring do not change decisions
- hand crossing or insufficient identity evidence becomes `unknown`
- no media track survives mode switch, inactivity, reset, or teardown
- physical-camera matrix reports reliable and unreliable conditions for every
  gesture family

## Result log

- `pnpm check` passed: formatting, lint, 46 unit tests, type-check, and production
  build.
- The full browser suite passed 32/32 with one worker. The eight experiment 004
  cases cover initial privacy, all five gesture families, competitive evidence,
  short holds, camera denial/unavailability, media-track teardown, and reduced
  motion.
- Headed Chromium inspection passed at 1200 px and 390 px widths without
  horizontal overflow. Reduced motion removed canvas animation and collapsed
  transitions while preserving the evidence readout.
- Deterministic evidence supports the shared competition and temporal state
  machine. Decision: **revise** thresholds and ownership behavior after the
  physical-camera matrix; do not promote these values to a product contract yet.
- Still pending: physical hands across blur, occlusion, low light, crossings,
  skin tones, sleeves, jewelry, and varied devices.
