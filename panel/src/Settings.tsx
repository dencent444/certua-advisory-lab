import { useEffect, useState, type FormEvent } from 'react'
import type { Language } from './models'
import { translations } from './translations'
import { Surface } from './ui'

type SiemStatus = { provider: string; configured: boolean; index: string; hostFields: string[] }

export default function Settings({ language }: { language: Language }) {
  const [accountName, setAccountName] = useState('')
  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [siemStatus, setSiemStatus] = useState<SiemStatus | null>(null)
  const t = translations[language]

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/creds', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign(`/login?lang=${language}`)
          return
        }
        if (!response.ok) throw new Error('account request failed')
        const data = (await response.json()) as { username: string }
        setAccountName(data.username)
        setUsername(data.username)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t.credsUnavailable)
      })
    void fetch('/api/siem', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setSiemStatus((await response.json()) as SiemStatus)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSiemStatus(null)
      })
    return () => controller.abort()
  }, [language, t.credsUnavailable])

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedUsername = username.trim()
    if (!trimmedUsername || !currentPassword) return
    if (password.length < 16) {
      setError(t.passwordLength)
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/creds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, currentPassword, newPassword: password }),
      })
      if (!response.ok) throw new Error('credential update failed')
      window.location.assign(`/login?lang=${language}`)
    } catch {
      setError(t.credsInvalid)
      setSaving(false)
    }
  }

  const siemMessage = siemStatus?.configured
    ? language === 'uk'
      ? `Моніторинг увімкнено · індекс ${siemStatus.index}. Токен зберігається лише на сервері.`
      : `Monitoring enabled · index ${siemStatus.index}. The token stays on the server.`
    : language === 'uk'
      ? 'Для моніторингу задайте адресу Splunk, токен і індекс алертів у середовищі сервера.'
      : 'Set the Splunk URL, token, and alert index in the server environment to monitor runs.'

  return (
    <div className="stack">
      <Surface title={t.account} meta="01 / 01">
        <div className="record-list" aria-live="polite">
          <div className="record-row">
            <span className="row-index">01</span>
            <strong>{accountName || '—'}</strong>
            <span className="masked-password" aria-label={t.hiddenPassword}>
              ••••••••
            </span>
          </div>
        </div>
      </Surface>
      <Surface title={t.changeCredentials} meta={t.server}>
        <form
          className="credential-form account-form"
          onSubmit={(event) => {
            void saveCredential(event)
          }}
        >
          <div className="field">
            <label htmlFor="username">{t.username}</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="current-password">{t.currentPassword}</label>
            <input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">{t.newPassword}</label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={16}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="primary-button" type="submit" disabled={saving}>
            {t.saveCredentials} <span aria-hidden="true">↗</span>
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </Surface>
      <Surface title="SIEM" meta="SPLUNK">
        <div className="context-note">
          <span className="note-marker" aria-hidden="true" />
          <p>{siemMessage}</p>
        </div>
      </Surface>
    </div>
  )
}
