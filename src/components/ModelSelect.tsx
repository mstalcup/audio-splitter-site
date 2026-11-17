import type { DeviceInfo } from '../device'
import { estimate, formatClock, formatRange, pathFor } from '../splitter/estimate'
import { MODELS } from '../splitter/models'

interface Props {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  device: DeviceInfo | null
  /** Duration of the loaded song, if any. */
  audioSeconds: number | null
}

const THREE_MIN = 180

export function ModelSelect({ value, onChange, disabled, device, audioSeconds }: Props) {
  const model = MODELS.find((m) => m.id === value)
  if (!model) return null
  const { perf } = model
  const path = pathFor(model, device)
  const est3 = estimate(model, device, THREE_MIN)
  const estSong = audioSeconds ? estimate(model, device, audioSeconds) : null
  const singleThread = path === 'cpu' && device && !device.isolated && perf.rtf.gpu
  const lowMemory = device?.memoryGB !== undefined && device.memoryGB < perf.ramGB

  return (
    <div className="model-select">
      <label htmlFor="model">Model</label>
      <select id="model" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.available}>
            {m.label}
            {m.available ? '' : ' (coming soon)'}
          </option>
        ))}
      </select>
      <p className="model-desc">{model.description}</p>

      <dl className="specs">
        <div>
          <dt>Download</dt>
          <dd>{perf.downloadMB ? `${perf.downloadMB} MB` : 'None'}</dd>
          {perf.downloadMB > 0 && <small>once, then cached</small>}
        </div>
        <div>
          <dt>Memory</dt>
          <dd>~{perf.ramGB < 1 ? `${perf.ramGB * 1000} MB` : `${perf.ramGB} GB`}</dd>
          <small>RAM while running</small>
        </div>
        <div>
          <dt>GPU</dt>
          <dd>{perf.gpu === 'recommended' ? 'Recommended' : 'Not needed'}</dd>
          {perf.gpu === 'recommended' && <small>works without, slower</small>}
        </div>
        <div>
          <dt>Quality</dt>
          <dd className="stars" aria-label={`${perf.quality} out of 5`}>
            {'★'.repeat(perf.quality)}
            <span className="dim">{'★'.repeat(5 - perf.quality)}</span>
          </dd>
        </div>
      </dl>

      <div className="time-est">
        <div className="time-row">
          <span>3-min song</span>
          <span className="time-paths">
            {perf.rtf.gpu && (
              <span className={path === 'gpu' ? 'mine' : ''}>
                GPU: {formatRange([perf.rtf.gpu[0] * THREE_MIN, perf.rtf.gpu[1] * THREE_MIN])}
              </span>
            )}
            <span className={path === 'cpu' ? 'mine' : ''}>
              CPU: {formatRange([perf.rtf.cpu[0] * THREE_MIN, perf.rtf.cpu[1] * THREE_MIN])}
            </span>
          </span>
        </div>
        <div className="time-row you">
          <span>{estSong && audioSeconds ? `Your song (${formatClock(audioSeconds)})` : 'On your device'}</span>
          <strong>
            {formatRange((estSong ?? est3).range)}
            {perf.rtf.gpu && <> on {path === 'gpu' ? 'GPU' : 'CPU'}</>}
            {(estSong ?? est3).measured && <span className="measured"> · based on your last run</span>}
          </strong>
        </div>
      </div>

      {perf.rtf.gpu && device && !device.webgpu && (
        <p className="warn">
          No GPU acceleration (WebGPU) detected, so this will run on your CPU and take a while. Recent Chrome or Edge on
          a computer with a graphics card is much faster.
        </p>
      )}
      {singleThread && (
        <p className="warn">Multi-threading is unavailable on this page, so CPU processing will be extra slow.</p>
      )}
      {lowMemory && (
        <p className="warn">
          Your browser reports {device?.memoryGB} GB of memory; this model may need ~{perf.ramGB} GB. Close other
          tabs if it fails.
        </p>
      )}
      {model.credit && <p className="credit">{model.credit}</p>}
    </div>
  )
}
