export type VideoFrameProcessor = (timestampMs: number) => number;

export class VideoFrameScheduler {
  private running = false;
  private request: number | undefined;
  private lastMediaTime = -1;
  private lastInferenceAtMs = 0;
  private previousDurationMs = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly processFrame: VideoFrameProcessor,
    private readonly onError: (error: unknown) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMediaTime = -1;
    this.lastInferenceAtMs = 0;
    this.previousDurationMs = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.request === undefined) return;
    if ('cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.request);
    } else {
      cancelAnimationFrame(this.request);
    }
    this.request = undefined;
  }

  private schedule(): void {
    if (!this.running) return;
    if ('requestVideoFrameCallback' in this.video) {
      this.request = this.video.requestVideoFrameCallback(
        (timestampMs, metadata) => {
          this.request = undefined;
          this.process(timestampMs, metadata.mediaTime);
          this.schedule();
        },
      );
      return;
    }
    this.request = requestAnimationFrame((timestampMs) => {
      this.request = undefined;
      this.process(timestampMs, this.video.currentTime);
      this.schedule();
    });
  }

  private process(timestampMs: number, mediaTime: number): void {
    if (!this.running || mediaTime === this.lastMediaTime) return;
    const minimumInterval = Math.min(
      67,
      Math.max(33, this.previousDurationMs * 1.25),
    );
    if (timestampMs - this.lastInferenceAtMs < minimumInterval) return;

    this.lastMediaTime = mediaTime;
    this.lastInferenceAtMs = timestampMs;
    try {
      this.previousDurationMs = this.processFrame(timestampMs);
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  }
}
