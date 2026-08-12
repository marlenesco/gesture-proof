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

export interface DiscardedSceneObject {
  readonly object: SceneObject;
  readonly index: number;
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
  private selectedId: string | undefined;
  private nextId = 1;

  constructor(readonly capacity: number) {
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
    return this.items.find(({ id }) => id === this.selectedId);
  }

  get count(): number {
    return this.items.length;
  }

  get full(): boolean {
    return this.items.length >= this.capacity;
  }

  reset(): void {
    this.items.length = 0;
    this.selectedId = undefined;
    this.nextId = 1;
    this.create();
  }

  create(): SceneObject | undefined {
    if (this.full) return undefined;
    const position = CREATE_POSITIONS[this.items.length] ?? CREATE_POSITIONS[0];
    const object: SceneObject = {
      id: `cube-${this.nextId}`,
      kind: 'cube',
      x: position.x,
      y: position.y,
      rotationX: -0.32,
      rotationY: 0.48 + this.items.length * 0.22,
      rotationZ: 0,
      scale: 1,
    };
    this.nextId += 1;
    this.items.push(object);
    this.selectedId = object.id;
    return object;
  }

  select(id: string): boolean {
    if (!this.items.some((object) => object.id === id)) return false;
    this.selectedId = id;
    return true;
  }

  selectAt(x: number, y: number): SceneObject | undefined {
    const object = this.items
      .toReversed()
      .find((candidate) => cubeContainsPoint(candidate, x, y));
    if (object) this.selectedId = object.id;
    return object;
  }

  selectRelative(offset: -1 | 1): SceneObject | undefined {
    if (this.items.length === 0) return undefined;
    const current = this.items.findIndex(({ id }) => id === this.selectedId);
    const index =
      (Math.max(0, current) + offset + this.items.length) % this.items.length;
    const selected = this.items[index];
    this.selectedId = selected?.id;
    return selected;
  }

  translate(deltaX: number, deltaY: number): void {
    const selected = this.selected;
    if (!selected) return;
    selected.x = clamp(selected.x + deltaX, 0.11, 0.89);
    selected.y = clamp(selected.y + deltaY, 0.17, 0.86);
  }

  rotate(deltaX: number, deltaY: number): void {
    const selected = this.selected;
    if (!selected) return;
    selected.rotationX += deltaX;
    selected.rotationY += deltaY;
  }

  resize(factor: number): void {
    const selected = this.selected;
    if (!selected || !Number.isFinite(factor) || factor <= 0) return;
    selected.scale = clamp(selected.scale * factor, 0.48, 1.8);
  }

  discardSelected(): DiscardedSceneObject | undefined {
    const index = this.items.findIndex(({ id }) => id === this.selectedId);
    if (index < 0) return undefined;
    const [object] = this.items.splice(index, 1);
    if (!object) return undefined;
    const next = this.items[Math.min(index, this.items.length - 1)];
    this.selectedId = next?.id;
    return { object: cloneObject(object), index };
  }

  restore(discarded: DiscardedSceneObject): boolean {
    if (this.full || this.items.some(({ id }) => id === discarded.object.id)) {
      return false;
    }
    const index = clamp(discarded.index, 0, this.items.length);
    const object = cloneObject(discarded.object);
    this.items.splice(index, 0, object);
    this.selectedId = object.id;
    const numericId = Number.parseInt(object.id.replace('cube-', ''), 10);
    if (Number.isFinite(numericId))
      this.nextId = Math.max(this.nextId, numericId + 1);
    return true;
  }
}
