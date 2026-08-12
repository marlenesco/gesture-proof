import type { NormalizedPoint } from '../engine/contracts';
import type { AperturePayload } from '../gesture/aperture-field';

export const APERTURE_EFFECTS = ['refraction', 'pixelate', 'blur'] as const;
export type ApertureEffectKind = (typeof APERTURE_EFFECTS)[number];

function crossingPoint(
  firstStart: NormalizedPoint,
  firstEnd: NormalizedPoint,
  secondStart: NormalizedPoint,
  secondEnd: NormalizedPoint,
): NormalizedPoint | undefined {
  const firstX = firstEnd.x - firstStart.x;
  const firstY = firstEnd.y - firstStart.y;
  const secondX = secondEnd.x - secondStart.x;
  const secondY = secondEnd.y - secondStart.y;
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) <= Number.EPSILON) return undefined;
  const offsetX = secondStart.x - firstStart.x;
  const offsetY = secondStart.y - firstStart.y;
  const firstProgress = (offsetX * secondY - offsetY * secondX) / denominator;
  const secondProgress = (offsetX * firstY - offsetY * firstX) / denominator;
  if (
    firstProgress <= 0 ||
    firstProgress >= 1 ||
    secondProgress <= 0 ||
    secondProgress >= 1
  ) {
    return undefined;
  }
  return {
    x: firstStart.x + firstX * firstProgress,
    y: firstStart.y + firstY * firstProgress,
  };
}

export class ApertureFieldEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly pixelContext: CanvasRenderingContext2D;
  private readonly pixelCanvas = document.createElement('canvas');
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private width = 1;
  private height = 1;
  private smoothedCorners: NormalizedPoint[] = [];
  private pendingJumpFrames = 0;
  private lastSignalTimestamp = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    const pixelContext = this.pixelCanvas.getContext('2d');
    if (!context || !pixelContext) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    this.pixelContext = pixelContext;
  }

  render(
    signal: {
      readonly phase: string;
      readonly payload: AperturePayload;
      readonly timestampMs: number;
    },
    effect: ApertureEffectKind,
    source: CanvasImageSource | undefined,
    mirrorX: boolean,
    timestampMs: number,
  ): void {
    this.resize();
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    if (signal.payload.corners.length < 3 || signal.phase === 'unknown') return;
    const corners = this.smooth(
      signal.payload.corners,
      mirrorX,
      signal.timestampMs,
    );
    const active = signal.phase === 'active';
    const alpha = active
      ? 1
      : signal.phase === 'candidate'
        ? signal.payload.activationProgress
        : 0.24;
    context.save();
    this.clip(corners);
    context.globalAlpha = alpha;
    if (source) {
      if (effect === 'pixelate')
        this.drawPixelate(source, mirrorX, signal.payload.area);
      else if (effect === 'blur')
        this.drawBlur(source, mirrorX, signal.payload.area);
      else
        this.drawRefraction(
          source,
          mirrorX,
          signal.payload.tension,
          timestampMs,
        );
    } else {
      this.drawFixtureField(effect, signal.payload.tension, timestampMs);
    }
    context.restore();
    this.drawBoundary(corners, alpha, active);
  }

  reset(): void {
    this.smoothedCorners = [];
    this.pendingJumpFrames = 0;
    this.lastSignalTimestamp = -1;
  }

  private smooth(
    corners: readonly NormalizedPoint[],
    mirrorX: boolean,
    timestampMs: number,
  ): readonly NormalizedPoint[] {
    const input = corners.map((point) => ({
      x: mirrorX ? 1 - point.x : point.x,
      y: point.y,
    }));
    if (
      this.smoothedCorners.length !== input.length ||
      this.reducedMotion.matches
    ) {
      this.smoothedCorners = input;
      this.pendingJumpFrames = 0;
      this.lastSignalTimestamp = timestampMs;
      return input;
    }
    if (timestampMs === this.lastSignalTimestamp) return this.smoothedCorners;
    this.lastSignalTimestamp = timestampMs;
    const meanDistance =
      input.reduce((total, point, index) => {
        const previous = this.smoothedCorners[index] ?? point;
        return total + Math.hypot(point.x - previous.x, point.y - previous.y);
      }, 0) / input.length;
    if (meanDistance > 0.28 && this.pendingJumpFrames < 2) {
      this.pendingJumpFrames += 1;
      return this.smoothedCorners;
    }
    this.pendingJumpFrames = 0;
    const alpha = Math.min(0.78, Math.max(0.2, 0.2 + meanDistance * 3.4));
    this.smoothedCorners = input.map((point, index) => {
      const previous = this.smoothedCorners[index] ?? point;
      return {
        x: previous.x + (point.x - previous.x) * alpha,
        y: previous.y + (point.y - previous.y) * alpha,
      };
    });
    return this.smoothedCorners;
  }

  private clip(corners: readonly NormalizedPoint[]): void {
    const intersection =
      corners.length === 4
        ? crossingPoint(corners[0]!, corners[1]!, corners[2]!, corners[3]!)
        : undefined;
    this.context.beginPath();
    if (intersection) {
      this.appendPolygon([corners[0]!, intersection, corners[3]!]);
      this.appendPolygon([corners[1]!, corners[2]!, intersection]);
      this.context.clip('evenodd');
      return;
    }
    this.appendPolygon(corners);
    this.context.clip();
  }

  private appendPolygon(corners: readonly NormalizedPoint[]): void {
    corners.forEach((point, index) => {
      const x = point.x * this.width;
      const y = point.y * this.height;
      if (index === 0) this.context.moveTo(x, y);
      else this.context.lineTo(x, y);
    });
    this.context.closePath();
  }

  private drawSource(source: CanvasImageSource, mirrorX: boolean): void {
    this.context.save();
    if (mirrorX) {
      this.context.translate(this.width, 0);
      this.context.scale(-1, 1);
    }
    this.context.drawImage(source, 0, 0, this.width, this.height);
    this.context.restore();
  }

  private drawRefraction(
    source: CanvasImageSource,
    mirrorX: boolean,
    tension: number,
    timestampMs: number,
  ): void {
    const shift = 6 + tension * 18;
    const drift = this.reducedMotion.matches
      ? 0
      : Math.sin(timestampMs / 220) * shift;
    this.context.save();
    this.context.globalCompositeOperation = 'screen';
    this.context.globalAlpha *= 0.6;
    this.context.translate(drift + shift, -shift * 0.25);
    this.drawSource(source, mirrorX);
    this.context.globalAlpha *= 0.72;
    this.context.translate(-shift * 2, shift * 0.6);
    this.drawSource(source, mirrorX);
    this.context.restore();
    const sheen = this.context.createLinearGradient(
      0,
      0,
      this.width,
      this.height,
    );
    sheen.addColorStop(0, 'rgba(133, 234, 255, 0.26)');
    sheen.addColorStop(0.48, 'rgba(255, 255, 255, 0.03)');
    sheen.addColorStop(1, 'rgba(178, 126, 255, 0.22)');
    this.context.fillStyle = sheen;
    this.context.fillRect(0, 0, this.width, this.height);
  }

  private drawPixelate(
    source: CanvasImageSource,
    mirrorX: boolean,
    area: number,
  ): void {
    const cell = Math.max(8, Math.min(28, Math.round(32 - area * 3)));
    const pixelWidth = Math.max(1, Math.round(this.width / cell));
    const pixelHeight = Math.max(1, Math.round(this.height / cell));
    if (
      this.pixelCanvas.width !== pixelWidth ||
      this.pixelCanvas.height !== pixelHeight
    ) {
      this.pixelCanvas.width = pixelWidth;
      this.pixelCanvas.height = pixelHeight;
    }
    this.pixelContext.imageSmoothingEnabled = false;
    this.pixelContext.clearRect(0, 0, pixelWidth, pixelHeight);
    if (mirrorX) {
      this.pixelContext.save();
      this.pixelContext.translate(pixelWidth, 0);
      this.pixelContext.scale(-1, 1);
      this.pixelContext.drawImage(source, 0, 0, pixelWidth, pixelHeight);
      this.pixelContext.restore();
    } else this.pixelContext.drawImage(source, 0, 0, pixelWidth, pixelHeight);
    this.context.imageSmoothingEnabled = false;
    this.context.drawImage(this.pixelCanvas, 0, 0, this.width, this.height);
    this.context.imageSmoothingEnabled = true;
  }

  private drawBlur(
    source: CanvasImageSource,
    mirrorX: boolean,
    area: number,
  ): void {
    this.context.save();
    this.context.filter = `blur(${Math.min(18, 4 + area * 1.5)}px) saturate(1.35)`;
    this.context.scale(1.04, 1.04);
    this.context.translate(-this.width * 0.02, -this.height * 0.02);
    this.drawSource(source, mirrorX);
    this.context.restore();
  }

  private drawFixtureField(
    effect: ApertureEffectKind,
    tension: number,
    timestampMs: number,
  ): void {
    const context = this.context;
    const drift = this.reducedMotion.matches
      ? 0.5
      : (Math.sin(timestampMs / 700) + 1) / 2;
    const gradient = context.createLinearGradient(
      0,
      0,
      this.width,
      this.height,
    );
    gradient.addColorStop(0, '#ff4fc3');
    gradient.addColorStop(
      0.45 + drift * 0.1,
      effect === 'pixelate' ? '#ffb0df' : '#d484ff',
    );
    gradient.addColorStop(1, effect === 'blur' ? '#ff79bd' : '#3a103e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);
    context.globalCompositeOperation =
      effect === 'blur' ? 'soft-light' : 'overlay';
    context.fillStyle = `rgba(255, 255, 255, ${0.12 + tension * 0.2})`;
    const spacing = effect === 'pixelate' ? 18 : 42;
    for (let x = -spacing; x < this.width + spacing; x += spacing) {
      for (let y = -spacing; y < this.height + spacing; y += spacing) {
        context.fillRect(
          x + ((y / spacing) % 2) * 4,
          y,
          spacing - 3,
          spacing - 3,
        );
      }
    }
    context.globalCompositeOperation = 'source-over';
  }

  private drawBoundary(
    corners: readonly NormalizedPoint[],
    alpha: number,
    active: boolean,
  ): void {
    const context = this.context;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = active ? '#ff75d0' : 'rgba(255, 117, 208, 0.62)';
    context.lineWidth = active ? 2 : 1;
    context.beginPath();
    corners.forEach((point, index) => {
      const x = point.x * this.width;
      const y = point.y * this.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();
    context.restore();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(bounds.width));
    this.height = Math.max(1, Math.round(bounds.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(this.width * ratio);
    const backingHeight = Math.round(this.height * ratio);
    if (
      this.canvas.width !== backingWidth ||
      this.canvas.height !== backingHeight
    ) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }
}
