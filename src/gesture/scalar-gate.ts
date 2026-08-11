import type { GesturePhase, GestureSignal } from '../engine/contracts';

export interface ScalarGateThresholds {
  readonly activation: number;
  readonly continuation: number;
}

export interface ScalarGateConfig {
  readonly activationDurationMs: number;
  readonly releaseDurationMs: number;
  readonly cooldownDurationMs: number;
  readonly dropoutGraceMs: number;
  readonly maximumEvidenceGapMs: number;
}

export const DEFAULT_SCALAR_GATE_CONFIG: ScalarGateConfig = {
  activationDurationMs: 120,
  releaseDurationMs: 100,
  cooldownDurationMs: 180,
  dropoutGraceMs: 100,
  maximumEvidenceGapMs: 90,
};

export type ScalarGateReason =
  | 'released'
  | 'activation-candidate'
  | 'candidate-rejected'
  | 'activation-confirmed'
  | 'active-continuation'
  | 'release-candidate'
  | 'release-confirmed'
  | 'cooldown'
  | 'cooldown-waiting-release'
  | 'cooldown-complete'
  | 'dropout-grace'
  | 'evidence-missing'
  | 'evidence-gap'
  | 'recovered';

export interface ScalarGatePayload {
  readonly value?: number;
  readonly activationProgress: number;
  readonly releaseProgress: number;
  readonly reason: ScalarGateReason;
  readonly thresholds: ScalarGateThresholds;
}

export class ScalarGestureGate {
  private phase: GesturePhase = 'unknown';
  private candidateStartedAtMs: number | undefined;
  private releaseStartedAtMs: number | undefined;
  private cooldownStartedAtMs: number | undefined;
  private lastEvidenceAtMs: number | undefined;
  private lastValue: number | undefined;
  private lastConfidence = 0;

  constructor(
    readonly id: string,
    private thresholds: ScalarGateThresholds,
    private readonly config: ScalarGateConfig = DEFAULT_SCALAR_GATE_CONFIG,
  ) {
    if (thresholds.activation >= thresholds.continuation) {
      throw new Error(
        'Activation threshold must be below continuation threshold.',
      );
    }
  }

  update(
    value: number | undefined,
    timestampMs: number,
    confidence: number,
  ): GestureSignal<ScalarGatePayload> {
    if (value === undefined || !Number.isFinite(value)) {
      return this.missing(timestampMs);
    }
    const evidenceGap =
      this.lastEvidenceAtMs === undefined
        ? 0
        : timestampMs - this.lastEvidenceAtMs;
    this.lastEvidenceAtMs = timestampMs;
    this.lastValue = value;
    this.lastConfidence = confidence;

    if (this.phase === 'unknown') {
      this.phase = 'idle';
      this.resetTimers();
      return this.signal(timestampMs, confidence, value, 'recovered');
    }
    if (
      evidenceGap > this.config.maximumEvidenceGapMs &&
      this.phase === 'candidate'
    ) {
      this.candidateStartedAtMs =
        value <= this.thresholds.activation ? timestampMs : undefined;
      this.phase = value <= this.thresholds.activation ? 'candidate' : 'idle';
      return this.signal(timestampMs, confidence, value, 'evidence-gap');
    }
    if (evidenceGap > this.config.dropoutGraceMs && this.phase === 'active') {
      this.phase = 'unknown';
      this.resetTimers();
      return this.signal(timestampMs, 0, value, 'evidence-missing');
    }

    switch (this.phase) {
      case 'idle':
        return this.idle(value, timestampMs, confidence);
      case 'candidate':
        return this.candidate(value, timestampMs, confidence);
      case 'active':
        return this.active(value, timestampMs, confidence);
      case 'cooldown':
        return this.cooldown(value, timestampMs, confidence);
    }
  }

  setThresholds(thresholds: ScalarGateThresholds): void {
    if (thresholds.activation >= thresholds.continuation) {
      throw new Error(
        'Activation threshold must be below continuation threshold.',
      );
    }
    this.thresholds = thresholds;
    this.reset();
  }

  reset(): void {
    this.phase = 'unknown';
    this.lastEvidenceAtMs = undefined;
    this.lastValue = undefined;
    this.lastConfidence = 0;
    this.resetTimers();
  }

  private idle(
    value: number,
    timestampMs: number,
    confidence: number,
  ): GestureSignal<ScalarGatePayload> {
    if (value <= this.thresholds.activation) {
      this.phase = 'candidate';
      this.candidateStartedAtMs = timestampMs;
      return this.signal(
        timestampMs,
        confidence,
        value,
        'activation-candidate',
      );
    }
    return this.signal(timestampMs, confidence, value, 'released');
  }

  private candidate(
    value: number,
    timestampMs: number,
    confidence: number,
  ): GestureSignal<ScalarGatePayload> {
    if (value > this.thresholds.activation) {
      this.phase = 'idle';
      this.candidateStartedAtMs = undefined;
      return this.signal(timestampMs, confidence, value, 'candidate-rejected');
    }
    if (
      timestampMs - (this.candidateStartedAtMs ?? timestampMs) >=
      this.config.activationDurationMs
    ) {
      this.phase = 'active';
      this.candidateStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        confidence,
        value,
        'activation-confirmed',
      );
    }
    return this.signal(timestampMs, confidence, value, 'activation-candidate');
  }

  private active(
    value: number,
    timestampMs: number,
    confidence: number,
  ): GestureSignal<ScalarGatePayload> {
    if (value <= this.thresholds.continuation) {
      this.releaseStartedAtMs = undefined;
      return this.signal(timestampMs, confidence, value, 'active-continuation');
    }
    this.releaseStartedAtMs ??= timestampMs;
    if (
      timestampMs - this.releaseStartedAtMs >=
      this.config.releaseDurationMs
    ) {
      this.phase = 'cooldown';
      this.releaseStartedAtMs = undefined;
      this.cooldownStartedAtMs = timestampMs;
      return this.signal(timestampMs, confidence, value, 'release-confirmed');
    }
    return this.signal(timestampMs, confidence, value, 'release-candidate');
  }

  private cooldown(
    value: number,
    timestampMs: number,
    confidence: number,
  ): GestureSignal<ScalarGatePayload> {
    if (value <= this.thresholds.continuation) {
      this.cooldownStartedAtMs = undefined;
      return this.signal(
        timestampMs,
        confidence,
        value,
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
      return this.signal(timestampMs, confidence, value, 'cooldown-complete');
    }
    return this.signal(timestampMs, confidence, value, 'cooldown');
  }

  private missing(timestampMs: number): GestureSignal<ScalarGatePayload> {
    const elapsed =
      this.lastEvidenceAtMs === undefined
        ? Number.POSITIVE_INFINITY
        : timestampMs - this.lastEvidenceAtMs;
    if (this.phase === 'active' && elapsed <= this.config.dropoutGraceMs) {
      return this.signal(
        timestampMs,
        this.lastConfidence * (1 - elapsed / this.config.dropoutGraceMs),
        this.lastValue,
        'dropout-grace',
      );
    }
    this.phase = 'unknown';
    this.resetTimers();
    return this.signal(timestampMs, 0, this.lastValue, 'evidence-missing');
  }

  private signal(
    timestampMs: number,
    confidence: number,
    value: number | undefined,
    reason: ScalarGateReason,
  ): GestureSignal<ScalarGatePayload> {
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
        value,
        activationProgress,
        releaseProgress,
        reason,
        thresholds: this.thresholds,
      },
    };
  }

  private resetTimers(): void {
    this.candidateStartedAtMs = undefined;
    this.releaseStartedAtMs = undefined;
    this.cooldownStartedAtMs = undefined;
  }
}
