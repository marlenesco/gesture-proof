# Experiment 008 - Aperture Object Set

Status: deterministic implementation validated; physical-camera validation
pending.

## Question

Can a temporally confirmed two-hand aperture select one or several complete
wireframe cubes before a separate gesture transforms or deletes that set?

## Hypothesis

Previewing every projected cube vertex against a confirmed aperture polygon
makes containment visible and conservative. Commit happens only after release
and a neutral pause, so residual L-pose evidence cannot become deletion. Timed
point and open-palm holds make delete and clear deliberate and distinct.

## Originality check

This study combines project-owned Aperture Field geometry with Object Bench
scene commands. It does not reuse external code, visual identity, copy, or
interaction implementation. The contribution is an inspectable containment
contract: a partial cube is never selected.

## Inputs

- front-facing camera after explicit user action
- deterministic preview, transform, point-delete, open-palm-clear, valid-empty,
  and dropout fixtures
- two L-pose hands for aperture; one hand for pinch, fist, point, and open palm;
  two hands for span
- three varied cubes on desktop and two on compact mobile viewports

## Gesture contract

- Aperture Field must confirm for `260 ms` before selection is evaluated. Its
  shared micro-field floor is `0.18` palm-scale squared, with confidence >=
  `0.80`, three corners distinct by `0.045` palm scale, and candidate drift <=
  `0.06` palm scale. Both hands must be L-poses: at least two of middle/ring/
  pinky remain non-extended at openness <= `0.78` to enter and <= `0.86` to
  continue; one noisy fingertip is tolerated. Close deliberate hands work
  without accepting collapsed, drifting, or open-palm/span geometry.
- Each cube projects all eight vertices into normalized stage coordinates; every
  vertex must be inside the aperture polygon to appear in the preview.
- Release Aperture commits its last preview once. Then `180 ms` neutral evidence
  is required before any command is armed. Candidate or active command evidence
  restarts this neutral pause; command signals reset at commit so residual hand
  evidence cannot steal the first transform.
- A committed set is locked against further Aperture evidence. This prevents a
  two-hand span from reopening a preview and deselecting cubes. Open-palm clear
  returns to selection mode; then a new Aperture can choose another set.
- Pinch translates, fist rotates, and span scales every committed cube only
  after command arm. Existing gesture temporal confirmation remains required.
- Scale clamps to `[0.30, 1.80]`. At normal desktop stage height, minimum wire
  cube is roughly 44 px and remains visible for an explicit interaction.
- Delete uses one pointing hand after command arm: index extended, thumb
  released, middle/ring/pinky folded. Hold for `350 ms` until the visible
  Delete hold reaches 100%; selected cubes then expand, fade, and collapse for
  `280 ms` before ephemeral deletion.
- Open palm must begin after command arm and remain active for `350 ms`; it
  clears selection only, never cubes.
- A valid Aperture with no complete cube commits no set and returns to selection
  mode. Deleting also returns directly to selection mode, including when one
  cube remains. Missing geometry, cooldown, gaps, owner loss, neutral pause,
  and deletion animation accept no transform.
- Undo restores exact deleted IDs, transforms, order, and selection.

## Visual thesis

An ultraviolet containment field briefly turns a dark drafting plane into a
selection instrument, then leaves a small set of wireframes to move as one.

## Content plan

- hero: Aperture Object Set, explicit camera/fixture entry, local-only promise
- support: fixture selection, skeleton, and mirror controls
- detail: preview/committed IDs, set phase, aperture phase, command, point and
  clear hold progress, scene capacity
- final action: reset, Undo, method, or return to research spine

## Interaction thesis

- aperture outline previews why a cube will be selected before release commits it
- selected cubes share one spatial delta, preserving their relative arrangement
- deletion motion visibly announces loss rather than hiding it behind a trash
  target

## Test matrix

- one, two, and zero complete cubes; partially intersected cube rejection;
  valid-empty Aperture no-op and one remaining cube reselection
- pinch translation, fist rotation, span scale to minimum and maximum
- point hold before/after neutral arm, shorter and longer than `350 ms`,
  one-shot delete, and exact Undo; open-palm clear hold preserves cubes
- aperture preview, release commit, neutral arm, committed-set lock during
  span, open-palm/span rejection, dropout, crossing, and impossible transform
  deltas
- left/right, mirrored display, 320 px, 390 px, desktop, reduced motion,
  permission denied, unsupported camera, reset, and inactive-page teardown

## Privacy behavior

- no camera request before explicit Start camera
- no frame, landmark, aperture, scene, or telemetry data leaves browser memory
- no recording, cookies, local storage, backend, or persistence
- tracks stop on reset, input switch, failure, inactivity, and page teardown
- deterministic fixture never starts camera or model

## Exit criteria

- no partial cube can be selected by aperture
- one and multiple complete cubes preview then commit together without baseline
  snap; a remaining single cube can be selected again
- point deletion is visibly causal, armed only after neutral, one-shot,
  recoverable by Undo, and does not need a trash target; open palm clears only
  selection
- scale reaches visible compact size without becoming unselectable
- fixture and camera failure paths stay recoverable; physical matrix records
  unreliable conditions before promotion

## Result log

- `pnpm test:unit` passed: 109 deterministic tests including complete-polygon
  selection, set transform/restore, point-hold timing, and existing gesture
  contracts.
- `pnpm build` passed: TypeScript and production static build include route
  `experiments/008-aperture-object-set/`.
- Targeted browser suite passed 8/8: preview/release commit, valid-empty clear,
  open-palm clear, point delete/Undo, containment, compact viewport, and camera
  recovery.
- Physical camera, low-light, occlusion, hand crossing, mobile, reduced-motion,
  and browser lifecycle validation remain pending.
- Decision: **keep / physical pending**.
