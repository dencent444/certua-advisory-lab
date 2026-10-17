import type { FormEvent } from 'react'
import type { Agent, Language, LoadState, Module, Page, ScenarioPlatform } from './models'
import { translations } from './translations'
import { EmptyState, Surface } from './ui'

type Props = {
  page: Page
  language: Language
  dataState: LoadState
  modules: Module[]
  filteredModules: Module[]
  selectedModuleId: string | null
  scenarioQuery: string
  scenarioPlatform: ScenarioPlatform
  onQueryChange: (query: string) => void
  onPlatformChange: (platform: ScenarioPlatform) => void
  onSelectModule: (id: string) => void
  selectedAgent: Agent | undefined
  disconnectingAgentId: string | null
  agentActionError: string
  onSaveSiemHost: (event: FormEvent<HTMLFormElement>, id: string) => void
  onDisconnectAgent: (id: string) => void
}

function ScenarioCatalog(props: Props) {
  const {
    language,
    dataState,
    modules,
    filteredModules,
    selectedModuleId,
    scenarioQuery,
    scenarioPlatform,
    onQueryChange,
    onPlatformChange,
    onSelectModule,
  } = props
  const t = translations[language]
  const selected =
    filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
  const emptyTitle =
    dataState === 'error'
      ? language === 'uk'
        ? 'Каталог недоступний'
        : 'Catalog unavailable'
      : dataState === 'loading'
        ? language === 'uk'
          ? 'Завантаження'
          : 'Loading'
        : modules.length
          ? language === 'uk'
            ? 'Нічого не знайдено'
            : 'No matches'
          : t.noScenario
  const emptyText =
    dataState === 'error'
      ? language === 'uk'
        ? 'Не вдалося отримати список.'
        : 'Could not load the list.'
      : dataState === 'ready' && modules.length
        ? language === 'uk'
          ? 'Змініть пошук або фільтр ОС.'
          : 'Change the search or OS filter.'
        : dataState === 'ready'
          ? t.noScenarioHint
          : ''

  return (
    <Surface
      title={t.availableScenarios}
      meta={dataState === 'ready' ? `${filteredModules.length} / ${modules.length}` : '—'}
      className="context-surface scenario-list"
    >
      <div className="scenario-filters">
        <input
          type="search"
          value={scenarioQuery}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={language === 'uk' ? 'Пошук UAC або назви' : 'Search UAC or title'}
          aria-label={language === 'uk' ? 'Пошук сценаріїв' : 'Search scenarios'}
        />
        <div
          className="scenario-platforms"
          aria-label={language === 'uk' ? 'Операційна система' : 'Operating system'}
        >
          {(['all', 'linux', 'windows'] as const).map((platform) => (
            <button
              key={platform}
              type="button"
              className={scenarioPlatform === platform ? 'selected' : ''}
              aria-pressed={scenarioPlatform === platform}
              onClick={() => onPlatformChange(platform)}
            >
              {platform === 'all'
                ? language === 'uk'
                  ? 'Усі'
                  : 'All'
                : platform === 'linux'
                  ? 'Linux'
                  : 'Windows'}
            </button>
          ))}
        </div>
      </div>
      {filteredModules.length ? (
        <div className="scenario-rows">
          {filteredModules.map((module) => (
            <button
              className={selected?.id === module.id ? 'data-row selected' : 'data-row'}
              key={module.id}
              type="button"
              onClick={() => onSelectModule(module.id)}
            >
              <strong>{module[language === 'uk' ? 'titleUk' : 'titleEn']}</strong>
              <span>
                {module.id} · {module.platform}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} text={emptyText} />
      )}
    </Surface>
  )
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AgentDetails(props: Props) {
  const {
    language,
    selectedAgent,
    disconnectingAgentId,
    agentActionError,
    onSaveSiemHost,
    onDisconnectAgent,
  } = props
  const t = translations[language]
  return (
    <Surface title={t.agentDetails} className="context-surface">
      {selectedAgent ? (
        <div className="detail-lines">
          <DetailRow label={t.agent} value={selectedAgent.name} />
          <DetailRow label={t.agentId} value={selectedAgent.id} />
          <DetailRow
            label={t.lastSeen}
            value={new Date(selectedAgent.lastSeen).toLocaleString(
              language === 'uk' ? 'uk-UA' : 'en-GB',
            )}
          />
          <DetailRow label={t.status} value={t.online} />
          <DetailRow label={t.os} value={selectedAgent.info?.os || '—'} />
          <DetailRow label={t.architecture} value={selectedAgent.info?.arch || '—'} />
          <DetailRow label={t.cpuThreads} value={selectedAgent.info?.cpu ?? '—'} />
          <DetailRow
            label={t.memory}
            value={
              selectedAgent.info?.memoryMiB != null ? `${selectedAgent.info.memoryMiB} MiB` : '—'
            }
          />
          <DetailRow label={t.uptime} value={selectedAgent.info?.uptimeSeconds ?? '—'} />
          <form
            className="siem-host-form"
            key={selectedAgent.id}
            onSubmit={(event) => onSaveSiemHost(event, selectedAgent.id)}
          >
            <label htmlFor="siem-host">
              {language === 'uk' ? 'Ім’я хоста в SIEM' : 'SIEM asset name'}
            </label>
            <div>
              <input
                id="siem-host"
                name="host"
                defaultValue={selectedAgent.siemHost || selectedAgent.name}
                pattern="[A-Za-z0-9._-]+"
                maxLength={253}
                required
              />
              <button className="outline-button" type="submit">
                {language === 'uk' ? 'Зберегти' : 'Save'}
              </button>
            </div>
          </form>
          <button
            className="outline-button disconnect-agent"
            type="button"
            disabled={disconnectingAgentId === selectedAgent.id}
            onClick={() => onDisconnectAgent(selectedAgent.id)}
          >
            {t.disconnect}
          </button>
          {agentActionError && (
            <p className="form-error" role="alert">
              {agentActionError}
            </p>
          )}
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
  )
}

export default function Context(props: Props) {
  if (props.page === 'scenarios') return <ScenarioCatalog {...props} />
  if (props.page === 'agents') return <AgentDetails {...props} />
  if (props.page === 'creds') {
    const t = translations[props.language]
    return (
      <Surface title={t.storage} meta={t.server} className="context-surface">
        <div className="context-note">
          <span className="note-marker" aria-hidden="true" />
          <p>{t.storageHint}</p>
        </div>
      </Surface>
    )
  }
  return null
}
