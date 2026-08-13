import { describe, expect, it } from 'vitest';
import {
  CUBE_EDGES,
  ObjectScene,
  cubeContainsPoint,
  projectCubeInto,
} from './object-scene';

describe('ObjectScene', () => {
  it('starts with one selected cube', () => {
    const scene = new ObjectScene(3);
    expect(scene.count).toBe(1);
    expect(scene.selected?.id).toBe('cube-1');
  });

  it('enforces a small deterministic capacity', () => {
    const scene = new ObjectScene(2);
    expect(scene.create()?.id).toBe('cube-2');
    expect(scene.create()).toBeUndefined();
    expect(scene.full).toBe(true);
  });

  it('clamps translation to safe stage bounds', () => {
    const scene = new ObjectScene(3);
    scene.translate(-2, 3);
    expect(scene.selected).toMatchObject({ x: 0.11, y: 0.86 });
  });

  it('applies rotation without changing position or scale', () => {
    const scene = new ObjectScene(3);
    const before = { ...scene.selected! };
    scene.rotate(0.2, -0.3);
    expect(scene.selected?.rotationX).toBeCloseTo(before.rotationX + 0.2);
    expect(scene.selected?.rotationY).toBeCloseTo(before.rotationY - 0.3);
    expect(scene.selected?.x).toBe(before.x);
    expect(scene.selected?.scale).toBe(before.scale);
  });

  it('clamps scale and rejects invalid factors', () => {
    const scene = new ObjectScene(3);
    scene.resize(8);
    expect(scene.selected?.scale).toBe(1.8);
    scene.resize(0.01);
    expect(scene.selected?.scale).toBe(0.3);
    scene.resize(Number.NaN);
    expect(scene.selected?.scale).toBe(0.3);
  });

  it('selects by hit area and cycles stable identity', () => {
    const scene = new ObjectScene(3);
    const second = scene.create();
    expect(second).toBeDefined();
    expect(scene.selectAt(0.5, 0.49)?.id).toBe('cube-1');
    expect(scene.selectRelative(1)?.id).toBe('cube-2');
    expect(scene.selectRelative(-1)?.id).toBe('cube-1');
  });

  it('discards and restores exact object identity and transform', () => {
    const scene = new ObjectScene(3);
    scene.translate(0.13, 0.08);
    scene.rotate(0.2, 0.3);
    scene.resize(1.2);
    const expected = { ...scene.selected! };
    const discarded = scene.discardSelected();
    expect(scene.count).toBe(0);
    expect(discarded).toBeDefined();
    expect(scene.restore(discarded!)).toBe(true);
    expect(scene.selected).toEqual(expected);
  });

  it('prevents duplicate restore and resets to one cube', () => {
    const scene = new ObjectScene(3);
    const discarded = scene.discardSelected()!;
    expect(scene.restore(discarded)).toBe(true);
    expect(scene.restore(discarded)).toBe(false);
    scene.create();
    scene.reset();
    expect(scene.objects.map(({ id }) => id)).toEqual(['cube-1']);
  });

  it('selects only cubes whose complete projected geometry stays in a polygon', () => {
    const scene = new ObjectScene(3);
    scene.create();
    const selected = scene.selectInsidePolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
    expect(selected.map(({ id }) => id)).toEqual(['cube-1', 'cube-2']);
    expect(scene.selectionIds).toEqual(['cube-1', 'cube-2']);

    scene.selectInsidePolygon([
      { x: 0.44, y: 0.4 },
      { x: 0.56, y: 0.4 },
      { x: 0.56, y: 0.58 },
      { x: 0.44, y: 0.58 },
    ]);
    expect(scene.selectionIds).toEqual([]);
  });

  it('commits an explicit preview id set and can clear it without deleting cubes', () => {
    const scene = new ObjectScene(3);
    scene.create();
    scene.selectIds(['cube-2']);
    expect(scene.selectionIds).toEqual(['cube-2']);
    scene.selectIds([]);
    expect(scene.selectionIds).toEqual([]);
    expect(scene.count).toBe(2);
  });

  it('transforms and restores a selected set as one command', () => {
    const scene = new ObjectScene(3);
    scene.create();
    scene.selectInsidePolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
    scene.resize(0.3);
    expect(scene.selectedObjects.map(({ scale }) => scale)).toEqual([0.3, 0.3]);
    const discarded = scene.discardSelection();
    expect(scene.count).toBe(0);
    expect(scene.restoreSelection(discarded!)).toBe(true);
    expect(scene.selectionIds).toEqual(['cube-1', 'cube-2']);
  });

  it('rejects unsafe capacities', () => {
    expect(() => new ObjectScene(0)).toThrow(/one to three/);
    expect(() => new ObjectScene(4)).toThrow(/one to three/);
  });
});

describe('wireframe geometry', () => {
  it('defines one cube as eight vertices and twelve edges', () => {
    expect(CUBE_EDGES).toHaveLength(12);
    const output = new Float32Array(16);
    const scene = new ObjectScene(1);
    projectCubeInto(scene.selected!, output, 16 / 9);
    expect([...output].every(Number.isFinite)).toBe(true);
  });

  it('changes projected vertices after rotation', () => {
    const scene = new ObjectScene(1);
    const before = new Float32Array(16);
    const after = new Float32Array(16);
    projectCubeInto(scene.selected!, before);
    scene.rotate(0.5, 0.7);
    projectCubeInto(scene.selected!, after);
    expect(after).not.toEqual(before);
  });

  it('uses a bounded hit target around projected object center', () => {
    const scene = new ObjectScene(1);
    expect(cubeContainsPoint(scene.selected!, 0.5, 0.49)).toBe(true);
    expect(cubeContainsPoint(scene.selected!, 0.05, 0.05)).toBe(false);
  });
});
