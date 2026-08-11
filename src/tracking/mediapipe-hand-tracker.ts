import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import wasmLoaderSimdPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinarySimdPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import wasmLoaderFallbackPath from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import wasmBinaryFallbackPath from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';

import type {
  HandObservation,
  HandTracker,
  NormalizedPoint,
  ObservationFrame,
  TrackerMode,
} from '../engine/contracts';
import { normalizedDistance } from '../engine/geometry';

const MODEL_PATH = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;
const MAX_IDENTITY_DISTANCE = 0.3;

interface SourceSize {
  readonly width: number;
  readonly height: number;
}

function sourceSize(source: TexImageSource): SourceSize {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (
    source instanceof HTMLCanvasElement ||
    (typeof OffscreenCanvas !== 'undefined' &&
      source instanceof OffscreenCanvas)
  ) {
    return { width: source.width, height: source.height };
  }
  if (source instanceof ImageBitmap || source instanceof ImageData) {
    return { width: source.width, height: source.height };
  }
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
    return { width: source.displayWidth, height: source.displayHeight };
  }
  return { width: 1, height: 1 };
}

function handednessLabel(
  categoryName: string | undefined,
): 'left' | 'right' | undefined {
  const normalized = categoryName?.toLowerCase();
  if (normalized === 'left' || normalized === 'right') return normalized;
  return undefined;
}

class StableHandIdentity {
  private nextId = 1;
  private previous: readonly HandObservation[] = [];

  assign(
    candidates: readonly Omit<HandObservation, 'id'>[],
  ): readonly HandObservation[] {
    const available = new Set(this.previous.map(({ id }) => id));
    const assigned = candidates.map((candidate) => {
      const wrist = candidate.landmarks[0];
      let closest: HandObservation | undefined;
      let closestDistance = Number.POSITIVE_INFINITY;

      if (wrist) {
        for (const previous of this.previous) {
          if (!available.has(previous.id)) continue;
          if (
            candidate.handedness &&
            previous.handedness &&
            candidate.handedness !== previous.handedness
          ) {
            continue;
          }
          const previousWrist = previous.landmarks[0];
          if (!previousWrist) continue;
          const distance = normalizedDistance(wrist, previousWrist);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = previous;
          }
        }
      }

      const id =
        closest && closestDistance <= MAX_IDENTITY_DISTANCE
          ? closest.id
          : `tracked-${this.nextId++}`;
      available.delete(id);
      return { ...candidate, id };
    });

    this.previous = assigned;
    return assigned;
  }

  reset(): void {
    this.previous = [];
  }
}

export class MediaPipeHandTracker implements HandTracker {
  private landmarker: HandLandmarker | undefined;
  private mode: TrackerMode | undefined;
  private readonly identity = new StableHandIdentity();

  async ensureMode(mode: TrackerMode): Promise<void> {
    if (!this.landmarker) {
      const supportsSimd = await FilesetResolver.isSimdSupported();
      this.landmarker = await HandLandmarker.createFromOptions(
        supportsSimd
          ? {
              wasmLoaderPath: wasmLoaderSimdPath,
              wasmBinaryPath: wasmBinarySimdPath,
            }
          : {
              wasmLoaderPath: wasmLoaderFallbackPath,
              wasmBinaryPath: wasmBinaryFallbackPath,
            },
        {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: mode,
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        },
      );
      this.mode = mode;
      return;
    }

    if (this.mode !== mode) {
      await this.landmarker.setOptions({ runningMode: mode });
      this.mode = mode;
      this.identity.reset();
    }
  }

  detectImage(source: TexImageSource, timestampMs: number): ObservationFrame {
    if (!this.landmarker || this.mode !== 'IMAGE') {
      throw new Error('Hand tracker is not ready for image input.');
    }
    const startedAt = performance.now();
    const result = this.landmarker.detect(source);
    return this.toFrame(
      result,
      source,
      timestampMs,
      performance.now() - startedAt,
    );
  }

  detectVideo(source: TexImageSource, timestampMs: number): ObservationFrame {
    if (!this.landmarker || this.mode !== 'VIDEO') {
      throw new Error('Hand tracker is not ready for video input.');
    }
    const startedAt = performance.now();
    const result = this.landmarker.detectForVideo(source, timestampMs);
    return this.toFrame(
      result,
      source,
      timestampMs,
      performance.now() - startedAt,
    );
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = undefined;
    this.mode = undefined;
    this.identity.reset();
  }

  private toFrame(
    result: HandLandmarkerResult,
    source: TexImageSource,
    timestampMs: number,
    inferenceDurationMs: number,
  ): ObservationFrame {
    const candidates = result.landmarks.map((landmarks, index) => {
      const classification = result.handedness[index]?.[0];
      return {
        timestampMs,
        landmarks: landmarks.map(({ x, y, z }): NormalizedPoint => ({
          x,
          y,
          z,
        })),
        handedness: handednessLabel(classification?.categoryName),
        confidence: classification?.score ?? 0,
      };
    });
    const size = sourceSize(source);

    return {
      observations: this.identity.assign(candidates),
      timestampMs,
      inferenceDurationMs,
      sourceWidth: size.width,
      sourceHeight: size.height,
    };
  }
}

export function createMediaPipeHandTracker(): HandTracker {
  return new MediaPipeHandTracker();
}
