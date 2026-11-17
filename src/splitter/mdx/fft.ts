/**
 * Mixed-radix complex FFT (forward, unnormalized), ported from KISS FFT.
 * MDX-Net uses non-power-of-two sizes (7680 = 2^9·3·5, 5120 = 2^10·5),
 * so a plain radix-2 FFT won't do.
 */
export class FFT {
  readonly n: number
  private readonly factors: number[] = [] // [p0, m0, p1, m1, ...]
  private readonly twRe: Float64Array
  private readonly twIm: Float64Array
  private readonly scRe: Float64Array
  private readonly scIm: Float64Array
  private inRe!: Float64Array
  private inIm!: Float64Array
  private oRe!: Float64Array
  private oIm!: Float64Array

  constructor(n: number) {
    this.n = n
    this.twRe = new Float64Array(n)
    this.twIm = new Float64Array(n)
    for (let k = 0; k < n; k++) {
      const phase = (-2 * Math.PI * k) / n
      this.twRe[k] = Math.cos(phase)
      this.twIm[k] = Math.sin(phase)
    }

    // Factor n: 4s first, then 2, 3, 5, 7, ...
    const floorSqrt = Math.floor(Math.sqrt(n))
    let rem = n
    let p = 4
    let maxP = 1
    do {
      while (rem % p !== 0) {
        p = p === 4 ? 2 : p === 2 ? 3 : p + 2
        if (p > floorSqrt) p = rem
      }
      rem /= p
      this.factors.push(p, rem)
      maxP = Math.max(maxP, p)
    } while (rem > 1)

    this.scRe = new Float64Array(maxP)
    this.scIm = new Float64Array(maxP)
  }

  /** out = DFT(in). Input and output arrays must be distinct, length n. */
  transform(inRe: Float64Array, inIm: Float64Array, outRe: Float64Array, outIm: Float64Array) {
    this.inRe = inRe
    this.inIm = inIm
    this.oRe = outRe
    this.oIm = outIm
    this.work(0, 0, 1, 0)
  }

  private work(outOff: number, inOff: number, fstride: number, stage: number) {
    const p = this.factors[stage * 2]
    const m = this.factors[stage * 2 + 1]
    const end = outOff + p * m
    if (m === 1) {
      let j = inOff
      for (let k = outOff; k < end; k++) {
        this.oRe[k] = this.inRe[j]
        this.oIm[k] = this.inIm[j]
        j += fstride
      }
    } else {
      let j = inOff
      for (let k = outOff; k < end; k += m) {
        this.work(k, j, fstride * p, stage + 1)
        j += fstride
      }
    }
    if (p === 4) this.bfly4(outOff, fstride, m)
    else if (p === 2) this.bfly2(outOff, fstride, m)
    else this.bflyGeneric(outOff, fstride, m, p)
  }

  private bfly2(off: number, fstride: number, m: number) {
    const { oRe, oIm, twRe, twIm } = this
    for (let u = 0; u < m; u++) {
      const i0 = off + u
      const i1 = i0 + m
      const t = u * fstride
      const tr = oRe[i1] * twRe[t] - oIm[i1] * twIm[t]
      const ti = oRe[i1] * twIm[t] + oIm[i1] * twRe[t]
      oRe[i1] = oRe[i0] - tr
      oIm[i1] = oIm[i0] - ti
      oRe[i0] += tr
      oIm[i0] += ti
    }
  }

  private bfly4(off: number, fstride: number, m: number) {
    const { oRe, oIm, twRe, twIm } = this
    for (let u = 0; u < m; u++) {
      const i0 = off + u
      const i1 = i0 + m
      const i2 = i1 + m
      const i3 = i2 + m
      const t1 = u * fstride
      const t2 = 2 * t1
      const t3 = 3 * t1

      const s0r = oRe[i1] * twRe[t1] - oIm[i1] * twIm[t1]
      const s0i = oRe[i1] * twIm[t1] + oIm[i1] * twRe[t1]
      const s1r = oRe[i2] * twRe[t2] - oIm[i2] * twIm[t2]
      const s1i = oRe[i2] * twIm[t2] + oIm[i2] * twRe[t2]
      const s2r = oRe[i3] * twRe[t3] - oIm[i3] * twIm[t3]
      const s2i = oRe[i3] * twIm[t3] + oIm[i3] * twRe[t3]

      const s5r = oRe[i0] - s1r
      const s5i = oIm[i0] - s1i
      const a0r = oRe[i0] + s1r
      const a0i = oIm[i0] + s1i
      const s3r = s0r + s2r
      const s3i = s0i + s2i
      const s4r = s0r - s2r
      const s4i = s0i - s2i

      oRe[i2] = a0r - s3r
      oIm[i2] = a0i - s3i
      oRe[i0] = a0r + s3r
      oIm[i0] = a0i + s3i
      oRe[i1] = s5r + s4i
      oIm[i1] = s5i - s4r
      oRe[i3] = s5r - s4i
      oIm[i3] = s5i + s4r
    }
  }

  private bflyGeneric(off: number, fstride: number, m: number, p: number) {
    const { oRe, oIm, twRe, twIm, scRe, scIm, n } = this
    for (let u = 0; u < m; u++) {
      let k = u
      for (let q = 0; q < p; q++) {
        scRe[q] = oRe[off + k]
        scIm[q] = oIm[off + k]
        k += m
      }
      k = u
      for (let q1 = 0; q1 < p; q1++) {
        let tw = 0
        let accR = scRe[0]
        let accI = scIm[0]
        for (let q = 1; q < p; q++) {
          tw += fstride * k
          if (tw >= n) tw -= n
          accR += scRe[q] * twRe[tw] - scIm[q] * twIm[tw]
          accI += scRe[q] * twIm[tw] + scIm[q] * twRe[tw]
        }
        oRe[off + k] = accR
        oIm[off + k] = accI
        k += m
      }
    }
  }
}
