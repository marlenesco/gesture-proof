# Project Context

## Product name

Gesture Proof.

Public tagline: **Private, on-device motion experiments.**

## One-line vision

Turn human movement into visible, understandable material for images and video,
while keeping capture local and user-controlled.

## Current stage

Tracking foundation plus temporal gesture, calibration, and gesture-vocabulary
experiments. The Research Spine presents isolated studies as a curated
collection while the studies still decide which signals deserve expressive
effects.

## Why this exists

Hand tracking demos often hide uncertainty behind novelty. This project should
show both magic and mechanism: viewers see an immediate visual reaction, while
curious users can reveal landmarks, confidence, timing, and gesture state.

Portfolio value should come from:

- original interaction design
- technically legible experiments
- local-first privacy architecture
- strong visual direction
- documented decisions and rejected paths
- real performance and failure evidence

## Product thesis

A gesture is not a button replacement. Best interactions use qualities unique to
hands: spatial extent, direction, speed, tension, symmetry, rhythm, and relation
between two hands.

The experience is a curated collection rather than one tool. Each study remains
independently linkable, occupies a clear research phase, and records evidence and
its keep/revise/discard decision. See
`docs/decisions/0004-research-spine-collection-and-records.md`.

## Audience

- designers and creative technologists
- frontend and graphics engineers
- recruiters or clients evaluating interaction craft
- curious visitors who want an immediate camera-based experience

No prior knowledge of computer vision should be required.

## Experience principles

1. **Signal before effect.** Understand and expose landmark behavior first.
2. **Movement has consequence.** Every motion response must feel causal.
3. **Uncertainty stays visible.** Graceful degradation beats false certainty.
4. **Local by default.** Camera and uploads remain on-device.
5. **One experiment, one question.** Avoid feature collections without thesis.
6. **Portfolio, not dashboard.** Image-led, editorial, sparse, memorable.
7. **Accessible fallback.** Camera denial never produces a dead page.

## Technical thesis

- Platform: modern browser, desktop first, mobile supported when feasible.
- Language: strict TypeScript.
- Tooling: Vite, Vitest, ESLint, Prettier, pnpm.
- Tracking: MediaPipe Tasks Vision behind a local adapter.
- Rendering: Canvas 2D first; WebGL/WebGPU only after an effect proves need.
- Architecture: input → tracking → gesture → effect → experience.
- Data: ephemeral memory; no backend in initial phases.
- Model: downloaded explicitly, served from local project origin.

Why no framework yet: experiment loop needs direct control over media, canvas,
workers, and allocation. A UI framework may be added later if narrative and
navigation complexity justify it.

## Gesture vocabulary to explore

These are research candidates, not committed features:

- pinch distance: continuous intensity or focus
- index direction: pointing, ray, brush direction
- open palm: reveal, pause, reset, or field generation
- fist: capture, compress, freeze, or collapse
- hand velocity: force, turbulence, persistence
- wrist rotation: hue, depth, timeline, or effect orientation
- two-hand span: scale or spatial boundary
- two-hand symmetry/asymmetry: blend between visual states
- repeated rhythm: trigger sequences or audiovisual loops
- hand depth: foreground/background response, with conservative confidence

## Effect families to explore

- spatial masks and reveals
- trails, echoes, and temporal accumulation
- displacement fields and fluid-like distortion
- particles attracted to landmarks or gesture vectors
- painterly strokes driven by hand velocity
- palette extraction and color remapping
- typography responding to pose and tension
- photo transformations controlled by live gestures
- semantic actions on an explicitly selected region, only after separate review

## Implemented experiments

**001 - Landmark Explorer**

Question: can users understand tracking quality and intentionally manipulate its
signals without an effect hiding errors?

Deliverable: camera/image view with landmark overlay, handedness, confidence,
frame timing, mirrored coordinates, deterministic fixture mode, and an inspector
for derived distances and joint angles. No showcase effect yet.

See `docs/experiments/001-landmark-explorer.md`.

**002 - Intent Gate**

Question: can a palm-normalized pinch measurement plus elapsed-time evidence,
hysteresis, dropout handling, and cooldown produce controllable intent?

Deliverable: camera and deterministic fixture modes, inspectable phase and
decision evidence, transition timeline, and an aperture effect that consumes
only the gesture signal.

See `docs/experiments/002-intent-gate.md`.

**003 - Gesture Calibration Bench**

Question: does a short, on-device calibration improve activation accuracy for
pinch and fist compared with fixed thresholds without excessive latency?

Deliverable: the same observation stream feeds fixed, One Euro filtered, and
locally calibrated pipelines with visible metrics, thresholds, state, errors,
and latency. Calibration can explicitly return `inconclusive`.

See `docs/experiments/003-gesture-calibration-bench.md`.

**004 - Gesture State Matrix**

Question: can pinch, fist, open palm, pointing, and two-hand span share one
timestamp-driven recognizer without direct handoffs or single-frame activation?

Deliverable: one observation stream produces five competing normalized scores,
an explicit winner margin, stable ownership, temporal confirmation, cooldown,
and `unknown` for ambiguous or missing evidence.

See `docs/experiments/004-gesture-state-matrix.md`.

**005 - Motion Field**

Question: can timestamp-derived palm motion drive a persistent effect through a
clean signal boundary that never exposes raw tracker landmarks to the renderer?

Deliverable: a stable-owner velocity signal with smoothing, jump and gap
rejection, dropout behavior, confirmed gesture force laws, deterministic motion
fixtures, and a fixed-size particle buffer.

See `docs/experiments/005-motion-field.md`.

**006 - Object Manipulation Bench**

Question: can confirmed gestures transform one wireframe cube through stable
translate, rotate, and scale operations without transform jumps or mobile
clutter?

Deliverable: one fixed cube, a pure Canvas 2D scene model, locked manipulation
signals, deterministic action fixtures, and pointer/keyboard alternatives.

See `docs/experiments/006-object-manipulation-bench.md`.

**007 - Aperture Field**

Question: can two open hands establish a selective local visual field only when
their thumb-index geometry remains coherent over time?

Deliverable: a two-hand temporal aperture recognizer with area rejection,
anatomical corner ordering, refraction/pixelate/blur Canvas effects,
deterministic geometry fixtures, and no-camera recovery.

See `docs/experiments/007-aperture-field.md`.

**008 - Aperture Object Set**

Question: can a temporally confirmed two-hand aperture select one or several
complete wireframe cubes before a separate gesture transforms or deletes that
set?

Deliverable: three desktop/two mobile varied cubes, all-vertex aperture
containment, shared pinch/fist/span commands, timestamp-based point-hold
deletion animation, exact Undo, and deterministic set fixtures.

See `docs/experiments/008-aperture-object-set.md`.

## Candidate follow-ups

1. Photo Conductor - gestures modulate a still image without touching controls.
2. Temporal Sculpture - movement writes into layered video history.
3. Intent Lens - a user-defined spatial region becomes a private processing
   boundary for color, text, or visual transformations.

## Non-goals

- copying another project's source, visual identity, copy, or implementation
- building a generic gesture-controlled menu
- training a custom model before heuristics are understood
- face recognition, identity, surveillance, or behavioral profiling
- uploading continuous camera footage
- premature backend, authentication, accounts, analytics, or CMS
- claiming robust accessibility replacement for mouse, keyboard, or touch

## Known risks

- camera permission friction and browser differences
- main-thread inference causing interaction stutter
- noisy fingertip landmarks under blur and occlusion
- unstable hand identity when hands cross
- gesture activation varying with hand size and orientation
- novelty overwhelming portfolio narrative
- over-polished effects masking weak gesture contracts

## Success measures

Foundation succeeds when:

- new experiment can reuse input and tracking without duplicating them
- deterministic fixtures reproduce edge cases without camera access
- gesture state can be inspected frame by frame
- no media leaves device
- a visitor understands experiment within ten seconds
- mobile and reduced-motion states remain usable
- result page explains what worked, failed, and changed

## Open decisions

- first expressive effect after Landmark Explorer
- whether final public build bundles model or fetches it from same-origin storage
- whether anonymous analytics can ever meet privacy thesis

Do not resolve these silently. Record decisions in `docs/decisions/`.

## Resolved publication decisions

- Original project source code and documentation use the Apache License 2.0.
  See `docs/decisions/0005-apache-2.0-project-license.md`.
