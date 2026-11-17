/** One separated output track. */
export interface Stem {
  name: string // e.g. "vocals", "drums", "bass", "other"
  buffer: AudioBuffer
}

/** Where the heavy lifting actually ran. */
export type Backend = 'webgpu' | 'wasm' | 'js'

export interface Progress {
  /** Human label, e.g. "Downloading model". */
  stage: string
  /** 0..1, or null when indeterminate. */
  fraction: number | null
  /** Extra info, e.g. "23 / 67 MB". */
  detail?: string
  /** True for the stage whose speed reflects the model's processing speed (drives ETA). */
  timed?: boolean
}

export interface SplitOptions {
  onProgress?: (p: Progress) => void
  /** Lets the UI cancel a long-running split. */
  signal?: AbortSignal
}

export interface SplitResult {
  stems: Stem[]
  backend: Backend
  /** Seconds spent separating (excludes model download/setup). */
  processingSeconds: number
}

/**
 * Rough resource profile, shown in the UI so users know what they're in for.
 * Time is a real-time factor: seconds of processing per second of audio.
 */
export interface ModelPerf {
  downloadMB: number
  /** Approximate peak RAM in GB while processing. */
  ramGB: number
  gpu: 'not needed' | 'recommended'
  rtf: {
    /** [fast GPU, weak GPU] via WebGPU. Absent if the model can't use the GPU. */
    gpu?: [number, number]
    /** [fast CPU, slow CPU] via multi-threaded WASM / plain JS. */
    cpu: [number, number]
  }
  /** 1–5, subjective separation quality. */
  quality: number
}

/**
 * Every splitter (in-browser DSP, ONNX model, remote API, ...) implements
 * this interface. The UI only talks to this contract, so adding a model is
 * just adding an entry to the registry in `models.ts`.
 */
export interface SplitterModel {
  id: string
  label: string
  description: string
  /** Where the work runs — shown in the UI so users know if audio leaves their machine. */
  runtime: 'browser' | 'server'
  /** Stem names this model produces, in display order. */
  stems: string[]
  /** False for models that are listed but not implemented yet. */
  available: boolean
  perf: ModelPerf
  /** Credit line for the model authors, if any. */
  credit?: string
  separate(input: AudioBuffer, options?: SplitOptions): Promise<SplitResult>
}
