import { useMemo } from 'react'

const W = 600
const H = 260
const PAD = { top: 20, right: 20, bottom: 32, left: 52 }

export default function LossChart({ metrics = [] }) {
  const stepData = useMemo(() => metrics.filter(m => m.event === 'step' && m.loss != null), [metrics])
  const evalData = useMemo(() => metrics.filter(m => m.event === 'eval' && m.eval_loss != null), [metrics])

  const { xMin, xMax, yMin, yMax, xTicks, yTicks } = useMemo(() => {
    const allSteps = [...stepData.map(m => m.step), ...evalData.map(m => m.step)]
    const allLoss = [...stepData.map(m => m.loss), ...evalData.map(m => m.eval_loss)]

    if (allSteps.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, xTicks: [], yTicks: [] }

    const xMin = Math.min(...allSteps)
    const xMax = Math.max(...allSteps) || 1
    const rawYMin = Math.min(...allLoss)
    const rawYMax = Math.max(...allLoss)
    const yPad = (rawYMax - rawYMin) * 0.1 || 0.1
    const yMin = Math.max(0, rawYMin - yPad)
    const yMax = rawYMax + yPad

    const xTicks = niceSteps(xMin, xMax, 5)
    const yTicks = niceSteps(yMin, yMax, 5)

    return { xMin, xMax, yMin, yMax, xTicks, yTicks }
  }, [stepData, evalData])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const scaleX = (v) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * plotW
  const scaleY = (v) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  const trainPath = useMemo(() => {
    if (stepData.length < 2) return null
    return stepData.map((m, i) => `${i === 0 ? 'M' : 'L'}${scaleX(m.step).toFixed(1)},${scaleY(m.loss).toFixed(1)}`).join(' ')
  }, [stepData, xMin, xMax, yMin, yMax])

  const evalPath = useMemo(() => {
    if (evalData.length < 2) return null
    return evalData.map((m, i) => `${i === 0 ? 'M' : 'L'}${scaleX(m.step).toFixed(1)},${scaleY(m.eval_loss).toFixed(1)}`).join(' ')
  }, [evalData, xMin, xMax, yMin, yMax])

  if (stepData.length === 0) {
    return (
      <div className="loss-chart-container">
        <div className="section-title">Loss</div>
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>
          Waiting for training data...
        </div>
      </div>
    )
  }

  return (
    <div className="loss-chart-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Loss</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: 'var(--accent)', display: 'inline-block', borderRadius: 1 }} />
            <span style={{ color: 'var(--text3)' }}>Train</span>
          </span>
          {evalData.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 2, background: 'var(--green)', display: 'inline-block', borderRadius: 1, borderTop: '1px dashed var(--green)' }} />
              <span style={{ color: 'var(--text3)' }}>Eval</span>
            </span>
          )}
        </div>
      </div>

      <svg className="loss-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yTicks.map(y => (
          <g key={`y-${y}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={scaleY(y)} y2={scaleY(y)} stroke="var(--border1)" strokeWidth="1" />
            <text x={PAD.left - 8} y={scaleY(y) + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{formatLoss(y)}</text>
          </g>
        ))}

        {xTicks.map(x => (
          <g key={`x-${x}`}>
            <line x1={scaleX(x)} x2={scaleX(x)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border1)" strokeWidth="1" />
            <text x={scaleX(x)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10" fill="var(--text3)">{x}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border2)" strokeWidth="1" />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--border2)" strokeWidth="1" />

        {/* Train loss line */}
        {trainPath && <path d={trainPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}

        {/* Eval loss line (dashed) */}
        {evalPath && <path d={evalPath} fill="none" stroke="var(--green)" strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />}

        {/* Data points — only show if few enough */}
        {stepData.length <= 50 && stepData.map((m, i) => (
          <circle key={`t-${i}`} cx={scaleX(m.step)} cy={scaleY(m.loss)} r="2.5" fill="var(--accent)" />
        ))}
        {evalData.length <= 50 && evalData.map((m, i) => (
          <circle key={`e-${i}`} cx={scaleX(m.step)} cy={scaleY(m.eval_loss)} r="2.5" fill="var(--green)" />
        ))}

        {/* Axis labels */}
        <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--text3)">Step</text>
      </svg>
    </div>
  )
}

function formatLoss(v) {
  if (v >= 10) return v.toFixed(1)
  if (v >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

function niceSteps(min, max, count) {
  const range = max - min
  if (range === 0) return [min]
  const rough = range / count
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const nice = rough / pow >= 5 ? 5 * pow : rough / pow >= 2 ? 2 * pow : pow
  const start = Math.ceil(min / nice) * nice
  const ticks = []
  for (let v = start; v <= max; v += nice) {
    ticks.push(Math.round(v * 1e6) / 1e6)
  }
  return ticks
}
