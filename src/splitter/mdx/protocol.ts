import type { MdxParams } from './stft'

export type Backend = 'webgpu' | 'wasm'

export interface RunRequest {
  type: 'run'
  modelUrl: string
  params: MdxParams
  left: Float32Array
  right: Float32Array
}

export type WorkerMessage =
  | { type: 'progress'; stage: 'download'; loaded: number; total: number }
  | { type: 'progress'; stage: 'load' }
  | { type: 'progress'; stage: 'separate'; done: number; total: number; backend: Backend }
  | {
      type: 'done'
      backend: Backend
      primary: [Float32Array, Float32Array]
      secondary: [Float32Array, Float32Array]
    }
  | { type: 'error'; message: string }
