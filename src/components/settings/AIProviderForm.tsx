'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AIConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']

export function AIProviderForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [config, setConfig] = useState<AIConfig | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama'>('openai')
  const [openaiMethod, setOpenaiMethod] = useState<'key' | 'oauth'>('oauth')
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
        if (data.provider === 'openai' && data.openai_auth_method) {
          setOpenaiMethod(data.openai_auth_method as 'key' | 'oauth')
        }
      }
    }).catch(() => {})

    if (searchParams.get('ai_connected') === 'true') {
      setMsg('OpenAI connected successfully.')
      router.replace('/settings')
    }
    if (searchParams.get('ai_error')) {
      setMsg(`Connection failed: ${searchParams.get('ai_error')}`)
      router.replace('/settings')
    }
  }, [searchParams, router])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await api.saveAIConfig({
        provider,
        openai_auth_method: provider === 'openai' ? openaiMethod : null,
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

  function formatExpiry(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    const h = Math.round((d.getTime() - Date.now()) / 3600000)
    if (h < 1) return 'expires soon'
    if (h < 24) return `expires in ${h}h`
    return `expires in ${Math.round(h / 24)}d`
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
                  setModel(p === 'anthropic' ? 'claude-haiku-4-5-20251001' : p === 'openai' ? 'gpt-4o-mini' : model)
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
              <label className={labelCls}>Authentication</label>
              <div className="flex gap-2">
                {(['oauth', 'key'] as const).map(method => (
                  <button key={method} type="button"
                    onClick={() => setOpenaiMethod(method)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      openaiMethod === method
                        ? 'bg-primary text-white'
                        : 'bg-surface-low text-on-surface/70 hover:bg-surface-high'
                    }`}>
                    {method === 'oauth' ? 'Connect with OpenAI' : 'API Key'}
                  </button>
                ))}
              </div>
            </div>

            {openaiMethod === 'oauth' ? (
              <div>
                {config?.oauth_connected ? (
                  <p className="text-sm text-healthy">
                    ✓ Connected — {formatExpiry(config.oauth_token_expiry)}
                  </p>
                ) : (
                  <a href="/api/auth/openai"
                    className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    Connect with OpenAI →
                  </a>
                )}
              </div>
            ) : (
              <div>
                <label className={labelCls}>
                  API Key {config?.has_key && config?.openai_auth_method === 'key' && <span className="text-healthy">(key saved)</span>}
                </label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputCls} />
              </div>
            )}

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

        {!(provider === 'openai' && openaiMethod === 'oauth') && (
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        )}
        {provider === 'openai' && openaiMethod === 'oauth' && config?.oauth_connected && (
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update Model'}</Button>
        )}
      </form>

      {msg && <p className="text-sm text-on-surface/70 mt-3">{msg}</p>}
    </section>
  )
}
