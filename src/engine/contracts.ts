export type InputKind = 'camera' | 'image' | 'video' | 'fixture';

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface HandObservation {
  readonly id: string;
  readonly timestampMs: number;
  readonly landmarks: readonly NormalizedPoint[];
  readonly handedness?: 'left' | 'right';
  readonly confidence: number;
}

export interface ObservationFrame {
  readonly observations: readonly HandObservation[];
  readonly timestampMs: number;
  readonly inferenceDurationMs: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourceMirrored?: boolean;
}

export type TrackerMode = 'IMAGE' | 'VIDEO';

export interface HandTracker {
  ensureMode(mode: TrackerMode): Promise<void>;
  detectImage(source: TexImageSource, timestampMs: number): ObservationFrame;
  detectVideo(source: TexImageSource, timestampMs: number): ObservationFrame;
  close(): void;
}

export type GesturePhase =
  'idle' | 'candidate' | 'active' | 'cooldown' | 'unknown';

export interface GestureSignal<TPayload = unknown> {
  readonly id: string;
  readonly phase: GesturePhase;
  readonly confidence: number;
  readonly timestampMs: number;
  readonly payload: TPayload;
}

export interface GestureRecognizer<TPayload = unknown> {
  readonly id: string;
  update(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): GestureSignal<TPayload>;
  reset(): void;
}

export interface EffectFrameContext {
  readonly source: CanvasImageSource;
  readonly timestampMs: number;
  readonly width: number;
  readonly height: number;
  readonly gestures: ReadonlyMap<string, GestureSignal>;
}

export interface VisualEffect {
  readonly id: string;
  render(context: EffectFrameContext, target: CanvasRenderingContext2D): void;
  dispose?(): void;
}
