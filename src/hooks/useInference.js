import { useState, useCallback } from 'react'

export function useInference() {
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [currentModel, setCurrentModel] = useState(null)
  const [error, setError] = useState(null)

  const loadModel = useCallback(async (modelId, adapterPath) => {
    setStatus('loading')
    setError(null)
    try {
      const result = await window.studio?.loadModelForChat(modelId, adapterPath)
      setStatus('ready')
      setCurrentModel({ modelId, adapterPath })
      return result
    } catch (err) {
      setStatus('error')
      setError(err.message)
      throw err
    }
  }, [])

  const unloadModel = useCallback(async () => {
    await window.studio?.unloadModel()
    setStatus('idle')
    setCurrentModel(null)
    setError(null)
  }, [])

  const sendMessage = useCallback(async (messages, opts = {}) => {
    if (status !== 'ready') throw new Error('Model not loaded')
    const result = await window.studio?.chatCompletionStream(messages, opts)
    return result?.content || ''
  }, [status])

  return { status, currentModel, error, loadModel, unloadModel, sendMessage }
}
