import type {
  GestureSignal,
  HandTracker,
  NormalizedPoint,
  ObservationFrame,
} from '../engine/contracts';
import {
  ObjectBenchFixturePlayer,
  type ObjectBenchFixtureScenario,
  type ObjectBenchFixtureState,
} from '../engine/object-bench-fixtures';
import { ObjectScene } from '../engine/object-scene';
import { PerformanceMonitor } from '../engine/performance-monitor';
import { ObjectBenchEffect } from '../effects/object-bench-effect';
import {
  DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
  GestureStateMatrix,
  type GestureStateMatrixPayload,
} from '../gesture/gesture-state-matrix';
import {
  ObjectManipulationSignal,
  type ObjectManipulationAction,
  type ObjectManipulationPayload,
} from '../gesture/object-manipulation-signal';
import {
  PalmMotionSignal,
  type MotionSignalPayload,
} from '../gesture/motion-signal';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type ObjectBenchInputMode = 'idle' | 'camera' | 'fixture';

interface ObjectBenchElements {
  readonly root: HTMLElement;
  readonly landmarkCanvas: HTMLCanvasElement;
  readonly objectCanvas: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly scenario: HTMLSelectElement;
  readonly overlay: HTMLInputElement;
  readonly mirror: HTMLInputElement;
  readonly toolButtons: readonly HTMLButtonElement[];
  readonly action: HTMLElement;
  readonly gesture: HTMLElement;
  readonly phase: HTMLElement;
  readonly owner: HTMLElement;
  readonly reason: HTMLElement;
  readonly position: HTMLElement;
  readonly rotation: HTMLElement;
  readonly scale: HTMLElement;
  readonly fixtureLabel: HTMLElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly reset: HTMLButtonElement;
}

function required<TElement extends Element>(
  selector: string,
  type: { new (): TElement },
): TElement {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Required element is missing: ${selector}`);
  }
  return element;
}

function collectElements(): ObjectBenchElements {
  return {
    root: required('#object-bench', HTMLElement),
    landmarkCanvas: required('#object-landmarks', HTMLCanvasElement),
    objectCanvas: required('#object-stage', HTMLCanvasElement),
    video: required('#object-video', HTMLVideoElement),
    startCamera: required('#object-start-camera', HTMLButtonElement),
    startFixture: required('#object-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-object-input]'),
    ),
    scenario: required('#object-scenario', HTMLSelectElement),
    overlay: required('#object-overlay', HTMLInputElement),
    mirror: required('#object-mirror', HTMLInputElement),
    toolButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-object-tool]'),
    ),
    action: required('#object-action', HTMLElement),
    gesture: required('#object-gesture', HTMLElement),
    phase: required('#object-phase', HTMLElement),
    owner: required('#object-owner', HTMLElement),
    reason: required('#object-reason', HTMLElement),
    position: required('#object-position', HTMLElement),
    rotation: required('#object-rotation', HTMLElement),
    scale: required('#object-scale', HTMLElement),
    fixtureLabel: required('#object-fixture-label', HTMLElement),
    status: required('#object-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    reset: required('#object-reset', HTMLButtonElement),
  };
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

function label(value: string | undefined): string {
  return value?.replaceAll('-', ' ') ?? '-';
}

function displayCursor(
  point: NormalizedPoint | undefined,
  mirrorX: boolean,
): NormalizedPoint | undefined {
  return point ? { x: mirrorX ? 1 - point.x : point.x, y: point.y } : undefined;
}

function compactViewport(): boolean {
  return window.matchMedia('(max-width: 680px), (max-height: 520px)').matches;
}

export class ObjectManipulationBenchExperience {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly effect = new ObjectBenchEffect(this.elements.objectCanvas);
  private readonly fixture = new ObjectBenchFixturePlayer();
  private readonly monitor = new PerformanceMonitor();
  private readonly matrix = new GestureStateMatrix({
    ...DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
    spanContinuationRatio: 1.45,
    spanActivationRatio: 2.45,
  });
  private readonly motion = new PalmMotionSignal();
  private readonly manipulation = new ObjectManipulationSignal();
  private readonly scene = new ObjectScene(1);
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: ObjectBenchInputMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private motionSignal: GestureSignal<MotionSignalPayload> = this.motion.update(
    [],
    0,
  );
  private matrixSignal: GestureSignal<GestureStateMatrixPayload> =
    this.matrix.update([], 0);
  private manipulationSignal: GestureSignal<ObjectManipulationPayload> =
    this.manipulation.update(this.motionSignal, this.matrixSignal, 0);
  private pointerTool: ObjectManipulationAction = 'translate';
  private pointerDragging = false;
  private pointerPrevious: NormalizedPoint | undefined;
  private lastFixtureTimestamp = -1;
  private displayRequest = 0;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly tracker: HandTracker) {
    this.camera = new CameraSource(this.elements.video);
    this.scheduler = new VideoFrameScheduler(
      this.elements.video,
      (timestampMs) => this.processVideoFrame(timestampMs),
      () => this.handleTrackingError(),
    );
    if (compactViewport()) {
      this.elements.overlay.checked = false;
    }
    this.bindEvents();
    this.configureCamera();
    this.updateReadout();
    this.displayRequest = requestAnimationFrame(this.displayLoop);
  }

  private readonly displayLoop = (timestampMs: number): void => {
    if (this.disposed) return;
    this.monitor.markDisplay(timestampMs);
    if (this.mode === 'fixture') {
      const state = this.fixture.frame(timestampMs);
      if (state.frame.timestampMs !== this.lastFixtureTimestamp) {
        this.lastFixtureTimestamp = state.frame.timestampMs;
        this.acceptFrame(state.frame, state);
      }
    }
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
      selectedId: this.scene.selected?.id,
      cursor: displayCursor(
        this.manipulationSignal.payload.cursor,
        this.elements.mirror.checked,
      ),
      action: this.manipulationSignal.payload.action,
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
    this.elements.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.objectInput === 'camera') void this.startCamera();
        if (button.dataset.objectInput === 'fixture') this.startFixture();
      });
    });
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.toolButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.pointerTool = button.dataset
          .objectTool as ObjectManipulationAction;
        this.updateToolButtons();
      });
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    this.elements.objectCanvas.addEventListener('pointerdown', (event) =>
      this.pointerStart(event),
    );
    this.elements.objectCanvas.addEventListener('pointermove', (event) =>
      this.pointerMove(event),
    );
    this.elements.objectCanvas.addEventListener('pointerup', (event) =>
      this.pointerEnd(event),
    );
    this.elements.objectCanvas.addEventListener('pointercancel', (event) =>
      this.pointerEnd(event),
    );
    this.elements.objectCanvas.addEventListener('lostpointercapture', (event) =>
      this.pointerEnd(event),
    );
    window.addEventListener('pointerup', (event) => this.pointerEnd(event));
    window.addEventListener('pointercancel', (event) => this.pointerEnd(event));
    document.addEventListener('keydown', (event) => this.handleKeyboard(event));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'camera') return;
      this.stopInput();
      this.resetSignals();
      this.setMode('idle');
      this.setStatus(
        'camera-stopped',
        'Camera stopped because the page became inactive.',
      );
    });
    window.addEventListener('pagehide', () => this.dispose());
  }

  private configureCamera(): void {
    this.elements.startCamera.disabled = !this.camera.supported;
    const cameraButton = this.elements.modeButtons.find(
      ({ dataset }) => dataset.objectInput === 'camera',
    );
    if (cameraButton) cameraButton.disabled = !this.camera.supported;
    if (!this.camera.supported) {
      this.setStatus(
        'camera-unavailable',
        'Camera API unavailable. Deterministic fixture remains available.',
      );
    }
  }

  private async startCamera(): Promise<void> {
    if (!this.camera.supported) {
      this.setStatus(
        'camera-unavailable',
        'Camera API unavailable. Deterministic fixture remains available.',
      );
      return;
    }
    const operation = this.stopInput();
    this.resetSignals();
    this.setMode('camera');
    this.elements.mirror.checked = true;
    this.setStatus(
      'requesting-camera',
      'Waiting for camera permission. Nothing is recorded.',
    );
    try {
      await this.camera.start();
      if (operation !== this.operationId) return;
      this.setStatus('loading-model', 'Loading the local hand model…');
      await this.tracker.ensureMode('VIDEO');
      if (operation !== this.operationId) return;
      this.setStatus(
        'tracking',
        'Camera active. Pinch and move to translate; close fist and move to rotate; spread two open palms to scale.',
      );
      this.scheduler.start();
    } catch (error) {
      if (operation !== this.operationId || isCameraAbort(error)) return;
      this.stopInput();
      this.setMode('idle');
      this.setStatus(
        permissionDenied(error) ? 'permission-denied' : 'camera-error',
        permissionDenied(error)
          ? 'Camera permission denied. Change browser permission or use the fixture.'
          : 'Camera or local model could not start. Retry or use the fixture.',
      );
    }
  }

  private startFixture(): void {
    this.stopInput();
    this.resetSignals();
    this.setMode('fixture');
    this.elements.mirror.checked =
      this.elements.scenario.value === 'left-mirrored';
    this.fixture.select(
      this.elements.scenario.value as ObjectBenchFixtureScenario,
      performance.now(),
    );
    this.lastFixtureTimestamp = -1;
    this.setStatus(
      'fixture',
      `Fixture playing: ${this.scenarioLabel()}. Camera and model are off.`,
    );
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
    fixtureState?: ObjectBenchFixtureState,
  ): void {
    this.currentFrame = frame;
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
    this.applyGestureTransform();
    this.elements.fixtureLabel.textContent =
      fixtureState?.label ?? `${frame.observations.length} hand evidence`;
    this.updateReadout();

    if (this.mode === 'camera') {
      const snapshot = this.monitor.snapshot();
      const hands = frame.observations.length;
      this.setStatus(
        'tracking',
        hands === 0
          ? 'Camera active. No hand detected; scene is frozen.'
          : `Tracking ${hands} hand${hands === 1 ? '' : 's'} on-device · ${snapshot.medianInferenceMs ? `${snapshot.medianInferenceMs.toFixed(1)} ms median` : 'warming up'}.`,
      );
    }
  }

  private applyGestureTransform(): void {
    if (this.pointerDragging) return;
    const payload = this.manipulationSignal.payload;
    if (
      payload.reason === 'action-acquired' ||
      payload.reason === 'transforming'
    ) {
      if (payload.action === 'translate') {
        this.scene.translate(
          this.elements.mirror.checked ? -payload.deltaX : payload.deltaX,
          payload.deltaY,
        );
      }
      if (payload.action === 'rotate') {
        this.scene.rotate(
          payload.rotationX,
          this.elements.mirror.checked ? -payload.rotationY : payload.rotationY,
        );
      }
      if (payload.action === 'scale') this.scene.resize(payload.scaleFactor);
    }
  }

  private pointerStart(event: PointerEvent): void {
    const point = this.pointerPoint(event);
    if (!this.scene.selected) return;
    this.pointerDragging = true;
    this.pointerPrevious = point;
    this.elements.objectCanvas.setPointerCapture(event.pointerId);
    this.updateReadout();
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.pointerDragging || !this.pointerPrevious) return;
    const point = this.pointerPoint(event);
    const deltaX = point.x - this.pointerPrevious.x;
    const deltaY = point.y - this.pointerPrevious.y;
    this.pointerPrevious = point;
    if (this.pointerTool === 'translate') this.scene.translate(deltaX, deltaY);
    if (this.pointerTool === 'rotate') {
      this.scene.rotate(deltaY * 4, deltaX * 4);
    }
    if (this.pointerTool === 'scale') {
      this.scene.resize(Math.min(1.08, Math.max(0.92, 1 - deltaY * 2)));
    }
    this.updateReadout();
  }

  private pointerEnd(event: PointerEvent): void {
    if (!this.pointerDragging) return;
    this.pointerDragging = false;
    this.pointerPrevious = undefined;
    if (this.elements.objectCanvas.hasPointerCapture(event.pointerId)) {
      this.elements.objectCanvas.releasePointerCapture(event.pointerId);
    }
  }

  private pointerPoint(event: PointerEvent): NormalizedPoint {
    const bounds = this.elements.objectCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  private handleKeyboard(event: KeyboardEvent): void {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      this.applyKeyboardArrow(event.key);
    } else if (event.key === '+' || event.key === '=') this.scene.resize(1.05);
    else if (event.key === '-' || event.key === '_') this.scene.resize(0.95);
    else return;
    this.updateReadout();
  }

  private applyKeyboardArrow(key: string): void {
    const horizontal = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    const vertical = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    if (this.pointerTool === 'translate') {
      this.scene.translate(horizontal * 0.025, vertical * 0.025);
    }
    if (this.pointerTool === 'rotate') {
      this.scene.rotate(vertical * 0.09, horizontal * 0.09);
    }
    if (this.pointerTool === 'scale' && vertical !== 0) {
      this.scene.resize(vertical < 0 ? 1.05 : 0.95);
    }
  }

  private updateReadout(): void {
    const selected = this.scene.selected;
    const payload = this.manipulationSignal.payload;
    this.elements.root.dataset.active = String(this.mode !== 'idle');
    this.elements.root.dataset.action = payload.action ?? 'none';
    this.elements.action.textContent = label(payload.action).toUpperCase();
    this.elements.gesture.textContent = label(
      this.matrixSignal.payload.gesture,
    ).toUpperCase();
    this.elements.phase.textContent =
      this.manipulationSignal.phase.toUpperCase();
    this.elements.owner.textContent = payload.ownerId ?? '-';
    this.elements.reason.textContent = label(payload.reason);
    this.elements.position.textContent = selected
      ? `${selected.x.toFixed(2)}, ${selected.y.toFixed(2)}`
      : '-';
    this.elements.rotation.textContent = selected
      ? `${selected.rotationX.toFixed(2)}, ${selected.rotationY.toFixed(2)}`
      : '-';
    this.elements.scale.textContent = selected?.scale.toFixed(2) ?? '-';
    this.updateToolButtons();
  }

  private updateToolButtons(): void {
    this.elements.toolButtons.forEach((button) => {
      const selected = button.dataset.objectTool === this.pointerTool;
      button.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  private reset(): void {
    this.stopInput();
    this.resetSignals();
    this.scene.reset();
    this.setMode('idle');
    this.currentFrame = undefined;
    this.elements.fixtureLabel.textContent = 'No manipulation selected';
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
    this.elements.startCamera.focus();
    this.updateReadout();
  }

  private resetSignals(): void {
    this.motion.reset();
    this.matrix.reset();
    this.manipulation.reset();
    const timestampMs = performance.now();
    this.motionSignal = this.motion.update([], timestampMs);
    this.matrixSignal = this.matrix.update([], timestampMs);
    this.manipulationSignal = this.manipulation.update(
      this.motionSignal,
      this.matrixSignal,
      timestampMs,
    );
    this.updateReadout();
  }

  private setMode(mode: ObjectBenchInputMode): void {
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.objectInput === mode;
      button.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  private setStatus(state: string, text: string): void {
    this.elements.statusLine.dataset.state = state;
    this.elements.status.textContent = text;
  }

  private scenarioLabel(): string {
    return (
      this.elements.scenario.selectedOptions[0]?.textContent?.trim() ??
      this.elements.scenario.value
    );
  }

  private handleTrackingError(): void {
    this.stopInput();
    this.resetSignals();
    this.setMode('idle');
    this.setStatus(
      'tracking-error',
      'Tracking failed. Camera stopped; deterministic fixture remains available.',
    );
  }

  private stopInput(): number {
    this.operationId += 1;
    this.scheduler.stop();
    this.camera.stop();
    return this.operationId;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.displayRequest);
    this.stopInput();
    this.monitor.dispose();
    this.tracker.close();
  }
}
