import { useEffect, useState } from 'react'
import type { Language, LoadState, Page, ServerLog } from './models'
import { translations } from './translations'

type Props = { page: Page; agentView: 'list' | 'connect'; language: Language }

export default function ServerActivity({ page, agentView, language }: Props) {
  const [logs, setLogs] = useState<ServerLog[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const t = translations[language]

  useEffect(() => {
    const controller = new AbortController()
    const tab = page === 'agents' && agentView === 'connect' ? 'connect' : page
    async function loadLogs() {
      try {
        const response = await fetch(`/api/logs?tab=${tab}&lang=${language}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('log request failed')
        const data = (await response.json()) as { entries: ServerLog[] }
        setLogs(Array.isArray(data.entries) ? data.entries : [])
        setState('ready')
      } catch {
        if (!controller.signal.aborted) setState('error')
      }
    }
    setLogs([])
    setState('loading')
    void loadLogs()
    const timer = window.setInterval(() => {
      void loadLogs()
    }, 5000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [page, agentView, language])

  return (
    <details className="server-activity">
      <summary>
        {language === 'uk' ? 'Активність сервера' : 'Server activity'}{' '}
        <span>{state === 'ready' ? logs.length : '—'}</span>
      </summary>
      <div className="server-activity-list" aria-live="polite">
        {state === 'loading' && <p>{t.logsLoading}</p>}
        {state === 'error' && <p>{t.logsError}</p>}
        {state === 'ready' && logs.length === 0 && <p>{t.logsEmpty}</p>}
        {state === 'ready' &&
          logs.map((entry, index) => (
            <div className="server-activity-row" key={`${entry.time}-${index}`}>
              <time>
                {new Date(entry.time).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB')}
              </time>
              <span className={entry.level === 'WARN' ? 'activity-warn' : ''}>{entry.level}</span>
              <p>{entry.message}</p>
            </div>
          ))}
      </div>
    </details>
  )
}
