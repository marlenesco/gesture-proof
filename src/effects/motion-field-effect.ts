import type { GestureSignal } from '../engine/contracts';
import type { GestureStateMatrixPayload } from '../gesture/gesture-state-matrix';
import type { MotionSignalPayload } from '../gesture/motion-signal';

const PARTICLE_CAPACITY = 320;

export type MotionFieldMode =
  'trace' | 'emit' | 'stream' | 'curl' | 'attract' | 'disperse';

export function motionFieldMode(
  matrix: GestureSignal<GestureStateMatrixPayload>,
): MotionFieldMode {
  if (matrix.phase !== 'active') return 'trace';
  switch (matrix.payload.gesture) {
    case 'open-palm':
      return 'emit';
    case 'point':
      return 'stream';
    case 'pinch':
      return 'curl';
    case 'fist':
      return 'attract';
    case 'two-hand-span':
      return 'disperse';
    case undefined:
      return 'trace';
  }
}

export class MotionFieldEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly x = new Float32Array(PARTICLE_CAPACITY);
  private readonly y = new Float32Array(PARTICLE_CAPACITY);
  private readonly previousX = new Float32Array(PARTICLE_CAPACITY);
  private readonly previousY = new Float32Array(PARTICLE_CAPACITY);
  private readonly velocityX = new Float32Array(PARTICLE_CAPACITY);
  private readonly velocityY = new Float32Array(PARTICLE_CAPACITY);
  private readonly life = new Float32Array(PARTICLE_CAPACITY);
  private readonly maximumLife = new Float32Array(PARTICLE_CAPACITY);
  private width = 1;
  private height = 1;
  private lastTimestampMs = 0;
  private lastSignalTimestampMs = -1;
  private cursor = 0;
  private spawnRemainder = 0;
  private randomState = 0x5eed1234;
  private alive = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  get particleCount(): number {
    return this.alive;
  }

  render(
    motion: GestureSignal<MotionSignalPayload>,
    matrix: GestureSignal<GestureStateMatrixPayload>,
    timestampMs: number,
    mirrorX: boolean,
  ): void {
    this.resize();
    if (this.reducedMotion.matches) {
      if (motion.timestampMs === this.lastSignalTimestampMs) return;
      this.lastSignalTimestampMs = motion.timestampMs;
      this.drawReduced(motion, mirrorX);
      return;
    }

    const elapsedSeconds = Math.min(
      0.05,
      Math.max(0, (timestampMs - this.lastTimestampMs) / 1000),
    );
    this.lastTimestampMs = timestampMs;
    const context = this.context;
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = `rgba(0, 0, 0, ${Math.min(0.22, elapsedSeconds * 2.8)})`;
    context.fillRect(0, 0, this.width, this.height);
    context.restore();

    const position = motion.payload.position;
    const anchorX = position
      ? (mirrorX ? 1 - position.x : position.x) * this.width
      : this.width / 2;
    const anchorY = position ? position.y * this.height : this.height / 2;
    const mode = motionFieldMode(matrix);
    this.integrate(elapsedSeconds, anchorX, anchorY, mode);

    if (motion.phase === 'active' && position && elapsedSeconds > 0) {
      const velocityX = mirrorX
        ? -motion.payload.velocityX
        : motion.payload.velocityX;
      const desired =
        motion.payload.speed * 54 * elapsedSeconds + this.spawnRemainder;
      const count = Math.min(8, Math.floor(desired));
      this.spawnRemainder = desired - count;
      for (let index = 0; index < count; index += 1) {
        this.spawn(
          anchorX,
          anchorY,
          velocityX * this.width,
          motion.payload.velocityY * this.height,
          mode,
        );
      }
    }
    this.draw(mode);
  }

  reset(): void {
    this.life.fill(0);
    this.maximumLife.fill(0);
    this.alive = 0;
    this.cursor = 0;
    this.spawnRemainder = 0;
    this.lastTimestampMs = 0;
    this.lastSignalTimestampMs = -1;
    this.context.clearRect(0, 0, this.width, this.height);
  }

  private integrate(
    elapsedSeconds: number,
    anchorX: number,
    anchorY: number,
    mode: MotionFieldMode,
  ): void {
    let alive = 0;
    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      let life = this.life[index] ?? 0;
      if (life <= 0) continue;
      let x = this.x[index] ?? 0;
      let y = this.y[index] ?? 0;
      let velocityX = this.velocityX[index] ?? 0;
      let velocityY = this.velocityY[index] ?? 0;
      this.previousX[index] = x;
      this.previousY[index] = y;
      const dx = anchorX - x;
      const dy = anchorY - y;
      const distance = Math.max(24, Math.hypot(dx, dy));
      const force = elapsedSeconds * 80;

      if (mode === 'attract') {
        velocityX += (dx / distance) * force;
        velocityY += (dy / distance) * force;
      } else if (mode === 'disperse') {
        velocityX -= (dx / distance) * force * 1.25;
        velocityY -= (dy / distance) * force * 1.25;
      } else if (mode === 'curl') {
        velocityX += (-dy / distance) * force;
        velocityY += (dx / distance) * force;
      }

      const drag = Math.exp(-elapsedSeconds * 1.8);
      velocityX *= drag;
      velocityY *= drag;
      x += velocityX * elapsedSeconds;
      y += velocityY * elapsedSeconds;
      life -= elapsedSeconds;
      if (x < -40 || x > this.width + 40 || y < -40 || y > this.height + 40) {
        life = 0;
      }
      this.x[index] = x;
      this.y[index] = y;
      this.velocityX[index] = velocityX;
      this.velocityY[index] = velocityY;
      this.life[index] = life;
      if (life > 0) alive += 1;
    }
    this.alive = alive;
  }

  private spawn(
    anchorX: number,
    anchorY: number,
    sourceVelocityX: number,
    sourceVelocityY: number,
    mode: MotionFieldMode,
  ): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % PARTICLE_CAPACITY;
    const angle = this.random() * Math.PI * 2;
    const radius = this.random() * (mode === 'disperse' ? 28 : 10);
    const x = anchorX + Math.cos(angle) * radius;
    const y = anchorY + Math.sin(angle) * radius;
    this.x[index] = x;
    this.y[index] = y;
    this.previousX[index] = x;
    this.previousY[index] = y;
    const spread = mode === 'stream' ? 14 : mode === 'emit' ? 48 : 28;
    this.velocityX[index] =
      sourceVelocityX * 0.16 + Math.cos(angle) * this.random() * spread;
    this.velocityY[index] =
      sourceVelocityY * 0.16 + Math.sin(angle) * this.random() * spread;
    const life = 0.65 + this.random() * 1.15;
    this.life[index] = life;
    this.maximumLife[index] = life;
  }

  private draw(mode: MotionFieldMode): void {
    const context = this.context;
    context.save();
    context.lineCap = 'round';
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle =
      mode === 'curl' ? '#ffcb66' : mode === 'attract' ? '#f4f1e8' : '#b9ff35';
    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const life = this.life[index] ?? 0;
      if (life <= 0) continue;
      const alpha = life / Math.max(0.001, this.maximumLife[index] ?? 0);
      context.globalAlpha = alpha * 0.72;
      context.lineWidth = 0.8 + alpha * 1.8;
      context.beginPath();
      context.moveTo(this.previousX[index] ?? 0, this.previousY[index] ?? 0);
      context.lineTo(this.x[index] ?? 0, this.y[index] ?? 0);
      context.stroke();
    }
    context.restore();
  }

  private drawReduced(
    motion: GestureSignal<MotionSignalPayload>,
    mirrorX: boolean,
  ): void {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.life.fill(0);
    this.alive = 0;
    const position = motion.payload.position;
    if (!position) return;
    const x = (mirrorX ? 1 - position.x : position.x) * this.width;
    const y = position.y * this.height;
    context.save();
    context.strokeStyle = '#b9ff35';
    context.fillStyle = 'rgba(185, 255, 53, 0.18)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 14, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  private random(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
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
