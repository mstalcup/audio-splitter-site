import type { DeviceInfo } from '../device'
import type { Backend, SplitterModel } from './types'

export type Path = 'gpu' | 'cpu'

export interface Estimate {
  /** Seconds, [best, worst]. */
  range: [number, number]
  path: Path
  /** True when based on a previous run on this device rather than defaults. */
  measured: boolean
}

/** Single-threaded WASM (no cross-origin isolation) is roughly this much slower. */
const SINGLE_THREAD_PENALTY = 4

const storageKey = (modelId: string, path: Path) => `rtf:${modelId}:${path}`

/** Which hardware a model will use on this device. */
export function pathFor(model: SplitterModel, device: DeviceInfo | null): Path {
  return device?.webgpu && model.perf.rtf.gpu ? 'gpu' : 'cpu'
}

export function estimate(model: SplitterModel, device: DeviceInfo | null, audioSeconds: number): Estimate {
  const path = pathFor(model, device)
  const measured = loadMeasured(model.id, path)
  if (measured) {
    // A single past run is a good guide; widen a little for variance.
    return { range: [measured * audioSeconds * 0.85, measured * audioSeconds * 1.2], path, measured: true }
  }
  let [lo, hi] = (path === 'gpu' ? model.perf.rtf.gpu : model.perf.rtf.cpu) ?? model.perf.rtf.cpu
  if (path === 'cpu' && device && !device.isolated && model.perf.rtf.gpu) {
    lo *= SINGLE_THREAD_PENALTY
    hi *= SINGLE_THREAD_PENALTY
  }
  return { range: [lo * audioSeconds, hi * audioSeconds], path, measured: false }
}

/** Default (unmeasured) range for a specific path — for the comparison table. */
export function defaultRange(model: SplitterModel, path: Path, audioSeconds: number): [number, number] | null {
  const rtf = model.perf.rtf[path]
  return rtf ? [rtf[0] * audioSeconds, rtf[1] * audioSeconds] : null
}

export function recordRun(modelId: string, backend: Backend, processingSeconds: number, audioSeconds: number) {
  if (audioSeconds < 5 || backend === 'js') return
  const path: Path = backend === 'webgpu' ? 'gpu' : 'cpu'
  try {
    localStorage.setItem(storageKey(modelId, path), String(processingSeconds / audioSeconds))
  } catch {
    /* storage unavailable */
  }
}

function loadMeasured(modelId: string, path: Path): number | null {
  try {
    const v = Number(localStorage.getItem(storageKey(modelId, path)))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

export function formatDuration(sec: number): string {
  if (sec < 1) return 'under a second'
  if (sec < 60) return `${Math.round(sec)} s`
  const min = sec / 60
  if (min < 10) return `${min.toFixed(1).replace(/\.0$/, '')} min`
  return `${Math.round(min)} min`
}

export function formatRange([lo, hi]: [number, number]): string {
  if (hi < 1) return 'instant'
  if (hi < 5) return 'a few seconds'
  const a = formatDuration(lo)
  const b = formatDuration(hi)
  if (a === b) return `~${a}`
  // "20 s – 1.5 min" or "4–12 min"
  if (a.endsWith(' min') && b.endsWith(' min')) return `${a.replace(' min', '')}–${b}`
  if (a.endsWith(' s') && b.endsWith(' s')) return `${a.replace(' s', '')}–${b}`
  return `${a} – ${b}`
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
