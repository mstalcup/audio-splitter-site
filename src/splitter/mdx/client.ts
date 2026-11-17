import type { ModelPerf, SplitterModel, SplitResult } from '../types'
import type { RunRequest, WorkerMessage } from './protocol'
import type { MdxParams } from './stft'

const SAMPLE_RATE = 44100
const MB = 1024 * 1024

let worker: Worker | null = null
const getWorker = () =>
  (worker ??= new Worker(new URL('./mdx.worker.ts', import.meta.url), { type: 'module', name: 'mdx-splitter' }))

interface MdxModelConfig {
  id: string
  label: string
  description: string
  modelUrl: string
  params: MdxParams
  /** What the network predicts; the other stem is mix − primary. */
  primaryStem: string
  secondaryStem: string
  perf: ModelPerf
  credit: string
}

/** Wraps a UVR MDX-Net ONNX model (run in a Web Worker) as a SplitterModel. */
export function createMdxModel(cfg: MdxModelConfig): SplitterModel {
  return {
    id: cfg.id,
    label: cfg.label,
    description: cfg.description,
    runtime: 'browser',
    stems: ['vocals', 'instrumental'],
    available: true,
    perf: cfg.perf,
    credit: cfg.credit,

    separate(input, { onProgress, signal } = {}) {
      if (input.sampleRate !== SAMPLE_RATE) {
        return Promise.reject(new Error(`Expected ${SAMPLE_RATE} Hz audio, got ${input.sampleRate} Hz.`))
      }
      const left = input.getChannelData(0).slice()
      const right = input.numberOfChannels > 1 ? input.getChannelData(1).slice() : left.slice()

      return new Promise<SplitResult>((resolve, reject) => {
        const w = getWorker()
        let separateStart = 0

        const onAbort = () => {
          w.terminate()
          worker = null
          reject(new DOMException('Cancelled', 'AbortError'))
        }
        if (signal?.aborted) return onAbort()
        signal?.addEventListener('abort', onAbort, { once: true })
        const cleanup = () => signal?.removeEventListener('abort', onAbort)

        w.onerror = (e) => {
          cleanup()
          worker = null
          reject(new Error(e.message || 'The splitter worker crashed (possibly out of memory).'))
        }
        w.onmessage = (e: MessageEvent<WorkerMessage>) => {
          const msg = e.data
          switch (msg.type) {
            case 'progress':
              if (msg.stage === 'download') {
                onProgress?.({
                  stage: 'Downloading model (first time only)',
                  fraction: msg.total ? msg.loaded / msg.total : null,
                  detail: `${(msg.loaded / MB).toFixed(0)} / ${msg.total ? (msg.total / MB).toFixed(0) : '?'} MB`,
                })
              } else if (msg.stage === 'load') {
                onProgress?.({ stage: 'Preparing model', fraction: null })
              } else {
                if (!separateStart) separateStart = performance.now()
                onProgress?.({
                  stage: 'Separating',
                  fraction: msg.done / msg.total,
                  detail: msg.backend === 'webgpu' ? 'GPU' : 'CPU',
                  timed: true,
                })
              }
              break
            case 'done': {
              cleanup()
              const toBuffer = ([l, r]: [Float32Array, Float32Array]) => {
                const b = new AudioBuffer({ numberOfChannels: 2, length: l.length, sampleRate: SAMPLE_RATE })
                b.copyToChannel(l as Float32Array<ArrayBuffer>, 0)
                b.copyToChannel(r as Float32Array<ArrayBuffer>, 1)
                return b
              }
              const byName: Record<string, AudioBuffer> = {
                [cfg.primaryStem]: toBuffer(msg.primary),
                [cfg.secondaryStem]: toBuffer(msg.secondary),
              }
              resolve({
                stems: ['vocals', 'instrumental'].map((name) => ({ name, buffer: byName[name] })),
                backend: msg.backend,
                processingSeconds: (performance.now() - separateStart) / 1000,
              })
              break
            }
            case 'error':
              cleanup()
              reject(new Error(msg.message))
              break
          }
        }

        const req: RunRequest = { type: 'run', modelUrl: cfg.modelUrl, params: cfg.params, left, right }
        w.postMessage(req, [left.buffer, right.buffer])
      })
    },
  }
}
