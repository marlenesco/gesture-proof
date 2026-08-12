import type {
  HandObservation,
  ObservationFrame,
  PixelPoint,
} from '../engine/contracts';
import {
  createContainTransform,
  createCoverTransform,
  normalizedToDisplay,
  type DisplayTransform,
} from '../engine/geometry';
import { HAND_CONNECTIONS } from '../engine/hand-model';

interface RenderOptions {
  readonly frame: ObservationFrame | undefined;
  readonly source: CanvasImageSource | undefined;
  readonly mirrorX: boolean;
  readonly overlayVisible: boolean;
  readonly selectedHandId: string | undefined;
  readonly selectedLandmarkIndex: number;
  readonly timestampMs: number;
}

export interface LandmarkHit {
  readonly handId: string;
  readonly landmarkIndex: number;
}

const ACQUISITION_DURATION_MS = 360;

export class LandmarkRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly acquiredAt = new Map<string, number>();
  private transform: DisplayTransform = createCoverTransform(1, 1, 1, 1);
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);

    if (
      this.canvas.width !== backingWidth ||
      this.canvas.height !== backingHeight
    ) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
    this.cssWidth = width;
    this.cssHeight = height;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  render(options: RenderOptions): void {
    this.resize();
    const { context } = this;
    context.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const sourceWidth = options.frame?.sourceWidth ?? 1280;
    const sourceHeight = options.frame?.sourceHeight ?? 720;
    this.transform = options.source
      ? createCoverTransform(
          sourceWidth,
          sourceHeight,
          this.cssWidth,
          this.cssHeight,
          options.mirrorX,
        )
      : createContainTransform(
          1,
          1,
          this.cssWidth,
          this.cssHeight,
          options.mirrorX,
        );

    if (options.source) {
      this.drawSource(options.source, this.transform);
    } else {
      this.drawCalibrationField(options.timestampMs);
    }
    this.drawVignette();

    if (!options.frame || !options.overlayVisible) return;

    this.syncAcquisition(options.frame.observations, options.timestampMs);
    for (const hand of options.frame.observations) {
      this.drawHand(
        hand,
        options.timestampMs,
        hand.id === options.selectedHandId,
        options.selectedLandmarkIndex,
      );
    }
  }

  hitTest(
    frame: ObservationFrame | undefined,
    x: number,
    y: number,
    threshold = 26,
  ): LandmarkHit | undefined {
    if (!frame) return undefined;
    let closest: LandmarkHit | undefined;
    let closestDistance = threshold;

    for (const hand of frame.observations) {
      for (let index = 0; index < hand.landmarks.length; index += 1) {
        const landmark = hand.landmarks[index];
        if (!landmark) continue;
        const point = normalizedToDisplay(landmark, this.transform);
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = { handId: hand.id, landmarkIndex: index };
        }
      }
    }
    return closest;
  }

  pointFor(
    hand: HandObservation,
    landmarkIndex: number,
  ): PixelPoint | undefined {
    const landmark = hand.landmarks[landmarkIndex];
    return landmark ? normalizedToDisplay(landmark, this.transform) : undefined;
  }

  private drawSource(
    source: CanvasImageSource,
    transform: DisplayTransform,
  ): void {
    const { context } = this;
    context.save();
    if (transform.mirrorX) {
      context.translate(this.cssWidth, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      source,
      transform.offsetX,
      transform.offsetY,
      transform.inputWidth * transform.scale,
      transform.inputHeight * transform.scale,
    );
    context.restore();
    context.fillStyle = 'rgba(7, 9, 10, 0.14)';
    context.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }

  private drawCalibrationField(timestampMs: number): void {
    const { context } = this;
    context.fillStyle = '#101316';
    context.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const spacing = Math.max(54, this.cssWidth / 18);
    context.strokeStyle = 'rgba(245, 239, 229, 0.075)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= this.cssWidth; x += spacing) {
      context.moveTo(x, 0);
      context.lineTo(x, this.cssHeight);
    }
    for (let y = 0; y <= this.cssHeight; y += spacing) {
      context.moveTo(0, y);
      context.lineTo(this.cssWidth, y);
    }
    context.stroke();

    const scanX = this.reducedMotion.matches
      ? this.cssWidth * 0.5
      : ((timestampMs % 5000) / 5000) * (this.cssWidth + spacing) - spacing;
    const gradient = context.createLinearGradient(scanX - 80, 0, scanX + 80, 0);
    gradient.addColorStop(0, 'rgba(255, 79, 47, 0)');
    gradient.addColorStop(0.5, 'rgba(255, 79, 47, 0.08)');
    gradient.addColorStop(1, 'rgba(255, 79, 47, 0)');
    context.fillStyle = gradient;
    context.fillRect(scanX - 80, 0, 160, this.cssHeight);
  }

  private drawVignette(): void {
    const gradient = this.context.createRadialGradient(
      this.cssWidth * 0.54,
      this.cssHeight * 0.45,
      this.cssWidth * 0.08,
      this.cssWidth * 0.54,
      this.cssHeight * 0.45,
      Math.max(this.cssWidth, this.cssHeight) * 0.76,
    );
    gradient.addColorStop(0, 'rgba(5, 7, 8, 0)');
    gradient.addColorStop(1, 'rgba(5, 7, 8, 0.58)');
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }

  private syncAcquisition(
    observations: readonly HandObservation[],
    timestampMs: number,
  ): void {
    const activeIds = new Set(observations.map(({ id }) => id));
    for (const id of this.acquiredAt.keys()) {
      if (!activeIds.has(id)) this.acquiredAt.delete(id);
    }
    for (const { id } of observations) {
      if (!this.acquiredAt.has(id)) this.acquiredAt.set(id, timestampMs);
    }
  }

  private drawHand(
    hand: HandObservation,
    timestampMs: number,
    selected: boolean,
    selectedLandmarkIndex: number,
  ): void {
    const { context } = this;
    const acquiredAt = this.acquiredAt.get(hand.id) ?? timestampMs;
    const revealProgress = this.reducedMotion.matches
      ? 1
      : Math.min(
          1,
          Math.max(0, (timestampMs - acquiredAt) / ACQUISITION_DURATION_MS),
        );
    const connectionCount = Math.ceil(HAND_CONNECTIONS.length * revealProgress);
    const opacity = 0.28 + hand.confidence * 0.72;

    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = selected ? '#ff4f2f' : '#f5efe5';
    context.fillStyle = selected ? '#ff4f2f' : '#f5efe5';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 1 + hand.confidence * 2.2;
    context.beginPath();
    for (let index = 0; index < connectionCount; index += 1) {
      const connection = HAND_CONNECTIONS[index];
      if (!connection) continue;
      const start = hand.landmarks[connection[0]];
      const end = hand.landmarks[connection[1]];
      if (!start || !end) continue;
      const startPoint = normalizedToDisplay(start, this.transform);
      const endPoint = normalizedToDisplay(end, this.transform);
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
    }
    context.stroke();

    for (let index = 0; index < hand.landmarks.length; index += 1) {
      const landmark = hand.landmarks[index];
      if (!landmark) continue;
      const point = normalizedToDisplay(landmark, this.transform);
      const isSelected = selected && index === selectedLandmarkIndex;
      context.beginPath();
      context.arc(point.x, point.y, isSelected ? 7 : 3.2, 0, Math.PI * 2);
      context.fill();
      if (isSelected) {
        context.globalAlpha = 0.62;
        context.strokeStyle = '#ff4f2f';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(point.x, point.y, 13, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([3, 7]);
        context.beginPath();
        context.moveTo(point.x + 14, point.y);
        context.lineTo(this.cssWidth - 18, point.y);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = opacity;
      }
    }

    const wrist = hand.landmarks[0];
    if (wrist) {
      const labelPoint = normalizedToDisplay(wrist, this.transform);
      context.globalAlpha = 0.9;
      context.fillStyle = '#0b0d0f';
      context.fillRect(labelPoint.x - 2, labelPoint.y + 14, 42, 20);
      context.fillStyle = '#f5efe5';
      context.font = '600 10px ui-monospace, SFMono-Regular, monospace';
      context.fillText(
        hand.handedness === 'left' ? 'LEFT' : 'RIGHT',
        labelPoint.x + 5,
        labelPoint.y + 28,
      );
    }
    context.restore();
  }
}
