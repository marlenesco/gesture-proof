export interface OneEuroFilterConfig {
  readonly minimumCutoff: number;
  readonly beta: number;
  readonly derivativeCutoff: number;
}

export const DEFAULT_ONE_EURO_CONFIG: OneEuroFilterConfig = {
  minimumCutoff: 1,
  beta: 1.2,
  derivativeCutoff: 1,
};

function smoothingFactor(cutoff: number, elapsedSeconds: number): number {
  const ratio = 2 * Math.PI * cutoff * elapsedSeconds;
  return ratio / (ratio + 1);
}

function smooth(previous: number, current: number, factor: number): number {
  return factor * current + (1 - factor) * previous;
}

export class OneEuroFilter {
  private previousTimestampMs: number | undefined;
  private previousRaw: number | undefined;
  private filteredValue: number | undefined;
  private filteredDerivative = 0;

  constructor(
    private readonly config: OneEuroFilterConfig = DEFAULT_ONE_EURO_CONFIG,
  ) {}

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) return value;
    if (
      this.previousTimestampMs === undefined ||
      this.previousRaw === undefined ||
      this.filteredValue === undefined
    ) {
      this.previousTimestampMs = timestampMs;
      this.previousRaw = value;
      this.filteredValue = value;
      this.filteredDerivative = 0;
      return value;
    }

    const elapsedSeconds = (timestampMs - this.previousTimestampMs) / 1000;
    if (elapsedSeconds <= 0) return this.filteredValue;
    const derivative = (value - this.previousRaw) / elapsedSeconds;
    this.filteredDerivative = smooth(
      this.filteredDerivative,
      derivative,
      smoothingFactor(this.config.derivativeCutoff, elapsedSeconds),
    );
    const cutoff =
      this.config.minimumCutoff +
      this.config.beta * Math.abs(this.filteredDerivative);
    this.filteredValue = smooth(
      this.filteredValue,
      value,
      smoothingFactor(cutoff, elapsedSeconds),
    );
    this.previousTimestampMs = timestampMs;
    this.previousRaw = value;
    return this.filteredValue;
  }

  reset(): void {
    this.previousTimestampMs = undefined;
    this.previousRaw = undefined;
    this.filteredValue = undefined;
    this.filteredDerivative = 0;
  }
}
