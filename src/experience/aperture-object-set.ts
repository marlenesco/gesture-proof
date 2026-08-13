import type {
  GestureSignal,
  HandTracker,
  NormalizedPoint,
  ObservationFrame,
} from '../engine/contracts';
import {
  ApertureObjectFixturePlayer,
  type ApertureObjectFixtureScenario,
  type ApertureObjectFixtureState,
} from '../engine/aperture-object-fixtures';
import {
  ObjectScene,
  type DiscardedSceneObjects,
  type SceneObjectSeed,
} from '../engine/object-scene';
import { PerformanceMonitor } from '../engine/performance-monitor';
import { ObjectBenchEffect } from '../effects/object-bench-effect';
import {
  ApertureFieldRecognizer,
  type AperturePayload,
} from '../gesture/aperture-field';
import {
  DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
  GestureStateMatrix,
  type GestureStateMatrixPayload,
} from '../gesture/gesture-state-matrix';
import {
  ObjectManipulationSignal,
  type ObjectManipulationPayload,
} from '../gesture/object-manipulation-signal';
import {
  PalmMotionSignal,
  type MotionSignalPayload,
} from '../gesture/motion-signal';
import {
  PointHoldRecognizer,
  type PointHoldPayload,
} from '../gesture/point-hold';
import {
  GestureHoldRecognizer,
  type GestureHoldPayload,
} from '../gesture/gesture-hold';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type InputMode = 'idle' | 'camera' | 'fixture';
type SetPhase = 'select' | 'preview' | 'neutral' | 'ready';

interface Elements {
  readonly root: HTMLElement;
  readonly landmarkCanvas: HTMLCanvasElement;
  readonly stage: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly scenario: HTMLSelectElement;
  readonly overlay: HTMLInputElement;
  readonly mirror: HTMLInputElement;
  readonly reset: HTMLButtonElement;
  readonly undo: HTMLButtonElement;
  readonly selected: HTMLElement;
  readonly action: HTMLElement;
  readonly aperture: HTMLElement;
  readonly deletion: HTMLElement;
  readonly clear: HTMLElement;
  readonly setPhase: HTMLElement;
  readonly count: HTMLElement;
  readonly fixture: HTMLElement;
  readonly status: HTMLElement;
}

interface DeletionAnimation {
  readonly ids: readonly string[];
  readonly startedAtMs: number;
}

const DELETION_DURATION_MS = 280;
const NEUTRAL_DURATION_MS = 180;
const SET_SEEDS: readonly SceneObjectSeed[] = [
  { x: 0.46, y: 0.54, rotationX: -0.32, rotationY: 0.45, scale: 0.28 },
  { x: 0.55, y: 0.56, rotationX: -0.12, rotationY: 0.92, scale: 0.18 },
  { x: 0.72, y: 0.68, rotationX: -0.46, rotationY: 0.2, scale: 0.62 },
];

function required<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type))
    throw new Error(`Required element is missing: ${selector}`);
  return element;
}

function collectElements(): Elements {
  return {
    root: required('#aperture-object-set', HTMLElement),
    landmarkCanvas: required('#aperture-set-landmarks', HTMLCanvasElement),
    stage: required('#aperture-set-stage', HTMLCanvasElement),
    video: required('#aperture-set-video', HTMLVideoElement),
    startCamera: required('#aperture-set-start-camera', HTMLButtonElement),
    startFixture: required('#aperture-set-start-fixture', HTMLButtonElement),
    scenario: required('#aperture-set-scenario', HTMLSelectElement),
    overlay: required('#aperture-set-overlay', HTMLInputElement),
    mirror: required('#aperture-set-mirror', HTMLInputElement),
    reset: required('#aperture-set-reset', HTMLButtonElement),
    undo: required('#aperture-set-undo', HTMLButtonElement),
    selected: required('#aperture-set-selected', HTMLElement),
    action: required('#aperture-set-action', HTMLElement),
    aperture: required('#aperture-set-aperture', HTMLElement),
    deletion: required('#aperture-set-deletion', HTMLElement),
    clear: required('#aperture-set-clear', HTMLElement),
    setPhase: required('#aperture-set-phase', HTMLElement),
    count: required('#aperture-set-count', HTMLElement),
    fixture: required('#aperture-set-fixture', HTMLElement),
    status: required('#aperture-set-status', HTMLElement),
  };
}

function compactViewport(): boolean {
  return window.matchMedia('(max-width: 680px), (max-height: 520px)').matches;
}

function displayPoint(
  point: NormalizedPoint,
  mirror: boolean,
): NormalizedPoint {
  return mirror ? { ...point, x: 1 - point.x } : point;
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    ['NotAllowedError', 'SecurityError'].includes(error.name)
  );
}

export class ApertureObjectSetExperience {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly effect = new ObjectBenchEffect(this.elements.stage);
  private readonly fixture = new ApertureObjectFixturePlayer();
  private readonly aperture = new ApertureFieldRecognizer();
  private readonly matrix = new GestureStateMatrix({
    ...DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
    spanContinuationRatio: 1.45,
    spanActivationRatio: 2.45,
  });
  private readonly motion = new PalmMotionSignal();
  private readonly manipulation = new ObjectManipulationSignal();
  private readonly pointHold = new PointHoldRecognizer();
  private readonly clearHold = new GestureHoldRecognizer('open-palm');
  private readonly scene = new ObjectScene(compactViewport() ? 2 : 3, {
    initialObjects: SET_SEEDS,
  });
  private readonly monitor = new PerformanceMonitor();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: InputMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private apertureSignal: GestureSignal<AperturePayload> =
    this.aperture.empty(0);
  private motionSignal: GestureSignal<MotionSignalPayload> = this.motion.update(
    [],
    0,
  );
  private matrixSignal: GestureSignal<GestureStateMatrixPayload> =
    this.matrix.update([], 0);
  private manipulationSignal: GestureSignal<ObjectManipulationPayload> =
    this.manipulation.update(this.motionSignal, this.matrixSignal, 0);
  private pointSignal: GestureSignal<PointHoldPayload> =
    this.pointHold.reset(0);
  private clearSignal: GestureSignal<GestureHoldPayload> =
    this.clearHold.reset(0);
  private deletion: DeletionAnimation | undefined;
  private lastDiscarded: DiscardedSceneObjects | undefined;
  private setPhase: SetPhase = 'select';
  private previewIds: readonly string[] = [];
  private apertureWasActive = false;
  private neutralStartedAtMs: number | undefined;
  private lastFixtureTimestamp = -1;
  private displayRequest = 0;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly tracker: HandTracker) {
    this.scene.selectIds([]);
    this.camera = new CameraSource(this.elements.video);
    this.scheduler = new VideoFrameScheduler(
      this.elements.video,
      (timestampMs) => this.processVideoFrame(timestampMs),
      () => this.handleTrackingError(),
    );
    if (compactViewport()) this.elements.overlay.checked = false;
    this.bindEvents();
    this.elements.startCamera.disabled = !this.camera.supported;
    this.updateReadout();
    this.displayRequest = requestAnimationFrame(this.displayLoop);
  }

  private readonly displayLoop = (timestampMs: number): void => {
    if (this.disposed) return;
    this.monitor.markDisplay(timestampMs);
    if (this.mode === 'fixture') {
      const fixture = this.fixture.frame(timestampMs);
      if (fixture.frame.timestampMs !== this.lastFixtureTimestamp) {
        this.lastFixtureTimestamp = fixture.frame.timestampMs;
        this.acceptFrame(fixture.frame, fixture);
      }
    }
    this.finishDeletion(timestampMs);
    const corners =
      this.apertureSignal.phase === 'candidate' ||
      this.apertureSignal.phase === 'active'
        ? this.apertureSignal.payload.corners.map((point) =>
            displayPoint(point, this.elements.mirror.checked),
          )
        : undefined;
    const deletionProgress = this.deletion
      ? Math.min(
          1,
          Math.max(
            0,
            (timestampMs - this.deletion.startedAtMs) / DELETION_DURATION_MS,
          ),
        )
      : undefined;
    this.landmarks.render({
      frame: this.currentFrame,
      source: this.mode === 'camera' ? this.elements.video : undefined,
      mirrorX: this.elements.mirror.checked,
      overlayVisible: this.elements.overlay.checked,
      selectedHandId: this.motionSignal.payload.ownerId,
      selectedLandmarkIndex: 9,
      timestampMs,
    });
    this.effect.render({
      objects: this.scene.objects,
      selectedIds:
        this.setPhase === 'preview' ? this.previewIds : this.scene.selectionIds,
      action: this.manipulationSignal.payload.action,
      aperture: corners,
      deletion:
        this.deletion && deletionProgress !== undefined
          ? { ids: this.deletion.ids, progress: deletionProgress }
          : undefined,
      timestampMs,
    });
    this.displayRequest = requestAnimationFrame(this.displayLoop);
  };

  private bindEvents(): void {
    this.elements.startCamera.addEventListener(
      'click',
      () => void this.startCamera(),
    );
    this.elements.startFixture.addEventListener('click', () =>
      this.startFixture(),
    );
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    this.elements.undo.addEventListener('click', () => this.undo());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'camera') this.stopForInactivity();
    });
    window.addEventListener('pagehide', () => this.dispose());
  }

  private async startCamera(): Promise<void> {
    if (!this.camera.supported) return;
    const operation = this.stopInput();
    this.resetSignals();
    this.mode = 'camera';
    this.elements.mirror.checked = true;
    this.setStatus('Waiting for camera permission. Nothing is recorded.');
    try {
      await this.camera.start();
      if (operation !== this.operationId) return;
      await this.tracker.ensureMode('VIDEO');
      if (operation !== this.operationId) return;
      this.setStatus(
        'Camera active. Build aperture, release, then transform selected set.',
      );
      this.scheduler.start();
    } catch (error) {
      if (operation !== this.operationId || isCameraAbort(error)) return;
      this.stopInput();
      this.mode = 'idle';
      this.setStatus(
        permissionDenied(error)
          ? 'Camera permission denied. Fixture remains available.'
          : 'Camera or local model failed. Retry or use fixture.',
      );
    }
  }

  private startFixture(): void {
    this.stopInput();
    this.resetSignals();
    this.mode = 'fixture';
    this.fixture.select(
      this.elements.scenario.value as ApertureObjectFixtureScenario,
      performance.now(),
    );
    this.lastFixtureTimestamp = -1;
    this.setStatus('Fixture playing. Camera and model are off.');
  }

  private processVideoFrame(timestampMs: number): number {
    if (this.mode !== 'camera') return 0;
    const frame = this.tracker.detectVideo(this.elements.video, timestampMs);
    this.monitor.markInference(timestampMs, frame.inferenceDurationMs);
    this.acceptFrame(frame);
    return frame.inferenceDurationMs;
  }

  private acceptFrame(
    frame: ObservationFrame,
    fixture?: ApertureObjectFixtureState,
  ): void {
    this.currentFrame = frame;
    this.apertureSignal = this.aperture.update(
      frame.observations,
      frame.timestampMs,
    );
    this.motionSignal = this.motion.update(
      frame.observations,
      frame.timestampMs,
    );
    this.matrixSignal = this.matrix.update(
      frame.observations,
      frame.timestampMs,
    );
    this.manipulationSignal = this.manipulation.update(
      this.motionSignal,
      this.matrixSignal,
      frame.timestampMs,
    );
    this.advanceSelection(frame.timestampMs);
    this.pointSignal = this.pointHold.update(
      this.matrixSignal,
      this.setPhase === 'ready' ? this.scene.selectionIds.length : 0,
    );
    this.clearSignal = this.clearHold.update(
      this.matrixSignal,
      this.setPhase === 'ready' && this.scene.selectionIds.length > 0,
    );
    if (this.pointSignal.payload.armed) this.beginDeletion(frame.timestampMs);
    if (this.clearSignal.payload.armed) this.clearSelection();
    this.applyTransform();
    this.elements.fixture.textContent =
      fixture?.label ?? `${frame.observations.length} hand evidence`;
    this.updateReadout();
  }

  private selectionInsideAperture(): readonly string[] {
    const corners = this.apertureSignal.payload.corners.map((point) =>
      displayPoint(point, this.elements.mirror.checked),
    );
    const bounds = this.elements.stage.getBoundingClientRect();
    return this.scene.objects
      .filter((object) =>
        this.scene.isInsidePolygon(
          object,
          corners,
          bounds.width / Math.max(1, bounds.height),
        ),
      )
      .map(({ id }) => id);
  }

  private advanceSelection(timestampMs: number): void {
    const aperturePresent =
      this.apertureSignal.phase === 'candidate' ||
      this.apertureSignal.phase === 'active';

    if (this.setPhase === 'select' && aperturePresent) {
      this.setPhase = 'preview';
      this.previewIds = this.selectionInsideAperture();
      this.apertureWasActive ||= this.apertureSignal.phase === 'active';
      this.neutralStartedAtMs = undefined;
      return;
    }

    if (this.setPhase === 'preview') {
      if (aperturePresent) {
        this.previewIds = this.selectionInsideAperture();
        this.apertureWasActive ||= this.apertureSignal.phase === 'active';
        return;
      }
      if (!this.apertureWasActive) {
        this.setPhase = 'select';
        this.previewIds = [];
        return;
      }
      this.commitPreviewSelection(timestampMs);
      this.apertureWasActive = false;
      this.previewIds = [];
      this.setPhase = 'neutral';
      this.neutralStartedAtMs = timestampMs;
      return;
    }

    // A committed set owns the interaction. New aperture candidates from a
    // two-hand span must never reopen preview or replace the selection.
    if (this.setPhase !== 'neutral') return;
    if (
      this.matrixSignal.phase === 'active' ||
      this.matrixSignal.phase === 'candidate'
    ) {
      this.neutralStartedAtMs = timestampMs;
      return;
    }
    if (
      timestampMs - (this.neutralStartedAtMs ?? timestampMs) >=
      NEUTRAL_DURATION_MS
    ) {
      if (this.scene.selectionIds.length === 0) {
        this.setPhase = 'select';
        this.setStatus('No cube committed. Build another aperture.');
      } else {
        this.setPhase = 'ready';
        this.setStatus(
          'Set armed. Pinch move, fist rotate, span scale. Point: index up, other fingers folded, hold 350 ms to delete.',
        );
      }
    }
  }

  private commitPreviewSelection(timestampMs: number): void {
    this.scene.selectIds(this.previewIds);
    this.resetCommandSignals(timestampMs);
    this.pointSignal = this.pointHold.reset(timestampMs);
    this.clearSignal = this.clearHold.reset(timestampMs);
    const selection = this.scene.selectionIds;
    this.setStatus(
      selection.length
        ? `${selection.length} cube${selection.length === 1 ? '' : 's'} selected. Release hands, then neutral.`
        : 'Aperture released empty. Selection cleared.',
    );
  }

  private applyTransform(): void {
    if (this.deletion || this.setPhase !== 'ready') return;
    const payload = this.manipulationSignal.payload;
    if (
      payload.reason !== 'action-acquired' &&
      payload.reason !== 'transforming'
    )
      return;
    if (payload.action === 'translate')
      this.scene.translate(
        this.elements.mirror.checked ? -payload.deltaX : payload.deltaX,
        payload.deltaY,
      );
    if (payload.action === 'rotate')
      this.scene.rotate(
        payload.rotationX,
        this.elements.mirror.checked ? -payload.rotationY : payload.rotationY,
      );
    if (payload.action === 'scale') this.scene.resize(payload.scaleFactor);
  }

  private resetCommandSignals(timestampMs: number): void {
    this.motion.reset();
    this.matrix.reset();
    this.manipulation.reset();
    this.motionSignal = this.motion.update([], timestampMs);
    this.matrixSignal = this.matrix.update([], timestampMs);
    this.manipulationSignal = this.manipulation.update(
      this.motionSignal,
      this.matrixSignal,
      timestampMs,
    );
  }

  private beginDeletion(timestampMs: number): void {
    if (this.deletion || this.scene.selectionIds.length === 0) return;
    this.deletion = {
      ids: [...this.scene.selectionIds],
      startedAtMs: timestampMs,
    };
    this.resetCommandSignals(timestampMs);
    this.setStatus('Point hold confirmed. Selected set is collapsing.');
  }

  private clearSelection(): void {
    this.scene.selectIds([]);
    this.setPhase = 'select';
    this.resetCommandSignals(this.clearSignal.timestampMs);
    this.setStatus('Open-palm hold cleared selection. Build a new aperture.');
  }

  private finishDeletion(timestampMs: number): void {
    if (
      !this.deletion ||
      timestampMs - this.deletion.startedAtMs < DELETION_DURATION_MS
    )
      return;
    this.lastDiscarded = this.scene.discardSelection();
    this.deletion = undefined;
    this.setPhase = 'select';
    this.resetCommandSignals(timestampMs);
    this.pointSignal = this.pointHold.reset(timestampMs);
    this.clearSignal = this.clearHold.reset(timestampMs);
    this.updateReadout();
    this.setStatus('Selected set deleted. Build aperture for remaining cubes.');
  }

  private undo(): void {
    if (!this.lastDiscarded || !this.scene.restoreSelection(this.lastDiscarded))
      return;
    this.lastDiscarded = undefined;
    const timestampMs = performance.now();
    this.setPhase = 'neutral';
    this.neutralStartedAtMs = timestampMs;
    this.resetCommandSignals(timestampMs);
    this.pointSignal = this.pointHold.reset(timestampMs);
    this.clearSignal = this.clearHold.reset(timestampMs);
    this.updateReadout();
    this.setStatus('Deleted set restored. Release hands, then neutral.');
  }

  private reset(): void {
    this.stopInput();
    this.mode = 'idle';
    this.scene.reset();
    this.scene.selectIds([]);
    this.lastDiscarded = undefined;
    this.deletion = undefined;
    this.resetSignals();
    this.updateReadout();
    this.setStatus('Scene reset. Camera permission has not been requested.');
  }

  private resetSignals(): void {
    this.apertureSignal = this.aperture.empty(0);
    this.motion.reset();
    this.matrix.reset();
    this.manipulation.reset();
    this.motionSignal = this.motion.update([], 0);
    this.matrixSignal = this.matrix.update([], 0);
    this.manipulationSignal = this.manipulation.update(
      this.motionSignal,
      this.matrixSignal,
      0,
    );
    this.pointSignal = this.pointHold.reset(0);
    this.clearSignal = this.clearHold.reset(0);
    this.setPhase = 'select';
    this.previewIds = [];
    this.apertureWasActive = false;
    this.neutralStartedAtMs = undefined;
  }

  private stopInput(): number {
    this.operationId += 1;
    this.scheduler.stop();
    this.camera.stop();
    return this.operationId;
  }

  private stopForInactivity(): void {
    this.stopInput();
    this.resetSignals();
    this.mode = 'idle';
    this.setStatus('Camera stopped because page became inactive.');
  }

  private handleTrackingError(): void {
    this.stopInput();
    this.mode = 'idle';
    this.setStatus('Tracking failed. Retry camera or use fixture.');
  }

  private updateReadout(): void {
    this.elements.root.dataset.active = String(this.mode !== 'idle');
    const visibleIds =
      this.setPhase === 'preview' ? this.previewIds : this.scene.selectionIds;
    this.elements.selected.textContent = visibleIds.length
      ? visibleIds.map((id) => id.toUpperCase()).join(', ')
      : 'NONE';
    this.elements.action.textContent =
      this.manipulationSignal.payload.action?.toUpperCase() ?? 'SELECT';
    this.elements.aperture.textContent =
      this.apertureSignal.phase.toUpperCase();
    this.elements.deletion.textContent = `${Math.round(this.pointSignal.payload.progress * 100)}%`;
    this.elements.clear.textContent = `${Math.round(this.clearSignal.payload.progress * 100)}%`;
    this.elements.setPhase.textContent = this.setPhase.toUpperCase();
    this.elements.count.textContent = `${this.scene.count} / ${this.scene.capacity}`;
    this.elements.undo.disabled = !this.lastDiscarded;
  }

  private setStatus(message: string): void {
    this.elements.status.textContent = message;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.displayRequest);
    this.stopInput();
  }
}
