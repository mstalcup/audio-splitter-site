import { createMdxModel } from './mdx/client'
import { midSideSplitter } from './midSide'
import type { SplitterModel } from './types'

const notImplemented = async (): Promise<never> => {
  throw new Error('This model is not implemented yet.')
}

// UVR MDX-Net ONNX weights, mirrored on Hugging Face (served with CORS).
const UVR_REPO = 'https://huggingface.co/aaatmy/uvr-mdx-net-onnx/resolve/main'
const UVR_CREDIT = 'MDX-Net models from Ultimate Vocal Remover (Anjok07, aufr33); architecture by kuielab.'

/*
 * Performance numbers are rough starting estimates (real-time factor =
 * processing seconds per second of audio). MDX-Net CPU figures are scaled from
 * a measured ~65 s per 5.3 s chunk on one WASM thread. GPU figures are anchored
 * on a measured 0.53 RTF (Kim Vocal 2, WebGPU, first test machine) and widened.
 * The app records real runs and prefers those on later visits.
 */

/** All models shown in the dropdown. Add new splitters here. */
export const MODELS: SplitterModel[] = [
  midSideSplitter,
  createMdxModel({
    id: 'mdx-kim-vocal-2',
    label: 'AI vocals / instrumental (Kim Vocal 2)',
    description: 'MDX-Net model tuned for clean vocals. Good all-rounder for acapellas and karaoke tracks.',
    modelUrl: `${UVR_REPO}/Kim_Vocal_2.onnx`,
    params: { nFft: 7680, hop: 1024, dimF: 3072, dimT: 256, compensate: 1.009 },
    primaryStem: 'vocals',
    secondaryStem: 'instrumental',
    perf: { downloadMB: 67, ramGB: 2, gpu: 'recommended', rtf: { gpu: [0.2, 0.8], cpu: [1.5, 5] }, quality: 4 },
    credit: `${UVR_CREDIT} Kim Vocal 2 by KimberleyJensen.`,
  }),
  createMdxModel({
    id: 'mdx-inst-hq-4',
    label: 'AI instrumental focus (UVR Inst HQ 4)',
    description: 'MDX-Net model tuned for clean backing tracks — fewer vocal artifacts left in the instrumental.',
    modelUrl: `${UVR_REPO}/UVR-MDX-NET-Inst_HQ_4.onnx`,
    params: { nFft: 5120, hop: 1024, dimF: 2560, dimT: 256, compensate: 1.019 },
    primaryStem: 'instrumental',
    secondaryStem: 'vocals',
    perf: { downloadMB: 59, ramGB: 1.8, gpu: 'recommended', rtf: { gpu: [0.17, 0.7], cpu: [1.3, 4.5] }, quality: 4 },
    credit: UVR_CREDIT,
  }),
  {
    id: 'demucs-browser',
    label: 'AI 4 stems (Demucs v4)',
    description: 'Splits into vocals, drums, bass and other. Coming soon.',
    runtime: 'browser',
    stems: ['vocals', 'drums', 'bass', 'other'],
    available: false,
    perf: { downloadMB: 170, ramGB: 3, gpu: 'recommended', rtf: { gpu: [0.15, 0.7], cpu: [1, 4] }, quality: 5 },
    separate: notImplemented,
  },
]

export const DEFAULT_MODEL_ID = 'mdx-kim-vocal-2'
