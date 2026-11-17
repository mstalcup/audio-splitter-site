import { useEffect, useRef, useState } from 'react'
import { decodeFile } from './audio/codec'
import { DropZone } from './components/DropZone'
import { CompareModels, DeviceSummary, FormatNote } from './components/ModelInfo'
import { ModelSelect } from './components/ModelSelect'
import { StemList } from './components/StemList'
import { detectDevice, type DeviceInfo } from './device'
import { formatClock, formatDuration, recordRun } from './splitter/estimate'
import { DEFAULT_MODEL_ID, MODELS } from './splitter/models'
import type { Progress, SplitResult } from './splitter/types'

type Status =
  | { kind: 'idle' }
  | { kind: 'decoding' }
  | { kind: 'working'; progress: Progress; eta: number | null }
  | { kind: 'done'; result: SplitResult; modelLabel: string; audioSeconds: number }
  | { kind: 'error'; message: string }

const BACKEND_LABEL = { webgpu: 'GPU (WebGPU)', wasm: 'CPU (WebAssembly)', js: 'CPU' } as const

/** speed = audio seconds per processing second. */
const speedLabel = (speed: number) =>
  speed >= 1 ? `${speed.toFixed(1)}× faster than real-time` : `${(1 / speed).toFixed(1)}× slower than real-time`

export default function App() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [audio, setAudio] = useState<AudioBuffer | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const timedStartRef = useRef(0)

  useEffect(() => {
    detectDevice().then(setDevice)
  }, [])

  const busy = status.kind === 'working' || status.kind === 'decoding'

  const chooseFile = async (f: File) => {
    setFile(f)
    setAudio(null)
    setStatus({ kind: 'decoding' })
    try {
      setAudio(await decodeFile(f))
      setStatus({ kind: 'idle' })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const split = async () => {
    const model = MODELS.find((m) => m.id === modelId)
    if (!audio || !model) return

    const abort = new AbortController()
    abortRef.current = abort
    timedStartRef.current = 0
    setStatus({ kind: 'working', progress: { stage: 'Starting', fraction: null }, eta: null })

    try {
      const result = await model.separate(audio, {
        signal: abort.signal,
        onProgress: (progress) => {
          // ETA from observed throughput of the timed (processing) stage.
          let eta: number | null = null
          if (progress.timed) {
            const now = performance.now()
            if (!timedStartRef.current) timedStartRef.current = now
            const f = progress.fraction ?? 0
            const elapsed = (now - timedStartRef.current) / 1000
            if (f > 0.02 && elapsed > 1) eta = (elapsed / f) * (1 - f)
          }
          setStatus({ kind: 'working', progress, eta })
        },
      })
      recordRun(model.id, result.backend, result.processingSeconds, audio.duration)
      setStatus({ kind: 'done', result, modelLabel: model.label, audioSeconds: audio.duration })
    } catch (err) {
      if (abort.signal.aborted) setStatus({ kind: 'idle' })
      else setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      abortRef.current = null
    }
  }

  return (
    <main className="container">
      <header>
        <h1>Stem Splitter</h1>
        <p className="tagline">Split a song into separate tracks, right in your browser. No sign-up, no upload.</p>
        <DeviceSummary device={device} />
      </header>

      <DropZone onFile={chooseFile} disabled={busy} />

      {file && (
        <section className="panel">
          <div className="file-row">
            <span className="file-name" title={file.name}>
              {file.name}
            </span>
            <span className="file-size">
              {audio && `${formatClock(audio.duration)} · `}
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>

          <ModelSelect
            value={modelId}
            onChange={setModelId}
            disabled={busy}
            device={device}
            audioSeconds={audio?.duration ?? null}
          />

          {status.kind === 'working' ? (
            <div className="progress-row">
              <div className="progress-label">
                <span>
                  {status.progress.stage}
                  {status.progress.detail && ` · ${status.progress.detail}`}
                  {status.progress.fraction !== null && ` · ${Math.round(status.progress.fraction * 100)}%`}
                </span>
                {status.eta !== null && <span>~{formatDuration(status.eta)} left</span>}
              </div>
              <div className="progress-line">
                <div
                  className={`progress${status.progress.fraction === null ? ' indeterminate' : ''}`}
                  role="progressbar"
                  aria-valuenow={status.progress.fraction === null ? undefined : Math.round(status.progress.fraction * 100)}
                >
                  <div className="progress-bar" style={{ width: `${(status.progress.fraction ?? 0) * 100}%` }} />
                </div>
                <button className="button secondary" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="button" onClick={split} disabled={!audio}>
              {status.kind === 'decoding' ? 'Reading file…' : 'Split'}
            </button>
          )}

          {status.kind === 'error' && <p className="error">{status.message}</p>}
        </section>
      )}

      {status.kind === 'done' && file && (
        <section className="panel">
          <h2>Stems</h2>
          <p className="summary">
            {status.modelLabel} · took {formatDuration(status.result.processingSeconds)} on{' '}
            {BACKEND_LABEL[status.result.backend]}
            {status.result.processingSeconds > 0.5 && ` (${speedLabel(status.audioSeconds / status.result.processingSeconds)})`}
          </p>
          <StemList stems={status.result.stems} sourceName={file.name} />
        </section>
      )}

      <CompareModels />
      <FormatNote />

      <footer>Files are processed locally and never leave your device. AI models download once from Hugging Face.</footer>
    </main>
  )
}
