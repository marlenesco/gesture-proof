# AGENTS.md

## Mission

Build a portfolio-grade, local-first laboratory where hand gestures become
inputs for image and video transformations. Learn from first principles. Do not
reproduce another project's feature set, visual identity, code, or copy.

Current goal: implement experiments that reveal how tracking behaves before
choosing a final product concept.

## Source of truth

Read these files before changing code:

1. `AGENTS.md`
2. `project-context.md`
3. relevant brief under `docs/experiments/`
4. accepted ADRs under `docs/decisions/`
5. `KICKOFF_PROMPT.md` when starting Experiment 001

If documents conflict, stop and report the conflict. Do not silently invent a
new product direction.

## Repository language

- Code, identifiers, documentation, UI copy, commits: English.
- User conversation may follow the user's language and requested tone.
- Explain unfamiliar tracking terms when first introduced.

## Working rules

- Inspect `git status` before edits. Preserve unrelated user work.
- Keep each change tied to one experiment or one documented foundation need.
- Do not commit, push, publish, deploy, or create a remote without explicit
  authorization.
- Never copy implementation code from inspiration repositories without a clear,
  compatible license and explicit approval.
- Prefer official MediaPipe and browser documentation for technical contracts.
- Add dependencies only when they replace substantial, error-prone work.
- Pin exact dependency versions. Explain large or cloud-connected additions.
- Keep generated models, recorded media, and personal captures out of Git.

## Privacy boundary

- Camera access requires an explicit user action and clear pre-permission copy.
- Default processing happens on-device, inside the browser.
- No frame, photo, video, landmark, biometric inference, or telemetry may leave
  the device without a separately approved feature and explicit user action.
- Stop all media tracks when capture view closes or page becomes inactive.
- Revoke temporary object URLs after use.
- Do not implement face recognition, identity inference, surveillance, or hidden
  recording.
- Uploaded media remains ephemeral unless user explicitly downloads an output.

## Architecture invariants

Keep these layers separate:

1. `input`: camera, image, video, deterministic fixture
2. `tracking`: model execution and normalized hand observations
3. `gesture`: temporal state machines over observations
4. `effects`: renderers consuming signals, never raw tracker internals
5. `experience`: navigation, narrative, controls, case-study content

Further rules:

- Geometry and gesture scoring should be pure and independently testable.
- Normalize coordinates at boundaries. Mirror only in explicit transforms.
- Use timestamps and elapsed time, not frame counts, for production behavior.
- Preserve stable hand identity across frames when possible.
- Treat confidence as a signal, not a boolean truth.
- Return `unknown` or `inconclusive` when evidence is insufficient.
- Reuse buffers in frame loops; avoid per-frame allocation and console logging.
- Decouple inference rate from display refresh rate.

## Experiment protocol

Every experiment needs a brief copied from `docs/EXPERIMENT_TEMPLATE.md`.
Record:

- question and hypothesis
- input sources
- gesture definition and state transitions
- visual response
- positive, negative, occlusion, motion-blur, and low-light cases
- privacy behavior
- performance measurements
- conclusion: keep, revise, or discard

An experiment may be ugly internally, but its public demo state must be coherent,
resettable, and understandable without developer narration.

## Visual direction

Before visual implementation, write in the experiment brief:

- one-sentence visual thesis
- content plan: hero, support, detail, final action
- interaction thesis with two or three meaningful motions

Default showcase direction:

- live image or experiment output is the dominant visual plane
- product name is strongest text
- one accent color, two typefaces maximum
- sparse copy, strong scale, full-bleed first viewport
- minimal chrome; no generic dashboard card grid
- motion explains acquisition, confidence, or cause and effect
- respect `prefers-reduced-motion`
- maintain readable contrast and keyboard-accessible controls

Do not polish a weak interaction with decoration. Signal clarity comes first.

## Gesture quality rules

- Define gestures using scale-independent ratios and joint geometry.
- Use hysteresis: stricter activation, easier continuation.
- Require temporal confirmation before activation.
- Add a clear cooldown or release condition.
- Reject impossible geometry and self-intersections.
- Test left/right hands, mirrored/unmirrored input, hand crossings, partial exits,
  rapid motion, different skin tones, sleeves, jewelry, and busy backgrounds.
- Never infer intent from one noisy frame.

## Validation

Minimum before handoff:

```bash
pnpm check
```

For camera or visual changes, also verify in a real browser:

- permission denied
- no camera available
- one hand / two hands / no hands
- narrow mobile viewport and desktop viewport
- reduced motion
- media tracks stop after leaving the experiment
- deterministic fixture mode works without camera

Report exact commands run, passes, failures, and anything not verified.

## Definition of done

- Experiment brief and result notes match behavior.
- No hidden network or persistence path exists.
- Failure state is visible and recoverable.
- Pure gesture/geometry logic has unit tests.
- Rendered interaction was checked, not only source code.
- No unrelated refactor entered the change.
- No server, watcher, browser, task, or shell remains running at session end.
