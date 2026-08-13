# Experiment 001 - Landmark Explorer

Status: implemented; physical-camera validation pending.

## Question

Can a visitor understand hand-tracking quality and intentionally manipulate its
signals before an expressive effect is introduced?

## Hypothesis

A full-bleed landmark view plus a restrained inspector will reveal enough about
jitter, confidence, mirroring, and occlusion to guide later gesture design. A
deterministic fixture path will make failures reproducible.

## Originality check

MediaPipe examples commonly draw landmarks. This experiment adds portfolio value
through signal explanation, deterministic failure playback, coordinate-space
clarity, and documented observation - not through copying a signature gesture or
effect from another demo.

## Inputs

- live front-facing camera after explicit user action
- uploaded still image
- deterministic landmark fixture
- maximum two hands for initial scope

Recorded-video upload is deferred until camera and image lifecycles are stable.

## Tracking contract

- use MediaPipe Hand Landmarker through local adapter
- preserve all 21 normalized landmarks per hand
- expose handedness and available confidence values
- run once per new media frame
- render and inference schedules remain separate
- mirror display, not model data

No gesture activation ships in this experiment. Derived values are observations:
joint angles, fingertip distances, palm scale, velocity, and frame age.

## Visual thesis

An instrument calibration surface: moving image dominates; warm landmarks and
one vermilion signal reveal machine perception without dashboard clutter.

## Content plan

- hero: experiment name, purpose, Start camera, dominant visual plane
- support: camera / image / fixture input switcher and overlay toggle
- detail: selected hand, landmark, confidence, timing, and coordinate inspector
- final action: reset or open experiment notes

## Interaction thesis

- acquisition traces hand structure in one short coherent reveal
- confidence changes line weight and opacity calmly
- selected landmark creates a direct line between image point and inspector row

## Required states

- pre-permission
- loading model
- requesting camera
- tracking with zero, one, or two hands
- permission denied
- unsupported camera API
- model download/load failure
- fixture playback
- image selected and cleared

## Test matrix

- stable open hand and fist
- left and right hand separately
- two hands apart and crossing
- fingertip leaving frame
- fast translation and motion blur
- short and long dropout
- mirrored and unmirrored fixture
- reduced motion
- keyboard-only mode switching
- teardown stops all media tracks

## Measurements

Record:

- browser and device
- video dimensions
- inference frequency
- display refresh frequency
- median and worst inference duration
- long tasks over 50 ms
- observed delay between movement and overlay

## Privacy behavior

- no camera request before click
- no network request containing pixels or landmarks
- no persistence
- stop tracks on input switch, teardown, and hidden-page policy chosen during
  implementation
- revoke uploaded-image object URL after clear or replacement

## Exit criteria

- fixture works without camera or model
- normalized/display coordinates remain correct when mirrored
- all required states are recoverable
- no media track survives teardown
- measurements identify whether main-thread tracking is acceptable
- experiment notes name at least three reliable and three unreliable signals

## Result log

### 2026-08-11 - implementation pass

Implemented:

- explicit camera permission action with unsupported, denied, stream, model,
  zero-hand, one-hand, and two-hand states
- uploaded-image lifecycle with ephemeral object URLs and a same-origin
  MediaPipe model
- deterministic stable, jitter, dropout, crossing, rapid-motion, mirrored, and
  low-confidence fixtures that work without camera or model initialization
- all 21 landmarks, standard hand connections, stable identity matching,
  handedness classification confidence, explicit display mirroring, selectable
  landmarks, and normalized/display coordinate inspection
- palm scale, scale-independent pinch distance, index joint angle, wrist
  velocity, frame age, display rate, inference rate, inference duration, and long
  task measurements
- independent video-frame inference and display schedules, capped at 15–30
  inferences per second according to recent inference cost
- camera track shutdown on mode switch, page inactivity, reset, model failure,
  and teardown; temporary image URL revocation on replacement, reset, failure,
  and teardown
- keyboard operation, visible focus, polite state announcements, responsive
  desktop/mobile composition, and reduced-motion handling for CSS and Canvas
  motion

Measured validation environment:

- Node.js 24.13.1, pnpm 11.20.0, Playwright 1.62.1, Chromium 151.0.7922.34
- rendered fixture checks at 1440×900 and 390×844; no horizontal overflow
- deterministic fixture source: 1280×720; observed display rate: 120 Hz in the
  in-app browser during the stable fixture
- real same-origin MediaPipe initialization with a 640×480 blank image in
  headless Chromium: 65.9 ms image inference, one 65.9 ms sample for both median
  and worst, one long task over 50 ms, and no detected hand
- browser coverage: initial privacy boundary, fixture without camera/model,
  keyboard activation/focus, real local MediaPipe asset loading, reduced motion,
  permission denial recovery, and media-track teardown
- production preview on `127.0.0.1:4174`: same-origin WASM and model initialized,
  blank image reached the recoverable no-hand state

Validation commands:

```bash
pnpm test:unit
pnpm test:browser
pnpm check
```

Observed limits:

- the 65.9 ms value is one still-image inference, not steady camera tracking and
  not a latency claim
- browser tests use camera mocks for denial and teardown; no physical camera was
  accessed during this pass
- actual behavior under motion blur, occlusion, low light, different skin tones,
  sleeves, jewelry, busy backgrounds, and hand crossing is not yet measured
- handedness confidence is exposed because the API does not return a single
  per-hand tracking-confidence value in this result contract
- identity matching uses handedness plus nearest wrist and may become
  inconclusive after long dropout, large jumps, or classification reversal

Conclusion: revise and continue measurement. Architecture, deterministic
fixtures, privacy lifecycle, and inspection UI are ready to keep. Do not select
gesture thresholds or expressive effects until the physical-camera matrix names
at least three reliable and three unreliable signals.

Method view exposes the local landmark path, coordinate boundary, rejection
rules, and implementation map through the shareable `#method` hash. It never
starts camera capture.

Unresolved questions:

- whether main-thread inference stays inside latency budget during sustained
  camera tracking on target laptop and mobile hardware
- which hidden-page policy feels best after users return to a stopped camera
- how often handedness or nearest-wrist identity swaps during real hand crossing
- which three derived signals remain controllable across the required physical
  test matrix
