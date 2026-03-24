import { useState, useEffect } from 'react'
import { useInference } from '../hooks/useInference'
import ChatInterface from '../components/ChatInterface'
import ModelCard from '../components/ModelCard'

export default function Models() {
  const [models, setModels] = useState([])
  const [chatModel, setChatModel] = useState(null)
  const { status, loadModel, unloadModel, sendMessage } = useInference()

  useEffect(() => {
    window.studio?.listModels().then(m => setModels(m || []))
  }, [])

  const handleChat = async (model) => {
    if (chatModel?.jobId === model.jobId && status === 'ready') return
    setChatModel(model)
    try {
      await loadModel(model.modelId, model.adapterPath)
    } catch (err) {
      alert('Failed to load model: ' + err.message)
    }
  }

  const handleBack = async () => {
    await unloadModel()
    setChatModel(null)
    window.studio?.listModels().then(m => setModels(m || []))
  }

  // Chat view
  if (chatModel) {
    return (
      <>
        <button className="back-link" onClick={handleBack}>← Back to models</button>

        <div className="page-header">
          <div>
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {chatModel.modelName}
              <span className={`method-badge ${chatModel.method === 'QLoRA' ? 'teal' : 'blue'}`}>
                {chatModel.method}
              </span>
              <span className={`status-badge ${status === 'ready' ? 'completed' : status === 'loading' ? 'running' : ''}`} style={{ marginLeft: 4 }}>
                {status}
              </span>
            </div>
            <div className="page-sub" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
              {chatModel.modelId}
            </div>
          </div>
        </div>

        <ChatInterface
          onSend={sendMessage}
          disabled={status !== 'ready'}
          loading={status === 'loading'}
        />
      </>
    )
  }

  // Models list view
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Models</div>
          <div className="page-sub">Fine-tuned model library.</div>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="empty-page">
          <div className="big">◉</div>
          <div>No models yet. Complete a training job to see your models here.</div>
          <a href="#/new-job">+ New Job</a>
        </div>
      ) : (
        <div className="model-grid">
          {models.map(model => (
            <ModelCard key={model.jobId} model={model} onChat={handleChat} />
          ))}
        </div>
      )}
    </>
  )
}
