import type {
  HandObservation,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import { FixturePlayer, type FixtureScenario } from '../engine/fixtures';
import {
  jointAngleDegrees,
  normalizedDistance,
  palmScale,
  scaleIndependentDistance,
} from '../engine/geometry';
import { HAND_LANDMARK_NAMES } from '../engine/hand-model';
import { PerformanceMonitor } from '../engine/performance-monitor';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type ActiveMode = 'idle' | 'camera' | 'image' | 'fixture';

type StatusKey =
  | 'idle'
  | 'requesting-camera'
  | 'loading-model'
  | 'tracking-zero'
  | 'tracking-one'
  | 'tracking-two'
  | 'permission-denied'
  | 'camera-unavailable'
  | 'camera-error'
  | 'model-error'
  | 'fixture'
  | 'image'
  | 'image-error'
  | 'camera-stopped';

interface ExplorerElements {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly imageInput: HTMLInputElement;
  readonly fixtureScenario: HTMLSelectElement;
  readonly overlayToggle: HTMLInputElement;
  readonly mirrorToggle: HTMLInputElement;
  readonly inspectorToggle: HTMLInputElement;
  readonly inspector: HTMLElement;
  readonly handSelect: HTMLSelectElement;
  readonly landmarkSelect: HTMLSelectElement;
  readonly reset: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly inspectorTitle: HTMLElement;
  readonly confidenceValue: HTMLElement;
  readonly inputCoordinate: HTMLElement;
  readonly displayCoordinate: HTMLElement;
  readonly depthValue: HTMLElement;
  readonly frameAge: HTMLElement;
  readonly palmScale: HTMLElement;
  readonly pinchDistance: HTMLElement;
  readonly jointAngle: HTMLElement;
  readonly wristVelocity: HTMLElement;
  readonly inputSize: HTMLElement;
  readonly displayRate: HTMLElement;
  readonly inferenceRate: HTMLElement;
  readonly inferenceTime: HTMLElement;
  readonly longTasks: HTMLElement;
}

function requiredElement<TElement extends Element>(
  selector: string,
  constructor: { new (): TElement },
): TElement {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Required element is missing: ${selector}`);
  }
  return element;
}

function collectElements(): ExplorerElements {
  return {
    root: requiredElement('#experiment', HTMLElement),
    canvas: requiredElement('#landmark-canvas', HTMLCanvasElement),
    video: requiredElement('#camera-video', HTMLVideoElement),
    startCamera: requiredElement('#start-camera', HTMLButtonElement),
    startFixture: requiredElement('#start-fixture', HTMLButtonElement),
    imageInput: requiredElement('#image-input', HTMLInputElement),
    fixtureScenario: requiredElement('#fixture-scenario', HTMLSelectElement),
    overlayToggle: requiredElement('#overlay-toggle', HTMLInputElement),
    mirrorToggle: requiredElement('#mirror-toggle', HTMLInputElement),
    inspectorToggle: requiredElement('#inspector-toggle', HTMLInputElement),
    inspector: requiredElement('#inspector', HTMLElement),
    handSelect: requiredElement('#hand-select', HTMLSelectElement),
    landmarkSelect: requiredElement('#landmark-select', HTMLSelectElement),
    reset: requiredElement('#reset-experiment', HTMLButtonElement),
    status: requiredElement('#experiment-status', HTMLElement),
    statusLine: requiredElement('.status-line', HTMLElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-input]'),
    ),
    inspectorTitle: requiredElement('#inspector-title', HTMLElement),
    confidenceValue: requiredElement('#confidence-value', HTMLElement),
    inputCoordinate: requiredElement('#input-coordinate', HTMLElement),
    displayCoordinate: requiredElement('#display-coordinate', HTMLElement),
    depthValue: requiredElement('#depth-value', HTMLElement),
    frameAge: requiredElement('#frame-age', HTMLElement),
    palmScale: requiredElement('#palm-scale', HTMLElement),
    pinchDistance: requiredElement('#pinch-distance', HTMLElement),
    jointAngle: requiredElement('#joint-angle', HTMLElement),
    wristVelocity: requiredElement('#wrist-velocity', HTMLElement),
    inputSize: requiredElement('#input-size', HTMLElement),
    displayRate: requiredElement('#display-rate', HTMLElement),
    inferenceRate: requiredElement('#inference-rate', HTMLElement),
    inferenceTime: requiredElement('#inference-time', HTMLElement),
    longTasks: requiredElement('#long-tasks', HTMLElement),
  };
}

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

function formatNumber(value: number | undefined, digits = 3): string {
  return value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

export class LandmarkExplorer {
  private readonly elements = collectElements();
  private readonly renderer = new LandmarkRenderer(this.elements.canvas);
  private readonly fixture = new FixturePlayer();
  private readonly performance = new PerformanceMonitor();
  private readonly tracker: HandTracker;
  private readonly camera: CameraSource;
  private readonly videoScheduler: VideoFrameScheduler;
  private mode: ActiveMode = 'idle';
  private statusKey: StatusKey = 'idle';
  private image: HTMLImageElement | undefined;
  private imageUrl: string | undefined;
  private currentFrame: ObservationFrame | undefined;
  private previousFrame: ObservationFrame | undefined;
  private frameReceivedAtMs = 0;
  private selectedHandId: string | undefined;
  private selectedLandmarkIndex = 8;
  private displayRequest = 0;
  private lastFixtureTimestamp = -1;
  private lastInspectorUpdateAtMs = 0;
  private lastMetricsUpdateAtMs = 0;
  private operationId = 0;
  private disposed = false;

  constructor(tracker: HandTracker) {
    this.tracker = tracker;
    this.camera = new CameraSource(this.elements.video);
    this.videoScheduler = new VideoFrameScheduler(
      this.elements.video,
      (timestampMs) => this.processVideoFrame(timestampMs),
      () => this.handleTrackingError(),
    );
    this.populateLandmarkSelect();
    this.bindEvents();
    this.configureCameraCapability();
    this.fixture.start(performance.now());
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

    this.renderer.render({
      frame: this.currentFrame,
      source:
        this.mode === 'camera'
          ? this.elements.video
          : this.mode === 'image'
            ? this.image
            : undefined,
      mirrorX: this.elements.mirrorToggle.checked,
      overlayVisible: this.elements.overlayToggle.checked,
      selectedHandId: this.selectedHandId,
      selectedLandmarkIndex: this.selectedLandmarkIndex,
      timestampMs,
    });

    if (timestampMs - this.lastInspectorUpdateAtMs >= 120) {
      this.updateInspector(timestampMs);
      this.lastInspectorUpdateAtMs = timestampMs;
    }
    if (timestampMs - this.lastMetricsUpdateAtMs >= 500) {
      this.updateMetrics();
      this.lastMetricsUpdateAtMs = timestampMs;
    }

    this.displayRequest = requestAnimationFrame(this.displayLoop);
  };

  private bindEvents(): void {
    this.elements.startCamera.addEventListener('click', () => {
      void this.startCamera();
    });
    this.elements.startFixture.addEventListener('click', () => {
      this.startFixture();
    });
    this.elements.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        switch (button.dataset.input) {
          case 'camera':
            void this.startCamera();
            break;
          case 'image':
            this.elements.imageInput.click();
            break;
          case 'fixture':
            this.startFixture();
            break;
        }
      });
    });
    this.elements.imageInput.addEventListener('change', () => {
      const file = this.elements.imageInput.files?.[0];
      if (file) void this.startImage(file);
    });
    this.elements.fixtureScenario.addEventListener('change', () => {
      if (this.mode !== 'fixture') return;
      this.fixture.select(
        this.elements.fixtureScenario.value as FixtureScenario,
        performance.now(),
      );
      this.lastFixtureTimestamp = -1;
      this.setStatus(
        'fixture',
        `Fixture playing: ${this.selectedFixtureLabel()}. No camera or model required.`,
      );
    });
    this.elements.inspectorToggle.addEventListener('change', () => {
      this.elements.inspector.hidden = !this.elements.inspectorToggle.checked;
    });
    this.elements.handSelect.addEventListener('change', () => {
      this.selectedHandId = this.elements.handSelect.value || undefined;
    });
    this.elements.landmarkSelect.addEventListener('change', () => {
      this.selectedLandmarkIndex = Number(this.elements.landmarkSelect.value);
    });
    this.elements.canvas.addEventListener('pointerup', (event) => {
      const bounds = this.elements.canvas.getBoundingClientRect();
      const hit = this.renderer.hitTest(
        this.currentFrame,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
      if (!hit) return;
      this.selectedHandId = hit.handId;
      this.selectedLandmarkIndex = hit.landmarkIndex;
      this.elements.handSelect.value = hit.handId;
      this.elements.landmarkSelect.value = String(hit.landmarkIndex);
      this.updateInspector(performance.now());
    });
    this.elements.reset.addEventListener('click', () => {
      this.reset();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'camera') {
        this.stopActiveInput();
        this.setMode('idle');
        this.setStatus(
          'camera-stopped',
          'Camera stopped because page became inactive. Start again when ready.',
        );
      }
    });
    window.addEventListener('pagehide', () => {
      this.dispose();
    });
  }

  private configureCameraCapability(): void {
    const supported = this.camera.supported;
    this.elements.startCamera.disabled = !supported;
    const cameraModeButton = this.elements.modeButtons.find(
      ({ dataset }) => dataset.input === 'camera',
    );
    if (cameraModeButton) cameraModeButton.disabled = !supported;
    if (!supported) {
      this.setStatus(
        'camera-unavailable',
        'Camera API unavailable. Image and fixture modes still work.',
      );
    }
  }

  private async startCamera(): Promise<void> {
    if (!this.camera.supported) {
      this.setStatus(
        'camera-unavailable',
        'Camera API unavailable. Image and fixture modes still work.',
      );
      return;
    }

    const operation = this.stopActiveInput();
    this.setMode('camera');
    this.elements.mirrorToggle.checked = true;
    this.setStatus(
      'requesting-camera',
      'Waiting for camera permission. Nothing has been captured yet.',
    );

    try {
      await this.camera.start();
    } catch (error) {
      if (operation !== this.operationId || isCameraAbort(error)) return;
      this.setMode('idle');
      this.setStatus(
        isPermissionDenied(error) ? 'permission-denied' : 'camera-error',
        isPermissionDenied(error)
          ? 'Camera permission denied. Use image or fixture, or retry after changing browser permission.'
          : 'Camera could not start. Check device availability, then retry or use fixture mode.',
      );
      return;
    }

    try {
      if (operation !== this.operationId) return;
      this.setStatus('loading-model', 'Loading local hand model…');
      await this.tracker.ensureMode('VIDEO');
      if (operation !== this.operationId) return;
      this.setStatus('tracking-zero', 'Camera active. No hand detected.');
      this.videoScheduler.start();
    } catch (error) {
      if (operation !== this.operationId) return;
      this.stopActiveInput();
      this.setMode('idle');
      this.setStatus(
        'model-error',
        error instanceof Error && error.message.includes('model')
          ? 'Local hand model failed to load. Run “pnpm models:fetch”, then retry.'
          : 'Camera stream or local hand model failed. Retry or use fixture mode.',
      );
    }
  }

  private processVideoFrame(timestampMs: number): number {
    if (this.mode !== 'camera') return 0;
    const frame = this.tracker.detectVideo(this.elements.video, timestampMs);
    this.performance.markInference(timestampMs, frame.inferenceDurationMs);
    this.acceptFrame(frame);
    return frame.inferenceDurationMs;
  }

  private handleTrackingError(): void {
    this.stopActiveInput();
    this.setMode('idle');
    this.setStatus(
      'model-error',
      'Tracking stopped after a model error. Camera tracks were closed; retry or use fixture.',
    );
  }

  private async startImage(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.setStatus('image-error', 'Selected file is not a supported image.');
      return;
    }

    const operation = this.stopActiveInput();
    this.setMode('image');
    this.elements.mirrorToggle.checked = false;
    this.setStatus(
      'loading-model',
      'Decoding image and loading local hand model…',
    );
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.alt = '';
    image.src = imageUrl;

    try {
      await image.decode();
      if (operation !== this.operationId) {
        URL.revokeObjectURL(imageUrl);
        return;
      }
      this.imageUrl = imageUrl;
      this.image = image;
      await this.tracker.ensureMode('IMAGE');
      if (operation !== this.operationId) return;
      const timestampMs = performance.now();
      const frame = this.tracker.detectImage(image, timestampMs);
      this.performance.markInference(timestampMs, frame.inferenceDurationMs);
      this.acceptFrame(frame);
      this.setStatus(
        'image',
        frame.observations.length === 0
          ? 'Image ready. No hand detected; choose another image or use fixture.'
          : `Image ready. ${frame.observations.length} hand${frame.observations.length === 1 ? '' : 's'} detected.`,
      );
    } catch {
      if (operation !== this.operationId) return;
      URL.revokeObjectURL(imageUrl);
      this.image = undefined;
      this.imageUrl = undefined;
      this.setStatus(
        'image-error',
        'Image or local hand model failed to load. Choose another image or use fixture.',
      );
    } finally {
      this.elements.imageInput.value = '';
    }
  }

  private startFixture(): void {
    this.stopActiveInput();
    this.setMode('fixture');
    this.elements.mirrorToggle.checked = false;
    this.fixture.select(
      this.elements.fixtureScenario.value as FixtureScenario,
      performance.now(),
    );
    this.lastFixtureTimestamp = -1;
    this.setStatus(
      'fixture',
      `Fixture playing: ${this.selectedFixtureLabel()}. No camera or model required.`,
    );
  }

  private selectedFixtureLabel(): string {
    return (
      this.elements.fixtureScenario.selectedOptions[0]?.textContent ??
      this.elements.fixtureScenario.value
    );
  }

  private acceptFrame(frame: ObservationFrame): void {
    if (this.currentFrame?.timestampMs !== frame.timestampMs) {
      this.previousFrame = this.currentFrame;
    }
    this.currentFrame = frame;
    this.frameReceivedAtMs = performance.now();
    this.syncHandSelection(frame.observations);

    if (this.mode === 'camera') {
      const count = frame.observations.length;
      this.setStatus(
        count === 0
          ? 'tracking-zero'
          : count === 1
            ? 'tracking-one'
            : 'tracking-two',
        count === 0
          ? 'Camera active. No hand detected.'
          : `Tracking ${count} hand${count === 1 ? '' : 's'} on-device.`,
      );
    }
  }

  private syncHandSelection(observations: readonly HandObservation[]): void {
    const ids = observations.map(({ id }) => id);
    if (!this.selectedHandId || !ids.includes(this.selectedHandId)) {
      this.selectedHandId = ids[0];
    }

    const signature = ids.join('|');
    if (this.elements.handSelect.dataset.signature === signature) return;
    this.elements.handSelect.dataset.signature = signature;
    this.elements.handSelect.replaceChildren();

    if (observations.length === 0) {
      this.elements.handSelect.add(new Option('No hand', ''));
      this.elements.handSelect.disabled = true;
      return;
    }
    observations.forEach((hand, index) => {
      const label = `${hand.handedness ?? 'unknown'} / ${index + 1}`;
      this.elements.handSelect.add(new Option(label, hand.id));
    });
    this.elements.handSelect.disabled = false;
    this.elements.handSelect.value = this.selectedHandId ?? '';
  }

  private updateInspector(timestampMs: number): void {
    const hand = this.currentFrame?.observations.find(
      ({ id }) => id === this.selectedHandId,
    );
    const landmark = hand?.landmarks[this.selectedLandmarkIndex];
    if (!hand || !landmark) {
      this.elements.inspectorTitle.textContent = 'No hand selected';
      this.elements.confidenceValue.textContent = '—';
      this.setInspectorValues('—');
      return;
    }

    this.elements.inspectorTitle.textContent = `${hand.handedness ?? 'Unknown'} hand / ${HAND_LANDMARK_NAMES[this.selectedLandmarkIndex] ?? 'Landmark'}`;
    this.elements.confidenceValue.textContent = `${Math.round(hand.confidence * 100)}%`;
    this.elements.inputCoordinate.textContent = `${formatNumber(landmark.x)}, ${formatNumber(landmark.y)}`;
    const displayPoint = this.renderer.pointFor(
      hand,
      this.selectedLandmarkIndex,
    );
    this.elements.displayCoordinate.textContent = displayPoint
      ? `${Math.round(displayPoint.x)}, ${Math.round(displayPoint.y)}`
      : '—';
    this.elements.depthValue.textContent = formatNumber(landmark.z);
    this.elements.frameAge.textContent = `${Math.max(0, timestampMs - this.frameReceivedAtMs).toFixed(0)} ms`;

    const scale = palmScale(hand.landmarks);
    const thumbTip = hand.landmarks[4];
    const indexTip = hand.landmarks[8];
    const indexMcp = hand.landmarks[5];
    const indexPip = hand.landmarks[6];
    const indexDip = hand.landmarks[7];
    this.elements.palmScale.textContent = formatNumber(scale);
    this.elements.pinchDistance.textContent =
      thumbTip && indexTip
        ? formatNumber(
            scaleIndependentDistance(thumbTip, indexTip, hand.landmarks),
          )
        : '—';
    this.elements.jointAngle.textContent =
      indexMcp && indexPip && indexDip
        ? `${formatNumber(jointAngleDegrees(indexMcp, indexPip, indexDip), 1)}°`
        : '—';
    this.elements.wristVelocity.textContent = this.wristVelocity(hand);
  }

  private wristVelocity(hand: HandObservation): string {
    const previousHand = this.previousFrame?.observations.find(
      ({ id }) => id === hand.id,
    );
    const wrist = hand.landmarks[0];
    const previousWrist = previousHand?.landmarks[0];
    const elapsedMs = previousHand
      ? hand.timestampMs - previousHand.timestampMs
      : 0;
    const scale = palmScale(hand.landmarks);
    if (!wrist || !previousWrist || elapsedMs <= 0 || !scale) return '—';
    const palmsPerSecond =
      (normalizedDistance(wrist, previousWrist) / scale) * (1000 / elapsedMs);
    return `${formatNumber(palmsPerSecond, 2)} palm/s`;
  }

  private setInspectorValues(value: string): void {
    this.elements.inputCoordinate.textContent = value;
    this.elements.displayCoordinate.textContent = value;
    this.elements.depthValue.textContent = value;
    this.elements.frameAge.textContent = value;
    this.elements.palmScale.textContent = value;
    this.elements.pinchDistance.textContent = value;
    this.elements.jointAngle.textContent = value;
    this.elements.wristVelocity.textContent = value;
  }

  private updateMetrics(): void {
    const snapshot = this.performance.snapshot();
    this.elements.inputSize.textContent = this.currentFrame
      ? `${this.currentFrame.sourceWidth}×${this.currentFrame.sourceHeight}`
      : '—';
    this.elements.displayRate.textContent = snapshot.displayFps
      ? `${snapshot.displayFps.toFixed(0)} Hz`
      : '—';
    this.elements.inferenceRate.textContent =
      this.mode === 'fixture'
        ? 'fixture'
        : snapshot.inferenceFps
          ? `${snapshot.inferenceFps.toFixed(1)} Hz`
          : '—';
    this.elements.inferenceTime.textContent = snapshot.medianInferenceMs
      ? `${snapshot.medianInferenceMs.toFixed(1)} / ${snapshot.worstInferenceMs.toFixed(1)} ms`
      : '—';
    this.elements.longTasks.textContent = String(snapshot.longTaskCount);
  }

  private populateLandmarkSelect(): void {
    HAND_LANDMARK_NAMES.forEach((name, index) => {
      this.elements.landmarkSelect.add(
        new Option(
          `${String(index).padStart(2, '0')} / ${name}`,
          String(index),
        ),
      );
    });
    this.elements.landmarkSelect.value = String(this.selectedLandmarkIndex);
  }

  private setMode(mode: ActiveMode): void {
    const moveFocus = document.activeElement?.closest('.hero-actions') !== null;
    const preservedScrollX = window.scrollX;
    const preservedScrollY = window.scrollY;
    if (moveFocus && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.mode = mode;
    this.elements.root.dataset.active = String(mode !== 'idle');
    this.elements.root.dataset.mode = mode;
    this.elements.modeButtons.forEach((button) => {
      const selected = button.dataset.input === mode;
      button.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (mode !== 'idle' && moveFocus) {
      const selectedButton = this.elements.modeButtons.find(
        ({ dataset }) => dataset.input === mode,
      );
      selectedButton?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        window.scrollTo(preservedScrollX, preservedScrollY);
      });
    }
  }

  private setStatus(key: StatusKey, message: string): void {
    if (
      this.statusKey === key &&
      this.elements.status.textContent === message
    ) {
      return;
    }
    this.statusKey = key;
    this.elements.status.textContent = message;
    this.elements.statusLine.dataset.state = key;
  }

  private stopActiveInput(): number {
    this.operationId += 1;
    this.videoScheduler.stop();
    this.camera.stop();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = undefined;
    this.image = undefined;
    this.currentFrame = undefined;
    this.previousFrame = undefined;
    this.selectedHandId = undefined;
    this.lastFixtureTimestamp = -1;
    this.syncHandSelection([]);
    return this.operationId;
  }

  private reset(): void {
    this.stopActiveInput();
    this.setMode('idle');
    this.elements.mirrorToggle.checked = true;
    this.elements.overlayToggle.checked = true;
    this.elements.inspectorToggle.checked = true;
    this.elements.inspector.hidden = false;
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopActiveInput();
    cancelAnimationFrame(this.displayRequest);
    this.tracker.close();
    this.performance.dispose();
  }
}
