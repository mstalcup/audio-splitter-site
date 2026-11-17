# Stem Splitter

A simple, no-login website that splits songs into separate stems (vocals, instrumental, …) entirely in the
browser. Drop in an audio file, pick a model, download the stems as WAV. Audio never leaves the device.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # production build in dist/
```

## Models

| Model | Stems | How it runs |
|---|---|---|
| Quick center-channel split | vocals / instrumental | Plain JS stereo trick, instant, no AI |
| Kim Vocal 2 (MDX-Net) | vocals / instrumental | ONNX model in a Web Worker, WebGPU with WASM fallback |
| UVR Inst HQ 4 (MDX-Net) | vocals / instrumental | same |

Each model shows download size, memory, GPU need and an estimated time. After a run the app stores the
measured speed in `localStorage` and uses it for future estimates.

## How it's built

- `src/splitter/types.ts` — `SplitterModel` contract every model implements; registry in `models.ts`
- `src/splitter/mdx/` — UVR MDX-Net pipeline: mixed-radix FFT, STFT matching UVR's torch code, overlapping
  chunked demix, and the Web Worker running onnxruntime-web
- `src/audio/codec.ts` — decode any browser-supported format to 44.1 kHz, encode WAV

## Deploying

The host must send these headers (they enable multi-threaded WASM; the dev server already does):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The ONNX Runtime `.wasm` file is ~29 MB, which exceeds some hosts' per-file limits (e.g. Cloudflare Pages: 25 MB).

## Credits

MDX-Net models from [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) (Anjok07, aufr33),
Kim Vocal 2 by KimberleyJensen, architecture by kuielab — via the
[aaatmy/uvr-mdx-net-onnx](https://huggingface.co/aaatmy/uvr-mdx-net-onnx) mirror.
