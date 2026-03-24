import { useState, useEffect } from 'react'

export default function GpuStatus() {
  const [gpu, setGpu] = useState(null)

  useEffect(() => {
    window.studio?.getGpuInfo().then(setGpu)
  }, [])

  if (!gpu) return null

  return (
    <div className="svc-pill" title={`${gpu.chip} — ${gpu.memoryGB}GB`}>
      <div className={`dot ${gpu.metal ? 'dot-green' : 'dot-dim'}`} />
      {gpu.chip?.replace('Apple ', '') || 'GPU'} {gpu.memoryGB}GB
    </div>
  )
}
