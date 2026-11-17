import { useEffect, useState } from 'react'
import { encodeWav } from '../audio/codec'
import type { Stem } from '../splitter/types'

interface Props {
  stems: Stem[]
  sourceName: string
}

export function StemList({ stems, sourceName }: Props) {
  const baseName = sourceName.replace(/\.[^.]+$/, '')

  // Create and revoke object URLs in the same effect so each URL is owned by
  // exactly one effect run (StrictMode mounts → unmounts → remounts in dev).
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const created = stems.map((s) => URL.createObjectURL(encodeWav(s.buffer)))
    // Object URLs are an external resource that needs cleanup, so an effect is the right owner.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrls(created)
    return () => created.forEach((u) => URL.revokeObjectURL(u))
  }, [stems])

  return (
    <ul className="stem-list">
      {stems.map((stem, i) => (
        <li key={stem.name} className="stem">
          <span className="stem-name">{stem.name}</span>
          <audio controls src={urls[i]} preload="metadata" />
          <a
            className="button secondary"
            href={urls[i]}
            download={`${baseName} - ${stem.name}.wav`}
            aria-disabled={!urls[i]}
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  )
}
