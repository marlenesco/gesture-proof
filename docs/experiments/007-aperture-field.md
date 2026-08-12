# Experiment 007 — Aperture Field

Status: deterministic implementation validated; physical-camera validation pending.

## Question

Can two index-and-thumb hand poses establish a stable, local visual field for
selectable Canvas effects while preserving crossed and pinched geometry?

## Hypothesis

Index openness, palm-normalized area, anatomical tip order, timestamp-based
confirmation, explicit release, and cooldown will produce a legible selective
field. Crossed boundaries retain their two-triangle shape; a thumb-index contact
becomes a three-corner field.

## Originality check

This study explores selective local rendering from hand landmarks. It does not
reuse code, copy, layout, visual identity, or effect implementation from
external references. The field is presented as an optical surface, not a camera
frame; its three Canvas effects and temporal contract are project-owned.

## Inputs

- front-facing camera after explicit user action
- deterministic two-hand fixtures without camera or model
- two open hands with visible thumb and index tips
- maximum two hands; still images excluded because confirmation requires time

## Gesture contract

- each hand must keep index openness above a palm-normalized joint threshold
- corners retain hand anatomy: left index, right index, right thumb, left thumb
- crossed corner paths remain valid bow-ties and render as two triangles
- near thumb-index tips keep their two corners; contact activates only below
  `0.075` palm scale and continues until `0.12` for hysteresis
- contact midpoint occupies both existing anatomical slots, so Canvas becomes a
  triangle without a four-to-three-corner signal snap
- four corners require area >= `1.25` palm-scale squared for `180 ms`; a pinch
  triangle uses `68%` of this area to preserve an equivalent local field
- continuation uses area >= `0.85` palm-scale squared, with same triangle factor
- release requires `120 ms` outside continuation evidence; cooldown is `220 ms`
- missing hands, non-finite points, too-small area, fewer than three distinct
  corners, or changed hand ownership return inactive evidence

## Visual thesis

A cold optical field interrupts a dark measurement plane only after two hands
make its boundary credible.

## Content plan

- hero: Aperture Field name, camera and fixture actions, local-processing copy
- support: input, evidence fixture, selected optic, skeleton, and mirror
- detail: phase, area, tension, ownership, reason, and geometry contract
- final action: reset or continue record

## Interaction thesis

- refraction is primary: layered source shifts respond to aperture tension
- pixelate and blur are selectable diagnostic optics, not decorative modes
- invalid geometry fades the field rather than inventing a new boundary

## Test matrix

- closed-fist to L-pose, insufficient area, jitter, short/long dropout
- near-contact quadrilateral, contact triangle, left/right and mirrored display,
  crossed bow-tie, partial exit
- refraction, pixelate, blur, reduced motion, narrow mobile, desktop
- permission denied, unavailable camera, reset, inactivity, teardown
- physical validation: blur, glare, low light, rotation, sleeves, jewelry,
  different skin tones, busy backgrounds, and devices

## Privacy behavior

- no camera request before click
- no frame, landmark, geometry, or effect data leaves browser memory
- no recording, telemetry, cookies, local storage, or backend
- camera tracks stop on mode switch, reset, inactivity, failure, and teardown
- fixture works without camera or model

## Exit criteria

- valid fixture activates only after hold and renders selected optic
- small/missing evidence never activates; crossed and pinched evidence preserve
  their natural boundary topology
- release and cooldown prevent instant direct handoff
- mirror does not change decision
- fixture, permission failure, and track teardown remain recoverable
- physical matrix records reliable and unreliable conditions before promotion

## Result log

- `pnpm check` passed: formatting, lint, 99 unit tests, type-check, and
  production build.
- Targeted browser suite passed 7/7: camera-free initial state, homepage and
  collection navigation, deterministic activation, optic selection,
  insufficient-area rejection, crossed bow-tie, pinch triangle, denial
  recovery, and reduced motion.
- Desktop and 390 px rendered checks passed without visible horizontal overflow.
  The L-pose fixture visibly establishes the field; crossed tips render as two
  clipped triangles and thumb-index contact as one triangle. All three optics
  remain selectable.
- Method view exposes the real anatomical corner order, contact midpoint rule,
  temporal area gate, and implementation map through the shareable `#method`
  hash. Its diagrams never start camera capture.
- Decision: **keep / physical pending**. Physical-camera matrix still decides
  threshold tuning and whether this becomes a product interaction.
