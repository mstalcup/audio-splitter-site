export interface DeviceInfo {
  webgpu: boolean
  gpuName?: string
  threads: number
  /** navigator.deviceMemory (Chromium only, capped at 8). */
  memoryGB?: number
  /** Cross-origin isolated → multi-threaded WASM available. */
  isolated: boolean
}

interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> }
  deviceMemory?: number
}

export async function detectDevice(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & GpuNavigator
  let webgpu = false
  let gpuName: string | undefined
  try {
    const adapter = await nav.gpu?.requestAdapter()
    if (adapter) {
      webgpu = true
      const info = adapter.info
      gpuName = info?.description || [info?.vendor, info?.architecture].filter(Boolean).join(' ') || undefined
    }
  } catch {
    /* no WebGPU */
  }
  return {
    webgpu,
    gpuName,
    threads: navigator.hardwareConcurrency || 1,
    memoryGB: nav.deviceMemory,
    isolated: self.crossOriginIsolated,
  }
}
