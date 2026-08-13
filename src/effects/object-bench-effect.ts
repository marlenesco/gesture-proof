import type { NormalizedPoint } from '../engine/contracts';
import {
  CUBE_EDGES,
  projectCubeInto,
  type SceneObject,
} from '../engine/object-scene';
import type { ObjectManipulationAction } from '../gesture/object-manipulation-signal';

export interface ObjectBenchRenderState {
  readonly objects: readonly SceneObject[];
  readonly selectedId?: string;
  readonly selectedIds?: readonly string[];
  readonly cursor?: NormalizedPoint;
  readonly action?: ObjectManipulationAction;
  readonly aperture?: readonly NormalizedPoint[];
  readonly deletion?: {
    readonly ids: readonly string[];
    readonly progress: number;
  };
  readonly timestampMs: number;
}

const MAX_OBJECTS = 3;

export class ObjectBenchEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly projections = Array.from(
    { length: MAX_OBJECTS },
    () => new Float32Array(16),
  );
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private width = 1;
  private height = 1;
  private lineColor = '#e8e3d8';
  private mutedColor = 'rgba(232, 227, 216, 0.28)';
  private accentColor = '#78f4ff';

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  render(state: ObjectBenchRenderState): void {
    this.resize();
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.drawDraftingField();
    if (state.aperture && state.aperture.length >= 3) {
      this.drawAperture(state.aperture);
    }
    const selectedIds = new Set(
      state.selectedIds ?? (state.selectedId ? [state.selectedId] : []),
    );
    state.objects.forEach((object, index) => {
      const projection = this.projections[index];
      if (!projection) return;
      projectCubeInto(object, projection, this.width / this.height);
      this.drawCube(
        object,
        projection,
        selectedIds.has(object.id),
        state.action,
        state.timestampMs,
        state.deletion?.ids.includes(object.id)
          ? state.deletion.progress
          : undefined,
      );
    });
    if (state.cursor) this.drawCursor(state.cursor, state.action);
  }

  private drawDraftingField(): void {
    const context = this.context;
    context.save();
    context.strokeStyle = 'rgba(232, 227, 216, 0.045)';
    context.lineWidth = 1;
    const spacing = Math.max(48, Math.round(this.height / 10));
    for (let x = this.width % spacing; x < this.width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.height);
      context.stroke();
    }
    for (let y = this.height % spacing; y < this.height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.width, y);
      context.stroke();
    }
    context.restore();
  }

  private drawCube(
    object: SceneObject,
    projection: Float32Array,
    selected: boolean,
    action: ObjectManipulationAction | undefined,
    timestampMs: number,
    deletionProgress: number | undefined,
  ): void {
    const context = this.context;
    const deleting = deletionProgress !== undefined;
    const opacity = deleting ? Math.max(0, 1 - deletionProgress) : 1;
    const collapse = deleting ? Math.max(0.02, 1 - deletionProgress * 0.94) : 1;
    const centerX = object.x * this.width;
    const centerY = object.y * this.height;
    if (selected) {
      const pulse =
        action && !this.reducedMotion.matches
          ? 1 + Math.sin(timestampMs / 120) * 0.035
          : 1;
      context.save();
      context.strokeStyle = this.accentColor;
      context.globalAlpha = action ? 0.34 : 0.18;
      context.lineWidth = 1;
      context.setLineDash([4, 8]);
      context.beginPath();
      context.arc(
        centerX,
        centerY,
        this.height *
          0.175 *
          object.scale *
          pulse *
          (deleting ? 1 + deletionProgress * 0.8 : 1),
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.restore();
    }

    context.save();
    context.strokeStyle = selected ? this.accentColor : this.lineColor;
    context.globalAlpha = (selected ? 1 : 0.48) * opacity;
    context.lineWidth = selected ? 2 : 1.15;
    context.lineJoin = 'round';
    CUBE_EDGES.forEach(([from, to]) => {
      const fromX = projection[from * 2];
      const fromY = projection[from * 2 + 1];
      const toX = projection[to * 2];
      const toY = projection[to * 2 + 1];
      if (
        fromX === undefined ||
        fromY === undefined ||
        toX === undefined ||
        toY === undefined
      ) {
        return;
      }
      context.beginPath();
      context.moveTo(
        centerX + (fromX * this.width - centerX) * collapse,
        centerY + (fromY * this.height - centerY) * collapse,
      );
      context.lineTo(
        centerX + (toX * this.width - centerX) * collapse,
        centerY + (toY * this.height - centerY) * collapse,
      );
      context.stroke();
    });
    context.restore();

    context.save();
    context.fillStyle = selected ? this.accentColor : this.mutedColor;
    context.globalAlpha = opacity;
    context.font = '600 10px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText(
      object.id.toUpperCase(),
      object.x * this.width,
      object.y * this.height + this.height * 0.2 * object.scale,
    );
    context.restore();
  }

  private drawAperture(corners: readonly NormalizedPoint[]): void {
    const context = this.context;
    const first = corners[0];
    if (!first) return;
    context.save();
    context.strokeStyle = this.accentColor;
    context.fillStyle = this.accentColor;
    context.globalAlpha = 0.13;
    context.beginPath();
    context.moveTo(first.x * this.width, first.y * this.height);
    corners.slice(1).forEach((corner) => {
      context.lineTo(corner.x * this.width, corner.y * this.height);
    });
    context.closePath();
    context.fill();
    context.globalAlpha = 0.86;
    context.setLineDash([6, 8]);
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  private drawCursor(
    cursor: NormalizedPoint,
    action: ObjectManipulationAction | undefined,
  ): void {
    const context = this.context;
    const x = cursor.x * this.width;
    const y = cursor.y * this.height;
    context.save();
    context.strokeStyle = action ? this.accentColor : this.mutedColor;
    context.lineWidth = action ? 2 : 1;
    context.beginPath();
    context.arc(x, y, action ? 12 : 7, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(x - 18, y);
    context.lineTo(x - 8, y);
    context.moveTo(x + 8, y);
    context.lineTo(x + 18, y);
    context.moveTo(x, y - 18);
    context.lineTo(x, y - 8);
    context.moveTo(x, y + 8);
    context.lineTo(x, y + 18);
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
      const style = getComputedStyle(this.canvas);
      this.lineColor =
        style.getPropertyValue('--object-line').trim() || this.lineColor;
      this.mutedColor =
        style.getPropertyValue('--object-muted').trim() || this.mutedColor;
      this.accentColor =
        style.getPropertyValue('--object-accent').trim() || this.accentColor;
    }
  }
}
