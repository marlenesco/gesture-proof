# Experiment 005 - Motion Field

Status: deterministic implementation validated; physical-camera validation pending.

## Question

Can timestamp-derived palm motion drive a persistent visual field that feels
responsive without coupling an effect to raw tracker landmarks?

## Hypothesis

A stable hand owner, normalized palm-center velocity, elapsed-time smoothing,
impossible-jump rejection, and the confirmed Gesture State Matrix signal will
produce a controllable field while returning `unknown` during insufficient or
contradictory evidence.

## Originality check

Particle trails controlled by hands are common. This experiment is not a novel
particle system. Its contribution is an inspectable signal boundary: tracking
observations become a compact motion signal, confirmed gestures select field
behavior, and the renderer receives neither landmarks nor tracker internals.

## Inputs

- front-facing camera after explicit user action
- deterministic sweeps, speed steps, direction changes, stillness, dropout,
  two-hand ownership, and mirrored left-hand fixtures
- maximum two hands; a stable primary owner drives motion
- fixture mode requires neither camera nor model

## Signal contract

- palm center is the mean of wrist and four metacarpophalangeal joints
- position is normalized to the input frame in `[0, 1]`
- velocity uses elapsed milliseconds, never frame count
- normalized velocity is clamped to `2.4` frame widths per second
- speed is also reported in palm widths per second for scale-independent
  comparison
- elapsed gaps above `160 ms`, non-positive time, invalid palm scale below
  `0.02`, non-finite geometry, and jumps above `4` frame widths per second
  return `unknown` or restart acquisition
- motion activates above `0.08` frame widths per second and continues down to
  `0.04`, providing speed hysteresis
- owner dropout has `120 ms` grace with decaying confidence and zero emitted
  velocity; longer loss becomes `unknown`
- confirmed Gesture State Matrix states choose field behavior: open palm emits,
  point streams, pinch curls, fist attracts, and two-hand span disperses
- the effect consumes motion and gesture signals only; it never receives raw
  observations

## Visual thesis

A near-black depth field where one electric-lime current records direction,
speed, and gesture force as a sparse wake rather than decorative confetti.

## Content plan

- hero: Motion Field name, question, explicit camera and fixture actions, and
  the live field as dominant plane
- support: input source, deterministic scenario, skeleton, and mirror controls
- detail: velocity vector, normalized speed, palm-relative speed, owner,
  acquisition reason, confirmed field mode, particle count, and performance
- final action: reset, read the experiment record, or return to the study index

## Interaction thesis

- hand direction bends one persistent current instead of moving a cursor
- confirmed gestures change the force law, so state is visible as cause and
  effect rather than a label alone
- dropout freezes emission immediately and fades the existing wake; recovery
  must reacquire motion instead of teleporting the field

Reduced motion replaces persistent particle integration with one static signal
marker and preserves all numeric evidence and focus transitions.

## Test matrix

- slow/fast horizontal and diagonal sweeps, stillness, and direction reversal
- low-amplitude jitter below activation and impossible position jumps
- irregular timestamps, repeated timestamps, long gaps, short/long dropout
- one hand, two hands, owner retention, owner loss, left/right, and mirrored
  display
- confirmed pinch, fist, open palm, point, span, neutral release, and ambiguous
  Gesture State Matrix evidence
- partial exits, rapid motion, motion blur, low light, busy background, different
  skin tones, sleeves, and jewelry during physical-camera validation
- permission denied, unavailable camera, local model failure, reduced motion,
  keyboard operation, reset, inactivity, and media-track teardown

## Measurements

- motion acquisition latency and direction error
- normalized and palm-relative speed stability across input rates
- impossible-jump, timestamp-gap, and dropout counts
- active particle count and time to visual quiescence
- display/inference rate, median/worst inference duration, and long tasks

## Privacy behavior

- no camera request before click
- frames, landmarks, motion signals, particles, and measurements remain in
  browser memory
- no backend, telemetry, recording, cookies, local storage, or persistence
- camera tracks stop on mode switch, reset, inactivity, model failure, and
  teardown
- particle buffers are fixed-size and disappear on reset or page teardown

## Exit criteria

- deterministic direction and speed agree with fixture motion within documented
  tolerance
- stillness and low-amplitude jitter do not sustain emission
- impossible jumps, long gaps, and ownership loss cannot teleport the field
- short dropout freezes emission; long dropout becomes `unknown`
- gesture changes alter the force law only after temporal confirmation
- reduced motion has no recurring particle animation
- no media track survives mode switch, inactivity, reset, or teardown
- physical-camera results identify reliable and unreliable motion conditions

## Result log

- `pnpm check` passed: formatting, lint, 57 unit tests, type-check, and production
  build.
- The full browser suite passed 41/41 with one worker. The nine experiment 005
  cases cover initial privacy, sweep emission, stillness, two-hand ownership,
  long dropout, camera denial/unavailability, media-track teardown, and reduced
  motion.
- Headed Chromium inspection passed at 1200 px and 390 px widths without
  horizontal overflow. The fixed field remained at or below 320 particles.
  Reduced motion retained active numeric evidence with zero recurring
  particles and collapsed transitions.
- Deterministic evidence supports the signal/effect boundary, timestamp-driven
  velocity, explicit rejection behavior, and fixed buffer. Decision: **revise**
  force laws and thresholds after physical-camera measurement.
- Still pending: physical direction error, camera-rate stability, blur,
  occlusion, lighting, varied devices, skin tones, sleeves, and jewelry.
- Method view exposes stable-owner velocity, timestamp gap rejection, bounded
  particle output, and implementation map through the shareable `#method` hash.
  It never starts camera capture.
