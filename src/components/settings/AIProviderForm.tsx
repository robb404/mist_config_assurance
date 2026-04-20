'use client'
import { useEffect, useState } from 'react'
import type { AIConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']

export function AIProviderForm() {
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama'>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getAIConfig().then(data => {
      setConfig(data)
      if (data.configured && data.provider) {
        setProvider(data.provider)
        setModel(data.model ?? 'gpt-4o-mini')
        setBaseUrl(data.base_url ?? 'http://localhost:11434')
      }
    }).catch(() => {})
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await api.saveAIConfig({
        provider,
        api_key: apiKey || null,
        model,
        base_url: provider === 'ollama' ? baseUrl : null,
      })
      setMsg('AI provider saved.')
      setApiKey('')
      setConfig(await api.getAIConfig())
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-surface-lowest rounded-lg p-6">
      <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
        AI Provider
        {config?.configured && (
          <span className="text-healthy ml-2 normal-case font-normal">
            ✓ {config.provider} / {config.model}
          </span>
        )}
      </h2>

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={labelCls}>Provider</label>
          <div className="flex gap-2">
            {(['anthropic', 'openai', 'ollama'] as const).map(p => (
              <button key={p} type="button"
                onClick={() => {
                  setProvider(p)
                  setModel(p === 'anthropic' ? 'claude-haiku-4-5-20251001' : p === 'openai' ? 'gpt-4o-mini' : '')
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  provider === p
                    ? 'bg-primary text-white'
                    : 'bg-surface-low text-on-surface/70 hover:bg-surface-high'
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {provider === 'anthropic' && (
          <>
            <div>
              <label className={labelCls}>
                API Key {config?.has_key && provider === 'anthropic' && <span className="text-healthy">(key saved)</span>}
              </label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={config?.has_key ? 'Enter new key to replace' : 'sk-ant-...'}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
                {ANTHROPIC_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}

        {provider === 'openai' && (
          <>
            <div>
              <label className={labelCls}>
                API Key {config?.has_key && provider === 'openai' && <span className="text-healthy">(key saved)</span>}
              </label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={config?.has_key ? 'Enter new key to replace' : 'sk-...'}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
                {OPENAI_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}

        {provider === 'ollama' && (
          <>
            <div>
              <label className={labelCls}>Base URL</label>
              <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model Name</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)}
                placeholder="llama3.2"
                className={inputCls} />
            </div>
          </>
        )}

        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </form>

      {msg && <p className="text-sm text-on-surface/70 mt-3">{msg}</p>}
    </section>
  )
}
