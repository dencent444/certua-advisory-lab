import type { Agent, Language, LoadState, Module, Page, Task } from './models'
import { statusLabel } from './navigation'
import { translations } from './translations'
import { EmptyState, Surface } from './ui'

type Props = {
  language: Language
  dataState: LoadState
  agents: Agent[]
  modules: Module[]
  tasks: Task[]
  taskCounts: { active: number; completed: number } | null
  onNavigate: (page: Page) => void
  onOpenTask: (id: string) => void
}

function Metric({
  label,
  value,
  onClick,
}: {
  label: string
  value: number | string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function RecentRun({
  task,
  modules,
  language,
  onOpen,
}: {
  task: Task
  modules: Module[]
  language: Language
  onOpen: (id: string) => void
}) {
  const module = modules.find((item) => item.id === task.scenario)
  const title = module?.[language === 'uk' ? 'titleUk' : 'titleEn'] ?? task.scenario
  const date = new Date(task.createdAt).toLocaleString(language === 'uk' ? 'uk-UA' : 'en-GB')
  return (
    <button className="overview-run" type="button" onClick={() => onOpen(task.id)}>
      <span>
        <strong>{title}</strong>
        <small>
          {task.agentName} · {date}
        </small>
      </span>
      <em className={`run-status status-${task.status}`}>{statusLabel(task.status, language)}</em>
    </button>
  )
}

function emptyRuns(language: Language, state: LoadState) {
  if (state === 'error')
    return language === 'uk'
      ? { title: 'Дані недоступні', text: 'Не вдалося отримати дані з сервера.' }
      : { title: 'Data unavailable', text: 'Could not load data from the server.' }
  if (state === 'loading')
    return { title: language === 'uk' ? 'Завантаження' : 'Loading', text: '' }
  return language === 'uk'
    ? {
        title: 'Запусків ще немає',
        text: 'Виберіть сценарій та підключеного агента для першої симуляції.',
      }
    : {
        title: 'No runs yet',
        text: 'Choose a scenario and connected agent to run the first simulation.',
      }
}

export default function Overview({
  language,
  dataState,
  agents,
  modules,
  tasks,
  taskCounts,
  onNavigate,
  onOpenTask,
}: Props) {
  const t = translations[language]
  const ready = dataState === 'ready'
  return (
    <div className="stack overview-stack">
      <div className="overview-heading">
        <div>
          <span className="eyebrow">{language === 'uk' ? 'РОБОЧИЙ ПРОСТІР' : 'WORKSPACE'}</span>
          <h1>{t.pages.main}</h1>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate('scenarios')}>
          {language === 'uk' ? 'Запустити симуляцію' : 'Run a simulation'}
        </button>
      </div>
      <div
        className="overview-metrics"
        aria-label={language === 'uk' ? 'Поточний стан' : 'Current state'}
      >
        <Metric
          label={language === 'uk' ? 'Агенти онлайн' : 'Agents online'}
          value={ready ? agents.length : '—'}
          onClick={() => onNavigate('agents')}
        />
        <Metric
          label={t.pages.scenarios}
          value={ready ? modules.length : '—'}
          onClick={() => onNavigate('scenarios')}
        />
        <Metric
          label={language === 'uk' ? 'Активні запуски' : 'Active runs'}
          value={ready ? (taskCounts?.active ?? '—') : '—'}
          onClick={() => onNavigate('attacks')}
        />
        <Metric
          label={language === 'uk' ? 'Завершені запуски' : 'Completed runs'}
          value={ready ? (taskCounts?.completed ?? '—') : '—'}
          onClick={() => onNavigate('attacks')}
        />
      </div>
      <Surface title={language === 'uk' ? 'Останні запуски' : 'Recent runs'}>
        {ready && tasks.length ? (
          tasks
            .slice(0, 6)
            .map((task) => (
              <RecentRun
                key={task.id}
                task={task}
                modules={modules}
                language={language}
                onOpen={onOpenTask}
              />
            ))
        ) : (
          <EmptyState {...emptyRuns(language, dataState)} />
        )}
      </Surface>
    </div>
  )
}
