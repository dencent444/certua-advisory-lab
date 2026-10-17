import type { Agent, Language, LoadState, Module } from './models'
import { agentSupports } from './navigation'
import { translations } from './translations'
import { EmptyState, Surface } from './ui'

type Props = {
  language: Language
  dataState: LoadState
  modules: Module[]
  agents: Agent[]
  selectedModuleId: string | null
  launchAgentId: string
  launchError: string
  onSelectAgent: (id: string) => void
  onOpenLaunch: () => void
}

export default function Scenarios({
  language,
  dataState,
  modules,
  agents,
  selectedModuleId,
  launchAgentId,
  launchError,
  onSelectAgent,
  onOpenLaunch,
}: Props) {
  const t = translations[language]
  const selected = modules.find((module) => module.id === selectedModuleId) ?? modules[0]
  const compatibleAgents = selected ? agents.filter((agent) => agentSupports(agent, selected)) : []
  const canLaunch = compatibleAgents.some((agent) => agent.id === launchAgentId)
  const description = selected?.[language === 'uk' ? 'descriptionUk' : 'descriptionEn']
  const limitations = selected?.[language === 'uk' ? 'limitationsUk' : 'limitationsEn']
  const emptyTitle =
    dataState === 'error'
      ? language === 'uk'
        ? 'Каталог недоступний'
        : 'Catalog unavailable'
      : dataState === 'loading'
        ? language === 'uk'
          ? 'Завантаження'
          : 'Loading'
        : t.noScenario
  const emptyText =
    dataState === 'error'
      ? language === 'uk'
        ? 'Не вдалося отримати сценарії з сервера.'
        : 'Could not load scenarios from the server.'
      : dataState === 'ready'
        ? t.noScenarioHint
        : ''

  return (
    <div className="stack scenario-stack">
      <Surface title={t.description} className="description-surface">
        {selected ? (
          <div className="module-description">
            <strong>{selected[language === 'uk' ? 'titleUk' : 'titleEn']}</strong>
            <p>{description}</p>
            {!!selected.requires?.length && (
              <p>
                {language === 'uk' ? 'Потрібні команди: ' : 'Required commands: '}
                {selected.requires.join(', ')}.{' '}
                {language === 'uk'
                  ? 'Агент перевірить їх до симуляції.'
                  : 'The agent checks them before the simulation.'}
              </p>
            )}
            {selected.sourceUrl && (
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                {selected.sourceLabel ?? 'Source'} ↗
              </a>
            )}
            {limitations && <p>{limitations}</p>}
          </div>
        ) : (
          <EmptyState title={emptyTitle} text={emptyText} />
        )}
      </Surface>
      {selected && (
        <div className="launch-bar">
          <div>
            <span className="section-label">{t.launch}</span>
            <p>
              {language === 'uk'
                ? 'Виберіть підключеного агента для цієї ОС'
                : 'Select a connected agent for this OS'}
            </p>
            <select
              value={canLaunch ? launchAgentId : ''}
              onChange={(event) => onSelectAgent(event.target.value)}
            >
              <option value="">{language === 'uk' ? 'Вибрати агента' : 'Select agent'}</option>
              {compatibleAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            {launchError && (
              <p className="form-error" role="alert">
                {launchError}
              </p>
            )}
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={!canLaunch}
            onClick={onOpenLaunch}
          >
            {t.launchButton} <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
    </div>
  )
}
