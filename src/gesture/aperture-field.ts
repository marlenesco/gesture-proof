import type {
  GesturePhase,
  GestureSignal,
  HandObservation,
  NormalizedPoint,
} from '../engine/contracts';
import { normalizedDistance, palmScale, polygonArea } from '../engine/geometry';
import { fingerOpenness } from './pose-metrics';

export type ApertureReason =
  | 'evidence-missing'
  | 'geometry-invalid'
  | 'activation-candidate'
  | 'activation-confirmed'
  | 'active-continuation'
  | 'release-candidate'
  | 'release-confirmed'
  | 'cooldown'
  | 'cooldown-complete';

export interface ApertureEvidence {
  readonly corners: readonly NormalizedPoint[];
  readonly handIds: readonly [string, string];
  readonly area: number;
  readonly tension: number;
}

export interface AperturePayload {
  readonly corners: readonly NormalizedPoint[];
  readonly handIds: readonly string[];
  readonly area: number;
  readonly tension: number;
  readonly activationProgress: number;
  readonly releaseProgress: number;
  readonly reason: ApertureReason;
}

export interface ApertureFieldConfig {
  readonly activationDurationMs: number;
  readonly releaseDurationMs: number;
  readonly cooldownDurationMs: number;
  readonly contactActivationRatio: number;
  readonly contactContinuationRatio: number;
  readonly nearContactRatio: number;
  readonly activationAreaRatio: number;
  readonly continuationAreaRatio: number;
}

export const DEFAULT_APERTURE_FIELD_CONFIG: ApertureFieldConfig = {
  activationDurationMs: 180,
  releaseDurationMs: 120,
  cooldownDurationMs: 220,
  contactActivationRatio: 0.075,
  contactContinuationRatio: 0.12,
  nearContactRatio: 0.32,
  activationAreaRatio: 1.25,
  continuationAreaRatio: 0.85,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function angularHull(
  points: readonly NormalizedPoint[],
): readonly NormalizedPoint[] {
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  return points.toSorted(
    (first, second) =>
      Math.atan2(first.y - center.y, first.x - center.x) -
      Math.atan2(second.y - center.y, second.x - center.x),
  );
}

function handEvidence(
  hand: HandObservation,
  nearContactRatio: number,
):
  | {
      readonly ratio: number;
      readonly index: NormalizedPoint;
      readonly thumb: NormalizedPoint;
    }
  | undefined {
  const thumb = hand.landmarks[4];
  const index = hand.landmarks[8];
  const scale = palmScale(hand.landmarks);
  const indexOpen = fingerOpenness(hand, 'index');
  if (!thumb || !index || !scale || scale < 0.02 || indexOpen === undefined) {
    return undefined;
  }
  const ratio = normalizedDistance(thumb, index) / scale;
  const minimumIndexOpen = ratio <= nearContactRatio ? 0.2 : 0.58;
  if (!Number.isFinite(ratio) || indexOpen < minimumIndexOpen) return undefined;
  return { ratio, index, thumb };
}

function contactPoint(
  thumb: NormalizedPoint,
  index: NormalizedPoint,
): NormalizedPoint {
  return { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
}

export function measureAperture(
  observations: readonly HandObservation[],
  config = DEFAULT_APERTURE_FIELD_CONFIG,
  continuation = false,
): ApertureEvidence | undefined {
  const detectedHands = observations
    .toSorted((first, second) => second.confidence - first.confidence)
    .slice(0, 2);
  if (detectedHands.length !== 2) return undefined;
  const hands = detectedHands.toSorted((first, second) => {
    const firstWrist = first.landmarks[0];
    const secondWrist = second.landmarks[0];
    return (firstWrist?.x ?? 0) - (secondWrist?.x ?? 0);
  });
  const first = hands[0]
    ? handEvidence(hands[0], config.nearContactRatio)
    : undefined;
  const second = hands[1]
    ? handEvidence(hands[1], config.nearContactRatio)
    : undefined;
  if (!first || !second) return undefined;
  const contactRatio = continuation
    ? config.contactContinuationRatio
    : config.contactActivationRatio;
  const firstPinching = first.ratio <= contactRatio;
  const secondPinching = second.ratio <= contactRatio;
  const firstContact = firstPinching
    ? contactPoint(first.thumb, first.index)
    : undefined;
  const secondContact = secondPinching
    ? contactPoint(second.thumb, second.index)
    : undefined;
  // Preserve anatomical slots. Crossed hands yield a bow-tie (two triangles).
  // Contact duplicates its measured midpoint into both anatomical slots. This
  // keeps a four-slot signal through contact, while Canvas sees a triangle.
  const corners = [
    firstContact ?? first.index,
    secondContact ?? second.index,
    secondContact ?? second.thumb,
    firstContact ?? first.thumb,
  ];
  const hullPoints = [
    ...(firstContact ? [firstContact] : [first.index, first.thumb]),
    ...(secondContact ? [secondContact] : [second.index, second.thumb]),
  ];
  if (hullPoints.length < 3) return undefined;
  const hull = angularHull(hullPoints);
  const meanScale =
    (palmScale(hands[0]!.landmarks)! + palmScale(hands[1]!.landmarks)!) / 2;
  const area = polygonArea(hull) / (meanScale * meanScale);
  const minimumArea =
    (continuation ? config.continuationAreaRatio : config.activationAreaRatio) *
    (hullPoints.length === 3 ? 0.68 : 1);
  if (!Number.isFinite(area) || area < minimumArea) return undefined;
  return {
    corners,
    handIds: [hands[0]!.id, hands[1]!.id],
    area,
    tension: clamp01(
      (Math.max(first.ratio, second.ratio) - contactRatio) / 0.84,
    ),
  };
}

const EMPTY_PAYLOAD: AperturePayload = {
  corners: [],
  handIds: [],
  area: 0,
  tension: 0,
  activationProgress: 0,
  releaseProgress: 0,
  reason: 'evidence-missing',
};

export class ApertureFieldRecognizer {
  readonly id = 'aperture-field';
  private phase: GesturePhase = 'unknown';
  private candidateAtMs: number | undefined;
  private releaseAtMs: number | undefined;
  private cooldownAtMs: number | undefined;
  private activeIds: readonly [string, string] | undefined;
  private lastEvidence: ApertureEvidence | undefined;

  constructor(private readonly config = DEFAULT_APERTURE_FIELD_CONFIG) {}

  update(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): GestureSignal<AperturePayload> {
    const continuation = this.phase === 'active' || this.phase === 'cooldown';
    const evidence = measureAperture(observations, this.config, continuation);
    const payload = (reason: ApertureReason): AperturePayload => {
      const current = evidence ?? this.lastEvidence;
      return {
        corners: current?.corners ?? [],
        handIds: current?.handIds ?? [],
        area: current?.area ?? 0,
        tension: current?.tension ?? 0,
        activationProgress:
          this.phase === 'candidate' && this.candidateAtMs !== undefined
            ? clamp01(
                (timestampMs - this.candidateAtMs) /
                  this.config.activationDurationMs,
              )
            : 0,
        releaseProgress:
          this.phase === 'active' && this.releaseAtMs !== undefined
            ? clamp01(
                (timestampMs - this.releaseAtMs) /
                  this.config.releaseDurationMs,
              )
            : 0,
        reason,
      };
    };
    const signal = (
      reason: ApertureReason,
    ): GestureSignal<AperturePayload> => ({
      id: this.id,
      phase: this.phase,
      confidence: evidence?.tension ?? 0,
      timestampMs,
      payload: payload(reason),
    });

    if (this.phase === 'cooldown') {
      if (
        timestampMs - (this.cooldownAtMs ?? timestampMs) <
        this.config.cooldownDurationMs
      ) {
        return signal('cooldown');
      }
      this.phase = 'idle';
      this.cooldownAtMs = undefined;
      return signal('cooldown-complete');
    }

    if (this.phase === 'active') {
      const sameHands =
        evidence &&
        this.activeIds &&
        evidence.handIds.every((id) => this.activeIds!.includes(id));
      if (evidence && sameHands) {
        this.lastEvidence = evidence;
        this.releaseAtMs = undefined;
        return signal('active-continuation');
      }
      this.releaseAtMs ??= timestampMs;
      if (timestampMs - this.releaseAtMs < this.config.releaseDurationMs) {
        return signal('release-candidate');
      }
      this.phase = 'cooldown';
      this.cooldownAtMs = timestampMs;
      this.releaseAtMs = undefined;
      this.activeIds = undefined;
      return signal('release-confirmed');
    }

    if (!evidence) {
      this.phase = 'idle';
      this.candidateAtMs = undefined;
      return signal('geometry-invalid');
    }
    this.lastEvidence = evidence;
    if (this.phase !== 'candidate') {
      this.phase = 'candidate';
      this.candidateAtMs = timestampMs;
      return signal('activation-candidate');
    }
    if (
      timestampMs - (this.candidateAtMs ?? timestampMs) <
      this.config.activationDurationMs
    ) {
      return signal('activation-candidate');
    }
    this.phase = 'active';
    this.activeIds = evidence.handIds;
    this.candidateAtMs = undefined;
    return signal('activation-confirmed');
  }

  reset(): void {
    this.phase = 'unknown';
    this.candidateAtMs = undefined;
    this.releaseAtMs = undefined;
    this.cooldownAtMs = undefined;
    this.activeIds = undefined;
    this.lastEvidence = undefined;
  }

  empty(timestampMs: number): GestureSignal<AperturePayload> {
    return {
      id: this.id,
      phase: 'unknown',
      confidence: 0,
      timestampMs,
      payload: EMPTY_PAYLOAD,
    };
  }
}
