import { MdxStft, type MdxParams } from './stft'

/** Runs the network on one spectrogram tensor ([1, 4, dimF, dimT] flattened). */
export type RunModel = (input: Float32Array) => Promise<Float32Array>

export interface DemixResult {
  primary: [Float32Array, Float32Array]
  secondary: [Float32Array, Float32Array]
}

/** Number of model calls demixMdx will make — useful for progress/ETA. */
export function countChunks(samples: number, params: MdxParams, overlap = 0.1) {
  const { step, total } = layout(samples, params, overlap)
  return Math.ceil(total / step)
}

function layout(samples: number, params: MdxParams, overlap: number) {
  const chunk = params.hop * (params.dimT - 1)
  const trim = params.nFft / 2
  const gen = chunk - 2 * trim
  const pad = gen + trim - (samples % gen)
  const total = trim + samples + pad
  const step = Math.max(1, Math.floor((1 - overlap) * chunk))
  return { chunk, trim, total, step }
}

/**
 * UVR-style MDX-Net separation: slide an overlapping, Hann-weighted window of
 * `hop * (dimT - 1)` samples over the padded track, run STFT → model → iSTFT
 * per chunk, and overlap-add. The secondary stem is mix − primary·compensate.
 */
export async function demixMdx(
  left: Float32Array,
  right: Float32Array,
  params: MdxParams,
  run: RunModel,
  onChunk?: (done: number, total: number) => void,
  overlap = 0.1,
): Promise<DemixResult> {
  const samples = left.length
  const { chunk, trim, total, step } = layout(samples, params, overlap)
  const stft = new MdxStft(params)

  const mixL = new Float32Array(total)
  const mixR = new Float32Array(total)
  mixL.set(left, trim)
  mixR.set(right, trim)

  const resL = new Float32Array(total)
  const resR = new Float32Array(total)
  const divider = new Float32Array(total)

  const inL = new Float32Array(chunk)
  const inR = new Float32Array(chunk)
  const outL = new Float32Array(chunk)
  const outR = new Float32Array(chunk)
  const tensor = new Float32Array(stft.tensorSize)

  const nChunks = Math.ceil(total / step)
  let done = 0
  for (let start = 0; start < total; start += step) {
    const end = Math.min(start + chunk, total)
    const actual = end - start
    inL.fill(0)
    inR.fill(0)
    inL.set(mixL.subarray(start, end))
    inR.set(mixR.subarray(start, end))

    stft.forward(inL, inR, tensor)
    const pred = await run(tensor)
    stft.inverse(pred, outL, outR)

    // Symmetric Hann (np.hanning) over the real chunk length.
    for (let i = 0; i < actual; i++) {
      const w = actual === 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (actual - 1))
      resL[start + i] += outL[i] * w
      resR[start + i] += outR[i] * w
      divider[start + i] += w
    }
    onChunk?.(++done, nChunks)
  }

  const pL = new Float32Array(samples)
  const pR = new Float32Array(samples)
  const sL = new Float32Array(samples)
  const sR = new Float32Array(samples)
  const c = params.compensate
  for (let i = 0; i < samples; i++) {
    const d = divider[i + trim]
    const inv = d > 1e-8 ? 1 / d : 0
    pL[i] = resL[i + trim] * inv
    pR[i] = resR[i + trim] * inv
    sL[i] = left[i] - pL[i] * c
    sR[i] = right[i] - pR[i] * c
  }
  return { primary: [pL, pR], secondary: [sL, sR] }
}
