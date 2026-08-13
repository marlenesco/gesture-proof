# Experiment 006 - Object Manipulation Bench

Status: implemented; deterministic validation passed; physical-camera
validation pending.

## Question

Can confirmed hand gestures manipulate a small wireframe scene through stable,
recoverable translate, rotate, scale, create, and discard operations without
turning the experiment into a cluttered gesture-controlled editor?

## Hypothesis

One selected object, a locked action for each confirmed gesture, explicit
release boundaries, reference-baseline reacquisition after tracking loss, and a
strict object cap will make spatial manipulation legible while preventing noisy
gesture changes from producing transform jumps.

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
- one cube at reset; maximum three cubes on desktop and two on fresh mobile
  sessions
- pointer and keyboard controls as complete alternatives to gesture input

## Gesture contract

- **Translate:** confirmed pinch locks the selected cube; normalized primary
  palm displacement moves it in display X/Y
- **Rotate:** confirmed fist locks the selected cube; palm displacement maps to
  yaw and pitch
- **Scale:** confirmed two-hand span locks the selected cube; current span ratio
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
- scale is clamped to `[0.48, 1.8]`; position stays inside a safe stage inset
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
- scene state contains stable ID, normalized position, Euler rotation, scale,
  selection, and ephemeral deletion history
- create starts one new cube at a deterministic open position
- create is disabled at three desktop cubes or two mobile cubes
- trash appears only during translate or pointer drag
- a cube held inside trash for `500 ms` becomes armed; release removes it
- one `Undo` action restores the last discarded cube during a five-second window
- no scene state persists across reset, reload, or navigation

## Visual thesis

A near-black drafting field where a few ivory wireframes float with measured
depth; one acid-cyan contour, not extra chrome, identifies the object receiving
hand intent.

## Content plan

- hero: Object Bench name, concise mapping, explicit camera and deterministic
  actions, dominant wireframe stage
- support: input, fixture scenario, landmark overlay, mirror, and create action
- detail: selected object, action phase, gesture, owner, delta, transform, scene
  count, capacity, trash state, and failure reason
- final action: reset scene, read experiment record, or return to study index

## Interaction thesis

- acquisition tightens a selection halo before the object follows movement,
  explaining when pose became an action
- each transform keeps spatial continuity: translate follows, rotate pivots, and
  span expands around the same selected center
- trash pulls only the selected contour after a deliberate dwell; discard exits
  faster than entry and offers immediate undo

Reduced motion removes halo pulses, transform interpolation, trash pull, and
discard travel while retaining direct manipulation, state text, focus, and undo.

## Test matrix

- confirmed translate, rotate, and two-hand scale
- neutral/open/point evidence and short holds that never transform scene
- direct gesture handoff, short/long dropout, repeated timestamp, long gap, and
  impossible movement
- one hand, two hands, no hands, stable owner, owner loss, and hand crossing
- left/right plus mirrored/unmirrored display
- safe-position and scale clamps, maximum object capacity, selection cycling,
  trash dwell, premature trash exit, discard, undo, and empty scene recovery
- pointer move/rotate/scale plus keyboard create, selection, transform, discard,
  and undo
- rapid motion, blur, partial exits, low light, busy background, different skin
  tones, sleeves, and jewelry during physical-camera validation
- permission denied, unavailable camera, model failure, reset, inactivity,
  reduced motion, narrow mobile, landscape mobile, and media-track teardown

## Measurements

- gesture-to-transform acquisition and release latency
- accepted, rejected, and baseline-reacquisition counts
- position, rotation, and scale delta stability at different input rates
- accidental action handoffs and transform jumps
- trash dwell completion and undo use
- display/inference rate, median/worst inference time, long tasks, and scene count

## Privacy behavior

- no camera request before click
- frames, landmarks, gesture evidence, transform commands, and scene state remain
  in browser memory
- no backend, telemetry, recording, cookies, local storage, or persistence
- camera tracks stop on mode switch, reset, inactivity, model failure, and
  teardown
- deleted objects and undo history disappear on reset or page teardown
- fixture mode requires neither camera nor model

## Exit criteria

- every deterministic action changes only its documented transform
- direct gesture changes cannot bypass release or reuse an old baseline
- dropout and impossible motion never teleport, rotate, or resize an object
- fresh desktop and mobile sessions cannot exceed their documented object caps
- trash requires dwell plus release; undo restores exact identity and transform
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
- Fresh desktop scenes cap at three cubes. Portrait and landscape compact
  viewports cap at two, hide the landmark overlay by default, and avoid
  horizontal overflow.
- Pointer input owns the scene for the duration of a drag, preventing live or
  fixture gesture evidence from racing trash dwell. The 500 ms dwell, release,
  discard, five-second undo, and exact object restore paths pass browser tests.
- Follow-up hands-on use exposed three fixture-blind defects: mobile readout
  layers intercepted cube drag, trash used hardcoded coordinates and required a
  final pointer movement to finish dwell, and fist/span scoring required overly
  clean pose evidence. Regression coverage now uses visible trash geometry,
  stationary dwell, mobile pointer rotate/scale, one noisy fist finger, and a
  practical two-hand span.
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
- `pnpm check` passes with 91 unit tests. The experiment browser file passes 14
  tests, and the full browser suite passes 55 tests serially.
- Headed Chromium inspection passed at 1200 × 900, 390 × 844, and 844 × 390.
  Reduced motion, permission denial, unavailable camera, and media-track
  teardown are covered by automated browser evidence.
- Physical-camera conditions including blur, occlusion, low light, skin tones,
  sleeves, jewelry, and hand crossing remain unverified.

Conclusion: **keep for physical validation**. The bounded object count and
input lock make the interaction coherent enough to test with real hands; final
gesture thresholds and product direction remain pending physical evidence.

Method view exposes confirmed gesture mapping, candidate-baseline staging,
transform rejection, and implementation map through the shareable `#method`
hash. It never starts camera capture.
