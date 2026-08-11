import type {
  GestureSignal,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import { PerformanceMonitor } from '../engine/performance-monitor';
import {
  StateMatrixFixturePlayer,
  type StateMatrixFixtureScenario,
  type StateMatrixFixtureState,
} from '../engine/state-matrix-fixtures';
import { GestureMatrixEffect } from '../effects/gesture-matrix-effect';
import {
  GestureStateMatrix,
  MATRIX_GESTURES,
  type GestureStateMatrixPayload,
  type MatrixGesture,
} from '../gesture/gesture-state-matrix';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type MatrixMode = 'idle' | 'camera' | 'fixture';

interface ScoreElements {
  readonly row: HTMLElement;
  readonly meter: HTMLMeterElement;
  readonly value: HTMLElement;
}

interface MatrixElements {
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
  readonly winner: HTMLElement;
  readonly margin: HTMLElement;
  readonly owner: HTMLElement;
  readonly timer: HTMLElement;
  readonly reason: HTMLElement;
  readonly fixtureLabel: HTMLElement;
  readonly timeline: HTMLOListElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly reset: HTMLButtonElement;
  readonly scores: Readonly<Record<MatrixGesture, ScoreElements>>;
}

function scoreElements(gesture: MatrixGesture): ScoreElements {
  const row = required(`[data-matrix-score="${gesture}"]`, HTMLElement);
  return {
    row,
    meter: required('meter', HTMLMeterElement, row),
    value: required('[data-score-value]', HTMLElement, row),
  };
}

function required<TElement extends Element>(
  selector: string,
  type: { new (): TElement },
  root: ParentNode = document,
): TElement {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Required element is missing: ${selector}`);
  }
  return element;
}

function collectElements(): MatrixElements {
  return {
    root: required('#gesture-matrix', HTMLElement),
    landmarkCanvas: required('#matrix-landmarks', HTMLCanvasElement),
    effectCanvas: required('#matrix-effect', HTMLCanvasElement),
    video: required('#matrix-video', HTMLVideoElement),
    startCamera: required('#matrix-start-camera', HTMLButtonElement),
    startFixture: required('#matrix-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-matrix-input]'),
    ),
    scenario: required('#matrix-scenario', HTMLSelectElement),
    overlay: required('#matrix-overlay', HTMLInputElement),
    mirror: required('#matrix-mirror', HTMLInputElement),
    phase: required('#matrix-phase', HTMLElement),
    winner: required('#matrix-winner', HTMLElement),
    margin: required('#matrix-margin', HTMLElement),
    owner: required('#matrix-owner', HTMLElement),
    timer: required('#matrix-timer', HTMLElement),
    reason: required('#matrix-reason', HTMLElement),
    fixtureLabel: required('#matrix-fixture-label', HTMLElement),
    timeline: required('#matrix-timeline', HTMLOListElement),
    status: required('#matrix-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    reset: required('#matrix-reset', HTMLButtonElement),
    scores: Object.fromEntries(
      MATRIX_GESTURES.map((gesture) => [gesture, scoreElements(gesture)]),
    ) as Record<MatrixGesture, ScoreElements>,
  };
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

function label(gesture: MatrixGesture | undefined): string {
  return gesture?.replaceAll('-', ' ') ?? '—';
}

export class GestureStateMatrixExperience {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly effect = new GestureMatrixEffect(this.elements.effectCanvas);
  private readonly fixture = new StateMatrixFixturePlayer();
  private readonly monitor = new PerformanceMonitor();
  private readonly matrix = new GestureStateMatrix();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: MatrixMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private signal: GestureSignal<GestureStateMatrixPayload> = this.matrix.update(
    [],
    0,
  );
  private lastFixtureTimestamp = -1;
  private lastTransitionKey = '';
  private readonly transitions: string[] = [];
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
      selectedHandId: this.signal.payload.primaryHandId,
      selectedLandmarkIndex: this.selectedLandmark(),
      timestampMs,
    });
    this.effect.render(this.signal, timestampMs);
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
        if (button.dataset.matrixInput === 'camera') void this.startCamera();
        if (button.dataset.matrixInput === 'fixture') this.startFixture();
      });
    });
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'camera') return;
      this.stopInput();
      this.matrix.reset();
      this.signal = this.matrix.update([], performance.now());
      this.setMode('idle');
      this.setStatus(
        'camera-stopped',
        'Camera stopped because the page became inactive.',
      );
      this.updateReadout();
    });
    window.addEventListener('pagehide', () => this.dispose());
  }

  private configureCamera(): void {
    this.elements.startCamera.disabled = !this.camera.supported;
    const cameraButton = this.elements.modeButtons.find(
      ({ dataset }) => dataset.matrixInput === 'camera',
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
    this.resetEvidence();
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
        'Camera active. Hold one gesture until the timed gate confirms it.',
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
    this.resetEvidence();
    this.setMode('fixture');
    this.elements.mirror.checked =
      this.elements.scenario.value === 'left-mirrored';
    this.fixture.select(
      this.elements.scenario.value as StateMatrixFixtureScenario,
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
    fixtureState?: StateMatrixFixtureState,
  ): void {
    this.currentFrame = frame;
    this.signal = this.matrix.update(frame.observations, frame.timestampMs);
    this.elements.fixtureLabel.textContent =
      fixtureState?.label ?? `${frame.observations.length} hand evidence`;
    this.recordTransition();
    this.updateReadout();

    if (this.mode === 'camera') {
      const performance = this.monitor.snapshot();
      const hands = frame.observations.length;
      this.setStatus(
        'tracking',
        hands === 0
          ? 'Camera active. No hand detected.'
          : `Tracking ${hands} hand${hands === 1 ? '' : 's'} on-device · ${performance.medianInferenceMs ? `${performance.medianInferenceMs.toFixed(1)} ms median` : 'warming up'}.`,
      );
    }
  }

  private recordTransition(): void {
    const key = `${this.signal.phase}:${this.signal.payload.gesture ?? 'none'}:${this.signal.payload.reason}`;
    if (key === this.lastTransitionKey) return;
    this.lastTransitionKey = key;
    const time = (this.signal.timestampMs / 1000).toFixed(2);
    this.transitions.unshift(
      `${time}s · ${this.signal.phase} · ${label(this.signal.payload.gesture)} · ${this.signal.payload.reason.replaceAll('-', ' ')}`,
    );
    this.transitions.splice(6);
    this.elements.timeline.replaceChildren(
      ...this.transitions.map((transition) => {
        const item = document.createElement('li');
        item.textContent = transition;
        return item;
      }),
    );
  }

  private updateReadout(): void {
    const payload = this.signal.payload;
    this.elements.root.dataset.phase = this.signal.phase;
    this.elements.root.dataset.gesture = payload.gesture ?? 'none';
    this.elements.phase.textContent = this.signal.phase.toUpperCase();
    this.elements.winner.textContent = label(payload.winner).toUpperCase();
    this.elements.margin.textContent = payload.margin.toFixed(3);
    this.elements.owner.textContent = payload.secondaryHandId
      ? `${payload.primaryHandId ?? '—'} + ${payload.secondaryHandId}`
      : (payload.primaryHandId ?? '—');
    this.elements.timer.textContent =
      this.signal.phase === 'candidate'
        ? `${Math.round(payload.activationProgress * 140)} / 140 ms`
        : this.signal.phase === 'active' && payload.releaseProgress > 0
          ? `${Math.round(payload.releaseProgress * 100)} / 100 ms release`
          : '—';
    this.elements.reason.textContent = payload.reason.replaceAll('-', ' ');

    MATRIX_GESTURES.forEach((gesture) => {
      const elements = this.elements.scores[gesture];
      const score = payload.scores[gesture];
      elements.meter.value = score;
      elements.value.textContent = score.toFixed(3);
      elements.row.dataset.winner = String(payload.winner === gesture);
      elements.row.dataset.active = String(payload.gesture === gesture);
    });
  }

  private reset(): void {
    this.stopInput();
    this.resetEvidence();
    this.setMode('idle');
    this.currentFrame = undefined;
    this.elements.fixtureLabel.textContent = 'No evidence selected';
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
    this.elements.startCamera.focus();
  }

  private resetEvidence(): void {
    this.matrix.reset();
    this.signal = this.matrix.update([], performance.now());
    this.effect.reset();
    this.transitions.length = 0;
    this.lastTransitionKey = '';
    this.elements.timeline.replaceChildren();
    this.updateReadout();
  }

  private setMode(mode: MatrixMode): void {
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.matrixInput === mode;
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

  private selectedLandmark(): number {
    switch (this.signal.payload.winner) {
      case 'pinch':
      case 'point':
        return 8;
      case 'fist':
        return 12;
      case 'open-palm':
        return 9;
      case 'two-hand-span':
      case undefined:
        return 0;
    }
  }

  private handleTrackingError(): void {
    this.stopInput();
    this.resetEvidence();
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
