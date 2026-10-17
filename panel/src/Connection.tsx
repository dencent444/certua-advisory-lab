import { useState } from 'react'
import type { ConnectionData, Language } from './models'
import { translations } from './translations'
import { Surface } from './ui'

type Props = {
  language: Language
  connection: ConnectionData | null
  checkingPort: boolean
  onCheckPort: () => void
}

export default function Connection({ language, connection, checkingPort, onCheckPort }: Props) {
  const [platform, setPlatform] = useState<'linux' | 'windows'>('linux')
  const [copied, setCopied] = useState(false)
  const t = translations[language]
  const command = platform === 'linux' ? connection?.linuxAgentCommand : connection?.agentCommand
  const probeState = connection?.probe.state as keyof typeof t.probeStates
  const tunnelState = connection?.tunnel.state as keyof typeof t.tunnelStates

  function copyCommand() {
    if (!command || !navigator.clipboard) return
    void navigator.clipboard
      .writeText(command)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  function selectPlatform(next: 'linux' | 'windows') {
    setPlatform(next)
    setCopied(false)
  }

  return (
    <div className="stack">
      <Surface title={t.networkAccess} meta={connection ? `${connection.port}/TCP` : '—'}>
        <div className="network-summary">
          <div>
            <span>{t.port}</span>
            <strong>{connection?.port ?? '—'}</strong>
          </div>
          <div>
            <span>{t.publicHost}</span>
            <strong>{connection?.probe.host || '—'}</strong>
          </div>
          <div>
            <span>{t.portState}</span>
            <strong className={connection?.probe.state === 'open' ? 'state-open' : 'state-warning'}>
              {t.probeStates[probeState] ?? t.probeStates.unknown}
            </strong>
          </div>
        </div>
        <div className="network-actions">
          <button
            className="outline-button"
            type="button"
            disabled={checkingPort}
            onClick={onCheckPort}
          >
            {checkingPort ? t.checking : t.checkPort}
          </button>
        </div>
        {connection?.probe.state !== 'open' && (
          <div className="pinggy-block">
            <div>
              <strong>{t.pinggy}</strong>
              <span>
                {t.tunnelStates[tunnelState] ?? t.tunnelStates.waiting} · {t.pinggyHint}
              </span>
            </div>
            {connection?.tunnel.url && (
              <code className="agent-endpoint-url">{connection.tunnel.url}</code>
            )}
          </div>
        )}
        <div className="pinggy-block">
          <div>
            <strong>{t.agentCommandTitle}</strong>
            <span>{t.agentCommandHint}</span>
          </div>
          <div className="command-platforms" role="group" aria-label={t.agentCommandTitle}>
            <button
              className={platform === 'linux' ? 'selected' : ''}
              type="button"
              aria-pressed={platform === 'linux'}
              onClick={() => selectPlatform('linux')}
            >
              {t.linux}
            </button>
            <button
              className={platform === 'windows' ? 'selected' : ''}
              type="button"
              aria-pressed={platform === 'windows'}
              onClick={() => selectPlatform('windows')}
            >
              {t.windows}
            </button>
          </div>
          <div className="command-row">
            <code>{command || t.waitingForAddress}</code>
            <button type="button" disabled={!command} onClick={copyCommand}>
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </div>
      </Surface>
    </div>
  )
}
