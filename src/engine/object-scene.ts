import type { NormalizedPoint } from './contracts';

export interface SceneObject {
  readonly id: string;
  readonly kind: 'cube';
  x: number;
  y: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
}

export interface SceneObjectSeed {
  readonly x: number;
  readonly y: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ?: number;
  readonly scale: number;
}

export interface ObjectSceneOptions {
  readonly initialObjects?: readonly SceneObjectSeed[];
}

export interface DiscardedSceneObject {
  readonly object: SceneObject;
  readonly index: number;
}

export interface DiscardedSceneObjects {
  readonly items: readonly DiscardedSceneObject[];
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const CUBE_VERTICES: readonly Point3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
] as const;

export const CUBE_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

const CREATE_POSITIONS = [
  { x: 0.5, y: 0.49 },
  { x: 0.3, y: 0.63 },
  { x: 0.7, y: 0.63 },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneObject(object: SceneObject): SceneObject {
  return { ...object };
}

function pointInsidePolygon(
  point: NormalizedPoint,
  polygon: readonly NormalizedPoint[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function cubeIsInsidePolygon(
  object: SceneObject,
  polygon: readonly NormalizedPoint[],
  aspectRatio = 1,
): boolean {
  const projection = new Float32Array(CUBE_VERTICES.length * 2);
  projectCubeInto(object, projection, aspectRatio);
  return CUBE_VERTICES.every((_, index) =>
    pointInsidePolygon(
      {
        x: projection[index * 2] ?? Number.NaN,
        y: projection[index * 2 + 1] ?? Number.NaN,
      },
      polygon,
    ),
  );
}

export function projectCubeInto(
  object: SceneObject,
  output: Float32Array,
  aspectRatio = 1,
): void {
  if (output.length < CUBE_VERTICES.length * 2) {
    throw new Error('Cube projection output requires sixteen values.');
  }
  const sinX = Math.sin(object.rotationX);
  const cosX = Math.cos(object.rotationX);
  const sinY = Math.sin(object.rotationY);
  const cosY = Math.cos(object.rotationY);
  const sinZ = Math.sin(object.rotationZ);
  const cosZ = Math.cos(object.rotationZ);
  const size = 0.105 * object.scale;

  CUBE_VERTICES.forEach((vertex, index) => {
    const xAfterY = vertex.x * cosY + vertex.z * sinY;
    const zAfterY = -vertex.x * sinY + vertex.z * cosY;
    const yAfterX = vertex.y * cosX - zAfterY * sinX;
    const zAfterX = vertex.y * sinX + zAfterY * cosX;
    const xAfterZ = xAfterY * cosZ - yAfterX * sinZ;
    const yAfterZ = xAfterY * sinZ + yAfterX * cosZ;
    const perspective = 1 / (1 + zAfterX * 0.16);
    output[index * 2] =
      object.x + ((xAfterZ * size * perspective) / aspectRatio) * 0.9;
    output[index * 2 + 1] = object.y + yAfterZ * size * perspective;
  });
}

export function cubeContainsPoint(
  object: SceneObject,
  x: number,
  y: number,
  padding = 0.035,
): boolean {
  const radius = 0.155 * object.scale + padding;
  return Math.hypot(x - object.x, y - object.y) <= radius;
}

export class ObjectScene {
  private readonly items: SceneObject[] = [];
  private readonly selectedIds = new Set<string>();
  private nextId = 1;

  constructor(
    readonly capacity: number,
    private readonly options: ObjectSceneOptions = {},
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3) {
      throw new Error(
        'Object scene capacity must be an integer from one to three.',
      );
    }
    this.reset();
  }

  get objects(): readonly SceneObject[] {
    return this.items;
  }

  get selected(): SceneObject | undefined {
    return this.selectedObjects[0];
  }

  get selectedObjects(): readonly SceneObject[] {
    return this.items.filter(({ id }) => this.selectedIds.has(id));
  }

  get selectedId(): string | undefined {
    return this.selected?.id;
  }

  get selectionIds(): readonly string[] {
    return this.selectedObjects.map(({ id }) => id);
  }

  get count(): number {
    return this.items.length;
  }

  get full(): boolean {
    return this.items.length >= this.capacity;
  }

  reset(): void {
    this.items.length = 0;
    this.selectedIds.clear();
    this.nextId = 1;
    const initialObjects = this.options.initialObjects;
    if (initialObjects?.length) {
      initialObjects
        .slice(0, this.capacity)
        .forEach((seed) => this.create(seed));
      return;
    }
    this.create();
  }

  create(seed?: SceneObjectSeed): SceneObject | undefined {
    if (this.full) return undefined;
    const position = CREATE_POSITIONS[this.items.length] ?? CREATE_POSITIONS[0];
    const object: SceneObject = {
      id: `cube-${this.nextId}`,
      kind: 'cube',
      x: seed?.x ?? position.x,
      y: seed?.y ?? position.y,
      rotationX: seed?.rotationX ?? -0.32,
      rotationY: seed?.rotationY ?? 0.48 + this.items.length * 0.22,
      rotationZ: seed?.rotationZ ?? 0,
      scale: seed?.scale ?? 1,
    };
    this.nextId += 1;
    this.items.push(object);
    this.selectedIds.clear();
    this.selectedIds.add(object.id);
    return object;
  }

  select(id: string): boolean {
    if (!this.items.some((object) => object.id === id)) return false;
    this.selectedIds.clear();
    this.selectedIds.add(id);
    return true;
  }

  selectIds(ids: readonly string[]): void {
    const valid = new Set(ids);
    this.selectedIds.clear();
    this.items.forEach(({ id }) => {
      if (valid.has(id)) this.selectedIds.add(id);
    });
  }

  isInsidePolygon(
    object: SceneObject,
    polygon: readonly NormalizedPoint[],
    aspectRatio = 1,
  ): boolean {
    return cubeIsInsidePolygon(object, polygon, aspectRatio);
  }

  selectAt(x: number, y: number): SceneObject | undefined {
    const object = this.items
      .toReversed()
      .find((candidate) => cubeContainsPoint(candidate, x, y));
    if (object) this.select(object.id);
    return object;
  }

  selectRelative(offset: -1 | 1): SceneObject | undefined {
    if (this.items.length === 0) return undefined;
    const current = this.items.findIndex(({ id }) => this.selectedIds.has(id));
    const index =
      (Math.max(0, current) + offset + this.items.length) % this.items.length;
    const selected = this.items[index];
    if (selected) this.select(selected.id);
    return selected;
  }

  selectInsidePolygon(
    polygon: readonly NormalizedPoint[],
    aspectRatio = 1,
  ): readonly SceneObject[] {
    const selected = this.items.filter((object) =>
      cubeIsInsidePolygon(object, polygon, aspectRatio),
    );
    this.selectIds(selected.map(({ id }) => id));
    return selected;
  }

  translate(deltaX: number, deltaY: number): void {
    this.selectedObjects.forEach((selected) => {
      selected.x = clamp(selected.x + deltaX, 0.11, 0.89);
      selected.y = clamp(selected.y + deltaY, 0.17, 0.86);
    });
  }

  rotate(deltaX: number, deltaY: number): void {
    this.selectedObjects.forEach((selected) => {
      selected.rotationX += deltaX;
      selected.rotationY += deltaY;
    });
  }

  resize(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.selectedObjects.forEach((selected) => {
      selected.scale = clamp(selected.scale * factor, 0.3, 1.8);
    });
  }

  discardSelected(): DiscardedSceneObject | undefined {
    const index = this.items.findIndex(({ id }) => this.selectedIds.has(id));
    if (index < 0) return undefined;
    const [object] = this.items.splice(index, 1);
    if (!object) return undefined;
    const next = this.items[Math.min(index, this.items.length - 1)];
    this.selectedIds.clear();
    if (next) this.selectedIds.add(next.id);
    return { object: cloneObject(object), index };
  }

  restore(discarded: DiscardedSceneObject): boolean {
    if (this.full || this.items.some(({ id }) => id === discarded.object.id)) {
      return false;
    }
    const index = clamp(discarded.index, 0, this.items.length);
    const object = cloneObject(discarded.object);
    this.items.splice(index, 0, object);
    this.selectedIds.clear();
    this.selectedIds.add(object.id);
    const numericId = Number.parseInt(object.id.replace('cube-', ''), 10);
    if (Number.isFinite(numericId))
      this.nextId = Math.max(this.nextId, numericId + 1);
    return true;
  }

  discardSelection(): DiscardedSceneObjects | undefined {
    const removed = this.items
      .map((object, index) => ({ object, index }))
      .filter(({ object }) => this.selectedIds.has(object.id));
    if (removed.length === 0) return undefined;
    for (let index = removed.length - 1; index >= 0; index -= 1) {
      const item = removed[index];
      if (item) this.items.splice(item.index, 1);
    }
    this.selectedIds.clear();
    return {
      items: removed.map(({ object, index }) => ({
        object: cloneObject(object),
        index,
      })),
    };
  }

  restoreSelection(discarded: DiscardedSceneObjects): boolean {
    if (this.count + discarded.items.length > this.capacity) return false;
    if (
      discarded.items.some(({ object }) =>
        this.items.some(({ id }) => id === object.id),
      )
    ) {
      return false;
    }
    this.selectedIds.clear();
    [...discarded.items]
      .sort((first, second) => first.index - second.index)
      .forEach(({ object, index }) => {
        this.items.splice(
          clamp(index, 0, this.items.length),
          0,
          cloneObject(object),
        );
        this.selectedIds.add(object.id);
      });
    return true;
  }
}
