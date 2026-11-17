import type { DeviceInfo } from '../device'
import { defaultRange, formatRange } from '../splitter/estimate'
import { MODELS } from '../splitter/models'

export function DeviceSummary({ device }: { device: DeviceInfo | null }) {
  if (!device) return <p className="device">Checking your device…</p>
  return (
    <p className="device">
      <span className={device.webgpu ? 'ok' : 'no'}>
        {device.webgpu ? '✓' : '✗'} GPU acceleration{device.webgpu && device.gpuName ? ` (${device.gpuName})` : ''}
      </span>
      <span>{device.threads} CPU threads</span>
      {device.memoryGB !== undefined && <span>{device.memoryGB >= 8 ? '8+' : device.memoryGB} GB RAM</span>}
    </p>
  )
}

const THREE_MIN = 180
const range = (r: [number, number] | null) => (r ? formatRange(r) : '—')

export function CompareModels() {
  return (
    <details className="info">
      <summary>Compare models</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Stems</th>
              <th>Download</th>
              <th>RAM</th>
              <th>3-min song, GPU</th>
              <th>3-min song, CPU</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr key={m.id} className={m.available ? '' : 'dim'}>
                <td>
                  {m.label}
                  {!m.available && ' (soon)'}
                </td>
                <td>{m.stems.length}</td>
                <td>{m.perf.downloadMB ? `${m.perf.downloadMB} MB` : '—'}</td>
                <td>~{m.perf.ramGB} GB</td>
                <td>{m.perf.rtf.gpu ? range(defaultRange(m, 'gpu', THREE_MIN)) : 'n/a'}</td>
                <td>{range(defaultRange(m, 'cpu', THREE_MIN))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Times are rough estimates and vary a lot by hardware. After your first split the app uses your real timing.
      </p>
    </details>
  )
}

/** Song length — not file format — drives processing cost; this table shows why. */
export function FormatNote() {
  const decodedMB = Math.round((THREE_MIN * 44100 * 2 * 4) / 1024 / 1024)
  return (
    <details className="info">
      <summary>Does the file format matter?</summary>
      <p>
        Barely. Every format is decoded to the same raw 44.1 kHz stereo audio before splitting, so a 3-minute song
        takes the same time and memory whether it's an MP3 or a WAV. Only the upload size and a second or two of
        decoding differ.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>3-min song as…</th>
              <th>File size</th>
              <th>Decoded in memory</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['MP3 128 kbps', '~3 MB'],
              ['MP3 320 kbps', '~7 MB'],
              ['AAC / M4A 256 kbps', '~6 MB'],
              ['FLAC (lossless)', '~20–30 MB'],
              ['WAV 16-bit 44.1 kHz', '~30 MB'],
              ['WAV 24-bit 48 kHz', '~50 MB'],
            ].map(([fmt, size]) => (
              <tr key={fmt}>
                <td>{fmt}</td>
                <td>{size}</td>
                <td>~{decodedMB} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Lossless sources (WAV/FLAC) give slightly cleaner stems; MP3 artifacts can leak into the separated tracks.
        Outputs are saved as 16-bit WAV (~30 MB per stem for 3 minutes).
      </p>
    </details>
  )
}
