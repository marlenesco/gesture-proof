import type {
  GesturePhase,
  GestureSignal,
  HandObservation,
  NormalizedPoint,
} from '../engine/contracts';
import { normalizedDistance, palmScale } from '../engine/geometry';
import { pinchRatio } from './pinch-recognizer';
import { fingerOpennesses, FINGER_NAMES } from './pose-metrics';

export const MATRIX_GESTURES = [
  'pinch',
  'fist',
  'open-palm',
  'point',
  'two-hand-span',
] as const;

export type MatrixGesture = (typeof MATRIX_GESTURES)[number];
export type MatrixScores = Readonly<Record<MatrixGesture, number>>;

export interface GestureMatrixEvidence {
  readonly scores: MatrixScores;
  readonly winner: MatrixGesture;
  readonly runnerUp: MatrixGesture;
  readonly margin: number;
  readonly confidence: number;
  readonly primaryHandId?: string;
  readonly secondaryHandId?: string;
  readonly pinchRatio?: number;
  readonly spanRatio?: number;
}

export interface GestureStateMatrixConfig {
  readonly activationScore: number;
  readonly continuationScore: number;
  readonly activationMargin: number;
  readonly continuationMargin: number;
  readonly activationDurationMs: number;
  readonly releaseDurationMs: number;
  readonly cooldownDurationMs: number;
  readonly dropoutGraceMs: number;
  readonly maximumEvidenceGapMs: number;
}

export const DEFAULT_GESTURE_STATE_MATRIX_CONFIG: GestureStateMatrixConfig = {
  activationScore: 0.78,
  continuationScore: 0.58,
  activationMargin: 0.16,
  continuationMargin: 0.08,
  activationDurationMs: 140,
  releaseDurationMs: 100,
  cooldownDurationMs: 180,
  dropoutGraceMs: 100,
  maximumEvidenceGapMs: 90,
};

export type GestureStateMatrixReason =
  | 'evidence-missing'
  | 'recovered'
  | 'released'
  | 'ambiguous'
  | 'activation-candidate'
  | 'candidate-switched'
  | 'candidate-rejected'
  | 'activation-confirmed'
  | 'active-continuation'
  | 'release-candidate'
  | 'release-confirmed'
  | 'cooldown'
  | 'cooldown-complete'
  | 'dropout-grace'
  | 'evidence-gap';

export interface GestureStateMatrixPayload {
  readonly scores: MatrixScores;
  readonly winner?: MatrixGesture;
  readonly runnerUp?: MatrixGesture;
  readonly margin: number;
  readonly gesture?: MatrixGesture;
  readonly primaryHandId?: string;
  readonly secondaryHandId?: string;
  readonly pinchRatio?: number;
  readonly spanRatio?: number;
  readonly activationProgress: number;
  readonly releaseProgress: number;
  readonly reason: GestureStateMatrixReason;
}

const EMPTY_SCORES: MatrixScores = {
  pinch: 0,
  fist: 0,
  'open-palm': 0,
  point: 0,
  'two-hand-span': 0,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mapRising(value: number, released: number, active: number): number {
  return clamp01((value - released) / (active - released));
}

function mapFalling(value: number, released: number, active: number): number {
  return clamp01((released - value) / (released - active));
}

function palmCenter(hand: HandObservation): NormalizedPoint | undefined {
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
  return {
    x: valid.reduce((total, point) => total + point.x, 0) / valid.length,
    y: valid.reduce((total, point) => total + point.y, 0) / valid.length,
  };
}

function minimumFingerOpenness(hand: HandObservation): number | undefined {
  const opennesses = fingerOpennesses(hand);
  if (!opennesses) return undefined;
  return Math.min(...FINGER_NAMES.map((finger) => opennesses[finger]));
}

function rank(scores: MatrixScores): readonly [MatrixGesture, MatrixGesture] {
  const ranked = MATRIX_GESTURES.toSorted(
    (first, second) => scores[second] - scores[first],
  );
  return [ranked[0] ?? 'pinch', ranked[1] ?? 'fist'];
}

export function measureGestureMatrix(
  observations: readonly HandObservation[],
  primaryHandId?: string,
): GestureMatrixEvidence | undefined {
  const primary = primaryHandId
    ? observations.find(({ id }) => id === primaryHandId)
    : observations.toSorted((a, b) => b.confidence - a.confidence)[0];
  if (!primary) return undefined;

  const pinch = pinchRatio(primary);
  const fingers = fingerOpennesses(primary);
  if (pinch === undefined || !fingers) return undefined;

  const fingerValues = FINGER_NAMES.map((finger) => fingers[finger]);
  const mostOpen = Math.max(...fingerValues);
  const leastOpen = Math.min(...fingerValues);
  const otherMostOpen = Math.max(fingers.middle, fingers.ring, fingers.pinky);
  const pinchScore = mapFalling(pinch, 0.52, 0.24);
  const fistScore = mapFalling(mostOpen, 0.46, 0.18);
  const releasedPinch = mapRising(pinch, 0.44, 0.66);
  const openScore = Math.min(mapRising(leastOpen, 0.62, 0.88), releasedPinch);
  const pointScore = Math.min(
    mapRising(fingers.index, 0.62, 0.9),
    mapFalling(otherMostOpen, 0.42, 0.16),
    releasedPinch,
  );

  let spanRatio: number | undefined;
  let spanScore = 0;
  let secondary: HandObservation | undefined;
  if (observations.length >= 2) {
    secondary = observations
      .filter(({ id }) => id !== primary.id)
      .toSorted((a, b) => b.confidence - a.confidence)[0];
    const primaryCenter = palmCenter(primary);
    const secondaryCenter = secondary ? palmCenter(secondary) : undefined;
    const primaryScale = palmScale(primary.landmarks);
    const secondaryScale = secondary
      ? palmScale(secondary.landmarks)
      : undefined;
    const secondaryOpen = secondary
      ? minimumFingerOpenness(secondary)
      : undefined;
    if (
      primaryCenter &&
      secondaryCenter &&
      primaryScale &&
      secondaryScale &&
      primaryScale >= 0.02 &&
      secondaryScale >= 0.02 &&
      secondaryOpen !== undefined
    ) {
      spanRatio =
        normalizedDistance(primaryCenter, secondaryCenter) /
        ((primaryScale + secondaryScale) / 2);
      const bothOpen = Math.min(leastOpen, secondaryOpen);
      spanScore = Math.min(
        mapRising(spanRatio, 1.6, 2.9),
        mapRising(bothOpen, 0.56, 0.82),
      );
    }
  }

  const singleHandAttenuation = 1 - spanScore * 0.72;
  const scores: MatrixScores = {
    pinch: pinchScore * singleHandAttenuation,
    fist: fistScore * singleHandAttenuation,
    'open-palm': openScore * singleHandAttenuation,
    point: pointScore * singleHandAttenuation,
    'two-hand-span': spanScore,
  };
  const [winner, runnerUp] = rank(scores);

  return {
    scores,
    winner,
    runnerUp,
    margin: scores[winner] - scores[runnerUp],
    confidence: secondary
      ? Math.min(primary.confidence, secondary.confidence)
      : primary.confidence,
    primaryHandId: primary.id,
    secondaryHandId: spanScore > 0 ? secondary?.id : undefined,
    pinchRatio: pinch,
    spanRatio,
  };
}

export class GestureStateMatrix {
  readonly id = 'gesture-state-matrix';
  private phase: GesturePhase = 'unknown';
  private primaryHandId: string | undefined;
  private primarySeenAtMs = -Infinity;
  private candidateGesture: MatrixGesture | undefined;
  private activeGesture: MatrixGesture | undefined;
  private candidateStartedAtMs: number | undefined;
  private releaseStartedAtMs: number | undefined;
  private cooldownStartedAtMs: number | undefined;
  private lastEvidenceAtMs: number | undefined;
  private lastEvidence: GestureMatrixEvidence | undefined;

  constructor(private readonly config = DEFAULT_GESTURE_STATE_MATRIX_CONFIG) {}

  update(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): GestureSignal<GestureStateMatrixPayload> {
    const primary = this.selectPrimary(observations, timestampMs);
    const evidence = measureGestureMatrix(observations, primary?.id);
    if (!evidence) return this.missing(timestampMs);

    const evidenceGap =
      this.lastEvidenceAtMs === undefined
        ? 0
        : timestampMs - this.lastEvidenceAtMs;
    this.lastEvidenceAtMs = timestampMs;
    this.lastEvidence = evidence;

    const eligible = this.activationEligible(evidence);
    const ambiguous =
      evidence.scores[evidence.winner] >= this.config.continuationScore &&
      evidence.margin < this.config.activationMargin;

    if (this.phase === 'unknown') {
      this.clearTimers();
      if (ambiguous) return this.signal(timestampMs, evidence, 'ambiguous');
      this.phase = 'idle';
      return this.signal(timestampMs, evidence, 'recovered');
    }

    if (
      evidenceGap > this.config.maximumEvidenceGapMs &&
      this.phase === 'candidate'
    ) {
      this.candidateGesture = eligible ? evidence.winner : undefined;
      this.candidateStartedAtMs = eligible ? timestampMs : undefined;
      this.phase = eligible ? 'candidate' : 'idle';
      return this.signal(timestampMs, evidence, 'evidence-gap');
    }

    switch (this.phase) {
      case 'idle':
        if (ambiguous) {
          this.phase = 'unknown';
          return this.signal(timestampMs, evidence, 'ambiguous');
        }
        if (!eligible) return this.signal(timestampMs, evidence, 'released');
        this.phase = 'candidate';
        this.candidateGesture = evidence.winner;
        this.candidateStartedAtMs = timestampMs;
        return this.signal(timestampMs, evidence, 'activation-candidate');

      case 'candidate':
        if (ambiguous) {
          this.phase = 'unknown';
          this.candidateGesture = undefined;
          this.candidateStartedAtMs = undefined;
          return this.signal(timestampMs, evidence, 'ambiguous');
        }
        if (!eligible) {
          this.phase = 'idle';
          this.candidateGesture = undefined;
          this.candidateStartedAtMs = undefined;
          return this.signal(timestampMs, evidence, 'candidate-rejected');
        }
        if (evidence.winner !== this.candidateGesture) {
          this.candidateGesture = evidence.winner;
          this.candidateStartedAtMs = timestampMs;
          return this.signal(timestampMs, evidence, 'candidate-switched');
        }
        if (
          timestampMs - (this.candidateStartedAtMs ?? timestampMs) >=
          this.config.activationDurationMs
        ) {
          this.phase = 'active';
          this.activeGesture = this.candidateGesture;
          this.candidateGesture = undefined;
          this.candidateStartedAtMs = undefined;
          return this.signal(timestampMs, evidence, 'activation-confirmed');
        }
        return this.signal(timestampMs, evidence, 'activation-candidate');

      case 'active': {
        const active = this.activeGesture;
        const activeScore = active ? evidence.scores[active] : 0;
        const runnerScore = active
          ? Math.max(
              ...MATRIX_GESTURES.filter((gesture) => gesture !== active).map(
                (gesture) => evidence.scores[gesture],
              ),
            )
          : 1;
        if (
          activeScore >= this.config.continuationScore &&
          activeScore - runnerScore >= this.config.continuationMargin
        ) {
          this.releaseStartedAtMs = undefined;
          return this.signal(timestampMs, evidence, 'active-continuation');
        }
        this.releaseStartedAtMs ??= timestampMs;
        if (
          timestampMs - this.releaseStartedAtMs >=
          this.config.releaseDurationMs
        ) {
          this.phase = 'cooldown';
          this.releaseStartedAtMs = undefined;
          this.cooldownStartedAtMs = timestampMs;
          return this.signal(timestampMs, evidence, 'release-confirmed');
        }
        return this.signal(timestampMs, evidence, 'release-candidate');
      }

      case 'cooldown':
        if (
          timestampMs - (this.cooldownStartedAtMs ?? timestampMs) >=
          this.config.cooldownDurationMs
        ) {
          this.phase = 'idle';
          this.activeGesture = undefined;
          this.cooldownStartedAtMs = undefined;
          return this.signal(timestampMs, evidence, 'cooldown-complete');
        }
        return this.signal(timestampMs, evidence, 'cooldown');
    }
  }

  reset(): void {
    this.phase = 'unknown';
    this.primaryHandId = undefined;
    this.primarySeenAtMs = -Infinity;
    this.candidateGesture = undefined;
    this.activeGesture = undefined;
    this.lastEvidenceAtMs = undefined;
    this.lastEvidence = undefined;
    this.clearTimers();
  }

  private selectPrimary(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): HandObservation | undefined {
    if (this.primaryHandId) {
      const retained = observations.find(({ id }) => id === this.primaryHandId);
      if (retained) {
        this.primarySeenAtMs = timestampMs;
        return retained;
      }
      if (timestampMs - this.primarySeenAtMs <= this.config.dropoutGraceMs) {
        return undefined;
      }
      this.primaryHandId = undefined;
    }
    const selected = observations.toSorted(
      (first, second) => second.confidence - first.confidence,
    )[0];
    if (selected) {
      this.primaryHandId = selected.id;
      this.primarySeenAtMs = timestampMs;
    }
    return selected;
  }

  private activationEligible(evidence: GestureMatrixEvidence): boolean {
    return (
      evidence.scores[evidence.winner] >= this.config.activationScore &&
      evidence.margin >= this.config.activationMargin
    );
  }

  private missing(
    timestampMs: number,
  ): GestureSignal<GestureStateMatrixPayload> {
    const elapsed =
      this.lastEvidenceAtMs === undefined
        ? Number.POSITIVE_INFINITY
        : timestampMs - this.lastEvidenceAtMs;
    if (
      this.phase === 'active' &&
      this.lastEvidence &&
      elapsed <= this.config.dropoutGraceMs
    ) {
      return this.signal(
        timestampMs,
        this.lastEvidence,
        'dropout-grace',
        1 - elapsed / this.config.dropoutGraceMs,
      );
    }
    this.phase = 'unknown';
    this.candidateGesture = undefined;
    this.activeGesture = undefined;
    this.clearTimers();
    return this.signal(timestampMs, undefined, 'evidence-missing');
  }

  private signal(
    timestampMs: number,
    evidence: GestureMatrixEvidence | undefined,
    reason: GestureStateMatrixReason,
    confidenceMultiplier = 1,
  ): GestureSignal<GestureStateMatrixPayload> {
    const gesture =
      this.phase === 'active' || this.phase === 'cooldown'
        ? this.activeGesture
        : this.phase === 'candidate'
          ? this.candidateGesture
          : undefined;
    return {
      id: this.id,
      phase: this.phase,
      confidence: clamp01((evidence?.confidence ?? 0) * confidenceMultiplier),
      timestampMs,
      payload: {
        scores: evidence?.scores ?? EMPTY_SCORES,
        winner: evidence?.winner,
        runnerUp: evidence?.runnerUp,
        margin: evidence?.margin ?? 0,
        gesture,
        primaryHandId: evidence?.primaryHandId ?? this.primaryHandId,
        secondaryHandId: evidence?.secondaryHandId,
        pinchRatio: evidence?.pinchRatio,
        spanRatio: evidence?.spanRatio,
        activationProgress:
          this.phase === 'candidate' && this.candidateStartedAtMs !== undefined
            ? clamp01(
                (timestampMs - this.candidateStartedAtMs) /
                  this.config.activationDurationMs,
              )
            : this.phase === 'active'
              ? 1
              : 0,
        releaseProgress:
          this.phase === 'active' && this.releaseStartedAtMs !== undefined
            ? clamp01(
                (timestampMs - this.releaseStartedAtMs) /
                  this.config.releaseDurationMs,
              )
            : 0,
        reason,
      },
    };
  }

  private clearTimers(): void {
    this.candidateStartedAtMs = undefined;
    this.releaseStartedAtMs = undefined;
    this.cooldownStartedAtMs = undefined;
  }
}
