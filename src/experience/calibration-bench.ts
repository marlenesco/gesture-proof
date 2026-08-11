import type {
  HandObservation,
  HandTracker,
  ObservationFrame,
} from '../engine/contracts';
import {
  CalibrationFixturePlayer,
  type CalibrationFixtureReference,
  type CalibrationFixtureScenario,
  type CalibrationFixtureState,
  type CalibrationGesture,
} from '../engine/calibration-fixtures';
import { PerformanceMonitor } from '../engine/performance-monitor';
import { CalibrationTraceEffect } from '../effects/calibration-trace-effect';
import {
  CalibrationPipeline,
  type CalibrationPipelineId,
} from '../gesture/calibration-comparison';
import {
  GestureCalibrationSession,
  type GestureCalibrationProfile,
} from '../gesture/calibration-profile';
import { pinchRatio } from '../gesture/pinch-recognizer';
import { fistOpenness } from '../gesture/pose-metrics';
import type { ScalarGateThresholds } from '../gesture/scalar-gate';
import { CameraSource, isCameraAbort } from '../input/camera-source';
import { LandmarkRenderer } from '../render/landmark-renderer';
import { VideoFrameScheduler } from '../tracking/video-frame-scheduler';

type BenchMode = 'idle' | 'camera' | 'fixture';

interface LaneElements {
  readonly root: HTMLElement;
  readonly phase: HTMLElement;
  readonly value: HTMLElement;
  readonly threshold: HTMLElement;
  readonly errors: HTMLElement;
  readonly latency: HTMLElement;
}

interface BenchElements {
  readonly root: HTMLElement;
  readonly landmarkCanvas: HTMLCanvasElement;
  readonly traceCanvas: HTMLCanvasElement;
  readonly video: HTMLVideoElement;
  readonly startCamera: HTMLButtonElement;
  readonly startFixture: HTMLButtonElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly gesture: HTMLSelectElement;
  readonly scenario: HTMLSelectElement;
  readonly overlay: HTMLInputElement;
  readonly mirror: HTMLInputElement;
  readonly calibrate: HTMLButtonElement;
  readonly calibrationPrompt: HTMLElement;
  readonly calibrationDetail: HTMLElement;
  readonly reset: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly statusLine: HTMLElement;
  readonly lanes: Readonly<Record<CalibrationPipelineId, LaneElements>>;
}

interface LaneStats {
  falseActivations: number;
  missedActivations: number;
  expectedStartedAtMs?: number;
  activatedDuringWindow: boolean;
  previousExpected?: boolean;
  previousPhase: string;
  latencies: number[];
}

interface CameraCalibrationState {
  readonly reference?: CalibrationFixtureReference;
  readonly prompt: string;
  readonly detail: string;
  readonly done: boolean;
}

const FIXED_THRESHOLDS: Readonly<
  Record<CalibrationGesture, ScalarGateThresholds>
> = {
  pinch: { activation: 0.34, continuation: 0.46 },
  fist: { activation: 0.32, continuation: 0.45 },
};
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

function lane(id: CalibrationPipelineId): LaneElements {
  return {
    root: required(`[data-lane="${id}"]`, HTMLElement),
    phase: required(`#bench-${id}-phase`, HTMLElement),
    value: required(`#bench-${id}-value`, HTMLElement),
    threshold: required(`#bench-${id}-threshold`, HTMLElement),
    errors: required(`#bench-${id}-errors`, HTMLElement),
    latency: required(`#bench-${id}-latency`, HTMLElement),
  };
}

function collectElements(): BenchElements {
  return {
    root: required('#calibration-bench', HTMLElement),
    landmarkCanvas: required('#bench-landmarks', HTMLCanvasElement),
    traceCanvas: required('#bench-traces', HTMLCanvasElement),
    video: required('#bench-video', HTMLVideoElement),
    startCamera: required('#bench-start-camera', HTMLButtonElement),
    startFixture: required('#bench-start-fixture', HTMLButtonElement),
    modeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-bench-input]'),
    ),
    gesture: required('#bench-gesture', HTMLSelectElement),
    scenario: required('#bench-scenario', HTMLSelectElement),
    overlay: required('#bench-overlay', HTMLInputElement),
    mirror: required('#bench-mirror', HTMLInputElement),
    calibrate: required('#bench-calibrate', HTMLButtonElement),
    calibrationPrompt: required('#bench-calibration-prompt', HTMLElement),
    calibrationDetail: required('#bench-calibration-detail', HTMLElement),
    reset: required('#bench-reset', HTMLButtonElement),
    status: required('#bench-status', HTMLElement),
    statusLine: required('.status-line', HTMLElement),
    lanes: {
      fixed: lane('fixed'),
      filtered: lane('filtered'),
      calibrated: lane('calibrated'),
    },
  };
}

function permissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  );
}

function newStats(): LaneStats {
  return {
    falseActivations: 0,
    missedActivations: 0,
    activatedDuringWindow: false,
    previousPhase: 'unknown',
    latencies: [],
  };
}

export class GestureCalibrationBench {
  private readonly elements = collectElements();
  private readonly landmarks = new LandmarkRenderer(
    this.elements.landmarkCanvas,
  );
  private readonly traces = new CalibrationTraceEffect(
    this.elements.traceCanvas,
  );
  private readonly fixture = new CalibrationFixturePlayer();
  private readonly monitor = new PerformanceMonitor();
  private readonly camera: CameraSource;
  private readonly scheduler: VideoFrameScheduler;
  private session = new GestureCalibrationSession();
  private profile: GestureCalibrationProfile | undefined;
  private pipelines = this.createPipelines();
  private outputs = this.pipelines.map((pipeline) =>
    pipeline.update(undefined, 0, 0),
  );
  private stats: Record<CalibrationPipelineId, LaneStats> = {
    fixed: newStats(),
    filtered: newStats(),
    calibrated: newStats(),
  };
  private mode: BenchMode = 'idle';
  private currentFrame: ObservationFrame | undefined;
  private selectedHandId: string | undefined;
  private lastHandSeenAtMs = -Infinity;
  private lastFixtureTimestamp = -1;
  private cameraCalibrationStartedAtMs: number | undefined;
  private fixtureProfileFinalized = false;
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
    this.updateLanes();
    this.displayRequest = requestAnimationFrame(this.displayLoop);
  }

  private get gesture(): CalibrationGesture {
    return this.elements.gesture.value as CalibrationGesture;
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
    } else if (this.mode === 'camera') {
      this.updateCameraCalibration(timestampMs);
    }
    this.landmarks.render({
      frame: this.currentFrame,
      source: this.mode === 'camera' ? this.elements.video : undefined,
      mirrorX: this.elements.mirror.checked,
      overlayVisible: this.elements.overlay.checked,
      selectedHandId: this.selectedHandId,
      selectedLandmarkIndex: this.gesture === 'pinch' ? 8 : 12,
      timestampMs,
    });
    this.traces.render(this.outputs, timestampMs, this.gesture);
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
        if (button.dataset.benchInput === 'camera') void this.startCamera();
        if (button.dataset.benchInput === 'fixture') this.startFixture();
      });
    });
    this.elements.gesture.addEventListener('change', () => {
      this.resetPipelines();
      this.setStatus(
        this.mode,
        `Comparing ${this.gesture} evidence across three pipelines.`,
      );
    });
    this.elements.scenario.addEventListener('change', () => {
      if (this.mode === 'fixture') this.startFixture();
    });
    this.elements.calibrate.addEventListener('click', () => {
      if (this.mode === 'fixture') this.startFixture();
      if (this.mode === 'camera') this.startCameraCalibration();
    });
    this.elements.reset.addEventListener('click', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.mode !== 'camera') return;
      this.stopInput();
      this.resetCalibration();
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
      ({ dataset }) => dataset.benchInput === 'camera',
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
    this.resetCalibration();
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
        'Camera active. Start calibration when one hand is clearly visible.',
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
    this.resetCalibration();
    this.setMode('fixture');
    this.elements.mirror.checked =
      this.elements.scenario.value === 'left-mirrored';
    this.fixture.select(
      this.elements.scenario.value as CalibrationFixtureScenario,
      performance.now(),
    );
    this.lastFixtureTimestamp = -1;
    this.elements.calibrationPrompt.textContent = 'Open reference';
    this.elements.calibrationDetail.textContent =
      'Fixture calibration runs locally before evaluation.';
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
    fixtureState?: CalibrationFixtureState,
  ): void {
    this.currentFrame = frame;
    const hand = this.selectHand(frame.observations, frame.timestampMs);
    const metrics = hand
      ? { pinch: pinchRatio(hand), fist: fistOpenness(hand) }
      : {};

    if (fixtureState?.reference) {
      this.session.record(fixtureState.reference, metrics);
      this.elements.calibrationPrompt.textContent = `${fixtureState.reference} reference`;
    }
    if (fixtureState?.evaluationStarted && !this.fixtureProfileFinalized) {
      this.fixtureProfileFinalized = true;
      this.finishCalibration();
    }
    if (
      this.mode === 'camera' &&
      this.cameraCalibrationStartedAtMs !== undefined
    ) {
      const calibration = this.cameraCalibrationState(frame.timestampMs);
      if (calibration.reference) {
        this.session.record(calibration.reference, metrics);
      }
    }

    const rawValue = this.gesture === 'pinch' ? metrics.pinch : metrics.fist;
    const confidence = hand?.confidence ?? 0;
    this.outputs = this.pipelines.map((pipeline) =>
      pipeline.update(rawValue, frame.timestampMs, confidence),
    );
    if (fixtureState?.evaluationStarted) {
      this.updateStats(fixtureState.expected[this.gesture], frame.timestampMs);
    }
    this.updateLanes();

    if (this.mode === 'camera') {
      const snapshot = this.monitor.snapshot();
      const count = frame.observations.length;
      this.setStatus(
        'tracking',
        count === 0
          ? 'Camera active. No hand detected.'
          : `Tracking ${count} hand${count === 1 ? '' : 's'} on-device · ${snapshot.medianInferenceMs ? `${snapshot.medianInferenceMs.toFixed(1)} ms median` : 'warming up'}.`,
      );
    }
  }

  private selectHand(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): HandObservation | undefined {
    if (this.selectedHandId) {
      const retained = observations.find(
        ({ id }) => id === this.selectedHandId,
      );
      if (retained) {
        this.lastHandSeenAtMs = timestampMs;
        return retained;
      }
      if (timestampMs - this.lastHandSeenAtMs <= 100) return undefined;
      this.selectedHandId = undefined;
    }
    const selected = observations.toSorted(
      (a, b) => b.confidence - a.confidence,
    )[0];
    if (selected) {
      this.selectedHandId = selected.id;
      this.lastHandSeenAtMs = timestampMs;
      return selected;
    }
    return undefined;
  }

  private startCameraCalibration(): void {
    this.resetCalibration();
    this.cameraCalibrationStartedAtMs = performance.now();
    this.elements.root.dataset.calibration = 'running';
    this.elements.calibrationPrompt.textContent = 'Prepare open hand';
    this.elements.calibrationDetail.textContent =
      'Keep one hand centered. Capture begins in 400 ms.';
  }

  private cameraCalibrationState(timestampMs: number): CameraCalibrationState {
    const elapsed =
      timestampMs - (this.cameraCalibrationStartedAtMs ?? timestampMs);
    if (elapsed < 400) {
      return {
        prompt: 'Prepare open hand',
        detail: 'Keep fingers comfortably extended.',
        done: false,
      };
    }
    if (elapsed < 1100) {
      return {
        reference: 'open',
        prompt: 'Hold open hand',
        detail: 'Capturing open-hand geometry.',
        done: false,
      };
    }
    if (elapsed < 1600) {
      return {
        prompt: 'Prepare pinch',
        detail: 'Touch thumb and index finger naturally.',
        done: false,
      };
    }
    if (elapsed < 2300) {
      return {
        reference: 'pinch',
        prompt: 'Hold pinch',
        detail: 'Capturing pinch geometry.',
        done: false,
      };
    }
    if (elapsed < 2800) {
      return {
        prompt: 'Prepare fist',
        detail: 'Close a comfortable fist.',
        done: false,
      };
    }
    if (elapsed < 3500) {
      return {
        reference: 'fist',
        prompt: 'Hold fist',
        detail: 'Capturing fist geometry.',
        done: false,
      };
    }
    return {
      prompt: 'Calculating profile',
      detail: 'Only session medians remain in memory.',
      done: true,
    };
  }

  private updateCameraCalibration(timestampMs: number): void {
    if (this.cameraCalibrationStartedAtMs === undefined) return;
    const state = this.cameraCalibrationState(timestampMs);
    this.elements.calibrationPrompt.textContent = state.prompt;
    this.elements.calibrationDetail.textContent = state.detail;
    if (!state.done) return;
    this.cameraCalibrationStartedAtMs = undefined;
    this.finishCalibration();
  }

  private finishCalibration(): void {
    const result = this.session.result();
    if (result.status === 'ready') {
      this.profile = result.profile;
      this.elements.root.dataset.calibration = 'ready';
      this.elements.calibrationPrompt.textContent = 'Profile ready';
      this.elements.calibrationDetail.textContent =
        'Calibrated gates now use this session only.';
    } else {
      this.profile = undefined;
      this.elements.root.dataset.calibration = 'inconclusive';
      this.elements.calibrationPrompt.textContent = 'Inconclusive';
      this.elements.calibrationDetail.textContent =
        result.reason === 'insufficient-samples'
          ? 'Not enough valid hand evidence. Recenter and retry.'
          : 'Reference poses overlap. Separate the poses and retry.';
    }
    this.resetPipelines();
  }

  private createPipelines(): CalibrationPipeline[] {
    const fixed = FIXED_THRESHOLDS[this.gesture];
    const calibrated = this.profile?.[this.gesture] ?? fixed;
    return [
      new CalibrationPipeline('fixed', fixed, false),
      new CalibrationPipeline('filtered', fixed, true),
      new CalibrationPipeline('calibrated', calibrated, true),
    ];
  }

  private resetPipelines(): void {
    this.pipelines = this.createPipelines();
    this.outputs = this.pipelines.map((pipeline) =>
      pipeline.update(undefined, 0, 0),
    );
    this.stats = {
      fixed: newStats(),
      filtered: newStats(),
      calibrated: newStats(),
    };
    this.traces.reset();
    this.updateLanes();
  }

  private resetCalibration(): void {
    this.session = new GestureCalibrationSession();
    this.profile = undefined;
    this.cameraCalibrationStartedAtMs = undefined;
    this.fixtureProfileFinalized = false;
    this.elements.root.dataset.calibration = 'empty';
    this.elements.calibrationPrompt.textContent = 'Not started';
    this.elements.calibrationDetail.textContent =
      'Open → pinch → fist. 700 ms evidence each.';
    this.resetPipelines();
  }

  private updateStats(
    expected: boolean | undefined,
    timestampMs: number,
  ): void {
    this.outputs.forEach((output) => {
      const stats = this.stats[output.id];
      const becameActive =
        output.signal.phase === 'active' && stats.previousPhase !== 'active';
      if (expected === true && stats.previousExpected !== true) {
        stats.expectedStartedAtMs = timestampMs;
        stats.activatedDuringWindow = false;
      }
      if (becameActive) {
        if (expected === true) {
          stats.activatedDuringWindow = true;
          if (stats.expectedStartedAtMs !== undefined) {
            stats.latencies.push(timestampMs - stats.expectedStartedAtMs);
          }
        } else if (expected === false) {
          stats.falseActivations += 1;
        }
      }
      if (expected !== true && stats.previousExpected === true) {
        if (!stats.activatedDuringWindow) stats.missedActivations += 1;
        stats.expectedStartedAtMs = undefined;
      }
      stats.previousExpected = expected;
      stats.previousPhase = output.signal.phase;
    });
  }

  private updateLanes(): void {
    this.outputs.forEach((output) => {
      const elements = this.elements.lanes[output.id];
      const stats = this.stats[output.id];
      const value = output.processedValue;
      const latencies = stats.latencies;
      const medianLatency = latencies.length
        ? latencies.toSorted((a, b) => a - b)[Math.floor(latencies.length / 2)]
        : undefined;
      elements.root.dataset.active = String(output.signal.phase === 'active');
      elements.phase.textContent = output.signal.phase.toUpperCase();
      elements.value.textContent = value === undefined ? '—' : value.toFixed(3);
      elements.threshold.textContent = `${output.signal.payload.thresholds.activation.toFixed(3)} / ${output.signal.payload.thresholds.continuation.toFixed(3)}`;
      elements.errors.textContent = `F${stats.falseActivations} / M${stats.missedActivations}`;
      elements.latency.textContent =
        medianLatency === undefined
          ? '—'
          : `${medianLatency.toFixed(0)} ms med.`;
    });
  }

  private setMode(mode: BenchMode): void {
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
      const selected = button.dataset.benchInput === mode;
      button.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (shouldMoveFocus) {
      if (mode === 'idle') {
        this.elements.startCamera.focus({ preventScroll: true });
      } else {
        this.elements.modeButtons
          .find(({ dataset }) => dataset.benchInput === mode)
          ?.focus({ preventScroll: true });
      }
    }
    const restoreScroll = (): void => {
      const behavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(preservedScrollX, preservedScrollY);
      document.documentElement.style.scrollBehavior = behavior;
    };
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
    window.setTimeout(restoreScroll, 120);
  }

  private setStatus(state: string, message: string): void {
    this.elements.status.textContent = message;
    this.elements.statusLine.dataset.state = state;
  }

  private scenarioLabel(): string {
    return (
      this.elements.scenario.selectedOptions[0]?.textContent ??
      this.elements.scenario.value
    );
  }

  private handleTrackingError(): void {
    this.stopInput();
    this.resetCalibration();
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
    this.selectedHandId = undefined;
    this.lastFixtureTimestamp = -1;
    this.cameraCalibrationStartedAtMs = undefined;
    return this.operationId;
  }

  private reset(): void {
    this.stopInput();
    this.setMode('idle');
    this.elements.overlay.checked = true;
    this.elements.mirror.checked = true;
    this.resetCalibration();
    this.setStatus('idle', 'Ready. Camera permission has not been requested.');
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopInput();
    this.session.reset();
    this.profile = undefined;
    cancelAnimationFrame(this.displayRequest);
    this.tracker.close();
    this.monitor.dispose();
  }
}
