import type {
  GesturePhase,
  GestureRecognizer,
  GestureSignal,
  HandObservation,
  NormalizedPoint,
} from '../engine/contracts';
import { palmScale, scaleIndependentDistance } from '../engine/geometry';

export interface PinchRecognizerConfig {
  readonly activationRatio: number;
  readonly continuationRatio: number;
  readonly activationDurationMs: number;
  readonly releaseDurationMs: number;
  readonly cooldownDurationMs: number;
  readonly dropoutGraceMs: number;
  readonly maxEvidenceGapMs: number;
  readonly minimumPalmScale: number;
  readonly maximumRatio: number;
}

export const DEFAULT_PINCH_CONFIG: PinchRecognizerConfig = {
  activationRatio: 0.34,
  continuationRatio: 0.46,
  activationDurationMs: 120,
  releaseDurationMs: 100,
  cooldownDurationMs: 180,
  dropoutGraceMs: 100,
  maxEvidenceGapMs: 90,
  minimumPalmScale: 0.02,
  maximumRatio: 4,
};

export type PinchReason =
  | 'released'
  | 'inside-activation-threshold'
  | 'candidate-rejected'
  | 'activation-confirmed'
  | 'active-continuation'
  | 'release-candidate'
  | 'release-confirmed'
  | 'cooldown'
  | 'cooldown-waiting-release'
  | 'cooldown-complete'
  | 'dropout-grace'
  | 'observation-missing'
  | 'invalid-geometry'
  | 'evidence-gap'
  | 'recovered-from-unknown';

export interface PinchPayload {
  readonly handId?: string;
  readonly ratio?: number;
  readonly activationProgress: number;
  readonly releaseProgress: number;
  readonly reason: PinchReason;
  readonly activationThreshold: number;
  readonly continuationThreshold: number;
}

interface PinchMeasurement {
  readonly hand: HandObservation;
  readonly ratio: number;
}

function pointIsPlausible(point: NormalizedPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= -0.25 &&
    point.x <= 1.25 &&
    point.y >= -0.25 &&
    point.y <= 1.25
  );
}

export function pinchRatio(
  hand: HandObservation,
  config: PinchRecognizerConfig = DEFAULT_PINCH_CONFIG,
): number | undefined {
  const wrist = hand.landmarks[0];
  const thumbTip = hand.landmarks[4];
  const indexBase = hand.landmarks[5];
  const indexTip = hand.landmarks[8];
  const pinkyBase = hand.landmarks[17];
  const required = [wrist, thumbTip, indexBase, indexTip, pinkyBase];
  if (required.some((point) => !point || !pointIsPlausible(point))) {
    return undefined;
  }

  const scale = palmScale(hand.landmarks);
  if (!scale || scale < config.minimumPalmScale || !thumbTip || !indexTip) {
    return undefined;
  }
  const ratio = scaleIndependentDistance(thumbTip, indexTip, hand.landmarks);
  return ratio !== undefined &&
    Number.isFinite(ratio) &&
    ratio <= config.maximumRatio
    ? ratio
    : undefined;
}

export class PinchRecognizer implements GestureRecognizer<PinchPayload> {
  readonly id = 'pinch';
  private phase: GesturePhase = 'unknown';
  private selectedHandId: string | undefined;
  private candidateStartedAtMs: number | undefined;
  private releaseStartedAtMs: number | undefined;
  private cooldownStartedAtMs: number | undefined;
  private lastEvidenceAtMs: number | undefined;
  private lastRatio: number | undefined;
  private lastConfidence = 0;

  constructor(
    private readonly config: PinchRecognizerConfig = DEFAULT_PINCH_CONFIG,
  ) {}

  update(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): GestureSignal<PinchPayload> {
    const measurement = this.selectMeasurement(observations);
    if (!measurement) {
      const selectedHandPresent = this.selectedHandId
        ? observations.some(({ id }) => id === this.selectedHandId)
        : false;
      return this.handleMissingEvidence(timestampMs, selectedHandPresent);
    }

    const evidenceGap =
      this.lastEvidenceAtMs === undefined
        ? 0
        : timestampMs - this.lastEvidenceAtMs;
    this.lastEvidenceAtMs = timestampMs;
    this.lastRatio = measurement.ratio;
    this.lastConfidence = measurement.hand.confidence;

    if (this.phase === 'unknown') {
      this.resetTimers();
      this.phase = 'idle';
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'recovered-from-unknown',
      );
    }

    if (
      evidenceGap > this.config.maxEvidenceGapMs &&
      this.phase === 'candidate'
    ) {
      this.candidateStartedAtMs =
        measurement.ratio <= this.config.activationRatio
          ? timestampMs
          : undefined;
      this.phase =
        measurement.ratio <= this.config.activationRatio ? 'candidate' : 'idle';
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'evidence-gap',
      );
    }
    if (evidenceGap > this.config.dropoutGraceMs && this.phase === 'active') {
      this.phase = 'unknown';
      this.resetTimers();
      return this.signal(
        timestampMs,
        0,
        measurement.ratio,
        'observation-missing',
      );
    }

    switch (this.phase) {
      case 'idle':
        return this.updateIdle(measurement, timestampMs);
      case 'candidate':
        return this.updateCandidate(measurement, timestampMs);
      case 'active':
        return this.updateActive(measurement, timestampMs);
      case 'cooldown':
        return this.updateCooldown(measurement, timestampMs);
    }
  }

  reset(): void {
    this.phase = 'unknown';
    this.selectedHandId = undefined;
    this.lastEvidenceAtMs = undefined;
    this.lastRatio = undefined;
    this.lastConfidence = 0;
    this.resetTimers();
  }

  private selectMeasurement(
    observations: readonly HandObservation[],
  ): PinchMeasurement | undefined {
    let hand = this.selectedHandId
      ? observations.find(({ id }) => id === this.selectedHandId)
      : undefined;
    if (!hand && !this.selectedHandId) {
      hand = [...observations].sort(
        (first, second) => second.confidence - first.confidence,
      )[0];
      this.selectedHandId = hand?.id;
    }
    if (!hand) return undefined;

    const ratio = pinchRatio(hand, this.config);
    return ratio === undefined ? undefined : { hand, ratio };
  }

  private handleMissingEvidence(
    timestampMs: number,
    selectedHandPresent: boolean,
  ): GestureSignal<PinchPayload> {
    const elapsed =
      this.lastEvidenceAtMs === undefined
        ? Number.POSITIVE_INFINITY
        : timestampMs - this.lastEvidenceAtMs;
    if (this.phase === 'active' && elapsed <= this.config.dropoutGraceMs) {
      const confidence =
        this.lastConfidence * (1 - elapsed / this.config.dropoutGraceMs);
      return this.signal(
        timestampMs,
        confidence,
        this.lastRatio,
        'dropout-grace',
      );
    }

    this.phase = 'unknown';
    this.resetTimers();
    const signal = this.signal(
      timestampMs,
      0,
      this.lastRatio,
      selectedHandPresent ? 'invalid-geometry' : 'observation-missing',
    );
    if (!selectedHandPresent) this.selectedHandId = undefined;
    return signal;
  }

  private updateIdle(
    measurement: PinchMeasurement,
    timestampMs: number,
  ): GestureSignal<PinchPayload> {
    if (measurement.ratio <= this.config.activationRatio) {
      this.phase = 'candidate';
      this.candidateStartedAtMs = timestampMs;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'inside-activation-threshold',
      );
    }
    return this.signal(
      timestampMs,
      measurement.hand.confidence,
      measurement.ratio,
      'released',
    );
  }

  private updateCandidate(
    measurement: PinchMeasurement,
    timestampMs: number,
  ): GestureSignal<PinchPayload> {
    if (measurement.ratio > this.config.activationRatio) {
      this.phase = 'idle';
      this.candidateStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'candidate-rejected',
      );
    }
    const elapsed = timestampMs - (this.candidateStartedAtMs ?? timestampMs);
    if (elapsed >= this.config.activationDurationMs) {
      this.phase = 'active';
      this.candidateStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'activation-confirmed',
      );
    }
    return this.signal(
      timestampMs,
      measurement.hand.confidence,
      measurement.ratio,
      'inside-activation-threshold',
    );
  }

  private updateActive(
    measurement: PinchMeasurement,
    timestampMs: number,
  ): GestureSignal<PinchPayload> {
    if (measurement.ratio <= this.config.continuationRatio) {
      this.releaseStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'active-continuation',
      );
    }
    this.releaseStartedAtMs ??= timestampMs;
    if (
      timestampMs - this.releaseStartedAtMs >=
      this.config.releaseDurationMs
    ) {
      this.phase = 'cooldown';
      this.cooldownStartedAtMs = timestampMs;
      this.releaseStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'release-confirmed',
      );
    }
    return this.signal(
      timestampMs,
      measurement.hand.confidence,
      measurement.ratio,
      'release-candidate',
    );
  }

  private updateCooldown(
    measurement: PinchMeasurement,
    timestampMs: number,
  ): GestureSignal<PinchPayload> {
    if (measurement.ratio <= this.config.continuationRatio) {
      this.cooldownStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'cooldown-waiting-release',
      );
    }
    this.cooldownStartedAtMs ??= timestampMs;
    if (
      timestampMs - this.cooldownStartedAtMs >=
      this.config.cooldownDurationMs
    ) {
      this.phase = 'idle';
      this.cooldownStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        measurement.hand.confidence,
        measurement.ratio,
        'cooldown-complete',
      );
    }
    return this.signal(
      timestampMs,
      measurement.hand.confidence,
      measurement.ratio,
      'cooldown',
    );
  }

  private signal(
    timestampMs: number,
    confidence: number,
    ratio: number | undefined,
    reason: PinchReason,
  ): GestureSignal<PinchPayload> {
    const activationProgress =
      this.phase === 'candidate' && this.candidateStartedAtMs !== undefined
        ? Math.min(
            1,
            (timestampMs - this.candidateStartedAtMs) /
              this.config.activationDurationMs,
          )
        : this.phase === 'active'
          ? 1
          : 0;
    const releaseProgress =
      this.phase === 'active' && this.releaseStartedAtMs !== undefined
        ? Math.min(
            1,
            (timestampMs - this.releaseStartedAtMs) /
              this.config.releaseDurationMs,
          )
        : 0;
    return {
      id: this.id,
      phase: this.phase,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestampMs,
      payload: {
        handId: this.selectedHandId,
        ratio,
        activationProgress,
        releaseProgress,
        reason,
        activationThreshold: this.config.activationRatio,
        continuationThreshold: this.config.continuationRatio,
      },
    };
  }

  private resetTimers(): void {
    this.candidateStartedAtMs = undefined;
    this.releaseStartedAtMs = undefined;
    this.cooldownStartedAtMs = undefined;
  }
}
