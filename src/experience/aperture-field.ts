import type {
  GestureSignal,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import {
  ApertureFixturePlayer,
  type ApertureFixtureScenario,
  type ApertureFixtureState,
} from '../engine/aperture-fixtures';
import { PerformanceMonitor } from '../engine/performance-monitor';
import {
  APERTURE_EFFECTS,
  ApertureFieldEffect,
  type ApertureEffectKind,
} from '../effects/aperture-field-effect';
import {
  ApertureFieldRecognizer,
  type AperturePayload,
} from '../gesture/aperture-field';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type InputMode = 'idle' | 'camera' | 'fixture';

interface Elements {
  readonly root: HTMLElement;
  readonly landmarks: HTMLCanvasElement;
  readonly effectCanvas: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly scenario: HTMLSelectElement;
  readonly effect: HTMLSelectElement;
  readonly overlay: HTMLInputElement;
  readonly mirror: HTMLInputElement;
  readonly phase: HTMLElement;
  readonly area: HTMLElement;
  readonly tension: HTMLElement;
  readonly hands: HTMLElement;
  readonly reason: HTMLElement;
  readonly fixtureLabel: HTMLElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly reset: HTMLButtonElement;
}

function required<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type))
    throw new Error(`Required element is missing: ${selector}`);
  return element;
}

function collectElements(): Elements {
  return {
    root: required('#aperture-field', HTMLElement),
    landmarks: required('#aperture-landmarks', HTMLCanvasElement),
    effectCanvas: required('#aperture-effect', HTMLCanvasElement),
    video: required('#aperture-video', HTMLVideoElement),
    startCamera: required('#aperture-start-camera', HTMLButtonElement),
    startFixture: required('#aperture-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-aperture-input]'),
    ),
    scenario: required('#aperture-scenario', HTMLSelectElement),
    effect: required('#aperture-effect-select', HTMLSelectElement),
    overlay: required('#aperture-overlay', HTMLInputElement),
    mirror: required('#aperture-mirror', HTMLInputElement),
    phase: required('#aperture-phase', HTMLElement),
    area: required('#aperture-area', HTMLElement),
    tension: required('#aperture-tension', HTMLElement),
    hands: required('#aperture-hands', HTMLElement),
    reason: required('#aperture-reason', HTMLElement),
    fixtureLabel: required('#aperture-fixture-label', HTMLElement),
    status: required('#aperture-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    reset: required('#aperture-reset', HTMLButtonElement),
  };
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

export class ApertureFieldExperience {
  private readonly elements = collectElements();
  private readonly landmarkRenderer = new LandmarkRenderer(
    this.elements.landmarks,
  );
  private readonly effectRenderer = new ApertureFieldEffect(
    this.elements.effectCanvas,
  );
  private readonly fixture = new ApertureFixturePlayer();
  private readonly recognizer = new ApertureFieldRecognizer();
  private readonly monitor = new PerformanceMonitor();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: InputMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private signal: GestureSignal<AperturePayload>;
  private lastFixtureTimestamp = -1;
  private displayRequest = 0;
  private operationId = 0;
  private disposed = false;

  constructor(private readonly tracker: HandTracker) {
    this.signal = this.recognizer.empty(0);
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
    this.landmarkRenderer.render({
      frame: this.currentFrame,
      source: this.mode === 'camera' ? this.elements.video : undefined,
      mirrorX: this.elements.mirror.checked,
      overlayVisible: this.elements.overlay.checked,
      selectedHandId: this.signal.payload.handIds[0],
      selectedLandmarkIndex: 8,
      timestampMs,
    });
    this.effectRenderer.render(
      this.signal,
      this.elements.effect.value as ApertureEffectKind,
      this.mode === 'camera' ? this.elements.video : undefined,
      this.elements.mirror.checked,
      timestampMs,
    );
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
    this.elements.modeButtons.forEach((button) =>
      button.addEventListener('click', () => {
        if (button.dataset.apertureInput === 'camera') void this.startCamera();
        if (button.dataset.apertureInput === 'fixture') this.startFixture();
      }),
    );
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.effect.addEventListener('change', () => {
      const selected = this.elements.effect.value as ApertureEffectKind;
      if (!APERTURE_EFFECTS.includes(selected))
        this.elements.effect.value = 'refraction';
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'camera') return;
      this.stopInput();
      this.resetEvidence();
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
    const button = this.elements.modeButtons.find(
      ({ dataset }) => dataset.apertureInput === 'camera',
    );
    if (button) button.disabled = !this.camera.supported;
    if (!this.camera.supported)
      this.setStatus(
        'camera-unavailable',
        'Camera API unavailable. Deterministic fixture remains available.',
      );
  }

  private async startCamera(): Promise<void> {
    if (!this.camera.supported) return;
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
        'Camera active. Hold two open hand apertures until field confirms.',
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
      this.elements.scenario.value as ApertureFixtureScenario,
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
    fixtureState?: ApertureFixtureState,
  ): void {
    this.currentFrame = frame;
    this.signal = this.recognizer.update(frame.observations, frame.timestampMs);
    this.elements.fixtureLabel.textContent =
      fixtureState?.label ?? `${frame.observations.length} hand evidence`;
    this.updateReadout();
    if (this.mode === 'camera') {
      this.setStatus(
        'tracking',
        frame.observations.length === 0
          ? 'Camera active. No hand detected.'
          : 'Camera active. Keep both apertures open until field confirms.',
      );
    }
  }

  private updateReadout(): void {
    const payload = this.signal.payload;
    this.elements.root.dataset.phase = this.signal.phase;
    this.elements.phase.textContent = this.signal.phase.toUpperCase();
    this.elements.area.textContent = payload.area.toFixed(2);
    this.elements.tension.textContent = payload.tension.toFixed(2);
    this.elements.hands.textContent = payload.handIds.length
      ? payload.handIds.join(' + ')
      : '—';
    this.elements.reason.textContent = payload.reason.replaceAll('-', ' ');
  }

  private reset(): void {
    this.stopInput();
    this.resetEvidence();
    this.setMode('idle');
    this.currentFrame = undefined;
    this.elements.fixtureLabel.textContent = 'No aperture selected';
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
    this.elements.startCamera.focus();
  }

  private resetEvidence(): void {
    this.recognizer.reset();
    this.signal = this.recognizer.empty(performance.now());
    this.effectRenderer.reset();
    this.updateReadout();
  }

  private setMode(mode: InputMode): void {
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.apertureInput === mode;
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
