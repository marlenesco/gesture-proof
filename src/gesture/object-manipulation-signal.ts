import type {
  GesturePhase,
  GestureSignal,
  NormalizedPoint,
} from '../engine/contracts';
import type { GestureStateMatrixPayload } from './gesture-state-matrix';
import type { MotionSignalPayload } from './motion-signal';

export type ObjectManipulationAction = 'translate' | 'rotate' | 'scale';

export type ObjectManipulationReason =
  | 'evidence-missing'
  | 'ready'
  | 'action-pending'
  | 'action-acquired'
  | 'transforming'
  | 'released'
  | 'baseline-reacquired'
  | 'invalid-timestamp'
  | 'delta-rejected'
  | 'action-changed';

export interface ObjectManipulationPayload {
  readonly action?: ObjectManipulationAction;
  readonly cursor?: NormalizedPoint;
  readonly acquisitionCursor?: NormalizedPoint;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly scaleFactor: number;
  readonly ownerId?: string;
  readonly reason: ObjectManipulationReason;
}

function actionForGesture(
  gesture: GestureStateMatrixPayload['gesture'],
): ObjectManipulationAction | undefined {
  switch (gesture) {
    case 'pinch':
      return 'translate';
    case 'fist':
      return 'rotate';
    case 'two-hand-span':
      return 'scale';
    case 'open-palm':
    case 'point':
    case undefined:
      return undefined;
  }
}

function activeActionFor(
  matrix: GestureSignal<GestureStateMatrixPayload>,
): ObjectManipulationAction | undefined {
  return matrix.phase === 'active'
    ? actionForGesture(matrix.payload.gesture)
    : undefined;
}

function candidateActionFor(
  matrix: GestureSignal<GestureStateMatrixPayload>,
): ObjectManipulationAction | undefined {
  return matrix.phase === 'candidate'
    ? actionForGesture(matrix.payload.gesture)
    : undefined;
}

export class ObjectManipulationSignal {
  readonly id = 'object-manipulation';
  private phase: GesturePhase = 'unknown';
  private action: ObjectManipulationAction | undefined;
  private previousPosition: NormalizedPoint | undefined;
  private previousSpanRatio: number | undefined;
  private previousTimestampMs: number | undefined;
  private needsBaseline = true;
  private pendingAction: ObjectManipulationAction | undefined;
  private pendingPosition: NormalizedPoint | undefined;
  private pendingSpanRatio: number | undefined;
  private pendingTimestampMs: number | undefined;

  update(
    motion: GestureSignal<MotionSignalPayload>,
    matrix: GestureSignal<GestureStateMatrixPayload>,
    timestampMs: number,
  ): GestureSignal<ObjectManipulationPayload> {
    const proposed = activeActionFor(matrix);
    const candidate = candidateActionFor(matrix);
    const cursor = motion.payload.position;

    if (!proposed) {
      if (candidate) {
        return this.stageCandidate(
          candidate,
          cursor,
          matrix.payload.spanRatio,
          timestampMs,
          motion,
          matrix,
        );
      }
      const released = this.action !== undefined;
      this.clearAction();
      this.phase = matrix.phase === 'unknown' ? 'unknown' : 'idle';
      return this.signal(
        timestampMs,
        cursor,
        released
          ? 'released'
          : this.phase === 'unknown'
            ? 'evidence-missing'
            : 'ready',
        motion,
        matrix,
      );
    }

    if (this.action && proposed !== this.action) {
      this.clearAction();
      this.phase = 'unknown';
      return this.signal(timestampMs, cursor, 'action-changed', motion, matrix);
    }

    const acquired = this.action === undefined;
    let acquisitionCursor: NormalizedPoint | undefined;
    if (acquired) {
      this.action = proposed;
      if (this.pendingAction === proposed) {
        this.previousPosition = this.pendingPosition;
        this.previousSpanRatio = this.pendingSpanRatio;
        this.previousTimestampMs = this.pendingTimestampMs;
        this.needsBaseline =
          proposed === 'scale'
            ? this.previousSpanRatio === undefined
            : this.previousPosition === undefined;
        acquisitionCursor = this.pendingPosition;
      } else {
        this.needsBaseline = true;
      }
      this.clearPending();
    }

    const elapsedMs =
      this.previousTimestampMs === undefined
        ? 0
        : timestampMs - this.previousTimestampMs;
    if (elapsedMs < 0 || elapsedMs > 160 || !Number.isFinite(elapsedMs)) {
      this.resetBaseline();
      this.phase = 'unknown';
      this.previousTimestampMs = timestampMs;
      return this.signal(
        timestampMs,
        cursor,
        'invalid-timestamp',
        motion,
        matrix,
      );
    }

    const currentSpan = matrix.payload.spanRatio;
    const evidenceAvailable =
      proposed === 'scale'
        ? currentSpan !== undefined && Number.isFinite(currentSpan)
        : motion.phase !== 'unknown' && cursor !== undefined;
    if (!evidenceAvailable) {
      this.resetBaseline();
      this.phase = 'unknown';
      this.previousTimestampMs = timestampMs;
      return this.signal(
        timestampMs,
        cursor,
        'evidence-missing',
        motion,
        matrix,
      );
    }

    if (this.needsBaseline) {
      this.previousPosition = cursor;
      this.previousSpanRatio = currentSpan;
      this.previousTimestampMs = timestampMs;
      this.needsBaseline = false;
      this.phase = 'active';
      return this.signal(
        timestampMs,
        cursor,
        elapsedMs === 0 ? 'action-acquired' : 'baseline-reacquired',
        motion,
        matrix,
        0,
        0,
        0,
        0,
        1,
        cursor,
      );
    }

    let deltaX = 0;
    let deltaY = 0;
    let rotationX = 0;
    let rotationY = 0;
    let scaleFactor = 1;
    if (proposed === 'scale') {
      const previousSpan = this.previousSpanRatio;
      if (!previousSpan || !currentSpan) {
        this.resetBaseline();
        this.phase = 'unknown';
        return this.signal(
          timestampMs,
          cursor,
          'evidence-missing',
          motion,
          matrix,
        );
      }
      scaleFactor = currentSpan / previousSpan;
      this.previousSpanRatio = currentSpan;
      if (scaleFactor < 0.75 || scaleFactor > 1.33) {
        this.resetBaseline();
        this.phase = 'unknown';
        return this.signal(
          timestampMs,
          cursor,
          'delta-rejected',
          motion,
          matrix,
        );
      }
    } else {
      const previous = this.previousPosition;
      if (!previous || !cursor) {
        this.resetBaseline();
        this.phase = 'unknown';
        return this.signal(
          timestampMs,
          cursor,
          'evidence-missing',
          motion,
          matrix,
        );
      }
      const positionDeltaX = cursor.x - previous.x;
      const positionDeltaY = cursor.y - previous.y;
      this.previousPosition = cursor;
      if (Math.hypot(positionDeltaX, positionDeltaY) > 0.12) {
        this.resetBaseline();
        this.phase = 'unknown';
        return this.signal(
          timestampMs,
          cursor,
          'delta-rejected',
          motion,
          matrix,
        );
      }
      if (proposed === 'translate') {
        deltaX = positionDeltaX;
        deltaY = positionDeltaY;
      } else {
        rotationX = positionDeltaY * 4.2;
        rotationY = positionDeltaX * 4.2;
      }
    }

    this.previousTimestampMs = timestampMs;
    this.phase = 'active';
    return this.signal(
      timestampMs,
      cursor,
      acquired ? 'action-acquired' : 'transforming',
      motion,
      matrix,
      deltaX,
      deltaY,
      rotationX,
      rotationY,
      scaleFactor,
      acquisitionCursor,
    );
  }

  reset(): void {
    this.phase = 'unknown';
    this.clearAction();
  }

  private clearAction(): void {
    this.action = undefined;
    this.previousTimestampMs = undefined;
    this.resetBaseline();
    this.clearPending();
  }

  private clearPending(): void {
    this.pendingAction = undefined;
    this.pendingPosition = undefined;
    this.pendingSpanRatio = undefined;
    this.pendingTimestampMs = undefined;
  }

  private stageCandidate(
    action: ObjectManipulationAction,
    cursor: NormalizedPoint | undefined,
    spanRatio: number | undefined,
    timestampMs: number,
    motion: GestureSignal<MotionSignalPayload>,
    matrix: GestureSignal<GestureStateMatrixPayload>,
  ): GestureSignal<ObjectManipulationPayload> {
    const evidenceAvailable =
      action === 'scale'
        ? spanRatio !== undefined && Number.isFinite(spanRatio)
        : cursor !== undefined;
    if (!evidenceAvailable) {
      this.clearPending();
      this.phase = 'unknown';
      return this.signal(
        timestampMs,
        cursor,
        'evidence-missing',
        motion,
        matrix,
      );
    }

    const elapsedMs =
      this.pendingTimestampMs === undefined
        ? 0
        : timestampMs - this.pendingTimestampMs;
    const restart =
      this.pendingAction !== action ||
      elapsedMs < 0 ||
      elapsedMs > 160 ||
      !Number.isFinite(elapsedMs);
    if (restart || this.pendingAction === undefined) {
      this.pendingAction = action;
      this.pendingPosition = cursor;
      this.pendingSpanRatio = spanRatio;
    }
    this.pendingTimestampMs = timestampMs;
    this.phase = 'candidate';
    return this.signal(timestampMs, cursor, 'action-pending', motion, matrix);
  }

  private resetBaseline(): void {
    this.previousPosition = undefined;
    this.previousSpanRatio = undefined;
    this.needsBaseline = true;
  }

  private signal(
    timestampMs: number,
    cursor: NormalizedPoint | undefined,
    reason: ObjectManipulationReason,
    motion: GestureSignal<MotionSignalPayload>,
    matrix: GestureSignal<GestureStateMatrixPayload>,
    deltaX = 0,
    deltaY = 0,
    rotationX = 0,
    rotationY = 0,
    scaleFactor = 1,
    acquisitionCursor?: NormalizedPoint,
  ): GestureSignal<ObjectManipulationPayload> {
    return {
      id: this.id,
      phase: this.phase,
      confidence: Math.min(motion.confidence, matrix.confidence),
      timestampMs,
      payload: {
        action: this.action,
        cursor,
        acquisitionCursor,
        deltaX,
        deltaY,
        rotationX,
        rotationY,
        scaleFactor,
        ownerId: motion.payload.ownerId,
        reason,
      },
    };
  }
}
