/** Decode any browser-supported audio file (mp3, wav, flac, ogg, m4a...) into PCM. */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, 44100)
  try {
    return await ctx.decodeAudioData(bytes)
  } catch {
    throw new Error(`Couldn't decode "${file.name}". Try MP3, WAV, FLAC or OGG.`)
  }
}

/** Encode an AudioBuffer as a 16-bit PCM WAV blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const { sampleRate, length } = buffer
  const dataSize = length * channels * 2
  const view = new DataView(new ArrayBuffer(44 + dataSize))

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true) // byte rate
  view.setUint16(32, channels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}
