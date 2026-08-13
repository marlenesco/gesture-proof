# Experiment 006 - Object Manipulation Bench

Status: implemented; deterministic validation passed; physical-camera
validation pending.

## Question

Can confirmed hand gestures transform one wireframe cube through stable,
recoverable translate, rotate, and scale operations without turning the
experiment into a cluttered gesture-controlled editor?

## Hypothesis

One fixed cube, a locked action for each confirmed gesture, explicit release
boundaries, and reference-baseline reacquisition after tracking loss will make
spatial manipulation legible while preventing noisy gesture changes from
producing transform jumps.

## Originality check

Gesture-controlled 3D viewers and object editors are common. This experiment
does not claim a new editor or renderer. It exposes the boundary between
continuous motion, confirmed pose, a pure manipulation command, and an
ephemeral scene model. The public state explains every transform and rejected
handoff instead of hiding uncertainty behind a polished object demo.

## Inputs

- front-facing camera after explicit user action
- deterministic translate, rotate, scale, dropout, neutral, and full-sequence
  fixtures without camera or model
- one hand for translate and rotate; two stable hands for scale
- one fixed cube on every viewport
- pointer and keyboard controls as complete alternatives to gesture input

## Gesture contract

- **Translate:** confirmed pinch locks the cube; normalized primary
  palm displacement moves it in display X/Y
- **Rotate:** confirmed fist locks the cube; palm displacement maps to
  yaw and pitch
- **Scale:** confirmed two-hand span locks the cube; current span ratio
  divided by its acquisition baseline produces scale delta
- this experiment maps two-hand span from continuation at `1.45` mean palm
  widths to full activation at `2.45`; Experiment 004 keeps its stricter
  exploratory `1.60` / `2.90` mapping
- open palm, point, ambiguous competition, missing evidence, and cooldown emit
  no scene transform
- an action stays locked until Gesture State Matrix releases it; direct action
  handoffs cannot occur
- motion or span baseline is staged when a gesture becomes a temporal candidate;
  accumulated displacement remains inert until activation, then applies once
- staged and active baselines are discarded after rejection, release, dropout,
  timestamp gap, impossible jump, owner loss, or reset
- scale is clamped to `[0.30, 1.8]`; position stays inside a safe stage inset.
  Minimum cube remains roughly 44 px on a normal desktop stage, making compact
  scale deliberate but still visible and interactive.
- transform deltas above documented per-sample limits are rejected as
  `inconclusive`
- short tracking loss freezes the object; recovery reacquires a baseline before
  movement resumes

State flow:

```text
unknown → ready → candidate(stage baseline) → active(apply + continue)
                    ↘ reject / evidence loss → unknown → reacquire ↗
active → released → ready
```

## Scene contract

- Canvas 2D projects eight cube vertices and twelve edges; no WebGL dependency
- scene state contains one stable ID, normalized position, Euler rotation, and
  scale
- creation, selection, deletion, and Undo are intentionally out of scope;
  Experiment 008 owns those multi-object contracts
- no scene state persists across reset, reload, or navigation

## Visual thesis

A near-black drafting field where one ivory wireframe floats with measured
depth; one acid-cyan contour, not extra chrome, identifies hand intent.

## Content plan

- hero: Object Bench name, concise mapping, explicit camera and deterministic
  actions, dominant wireframe stage
- support: input, fixture scenario, landmark overlay, and mirror
- detail: action phase, gesture, owner, transform, and failure reason
- final action: reset scene, read experiment record, or return to study index

## Interaction thesis

- acquisition tightens a selection halo before the object follows movement,
  explaining when pose became an action
- each transform keeps spatial continuity: translate follows, rotate pivots, and
  span expands around the same selected center
  Reduced motion removes halo pulses and transform interpolation while retaining
  direct manipulation, state text, and focus.

## Test matrix

- confirmed translate, rotate, and two-hand scale
- neutral/open/point evidence and short holds that never transform scene
- direct gesture handoff, short/long dropout, repeated timestamp, long gap, and
  impossible movement
- one hand, two hands, no hands, stable owner, owner loss, and hand crossing
- left/right plus mirrored/unmirrored display
- safe-position and scale clamps on one fixed cube
- pointer move/rotate/scale plus keyboard transform
- rapid motion, blur, partial exits, low light, busy background, different skin
  tones, sleeves, and jewelry during physical-camera validation
- permission denied, unavailable camera, model failure, reset, inactivity,
  reduced motion, narrow mobile, landscape mobile, and media-track teardown

## Measurements

- gesture-to-transform acquisition and release latency
- accepted, rejected, and baseline-reacquisition counts
- position, rotation, and scale delta stability at different input rates
- accidental action handoffs and transform jumps
- display/inference rate, median/worst inference time, and long tasks

## Privacy behavior

- no camera request before click
- frames, landmarks, gesture evidence, transform commands, and scene state remain
  in browser memory
- no backend, telemetry, recording, cookies, local storage, or persistence
- camera tracks stop on mode switch, reset, inactivity, model failure, and
  teardown
- fixture mode requires neither camera nor model

## Exit criteria

- every deterministic action changes only its documented transform
- direct gesture changes cannot bypass release or reuse an old baseline
- dropout and impossible motion never teleport, rotate, or resize an object
- all critical operations work through pointer and keyboard alternatives
- reduced motion preserves control without recurring or spatially misleading
  animation
- no media track survives mode switch, inactivity, reset, or teardown
- physical-camera results identify reliable and unreliable conditions per action

## Result log

- Implemented a pure ephemeral scene model, Canvas 2D wireframe renderer,
  manipulation command signal, deterministic fixtures, and pointer/keyboard
  alternatives without a new runtime dependency.
- Translate, rotate, and scale fixtures change only their mapped transform;
  invalid handoffs, timestamp gaps, impossible deltas, and evidence loss freeze
  the scene or reacquire a baseline.
- One fixed cube now exists on desktop and compact viewports, removing creation,
  selection, deletion, and Undo from this study. Experiment 008 owns those
  multi-object operations; 006 measures only transform continuity.
- Pointer input owns the cube for the duration of a drag, preventing live or
  fixture gesture evidence from racing pointer transforms. Regression coverage
  keeps mobile pointer rotate/scale, one noisy fist finger, and a practical
  two-hand span.
- A second hands-on pass traced failed camera rotation to the shared experiment
  004 recognizer: fist and point fixtures used non-physical finger chains and
  score gates demanded nearly perfect closure. The shared pose metric, fixtures,
  and partial-pose regressions are corrected; rotate still consumes the same
  confirmed fist signal rather than adding an experiment-specific shortcut.
- A third hands-on pass exposed a consumer timing bug affecting all three
  transforms: experiment 006 captured its baseline only after the matrix's
  `140 ms` confirmation, discarding natural movement made while acquiring the
  gesture. Candidate movement is now staged without mutating the scene and
  applied once on confirmation; rejection still produces no transform.
- Current validation replaces capacity, trash, deletion, and Undo cases with
  fixed-cube transform and responsive-layout cases.
- Physical-camera conditions including blur, occlusion, low light, skin tones,
  sleeves, jewelry, and hand crossing remain unverified.

Conclusion: **keep for physical validation**. The bounded object count and
input lock make the interaction coherent enough to test with real hands; final
gesture thresholds and product direction remain pending physical evidence.

Method view exposes confirmed gesture mapping, candidate-baseline staging,
transform rejection, and implementation map through the shareable `#method`
hash. It never starts camera capture.
