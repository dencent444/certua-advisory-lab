import Connection from './Connection'
import type { Agent, ConnectionData, Language, LoadState } from './models'
import { translations } from './translations'
import { EmptyState, Surface } from './ui'

type Props = {
  language: Language
  view: 'list' | 'connect'
  onChangeView: (view: 'list' | 'connect') => void
  agents: Agent[]
  agentsState: LoadState
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  connection: ConnectionData | null
  checkingPort: boolean
  onCheckPort: () => void
}

export default function Agents({
  language,
  view,
  onChangeView,
  agents,
  agentsState,
  selectedAgentId,
  onSelectAgent,
  connection,
  checkingPort,
  onCheckPort,
}: Props) {
  const t = translations[language]
  const selectedId = agents.find((agent) => agent.id === selectedAgentId)?.id ?? agents[0]?.id
  return (
    <div className="stack">
      <div className="section-tabs" aria-label={t.pages.agents}>
        <button
          type="button"
          aria-pressed={view === 'list'}
          className={view === 'list' ? 'selected' : ''}
          onClick={() => onChangeView('list')}
        >
          {t.connectedAgents}
        </button>
        <button
          type="button"
          aria-pressed={view === 'connect'}
          className={view === 'connect' ? 'selected' : ''}
          onClick={() => onChangeView('connect')}
        >
          {language === 'uk' ? 'Додати агента' : 'Add agent'}
        </button>
      </div>
      {view === 'connect' ? (
        <Connection
          language={language}
          connection={connection}
          checkingPort={checkingPort}
          onCheckPort={onCheckPort}
        />
      ) : (
        <Surface title={t.agentList} meta={agentsState === 'ready' ? String(agents.length) : '—'}>
          <div className="table-head" aria-hidden="true">
            <span>{t.agent}</span>
            <span>{t.lastSeen}</span>
            <span>{t.status}</span>
          </div>
          {agentsState === 'error' ? (
            <EmptyState title={t.agentsUnavailable} text={t.agentsUnavailableHint} />
          ) : agents.length ? (
            <div>
              {agents.map((agent) => (
                <button
                  className={selectedId === agent.id ? 'data-row selected' : 'data-row'}
                  key={agent.id}
                  type="button"
                  aria-pressed={selectedId === agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                >
                  <strong>{agent.name}</strong>
                  <span>
                    {new Date(agent.lastSeen).toLocaleTimeString(
                      language === 'uk' ? 'uk-UA' : 'en-GB',
                    )}
                  </span>
                  <em>{t.online}</em>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={t.noAgents}
              text={
                language === 'uk'
                  ? 'Додайте агента через сусідню вкладку.'
                  : 'Add an agent from the next tab.'
              }
            />
          )}
        </Surface>
      )}
    </div>
  )
}
