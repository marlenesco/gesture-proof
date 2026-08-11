function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Camera stream did not expose video metadata.'));
    }, 5000);
    const onLoaded = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('Camera video could not start.'));
    };
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function cameraAbort(): DOMException {
  return new DOMException('Camera start was superseded.', 'AbortError');
}

export function isCameraAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export class CameraSource {
  private stream: MediaStream | undefined;
  private generation = 0;

  constructor(
    readonly video: HTMLVideoElement,
    private readonly mediaDevices = navigator.mediaDevices,
  ) {}

  get supported(): boolean {
    return typeof this.mediaDevices?.getUserMedia === 'function';
  }

  async start(): Promise<void> {
    this.stop();
    if (!this.supported) {
      throw new DOMException('Camera API is unavailable.', 'NotSupportedError');
    }
    const generation = this.generation;
    const stream = await this.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      throw cameraAbort();
    }

    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await waitForVideoMetadata(this.video);
      await this.video.play();
      if (generation !== this.generation) throw cameraAbort();
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  stop(): void {
    this.generation += 1;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
  }
}
