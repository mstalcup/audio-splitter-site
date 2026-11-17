import * as ort from 'onnxruntime-web/webgpu'
import { demixMdx } from './demix'
import type { Backend, RunRequest, WorkerMessage } from './protocol'

// Threads need cross-origin isolation (COOP/COEP headers); otherwise fall back to 1.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 4, 8) : 1

const MODEL_CACHE = 'stem-splitter-models-v1'

const post = (msg: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(msg, { transfer })

/** Fetch model bytes, using the Cache API so each model downloads only once. */
async function loadModelBytes(url: string): Promise<Uint8Array> {
  const cache = await caches.open(MODEL_CACHE).catch(() => null)
  const cached = await cache?.match(url)
  if (cached) return new Uint8Array(await cached.arrayBuffer())

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  let lastPost = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    const now = performance.now()
    if (now - lastPost > 100) {
      post({ type: 'progress', stage: 'download', loaded, total })
      lastPost = now
    }
  }
  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const p of parts) {
    bytes.set(p, offset)
    offset += p.length
  }
  await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {
    /* quota exceeded etc. — just skip caching */
  })
  return bytes
}

let session: { url: string; backend: Backend; s: ort.InferenceSession } | null = null

async function getSession(url: string) {
  if (session?.url === url) return session
  await session?.s.release()
  session = null

  const bytes = await loadModelBytes(url)
  post({ type: 'progress', stage: 'load' })

  const backends: Backend[] = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm']
  let lastErr: unknown
  for (const backend of backends) {
    try {
      const s = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
      })
      session = { url, backend, s }
      return session
    } catch (err) {
      console.warn(`[splitter] ${backend} backend unavailable, trying next`, err)
      lastErr = err
    }
  }
  throw lastErr
}

async function run(req: RunRequest) {
  const { s, backend } = await getSession(req.modelUrl)
  const { dimF, dimT } = req.params
  const inputName = s.inputNames[0]
  const outputName = s.outputNames[0]

  const runModel = async (input: Float32Array) => {
    const feeds = { [inputName]: new ort.Tensor('float32', input, [1, 4, dimF, dimT]) }
    const out = await s.run(feeds)
    const tensor = out[outputName]
    const data = (await tensor.getData()) as Float32Array
    tensor.dispose()
    return data
  }

  post({ type: 'progress', stage: 'separate', done: 0, total: 1, backend })
  const result = await demixMdx(req.left, req.right, req.params, runModel, (done, total) =>
    post({ type: 'progress', stage: 'separate', done, total, backend }),
  )
  post({ type: 'done', backend, ...result }, [
    result.primary[0].buffer,
    result.primary[1].buffer,
    result.secondary[0].buffer,
    result.secondary[1].buffer,
  ])
}

self.onmessage = (e: MessageEvent<RunRequest>) => {
  run(e.data).catch((err) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
}
