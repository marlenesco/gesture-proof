# Architecture

## Data flow

```text
MediaSource
  → FrameScheduler
    → HandTracker
      → HandObservation[]
        → GestureRecognizer[]
          → GestureSignal[]
            → VisualEffect
              → Canvas
                → Showcase experience
```

Each arrow is a boundary. Effects may consume stable gesture signals and source
pixels. They must not reach into MediaPipe result objects directly.

## Modules

### Input

Owns camera, image, video, and fixture lifecycles. Produces a timestamped frame
source and dimensions. Camera adapter owns and stops its tracks.

### Frame scheduler

Separates display refresh from inference. Prevents duplicate inference on the
same video frame and provides timings for debugging.

### Tracking

Wraps MediaPipe. Converts vendor-specific results into `HandObservation` values.
This is the only layer allowed to import `@mediapipe/tasks-vision`.

### Gesture

Pure temporal recognizers. Each recognizer owns a documented state machine:
`idle → candidate → active → cooldown`. It emits confidence and payload rather
than DOM events.

### Effects

Render functions consuming source media and gesture signals. Start with Canvas
2D. Introduce WebGL or WebGPU behind the same effect contract when measurements
show Canvas cannot meet the experiment.

### Experience

Owns art direction, navigation, permission copy, inspectors, and case-study
story. It does not implement tracking mathematics.

The homepage may explain the research sequence before a study opens. Each study
can expose a camera-free `#method` panel that maps its signals, guards, and
implementation boundaries without reaching into input or tracking layers.

## Coordinate spaces

Name spaces explicitly:

- **input normalized:** model output, usually `[0, 1]`
- **input pixels:** decoded media dimensions
- **display pixels:** canvas backing-store dimensions
- **CSS pixels:** rendered layout dimensions
- **effect space:** optional rectified or reduced-resolution buffer

Never mutate coordinates to “make mirroring work.” Use a transform with an
explicit `mirrorX` flag and unit tests.

## Time

Production thresholds use milliseconds. Fixture tests can render at different
frame rates and must produce equivalent gesture state.

## Workers

MediaPipe web inference is synchronous. Experiment 001 may first measure it on
the main thread. Move tracking to a worker when measurements show frame or input
latency outside budget. Do not claim worker isolation before verifying library
and browser support.

## Performance targets

Initial targets, not guarantees:

- display: 60 Hz when device supports it
- tracking: adaptive 15–30 inferences per second
- visible input latency: below 100 ms on target laptop
- no unbounded allocations in frame loops
- no long task above 50 ms during steady tracking

Record device, browser, media size, tracking rate, and display rate with every
performance result.

## Deterministic fixtures

Fixtures are timestamped landmark sequences, not fake DOM events. Minimum set:

- stable single hand
- controlled fingertip jitter
- brief tracking dropout
- two hands crossing
- rapid translation
- mirrored and unmirrored input
- low-confidence observation

Fixtures let UI, gesture, and effect work continue without camera access.

## Network boundary

Initial application requires network only during dependency/model setup. Runtime
must work with assets served from the same origin. Any later remote inference
needs a new ADR and explicit approval.
