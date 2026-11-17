import { useRef, useState, type DragEvent } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function DropZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) pick(e.dataTransfer.files)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
      <div className="dropzone-icon" aria-hidden>♪</div>
      <p className="dropzone-title">Drop an audio file here</p>
      <p className="dropzone-sub">or click to browse · MP3, WAV, FLAC, OGG, M4A</p>
    </div>
  )
}
