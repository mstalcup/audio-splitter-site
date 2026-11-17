import type { SplitterModel } from './types'

/**
 * Classic "karaoke" trick — no ML. Vocals are usually mixed dead-center, so
 * the mid channel (L+R) emphasizes them and the side channel (L-R) removes
 * them. Quality is rough, but it's instant and needs no download.
 */
export const midSideSplitter: SplitterModel = {
  id: 'mid-side',
  label: 'Quick center-channel split',
  description: 'Instant, no download, no AI. Rough split using stereo placement — vocals are usually in the center. Needs a stereo file.',
  runtime: 'browser',
  stems: ['vocals (center)', 'instrumental (sides)'],
  available: true,
  perf: { downloadMB: 0, ramGB: 0.2, gpu: 'not needed', rtf: { cpu: [0.001, 0.01] }, quality: 1 },

  async separate(input, { onProgress, signal } = {}) {
    if (input.numberOfChannels < 2) {
      throw new Error('This method needs a stereo file — the input is mono.')
    }
    const started = performance.now()
    const left = input.getChannelData(0)
    const right = input.getChannelData(1)
    const { length, sampleRate } = input

    const mid = new AudioBuffer({ numberOfChannels: 2, length, sampleRate })
    const side = new AudioBuffer({ numberOfChannels: 2, length, sampleRate })
    const midL = mid.getChannelData(0)
    const midR = mid.getChannelData(1)
    const sideL = side.getChannelData(0)
    const sideR = side.getChannelData(1)

    // Process in chunks and yield so the progress bar can repaint.
    const chunk = sampleRate * 10
    for (let start = 0; start < length; start += chunk) {
      signal?.throwIfAborted()
      const end = Math.min(start + chunk, length)
      for (let i = start; i < end; i++) {
        const m = (left[i] + right[i]) * 0.5
        midL[i] = m
        midR[i] = m
        sideL[i] = left[i] - m
        sideR[i] = right[i] - m
      }
      onProgress?.({ stage: 'Splitting', fraction: end / length, timed: true })
      await new Promise((r) => setTimeout(r, 0))
    }

    return {
      stems: [
        { name: this.stems[0], buffer: mid },
        { name: this.stems[1], buffer: side },
      ],
      backend: 'js',
      processingSeconds: (performance.now() - started) / 1000,
    }
  },
}
