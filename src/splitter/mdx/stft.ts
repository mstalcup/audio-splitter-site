import { FFT } from './fft'

export interface MdxParams {
  nFft: number
  hop: number
  /** Frequency bins fed to the model (the rest are dropped / zero-filled). */
  dimF: number
  /** STFT frames per model call. */
  dimT: number
  /** UVR's volume compensation for deriving the secondary stem. */
  compensate: number
}

/**
 * STFT / iSTFT matching UVR MDX-Net's torch implementation:
 * periodic Hann window, center=True with reflect padding, first `dimF` bins,
 * tensor layout [1, 4, dimF, dimT] with planes [L.re, L.im, R.re, R.im].
 *
 * Both channels share one complex FFT per frame (L + iR packing).
 */
export class MdxStft {
  readonly chunkLen: number
  readonly tensorSize: number
  private readonly fft: FFT
  private readonly window: Float64Array
  private readonly wsum: Float64Array
  private readonly zRe: Float64Array
  private readonly zIm: Float64Array
  private readonly fRe: Float64Array
  private readonly fIm: Float64Array
  private readonly accL: Float64Array
  private readonly accR: Float64Array
  private readonly p: MdxParams
  private readonly zeroLowBins: number

  constructor(params: MdxParams, zeroLowBins = 3) {
    const { nFft, hop, dimF, dimT } = params
    this.p = params
    this.zeroLowBins = zeroLowBins
    this.chunkLen = hop * (dimT - 1)
    this.tensorSize = 4 * dimF * dimT
    this.fft = new FFT(nFft)
    this.window = new Float64Array(nFft)
    for (let i = 0; i < nFft; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft)

    const padded = this.chunkLen + nFft
    this.wsum = new Float64Array(padded)
    for (let t = 0; t < dimT; t++) {
      for (let i = 0; i < nFft; i++) this.wsum[t * hop + i] += this.window[i] * this.window[i]
    }
    this.accL = new Float64Array(padded)
    this.accR = new Float64Array(padded)
    this.zRe = new Float64Array(nFft)
    this.zIm = new Float64Array(nFft)
    this.fRe = new Float64Array(nFft)
    this.fIm = new Float64Array(nFft)
  }

  /** left/right: chunkLen samples → out: model input tensor data. */
  forward(left: Float32Array, right: Float32Array, out: Float32Array) {
    const { nFft, hop, dimF, dimT } = this.p
    const { zRe, zIm, fRe, fIm, window } = this
    const len = this.chunkLen
    const half = nFft / 2
    const plane = dimF * dimT

    for (let t = 0; t < dimT; t++) {
      const start = t * hop - half
      for (let i = 0; i < nFft; i++) {
        let s = start + i
        if (s < 0) s = -s
        else if (s >= len) s = 2 * (len - 1) - s
        zRe[i] = left[s] * window[i]
        zIm[i] = right[s] * window[i]
      }
      this.fft.transform(zRe, zIm, fRe, fIm)
      for (let k = 0; k < dimF; k++) {
        const idx = k * dimT + t
        if (k < this.zeroLowBins) {
          out[idx] = out[plane + idx] = out[2 * plane + idx] = out[3 * plane + idx] = 0
          continue
        }
        const nk = k === 0 ? 0 : nFft - k
        const a = fRe[k], b = fIm[k], c = fRe[nk], d = fIm[nk]
        out[idx] = (a + c) * 0.5 // L real
        out[plane + idx] = (b - d) * 0.5 // L imag
        out[2 * plane + idx] = (b + d) * 0.5 // R real
        out[3 * plane + idx] = (c - a) * 0.5 // R imag
      }
    }
  }

  /** spec: model output tensor data → outL/outR: chunkLen samples. */
  inverse(spec: Float32Array, outL: Float32Array, outR: Float32Array) {
    const { nFft, hop, dimF, dimT } = this.p
    const { zRe, zIm, fRe, fIm, window, accL, accR, wsum } = this
    const half = nFft / 2
    const plane = dimF * dimT
    const scale = 1 / nFft
    accL.fill(0)
    accR.fill(0)

    for (let t = 0; t < dimT; t++) {
      zRe.fill(0)
      zIm.fill(0)
      for (let k = 0; k < dimF; k++) {
        const idx = k * dimT + t
        const p = spec[idx], q = spec[plane + idx], r = spec[2 * plane + idx], s = spec[3 * plane + idx]
        if (k === 0) {
          // DC must be real for a real signal: drop imaginary parts.
          zRe[0] = p
          zIm[0] = r
          continue
        }
        // Z = XL + i·XR, with Hermitian mirror for negative frequencies.
        zRe[k] = p - s
        zIm[k] = q + r
        zRe[nFft - k] = p + s
        zIm[nFft - k] = r - q
      }
      // Inverse DFT via conj(FFT(conj(Z))) / N.
      for (let i = 0; i < nFft; i++) zIm[i] = -zIm[i]
      this.fft.transform(zRe, zIm, fRe, fIm)
      const base = t * hop
      for (let i = 0; i < nFft; i++) {
        const w = window[i] * scale
        accL[base + i] += fRe[i] * w
        accR[base + i] -= fIm[i] * w
      }
    }

    for (let j = 0; j < this.chunkLen; j++) {
      const ws = wsum[j + half]
      const inv = ws > 1e-11 ? 1 / ws : 0
      outL[j] = accL[j + half] * inv
      outR[j] = accR[j + half] * inv
    }
  }
}
