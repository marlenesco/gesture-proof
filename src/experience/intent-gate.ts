import type {
  GestureSignal,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import { PerformanceMonitor } from '../engine/performance-monitor';
import {
  PinchFixturePlayer,
  type PinchFixtureScenario,
} from '../engine/pinch-fixtures';
import { IntentGateEffect } from '../effects/intent-gate-effect';
import {
  PinchRecognizer,
  type PinchPayload,
} from '../gesture/pinch-recognizer';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type GateMode = 'idle' | 'camera' | 'fixture';

interface GateElements {
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
  readonly reset: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly phase: HTMLElement;
  readonly confidence: HTMLElement;
  readonly ratio: HTMLElement;
  readonly activation: HTMLMeterElement;
  readonly activationValue: HTMLElement;
  readonly release: HTMLMeterElement;
  readonly releaseValue: HTMLElement;
  readonly reason: HTMLElement;
  readonly hand: HTMLElement;
  readonly inference: HTMLElement;
  readonly timeline: HTMLOListElement;
}

function required<TElement extends Element>(
  selector: string,
  type: { new (): TElement },
): TElement {
  const element = document.querySelector(selector);
  if (!(element instanceof type))
    throw new Error(`Required element is missing: ${selector}`);
  return element;
}

function collectElements(): GateElements {
  return {
    root: required('#intent-gate', HTMLElement),
    landmarkCanvas: required('#gate-landmarks', HTMLCanvasElement),
    effectCanvas: required('#gate-effect', HTMLCanvasElement),
    video: required('#gate-video', HTMLVideoElement),
    startCamera: required('#gate-start-camera', HTMLButtonElement),
    startFixture: required('#gate-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-gate-input]'),
    ),
    scenario: required('#gate-scenario', HTMLSelectElement),
    overlay: required('#gate-overlay', HTMLInputElement),
    mirror: required('#gate-mirror', HTMLInputElement),
    reset: required('#gate-reset', HTMLButtonElement),
    status: required('#gate-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    phase: required('#gate-phase', HTMLElement),
    confidence: required('#gate-confidence', HTMLElement),
    ratio: required('#gate-ratio', HTMLElement),
    activation: required('#gate-activation', HTMLMeterElement),
    activationValue: required('#gate-activation-value', HTMLElement),
    release: required('#gate-release', HTMLMeterElement),
    releaseValue: required('#gate-release-value', HTMLElement),
    reason: required('#gate-reason', HTMLElement),
    hand: required('#gate-hand', HTMLElement),
    inference: required('#gate-inference', HTMLElement),
    timeline: required('#gate-timeline', HTMLOListElement),
  };
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

function readableReason(reason: string): string {
  return reason.replaceAll('-', ' ');
}

export class IntentGate {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly effect = new IntentGateEffect(this.elements.effectCanvas);
  private readonly recognizer = new PinchRecognizer();
  private readonly fixture = new PinchFixturePlayer();
  private readonly performance = new PerformanceMonitor();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private mode: GateMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private currentSignal: GestureSignal<PinchPayload> | undefined;
  private lastFixtureTimestamp = -1;
  private lastTransition = '';
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
    this.displayRequest = requestAnimationFrame(this.displayLoop);
  }

  private readonly displayLoop = (timestampMs: number): void => {
    if (this.disposed) return;
    this.performance.markDisplay(timestampMs);
    if (this.mode === 'fixture') {
      const frame = this.fixture.frame(timestampMs);
      if (frame.timestampMs !== this.lastFixtureTimestamp) {
        this.lastFixtureTimestamp = frame.timestampMs;
        this.acceptFrame(frame);
      }
    }
    this.landmarks.render({
      frame: this.currentFrame,
      source: this.mode === 'camera' ? this.elements.video : undefined,
      mirrorX: this.elements.mirror.checked,
      overlayVisible: this.elements.overlay.checked,
      selectedHandId: this.currentSignal?.payload.handId,
      selectedLandmarkIndex: 8,
      timestampMs,
    });
    this.effect.render(this.currentSignal, timestampMs);
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
        if (button.dataset.gateInput === 'camera') void this.startCamera();
        if (button.dataset.gateInput === 'fixture') this.startFixture();
      });
    });
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode !== 'fixture') return;
      this.recognizer.reset();
      this.fixture.select(
        this.elements.scenario.value as PinchFixtureScenario,
        performance.now(),
      );
      this.lastFixtureTimestamp = -1;
      this.clearTimeline();
      this.setStatus(
        'fixture',
        `Fixture playing: ${this.scenarioLabel()}. No camera or model required.`,
      );
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'camera') return;
      this.stopInput();
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
      ({ dataset }) => dataset.gateInput === 'camera',
    );
    if (button) button.disabled = !this.camera.supported;
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
    this.setMode('camera');
    this.elements.mirror.checked = true;
    this.setStatus(
      'requesting-camera',
      'Waiting for camera permission. Nothing has been recorded.',
    );
    try {
      await this.camera.start();
      if (operation !== this.operationId) return;
      this.setStatus('loading-model', 'Loading local hand model…');
      await this.tracker.ensureMode('VIDEO');
      if (operation !== this.operationId) return;
      this.setStatus(
        'tracking',
        'Camera active. Show one hand and pinch slowly.',
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
    this.setMode('fixture');
    this.elements.mirror.checked = false;
    this.fixture.select(
      this.elements.scenario.value as PinchFixtureScenario,
      performance.now(),
    );
    this.lastFixtureTimestamp = -1;
    this.clearTimeline();
    this.setStatus(
      'fixture',
      `Fixture playing: ${this.scenarioLabel()}. No camera or model required.`,
    );
  }

  private processVideoFrame(timestampMs: number): number {
    if (this.mode !== 'camera') return 0;
    const frame = this.tracker.detectVideo(this.elements.video, timestampMs);
    this.performance.markInference(timestampMs, frame.inferenceDurationMs);
    this.acceptFrame(frame);
    return frame.inferenceDurationMs;
  }

  private acceptFrame(frame: ObservationFrame): void {
    this.currentFrame = frame;
    this.currentSignal = this.recognizer.update(
      frame.observations,
      frame.timestampMs,
    );
    this.updateSignal(this.currentSignal);
    if (this.mode === 'camera') {
      const count = frame.observations.length;
      this.setStatus(
        'tracking',
        count === 0
          ? 'Camera active. No hand detected.'
          : `Tracking ${count} hand${count === 1 ? '' : 's'} on-device.`,
      );
    }
  }

  private updateSignal(signal: GestureSignal<PinchPayload>): void {
    const payload = signal.payload;
    this.elements.root.dataset.phase = signal.phase;
    this.elements.phase.textContent = signal.phase.toUpperCase();
    this.elements.confidence.textContent = `${Math.round(signal.confidence * 100)}%`;
    this.elements.ratio.textContent =
      payload.ratio === undefined ? '-' : payload.ratio.toFixed(3);
    this.elements.activation.value = payload.activationProgress;
    this.elements.activationValue.textContent = `${Math.round(payload.activationProgress * 100)}%`;
    this.elements.release.value = payload.releaseProgress;
    this.elements.releaseValue.textContent = `${Math.round(payload.releaseProgress * 100)}%`;
    this.elements.reason.textContent = readableReason(payload.reason);
    this.elements.hand.textContent = payload.handId ?? '-';
    const snapshot = this.performance.snapshot();
    this.elements.inference.textContent =
      this.mode === 'fixture'
        ? 'deterministic / 50 Hz'
        : snapshot.medianInferenceMs
          ? `${snapshot.medianInferenceMs.toFixed(1)} ms median / ${snapshot.inferenceFps.toFixed(1)} Hz`
          : 'warming up';
    const transition = `${signal.phase}:${payload.reason}`;
    if (transition !== this.lastTransition) {
      this.lastTransition = transition;
      const item = document.createElement('li');
      const phase = document.createElement('b');
      const reason = document.createElement('span');
      phase.textContent = signal.phase.toUpperCase();
      reason.textContent = readableReason(payload.reason);
      item.append(phase, reason);
      this.elements.timeline.prepend(item);
      while (this.elements.timeline.children.length > 4)
        this.elements.timeline.lastElementChild?.remove();
    }
  }

  private setMode(mode: GateMode): void {
    const activeControl =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const shouldMoveFocus =
      activeControl?.closest('.hero-actions, .reset-action') !== null;
    const preservedScrollX = window.scrollX;
    const preservedScrollY = window.scrollY;
    if (shouldMoveFocus) activeControl?.blur();
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.gateInput === mode;
      button.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (shouldMoveFocus) {
      if (mode === 'idle') {
        this.elements.startCamera.focus({ preventScroll: true });
      } else {
        this.elements.modeButtons
          .find(({ dataset }) => dataset.gateInput === mode)
          ?.focus({ preventScroll: true });
      }
    }
    const restoreScroll = (): void => {
      const scrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(preservedScrollX, preservedScrollY);
      document.documentElement.style.scrollBehavior = scrollBehavior;
    };
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
  }

  private setStatus(state: string, message: string): void {
    if (this.elements.status.textContent === message) return;
    this.elements.status.textContent = message;
    this.elements.statusLine.dataset.state = state;
  }

  private clearTimeline(): void {
    this.elements.timeline.replaceChildren();
    this.lastTransition = '';
  }

  private scenarioLabel(): string {
    return (
      this.elements.scenario.selectedOptions[0]?.textContent ??
      this.elements.scenario.value
    );
  }

  private handleTrackingError(): void {
    this.stopInput();
    this.setMode('idle');
    this.setStatus(
      'model-error',
      'Tracking stopped after a model error. Camera tracks are closed.',
    );
  }

  private stopInput(): number {
    this.operationId += 1;
    this.scheduler.stop();
    this.camera.stop();
    this.currentFrame = undefined;
    this.currentSignal = undefined;
    this.lastFixtureTimestamp = -1;
    this.recognizer.reset();
    return this.operationId;
  }

  private reset(): void {
    this.stopInput();
    this.setMode('idle');
    this.elements.overlay.checked = true;
    this.elements.mirror.checked = true;
    this.elements.root.dataset.phase = 'unknown';
    this.clearTimeline();
    this.elements.phase.textContent = 'UNKNOWN';
    this.elements.confidence.textContent = '0%';
    this.elements.ratio.textContent = '-';
    this.elements.activation.value = 0;
    this.elements.release.value = 0;
    this.elements.activationValue.textContent = '0%';
    this.elements.releaseValue.textContent = '0%';
    this.elements.reason.textContent = 'Awaiting evidence';
    this.elements.hand.textContent = '-';
    this.elements.inference.textContent = '-';
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopInput();
    cancelAnimationFrame(this.displayRequest);
    this.tracker.close();
    this.performance.dispose();
  }
}
