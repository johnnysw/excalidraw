/**
 * Author: Gery Casiez
 * https://github.com/casiez/OneEuroFilter
 *
 * OneEuroFilter implementation in TypeScript.
 */

class LowPassFilter {
  y: number | null = null;
  s: number | null = null;
  alpha: number = 0;

  constructor(alpha: number, initval: number | null = null) {
    this.y = initval;
    this.s = initval;
    this.setAlpha(alpha);
  }

  setAlpha(alpha: number) {
    this.alpha = alpha;
  }

  filter(value: number, s: number | null = null) {
    if (this.y === null) {
      const sVal = s !== null ? s : value;
      this.s = sVal;
      this.y = value;
      return value;
    }
    let sVal = this.s;
    if (s !== null) {
      sVal = s;
    }
    // @ts-ignore
    this.s = sVal;
    // @ts-ignore
    this.y = this.alpha * value + (1.0 - this.alpha) * sVal;
    return this.y as number;
  }

  lastValue() {
    return this.y;
  }
}

export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dcutoff: number;
  xFilter: LowPassFilter;
  yFilter: LowPassFilter;
  dxFilter: LowPassFilter;
  dyFilter: LowPassFilter;
  lastTime: number | null = null;

  constructor(
    minCutoff: number = 1.0,
    beta: number = 0.0,
    dcutoff: number = 1.0,
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter(this.alpha(minCutoff));
    this.yFilter = new LowPassFilter(this.alpha(minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(dcutoff));
    this.dyFilter = new LowPassFilter(this.alpha(dcutoff));
  }

  alpha(cutoff: number): number {
    const te = 1.0 / 60.0; // Assume 60Hz if delta is not available (initial)
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  setFrequency(te: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(x: number, y: number, timestamp: number) {
    if (this.lastTime !== null && timestamp !== this.lastTime) {
      // Calculate te (sampling period) in seconds
      const te = (timestamp - this.lastTime) / 1000.0;

      // Filter the derivative (speed)
      const dx = (x - (this.xFilter.lastValue() || x)) / te;
      const dy = (y - (this.yFilter.lastValue() || y)) / te;

      const edx = this.dxFilter.filter(dx, this.dxFilter.lastValue());
      const edy = this.dyFilter.filter(dy, this.dyFilter.lastValue());

      // Use the filtered speed to adapt the cutoff frequency
      const speed = Math.sqrt(edx * edx + edy * edy);
      const cutoff = this.minCutoff + this.beta * speed;

      // Update alpha based on dynamic cutoff and actual sampling period
      this.xFilter.setAlpha(this.setFrequency(te, cutoff));
      this.yFilter.setAlpha(this.setFrequency(te, cutoff));
    }

    const xFiltered = this.xFilter.filter(x, this.xFilter.lastValue());
    const yFiltered = this.yFilter.filter(y, this.yFilter.lastValue());

    this.lastTime = timestamp;

    return [xFiltered, yFiltered];
  }
}
