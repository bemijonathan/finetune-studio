import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHfSearch } from '../hooks/useHfSearch'
import { useJobs } from '../context/JobsContext'
import DatasetPreview from '../components/DatasetPreview'

const POPULAR_MODELS = [
  { id: 'mlx-community/Llama-3.2-3B-Instruct-4bit', name: 'Llama 3.2 3B', params: '3B', size: '~1.7GB' },
  { id: 'mlx-community/Mistral-7B-Instruct-v0.3-4bit', name: 'Mistral 7B', params: '7B', size: '~3.8GB' },
  { id: 'mlx-community/Phi-3.5-mini-instruct-4bit', name: 'Phi 3.5 Mini', params: '3.8B', size: '~2.1GB' },
  { id: 'mlx-community/Qwen2.5-7B-Instruct-4bit', name: 'Qwen 2.5 7B', params: '7B', size: '~4.1GB' },
  { id: 'mlx-community/gemma-2-2b-it-4bit', name: 'Gemma 2 2B', params: '2B', size: '~1.4GB' },
  { id: 'mlx-community/SmolLM2-1.7B-Instruct-4bit', name: 'SmolLM2 1.7B', params: '1.7B', size: '~0.9GB' },
]

const CLOUD_MODELS = [
  { id: 'meta-llama/Llama-3.2-3B-Instruct', name: 'Llama 3.2 3B', params: '3B', price: '$0.48/1M tokens' },
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', params: '8B', price: '$0.48/1M tokens' },
  { id: 'meta-llama/Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', params: '70B', price: '$3.20/1M tokens' },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', params: '7B', price: '$0.48/1M tokens' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B', params: '7B', price: '$0.48/1M tokens' },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', params: '9B', price: '$0.48/1M tokens' },
]

const PRESETS = [
  { name: 'Quick LoRA', loraRank: 8, loraAlpha: 16, lr: 1e-4, epochs: 3, batchSize: 4, desc: '~5 min, good for testing' },
  { name: 'Standard', loraRank: 16, loraAlpha: 32, lr: 5e-5, epochs: 5, batchSize: 4, desc: '~20 min, balanced' },
  { name: 'High Quality', loraRank: 32, loraAlpha: 64, lr: 2e-5, epochs: 10, batchSize: 2, desc: '~1 hr, best results' },
]

export default function NewJob() {
  const navigate = useNavigate()
  const { startJob } = useJobs()

  const [runtime, setRuntime] = useState('local') // 'local' | 'cloud'
  const [step, setStep] = useState(0)
  const [model, setModel] = useState(null)
  const [dataset, setDataset] = useState(null)
  const [datasetInfo, setDatasetInfo] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [config, setConfig] = useState({
    loraRank: 16, loraAlpha: 32, learningRate: 5e-5,
    epochs: 5, batchSize: 4, useQlora: false,
    evalSplit: 0.1, evalSteps: 50, maxSeqLength: 2048, preset: 'Standard',
  })
  const [launching, setLaunching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { results: searchResults, loading: searchLoading } = useHfSearch(searchQuery)

  // Reset model selection when switching runtime
  const handleRuntimeChange = (r) => {
    if (r !== runtime) {
      setRuntime(r)
      setModel(null)
      if (step > 0) setStep(0)
    }
  }

  const canNext = () => {
    if (step === 0) return model !== null
    if (step === 1) return dataset !== null && datasetInfo && !datasetInfo.error && (datasetInfo.errors || []).length === 0 && (runtime === 'cloud' || datasetInfo.mlx_compatible !== false)
    return true
  }

  const handleUploadDataset = async () => {
    const file = await window.studio?.uploadDataset()
    if (!file) return
    setDataset(file)
    const info = await window.studio?.detectDatasetFormat(file.path)
    if (info) setDatasetInfo(info)
    const rows = await window.studio?.previewDataset(file.path, 20)
    if (rows) setPreviewRows(rows)
  }

  const selectPreset = (p) => {
    setConfig({ ...config, loraRank: p.loraRank, loraAlpha: p.loraAlpha, learningRate: p.lr, epochs: p.epochs, batchSize: p.batchSize, preset: p.name })
  }

  const handleLaunch = async () => {
    if (!model || !dataset) return
    setLaunching(true)
    try {
      await startJob({
        runtime,
        model_id: model.id, dataset_path: dataset.path,
        lora_rank: config.loraRank, lora_alpha: config.loraAlpha,
        learning_rate: config.learningRate, epochs: config.epochs,
        batch_size: config.batchSize, use_qlora: config.useQlora,
        eval_split: config.evalSplit, eval_steps: config.evalSteps,
        max_seq_length: config.maxSeqLength,
      })
      navigate('/jobs')
    } catch (err) {
      alert('Failed to start training: ' + err.message)
    } finally {
      setLaunching(false)
    }
  }

  const stepLabels = ['Pick Model', 'Dataset', 'Configure', 'Review']

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">New Fine-Tuning Job</div>
          <div className="page-sub">Create a new training job in 4 steps.</div>
        </div>
      </div>

      <div className="runtime-toggle">
        <button className={`runtime-btn ${runtime === 'local' ? 'active' : ''}`} onClick={() => handleRuntimeChange('local')}>
          Local (MLX)
        </button>
        <button className={`runtime-btn ${runtime === 'cloud' ? 'active' : ''}`} onClick={() => handleRuntimeChange('cloud')}>
          Cloud (Together AI)
        </button>
      </div>

      <div className="wizard-steps">
        {stepLabels.map((s, i) => (
          <div key={i} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
            onClick={() => i < step && setStep(i)} style={{ cursor: i < step ? 'pointer' : 'default' }}>
            <span className="wizard-step-num">{i < step ? '✓' : i + 1}</span>
            <span className="wizard-step-label">{s}</span>
          </div>
        ))}
      </div>

      <div className="wizard-content">
        {step === 0 && <StepModel model={model} setModel={setModel} query={searchQuery} setQuery={setSearchQuery} results={searchResults} loading={searchLoading} runtime={runtime} />}
        {step === 1 && <StepDataset dataset={dataset} info={datasetInfo} rows={previewRows} onUpload={handleUploadDataset} evalSplit={config.evalSplit} onSplitChange={v => setConfig({ ...config, evalSplit: v })} setDataset={setDataset} setDatasetInfo={setDatasetInfo} setPreviewRows={setPreviewRows} runtime={runtime} />}
        {step === 2 && <StepConfig config={config} setConfig={setConfig} onPreset={selectPreset} runtime={runtime} />}
        {step === 3 && <StepReview model={model} dataset={dataset} info={datasetInfo} config={config} runtime={runtime} />}
      </div>

      <div className="wizard-nav">
        <button className="btn-secondary" onClick={() => setStep(s => s - 1)} disabled={step === 0}>Back</button>
        {step < 3 ? (
          <button className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next</button>
        ) : (
          <button className="btn-primary" onClick={handleLaunch} disabled={launching || !model || !dataset}>
            {launching ? 'Starting...' : 'Start Training'}
          </button>
        )}
      </div>
    </>
  )
}

function StepModel({ model, setModel, query, setQuery, results, loading, runtime }) {
  const models = runtime === 'cloud' ? CLOUD_MODELS : POPULAR_MODELS

  return (
    <>
      <div className="section-title">{runtime === 'cloud' ? 'Together AI Models' : 'Popular Models'}</div>
      <div className="model-grid" style={{ marginBottom: 24 }}>
        {models.map(m => (
          <button key={m.id} className={`model-card ${model?.id === m.id ? 'selected' : ''}`} onClick={() => setModel(m)}>
            <div className="model-name">{m.name}</div>
            <div className="model-card-tags">
              <span className="model-tag">{m.params}</span>
              {m.size && <span className="model-tag">{m.size}</span>}
              {m.price && <span className="model-tag">{m.price}</span>}
              {runtime === 'local' && <span className="model-tag">4-bit</span>}
            </div>
          </button>
        ))}
      </div>

      {runtime === 'local' && (
        <>
          <div className="section-title">Search HuggingFace</div>
          <div className="search-wrapper">
            <span className="search-icon">⌕</span>
            <input className="search-input" placeholder="Search MLX models..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {loading && <div className="search-loading">Searching...</div>}
          {results.length > 0 && (
            <div className="model-grid">
              {results.map(m => (
                <button key={m.id} className={`model-card ${model?.id === m.id ? 'selected' : ''}`} onClick={() => setModel(m)}>
                  <div className="model-name">{m.name}</div>
                  <div className="model-meta">{m.author} — {m.downloads?.toLocaleString()} downloads</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {model && (
        <div className="selected-model-card">
          <div className="selected-model-label">Selected model</div>
          <div className="selected-model-name">{model.name || model.id}</div>
          <div className="model-meta">{model.id}</div>
        </div>
      )}
    </>
  )
}

function StepDataset({ dataset, info, rows, onUpload, evalSplit, onSplitChange, setDataset, setDatasetInfo, setPreviewRows, runtime }) {
  const [converting, setConverting] = useState(false)
  const [existingDatasets, setExistingDatasets] = useState([])

  useEffect(() => {
    window.studio?.listDatasets().then(d => setExistingDatasets(d || []))
  }, [])

  const handleSelectExisting = async (ds) => {
    setDataset({ path: ds.path, name: ds.name, size: ds.size })
    const detectedInfo = await window.studio?.detectDatasetFormat(ds.path)
    if (detectedInfo) setDatasetInfo(detectedInfo)
    const preview = await window.studio?.previewDataset(ds.path, 20)
    if (preview) setPreviewRows(preview)
  }

  const handleConvert = async () => {
    if (!dataset) return
    setConverting(true)
    try {
      const result = await window.studio?.convertDataset(dataset.path)
      if (result && !result.error) {
        setDataset({ path: result.path, name: result.name, size: 0 })
        const newInfo = await window.studio?.detectDatasetFormat(result.path)
        if (newInfo) setDatasetInfo(newInfo)
      }
    } finally {
      setConverting(false)
    }
  }

  const formatBadgeColor = (fmt) => {
    if (fmt === 'chat') return 'blue'
    if (fmt === 'completions') return 'teal'
    if (fmt === 'text') return 'green'
    if (fmt === 'alpaca') return 'amber'
    return 'red'
  }

  const hasErrors = info?.errors?.length > 0 || info?.error

  return (
    <>
      {existingDatasets.length > 0 && (
        <>
          <div className="section-title">Existing Datasets</div>
          <div className="model-grid" style={{ marginBottom: 20 }}>
            {existingDatasets.map(ds => (
              <button
                key={ds.path}
                className={`model-card ${dataset?.path === ds.path ? 'selected' : ''}`}
                onClick={() => handleSelectExisting(ds)}
              >
                <div className="model-name">{ds.name}</div>
                <div className="model-meta">{ds.rowCount ?? '?'} rows — {ds.size ? `${(ds.size / 1024).toFixed(1)} KB` : ''}</div>
              </button>
            ))}
          </div>
          <div className="section-title">Or Upload New</div>
        </>
      )}
      {!existingDatasets.length && <div className="section-title">Import Dataset</div>}
      <button className="launch-card blue" onClick={onUpload} style={{ marginBottom: 20, maxWidth: 400 }}>
        <div className="card-icon blue">↑</div>
        <div className="card-title">Upload JSONL File</div>
        <div className="card-desc">Supports chat, completions, and text formats.</div>
      </button>

      {dataset && (
        <>
          <div className={`dataset-info-card ${hasErrors ? 'has-error' : ''}`}>
            <div className="dataset-info-header">
              <div className="dataset-info-name">{dataset.name}</div>
              {info && <span className={`method-badge ${formatBadgeColor(info.format)}`}>{info.format}</span>}
              {info?.mlx_compatible && runtime === 'local' && <span className="dataset-compat-badge">mlx-lm compatible</span>}
              {runtime === 'cloud' && info?.format === 'chat' && <span className="dataset-compat-badge">Together AI compatible</span>}
            </div>
            {info && !info.error && (
              <div className="model-meta" style={{ marginTop: 6 }}>
                {info.sample_count} rows — avg {info.avg_tokens} tokens/row
                {info.max_tokens > 0 && ` (max ${info.max_tokens})`}
              </div>
            )}

            {info?.error && (
              <div className="dataset-info-error">{info.error}</div>
            )}
            {info?.errors?.map((e, i) => (
              <div key={`e${i}`} className="dataset-info-error small">{e}</div>
            ))}

            {info?.warnings?.map((w, i) => (
              <div key={`w${i}`} className="dataset-info-warning">{w}</div>
            ))}

            {info?.needs_conversion && (
              <div style={{ marginTop: 10 }}>
                <button className="btn-primary btn-sm" onClick={handleConvert} disabled={converting}>
                  {converting ? 'Converting...' : 'Convert to Chat Format'}
                </button>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <>
              <div className="section-title">Preview</div>
              <DatasetPreview rows={rows} />
            </>
          )}

          {!hasErrors && (
            <div className="eval-split-section">
              <div className="section-title">Train / Eval Split</div>
              <div className="eval-split-row">
                <input type="range" min="0.05" max="0.3" step="0.05" value={evalSplit} onChange={e => onSplitChange(parseFloat(e.target.value))} />
                <span className="eval-split-label">{Math.round((1 - evalSplit) * 100)}% train / {Math.round(evalSplit * 100)}% eval</span>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function StepConfig({ config, setConfig, onPreset, runtime }) {
  const update = (key, val) => setConfig({ ...config, [key]: val, preset: 'Custom' })

  return (
    <>
      <div className="section-title">Presets</div>
      <div className="preset-grid">
        {PRESETS.map(p => (
          <button key={p.name} className={`preset-card ${config.preset === p.name ? 'selected' : ''}`} onClick={() => onPreset(p)}>
            <div className="preset-name">{p.name}</div>
            <div className="preset-desc">{p.desc}</div>
          </button>
        ))}
      </div>

      <div className="section-title">Training Parameters</div>
      <div className="config-grid">
        <div className="config-field">
          <label>LoRA Rank</label>
          <input type="number" value={config.loraRank} onChange={e => update('loraRank', parseInt(e.target.value) || 16)} />
        </div>
        <div className="config-field">
          <label>LoRA Alpha</label>
          <input type="number" value={config.loraAlpha} onChange={e => update('loraAlpha', parseInt(e.target.value) || 32)} />
        </div>
        <div className="config-field">
          <label>Learning Rate</label>
          <input type="text" value={config.learningRate} onChange={e => update('learningRate', parseFloat(e.target.value) || 5e-5)} />
        </div>
        <div className="config-field">
          <label>Epochs</label>
          <input type="number" value={config.epochs} onChange={e => update('epochs', parseInt(e.target.value) || 5)} />
        </div>
        <div className="config-field">
          <label>Batch Size</label>
          <input type="number" value={config.batchSize} onChange={e => update('batchSize', parseInt(e.target.value) || 4)} />
        </div>
        <div className="config-field">
          <label>Max Sequence Length</label>
          <input type="number" value={config.maxSeqLength} onChange={e => update('maxSeqLength', parseInt(e.target.value) || 2048)} />
        </div>
      </div>

      {runtime === 'local' && (
        <div className="qlora-toggle-row">
          <div className={`toggle ${config.useQlora ? 'on' : ''}`} onClick={() => setConfig({ ...config, useQlora: !config.useQlora })} />
          <span>Use QLoRA (4-bit quantization)</span>
        </div>
      )}
    </>
  )
}

function StepReview({ model, dataset, info, config, runtime }) {
  const rows = [
    ['Runtime', runtime === 'cloud' ? 'Cloud (Together AI)' : 'Local (MLX)'],
    ['Base Model', model?.name || model?.id],
    ['Model ID', model?.id],
    ['Dataset', dataset?.name],
    ['Format', info?.format || 'auto-detect'],
    ['Samples', info?.sample_count || '—'],
    ['Preset', config.preset],
    ...(runtime === 'local' ? [['Method', config.useQlora ? 'QLoRA' : 'LoRA']] : []),
    ['LoRA Rank / Alpha', `${config.loraRank} / ${config.loraAlpha}`],
    ['Learning Rate', config.learningRate],
    ['Epochs', config.epochs],
    ['Batch Size', config.batchSize],
    ['Eval Split', `${Math.round(config.evalSplit * 100)}%`],
  ]

  return (
    <>
      <div className="section-title">Review Configuration</div>
      <div className="review-summary">
        {rows.map(([label, value]) => (
          <div key={label} className="review-row">
            <span className="review-label">{label}</span>
            <span className="review-value">{String(value)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
