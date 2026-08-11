# Hand-tracking research notes

## MediaPipe model

MediaPipe Hand Landmarker uses a two-stage neural pipeline: a palm/hand detector
finds a crop, then a landmark regression model returns 21 three-dimensional
screen landmarks, world landmarks, presence, and handedness. Video tracking can
reuse previous hand regions and rerun palm detection when tracking or presence
falls below configured thresholds.

The web `detectForVideo()` call is synchronous and may block the main UI thread.
Measure first; move inference to a worker if required and supported.

Primary references:

- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf

## Inspiration reviewed

Finger Frame Effect demonstrates a useful architecture lesson: learned landmarks
can feed small deterministic geometry and temporal rules; a second learned gesture
classifier is not always necessary. Its signature interaction and rendering are
not part of this project's scope.

Reference:

- https://github.com/sophiamyang/finger-frame-effect

At review time, that repository root contained no explicit license. Treat its
source as readable reference, not reusable project code.

## Reliability reminders

- fingertip error tends to exceed error near rigid palm joints
- occlusion, blur, low light, and decorated/covered hands can reduce quality
- handedness and stable identity are probabilistic
- screen-space depth is estimated and should not be treated as exact geometry
- scale-normalized ratios improve portability but do not eliminate pose effects

## Questions for experiments

- Which landmarks remain stable enough for continuous control?
- Which gestures work without users learning precise choreography?
- Can visible confidence teach recovery without distracting from experience?
- How much temporal smoothing feels connected rather than delayed?
- Which effects benefit from hand velocity, span, direction, or rhythm?
