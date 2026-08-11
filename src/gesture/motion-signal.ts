import type {
  GesturePhase,
  GestureSignal,
  HandObservation,
  NormalizedPoint,
} from '../engine/contracts';
import { palmScale } from '../engine/geometry';

export interface MotionSignalConfig {
  readonly activationSpeed: number;
  readonly continuationSpeed: number;
  readonly maximumVelocity: number;
  readonly maximumJumpVelocity: number;
  readonly maximumGapMs: number;
  readonly dropoutGraceMs: number;
  readonly smoothingTimeMs: number;
}

export const DEFAULT_MOTION_SIGNAL_CONFIG: MotionSignalConfig = {
  activationSpeed: 0.08,
  continuationSpeed: 0.04,
  maximumVelocity: 2.4,
  maximumJumpVelocity: 4,
  maximumGapMs: 160,
  dropoutGraceMs: 120,
  smoothingTimeMs: 70,
};

export type MotionSignalReason =
  | 'evidence-missing'
  | 'acquiring'
  | 'still'
  | 'moving'
  | 'dropout-grace'
  | 'invalid-timestamp'
  | 'timestamp-gap'
  | 'impossible-jump';

export interface MotionSignalPayload {
  readonly position?: NormalizedPoint;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly speed: number;
  readonly palmRelativeSpeed: number;
  readonly ownerId?: string;
  readonly reason: MotionSignalReason;
}

export interface PalmMotionSample {
  readonly position: NormalizedPoint;
  readonly scale: number;
  readonly confidence: number;
  readonly ownerId: string;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function palmMotionSample(
  hand: HandObservation,
): PalmMotionSample | undefined {
  const indices = [0, 5, 9, 13, 17] as const;
  const points = indices.map((index) => hand.landmarks[index]);
  if (points.some((point) => !point)) return undefined;
  const valid = points.filter((point) => point !== undefined);
  if (
    valid.some(
      ({ x, y }) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < -0.25 ||
        x > 1.25 ||
        y < -0.25 ||
        y > 1.25,
    )
  ) {
    return undefined;
  }
  const scale = palmScale(hand.landmarks);
  if (!scale || scale < 0.02 || !Number.isFinite(scale)) return undefined;
  return {
    position: {
      x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
      y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
    },
    scale,
    confidence: clamp01(hand.confidence),
    ownerId: hand.id,
  };
}

export class PalmMotionSignal {
  readonly id = 'palm-motion';
  private phase: GesturePhase = 'unknown';
  private ownerId: string | undefined;
  private ownerSeenAtMs = -Infinity;
  private previousSample: PalmMotionSample | undefined;
  private previousTimestampMs: number | undefined;
  private velocityX = 0;
  private velocityY = 0;

  constructor(private readonly config = DEFAULT_MOTION_SIGNAL_CONFIG) {}

  update(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): GestureSignal<MotionSignalPayload> {
    const hand = this.selectOwner(observations, timestampMs);
    if (!hand) return this.missing(timestampMs);
    const sample = palmMotionSample(hand);
    if (!sample) return this.missing(timestampMs);

    if (!this.previousSample || this.previousTimestampMs === undefined) {
      this.previousSample = sample;
      this.previousTimestampMs = timestampMs;
      this.phase = 'idle';
      return this.signal(timestampMs, sample, 'acquiring', 0, 0);
    }

    const elapsedMs = timestampMs - this.previousTimestampMs;
    if (elapsedMs <= 0 || !Number.isFinite(elapsedMs)) {
      this.phase = 'unknown';
      return this.signal(timestampMs, sample, 'invalid-timestamp', 0, 0);
    }

    if (elapsedMs > this.config.maximumGapMs) {
      this.restart(sample, timestampMs);
      return this.signal(timestampMs, sample, 'timestamp-gap', 0, 0);
    }

    const elapsedSeconds = elapsedMs / 1000;
    const rawX =
      (sample.position.x - this.previousSample.position.x) / elapsedSeconds;
    const rawY =
      (sample.position.y - this.previousSample.position.y) / elapsedSeconds;
    const rawSpeed = Math.hypot(rawX, rawY);
    if (
      !Number.isFinite(rawSpeed) ||
      rawSpeed > this.config.maximumJumpVelocity
    ) {
      this.restart(sample, timestampMs);
      return this.signal(timestampMs, sample, 'impossible-jump', 0, 0);
    }

    const smoothing = 1 - Math.exp(-elapsedMs / this.config.smoothingTimeMs);
    this.velocityX += (rawX - this.velocityX) * smoothing;
    this.velocityY += (rawY - this.velocityY) * smoothing;
    const speedBeforeClamp = Math.hypot(this.velocityX, this.velocityY);
    if (speedBeforeClamp > this.config.maximumVelocity) {
      const ratio = this.config.maximumVelocity / speedBeforeClamp;
      this.velocityX *= ratio;
      this.velocityY *= ratio;
    }

    this.previousSample = sample;
    this.previousTimestampMs = timestampMs;
    const speed = Math.hypot(this.velocityX, this.velocityY);
    const active =
      speed >= this.config.activationSpeed ||
      (this.phase === 'active' && speed >= this.config.continuationSpeed);
    this.phase = active ? 'active' : 'idle';
    return this.signal(
      timestampMs,
      sample,
      active ? 'moving' : 'still',
      this.velocityX,
      this.velocityY,
    );
  }

  reset(): void {
    this.phase = 'unknown';
    this.ownerId = undefined;
    this.ownerSeenAtMs = -Infinity;
    this.previousSample = undefined;
    this.previousTimestampMs = undefined;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  private selectOwner(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): HandObservation | undefined {
    if (this.ownerId) {
      const retained = observations.find(({ id }) => id === this.ownerId);
      if (retained) {
        this.ownerSeenAtMs = timestampMs;
        return retained;
      }
      if (timestampMs - this.ownerSeenAtMs <= this.config.dropoutGraceMs) {
        return undefined;
      }
      this.ownerId = undefined;
      this.previousSample = undefined;
      this.previousTimestampMs = undefined;
    }
    const selected = observations.toSorted(
      (first, second) => second.confidence - first.confidence,
    )[0];
    if (selected) {
      this.ownerId = selected.id;
      this.ownerSeenAtMs = timestampMs;
    }
    return selected;
  }

  private missing(timestampMs: number): GestureSignal<MotionSignalPayload> {
    const elapsed = timestampMs - this.ownerSeenAtMs;
    const withinGrace =
      this.ownerId !== undefined && elapsed <= this.config.dropoutGraceMs;
    this.phase = 'unknown';
    this.velocityX = 0;
    this.velocityY = 0;
    if (!withinGrace) {
      this.previousSample = undefined;
      this.previousTimestampMs = undefined;
    }
    return this.signal(
      timestampMs,
      withinGrace ? this.previousSample : undefined,
      withinGrace ? 'dropout-grace' : 'evidence-missing',
      0,
      0,
      withinGrace ? clamp01(1 - elapsed / this.config.dropoutGraceMs) : 0,
    );
  }

  private restart(sample: PalmMotionSample, timestampMs: number): void {
    this.previousSample = sample;
    this.previousTimestampMs = timestampMs;
    this.velocityX = 0;
    this.velocityY = 0;
    this.phase = 'unknown';
  }

  private signal(
    timestampMs: number,
    sample: PalmMotionSample | undefined,
    reason: MotionSignalReason,
    velocityX: number,
    velocityY: number,
    confidenceMultiplier = 1,
  ): GestureSignal<MotionSignalPayload> {
    const speed = Math.hypot(velocityX, velocityY);
    return {
      id: this.id,
      phase: this.phase,
      confidence: (sample?.confidence ?? 0) * confidenceMultiplier,
      timestampMs,
      payload: {
        position: sample?.position,
        velocityX,
        velocityY,
        speed,
        palmRelativeSpeed: sample ? speed / sample.scale : 0,
        ownerId: sample?.ownerId ?? this.ownerId,
        reason,
      },
    };
  }
}
