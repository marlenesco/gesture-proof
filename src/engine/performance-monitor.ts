const SAMPLE_LIMIT = 120;

export interface PerformanceSnapshot {
  readonly displayFps: number;
  readonly inferenceFps: number;
  readonly medianInferenceMs: number;
  readonly worstInferenceMs: number;
  readonly longTaskCount: number;
}

export class PerformanceMonitor {
  private readonly inferenceDurations: number[] = [];
  private displayFrames = 0;
  private inferenceFrames = 0;
  private displayWindowStartedAt = performance.now();
  private inferenceWindowStartedAt = performance.now();
  private displayFps = 0;
  private inferenceFps = 0;
  private longTaskCount = 0;
  private observer: PerformanceObserver | undefined;

  constructor() {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
    ) {
      this.observer = new PerformanceObserver((list) => {
        this.longTaskCount += list
          .getEntries()
          .filter(({ duration }) => duration > 50).length;
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    }
  }

  markDisplay(timestampMs: number): void {
    this.displayFrames += 1;
    const elapsed = timestampMs - this.displayWindowStartedAt;
    if (elapsed >= 1000) {
      this.displayFps = (this.displayFrames * 1000) / elapsed;
      this.displayFrames = 0;
      this.displayWindowStartedAt = timestampMs;
    }
  }

  markInference(timestampMs: number, durationMs: number): void {
    this.inferenceFrames += 1;
    this.inferenceDurations.push(durationMs);
    if (this.inferenceDurations.length > SAMPLE_LIMIT) {
      this.inferenceDurations.shift();
    }
    const elapsed = timestampMs - this.inferenceWindowStartedAt;
    if (elapsed >= 1000) {
      this.inferenceFps = (this.inferenceFrames * 1000) / elapsed;
      this.inferenceFrames = 0;
      this.inferenceWindowStartedAt = timestampMs;
    }
  }

  snapshot(): PerformanceSnapshot {
    const sorted = [...this.inferenceDurations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const worst = sorted.at(-1) ?? 0;
    return {
      displayFps: this.displayFps,
      inferenceFps: this.inferenceFps,
      medianInferenceMs: median,
      worstInferenceMs: worst,
      longTaskCount: this.longTaskCount,
    };
  }

  dispose(): void {
    this.observer?.disconnect();
  }
}
