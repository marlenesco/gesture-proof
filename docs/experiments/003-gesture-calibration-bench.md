# Experiment 003 - Gesture Calibration Bench

Status: implemented; deterministic validation complete, physical-camera matrix
pending.

## Question

Does a short, on-device calibration improve activation accuracy for both pinch
and fist gestures compared with fixed thresholds, without adding more than 80 ms
of median activation latency?

## Hypothesis

A per-session profile built from open-hand, deliberate-pinch, and deliberate-fist
references will reduce misses caused by hand anatomy and camera perspective. A
timestamp-aware One Euro filter will reduce threshold jitter while preserving
motion better than fixed smoothing. Calibration must fail as `inconclusive` when
reference ranges overlap.

## Originality check

Calibration and smoothing are established techniques. This experiment does not
claim a new recognition algorithm. It contributes a visible, repeatable
comparison where the same observation stream drives three pipelines and exposes
their thresholds, state, errors, and latency instead of presenting one tuned
result as truth.

## Inputs

- front-facing camera after explicit user action
- deterministic calibration and evaluation fixtures without camera or model
- one selected hand; additional hands remain visible but cannot silently own a
  running gesture
- three calibration references: open hand, deliberate pinch, deliberate fist
- no still-image mode because state and calibration require elapsed-time evidence

## Gesture contract

### Pinch

- metric: thumb-tip to index-tip distance divided by palm scale; lower means
  stronger pinch
- fixed activation: `0.34`; fixed continuation: `0.46`
- calibrated activation: pinch median plus `15%` of distance to open median
- calibrated continuation: pinch median plus `30%` of distance to open median
- calibration requires open-minus-pinch separation of at least `0.16`

### Fist

- metric: mean extension evidence from index, middle, ring, and pinky, with PIP
  bend weighted above perspective-sensitive DIP bend and combined with
  wrist-to-tip distance; normalized to `[0, 1]`, lower means more closed
- fixed activation: `0.32`; fixed continuation: `0.45`
- calibrated activation: fist median plus `15%` of distance to open median
- calibrated continuation: fist median plus `30%` of distance to open median
- calibration requires open-minus-fist separation of at least `0.22`

### Shared temporal gate

- activation confirmation: `120 ms` continuously below activation threshold
- release confirmation: `100 ms` continuously above continuation threshold
- cooldown: `180 ms` while evidence remains released
- dropout grace: active state survives at most `100 ms` with decaying confidence
- evidence gaps above `90 ms` restart candidates
- non-finite, incomplete, implausible, degenerate, or anatomically impossible
  geometry becomes `unknown`

### Comparison pipelines

1. **Fixed** - raw metric and fixed thresholds
2. **Filtered** - One Euro filtered metric and fixed thresholds
3. **Calibrated** - same filter and per-session thresholds

One Euro parameters use minimum cutoff `1`, beta `1.2`, derivative cutoff `1`.
The initial beta `0.04` exceeded the deterministic latency budget and was
revised before handoff.

Calibration records at least 15 valid samples per reference over 700 ms. Medians
define references. Insufficient samples or overlapping ranges returns
`inconclusive`; fixed and filtered pipelines remain usable.

## Visual thesis

A dark proof table cut by three vermilion traces: one hand feeds fixed, filtered,
and calibrated evidence lanes so disagreement becomes visible material rather
than hidden tuning.

## Content plan

- hero: Gesture Calibration Bench name, question, explicit camera and fixture
  actions, dominant trace field
- support: gesture selector, fixture scenario, calibration stage, skeleton and
  mirror controls
- detail: three aligned evidence lanes with phase, metric, thresholds, misses,
  false activations, and latency
- final action: recalibrate, reset, return to experiment index, or compare Intent
  Gate

## Interaction thesis

- metric traces move continuously while threshold crossings remain sharply
  discrete
- calibration compresses broad reference bands into two explicit gates
- pipeline disagreements open a visible split in the trace field; agreement
  closes it

Reduced motion removes trace interpolation, pulsing, and acquisition sweeps but
preserves current values, thresholds, phases, and comparison evidence.

## Test matrix

- standard-range and personalized-range deliberate pinch and fist
- near misses, threshold jitter, and holds shorter than confirmation time
- open reference confused with pinch or fist reference
- insufficient and malformed calibration samples
- short and long dropouts during active state
- left/right hands and mirrored/unmirrored display
- hand scale changes, partial exits, hand replacement, and second-hand appearance
- rapid motion, stillness, motion blur, low light, busy background, different
  skin tones, sleeves, and jewelry during physical-camera validation
- permission denied, camera unavailable, local model failure, reduced motion,
  keyboard-only operation, reset, inactivity, and track teardown

## Measurements

- per-pipeline false activations, missed activations, and agreement rate against
  deterministic fixture ground truth
- activation and release latency
- reference medians, derived thresholds, rejected calibration reason
- time in `unknown`, state flicker, and candidate rejection count
- source size, display/inference rate, median/worst inference duration, and long
  tasks over 50 ms

## Privacy behavior

- no camera request before click
- calibration samples are scalar geometry evidence held only in memory
- frames, landmarks, samples, profiles, and measurements never leave browser
- no backend, telemetry, recording, local storage, cookies, or persistence
- reset and teardown discard profile and samples
- camera tracks stop on mode switch, reset, page inactivity, model failure, and
  teardown
- fixture mode requires neither camera nor model

## Exit criteria

- standard fixtures remain correct in all three pipelines
- personalized fixtures produce fewer misses in calibrated pipeline than fixed
  pipeline without more than 80 ms additional median activation latency
- filtered pipeline produces fewer phase flips under jitter than fixed pipeline
- overlapping or incomplete references become `inconclusive`, never a fabricated
  profile
- pinch and fist results remain equivalent across left/right and mirroring
- no media track or calibration profile survives teardown
- physical-camera matrix reports reliable and unreliable conditions for both
  gesture families

## Result log

- Implemented separate fixed, One Euro filtered, and locally calibrated
  timestamp-driven pipelines for pinch and fist.
- Added deterministic standard, personal-range, jitter, short-hold, dropout,
  and left/mirrored scenarios.
- Personalized fixture verifies calibrated activation where the fixed gate
  misses; malformed and overlapping reference sets remain `inconclusive`.
- Initial One Euro beta `0.04` exceeded the latency budget. Beta `1.2` keeps
  deterministic filtered/calibrated activation within `80 ms` of fixed gates
  for both pinch and fist while reducing threshold-jitter phase changes.
- Jitter and deliberately short holds remain negative cases in fixed and
  filtered pipelines.
- Hands-on review of experiment 004 exposed anatomically inconsistent fist
  fixtures. Finger chains now curl from MCP through PIP and DIP toward the palm;
  the thumb folds in two stages and the personalized fixture preserves the same
  calibration separation without posing as a pinch.
- Calibration remains memory-only and is discarded on reset, input switch,
  inactivity, error, and teardown.
- Physical-camera validation remains pending; no reliability claim is made for
  blur, low light, occlusion, appearance diversity, or real devices yet.
- Method view exposes the three pipeline comparison, session median thresholds,
  rejection rules, and implementation map through the shareable `#method` hash.
  It never starts camera capture.
