import type {
  GestureSignal,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import {
  MotionFieldFixturePlayer,
  type MotionFieldFixtureScenario,
  type MotionFieldFixtureState,
} from '../engine/motion-field-fixtures';
import { PerformanceMonitor } from '../engine/performance-monitor';
import {
  MotionFieldEffect,
  motionFieldMode,
} from '../effects/motion-field-effect';
import {
  GestureStateMatrix,
  type GestureStateMatrixPayload,
} from '../gesture/gesture-state-matrix';
import {
  PalmMotionSignal,
  type MotionSignalPayload,
} from '../gesture/motion-signal';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type MotionFieldInputMode = 'idle' | 'camera' | 'fixture';

interface MotionFieldElements {
  readonly root: HTMLElement;
  readonly landmarkCanvas: HTMLCanvasElement;
  readonly effectCanvas: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly scenario: HTMLSelectElement;
  readonly overlay: HTMLInputElement;
  readonly mirror: HTMLInputElement;
  readonly phase: HTMLElement;
  readonly speed: HTMLElement;
  readonly palmSpeed: HTMLElement;
  readonly vector: HTMLElement;
  readonly owner: HTMLElement;
  readonly reason: HTMLElement;
  readonly gesture: HTMLElement;
  readonly fieldMode: HTMLElement;
  readonly particles: HTMLElement;
  readonly performance: HTMLElement;
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

function collectElements(): MotionFieldElements {
  return {
    root: required('#motion-field', HTMLElement),
    landmarkCanvas: required('#motion-landmarks', HTMLCanvasElement),
    effectCanvas: required('#motion-effect', HTMLCanvasElement),
    video: required('#motion-video', HTMLVideoElement),
    startCamera: required('#motion-start-camera', HTMLButtonElement),
    startFixture: required('#motion-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-motion-input]'),
    ),
    scenario: required('#motion-scenario', HTMLSelectElement),
    overlay: required('#motion-overlay', HTMLInputElement),
    mirror: required('#motion-mirror', HTMLInputElement),
    phase: required('#motion-phase', HTMLElement),
    speed: required('#motion-speed', HTMLElement),
    palmSpeed: required('#motion-palm-speed', HTMLElement),
    vector: required('#motion-vector', HTMLElement),
    owner: required('#motion-owner', HTMLElement),
    reason: required('#motion-reason', HTMLElement),
    gesture: required('#motion-gesture', HTMLElement),
    fieldMode: required('#motion-field-mode', HTMLElement),
    particles: required('#motion-particles', HTMLElement),
    performance: required('#motion-performance', HTMLElement),
    fixtureLabel: required('#motion-fixture-label', HTMLElement),
    status: required('#motion-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    reset: required('#motion-reset', HTMLButtonElement),
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

export class MotionFieldExperience {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly effect = new MotionFieldEffect(this.elements.effectCanvas);
  private readonly fixture = new MotionFieldFixturePlayer();
  private readonly monitor = new PerformanceMonitor();
  private readonly matrix = new GestureStateMatrix();
  private readonly motion = new PalmMotionSignal();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: MotionFieldInputMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private motionSignal: GestureSignal<MotionSignalPayload> = this.motion.update(
    [],
    0,
  );
  private matrixSignal: GestureSignal<GestureStateMatrixPayload> =
    this.matrix.update([], 0);
  private lastFixtureTimestamp = -1;
  private lastLiveReadoutAtMs = -Infinity;
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
    this.effect.render(
      this.motionSignal,
      this.matrixSignal,
      timestampMs,
      this.elements.mirror.checked,
    );
    if (timestampMs - this.lastLiveReadoutAtMs >= 120) {
      this.lastLiveReadoutAtMs = timestampMs;
      this.updateLiveReadout();
    }
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
        if (button.dataset.motionInput === 'camera') void this.startCamera();
        if (button.dataset.motionInput === 'fixture') this.startFixture();
      });
    });
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.reset.addEventListener('click', () => this.reset());
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
      ({ dataset }) => dataset.motionInput === 'camera',
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
        'Camera active. Move one open hand through the frame.',
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
      this.elements.scenario.value as MotionFieldFixtureScenario,
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
    fixtureState?: MotionFieldFixtureState,
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
    this.elements.fixtureLabel.textContent =
      fixtureState?.label ?? `${frame.observations.length} hand evidence`;
    this.updateReadout();

    if (this.mode === 'camera') {
      const snapshot = this.monitor.snapshot();
      const hands = frame.observations.length;
      this.setStatus(
        'tracking',
        hands === 0
          ? 'Camera active. No hand detected.'
          : `Tracking ${hands} hand${hands === 1 ? '' : 's'} on-device · ${snapshot.medianInferenceMs ? `${snapshot.medianInferenceMs.toFixed(1)} ms median` : 'warming up'}.`,
      );
    }
  }

  private updateReadout(): void {
    const payload = this.motionSignal.payload;
    this.elements.root.dataset.active = String(this.mode !== 'idle');
    this.elements.root.dataset.motionPhase = this.motionSignal.phase;
    this.elements.phase.textContent = this.motionSignal.phase.toUpperCase();
    this.elements.speed.textContent = payload.speed.toFixed(3);
    this.elements.palmSpeed.textContent = payload.palmRelativeSpeed.toFixed(2);
    this.elements.vector.textContent = `${payload.velocityX.toFixed(2)}, ${payload.velocityY.toFixed(2)}`;
    this.elements.owner.textContent = payload.ownerId ?? '-';
    this.elements.reason.textContent = label(payload.reason);
    this.elements.gesture.textContent = label(
      this.matrixSignal.payload.gesture,
    ).toUpperCase();
    this.elements.fieldMode.textContent = motionFieldMode(
      this.matrixSignal,
    ).toUpperCase();
  }

  private updateLiveReadout(): void {
    this.elements.particles.textContent = String(this.effect.particleCount);
    const snapshot = this.monitor.snapshot();
    this.elements.performance.textContent = `${snapshot.displayFps.toFixed(0)} / ${snapshot.inferenceFps.toFixed(0)} fps`;
  }

  private reset(): void {
    this.stopInput();
    this.resetSignals();
    this.setMode('idle');
    this.currentFrame = undefined;
    this.elements.fixtureLabel.textContent = 'No motion selected';
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
    this.elements.startCamera.focus();
  }

  private resetSignals(): void {
    this.motion.reset();
    this.matrix.reset();
    const timestampMs = performance.now();
    this.motionSignal = this.motion.update([], timestampMs);
    this.matrixSignal = this.matrix.update([], timestampMs);
    this.effect.reset();
    this.updateReadout();
    this.updateLiveReadout();
  }

  private setMode(mode: MotionFieldInputMode): void {
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.motionInput === mode;
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
