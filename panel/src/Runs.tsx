import AttackMap from './AttackMap'
import type { Language, LoadState, Module, Task, TaskEvent } from './models'
import { statusLabel } from './navigation'
import { translations } from './translations'
import { EmptyState } from './ui'

type Props = {
  language: Language
  dataState: LoadState
  modules: Module[]
  tasks: Task[]
  selectedTask: Task | undefined
  events: TaskEvent[]
  onSelectTask: (id: string) => void
  onBrowseScenarios: () => void
}

function emptyRuns(language: Language, state: LoadState) {
  if (state === 'error')
    return language === 'uk'
      ? { title: 'Запуски недоступні', text: 'Не вдалося отримати запуски з сервера.' }
      : { title: 'Runs unavailable', text: 'Could not load runs from the server.' }
  if (state === 'loading')
    return { title: language === 'uk' ? 'Завантаження' : 'Loading', text: '' }
  return language === 'uk'
    ? { title: 'Запусків ще немає', text: 'Виберіть сценарій та агента для першої симуляції.' }
    : { title: 'No runs yet', text: 'Choose a scenario and agent for the first simulation.' }
}

export default function Runs({
  language,
  dataState,
  modules,
  tasks,
  selectedTask,
  events,
  onSelectTask,
  onBrowseScenarios,
}: Props) {
  if (!tasks.length)
    return (
      <div className="runs-empty">
        <EmptyState {...emptyRuns(language, dataState)} />
        {dataState === 'ready' && (
          <button type="button" className="primary-button" onClick={onBrowseScenarios}>
            {language === 'uk' ? 'Відкрити сценарії' : 'Browse scenarios'}
          </button>
        )}
      </div>
    )

  return (
    <div className="runs-layout">
      <aside className="runs-list" aria-label={language === 'uk' ? 'Список запусків' : 'Runs list'}>
        <div className="runs-list-heading">
          <h2>{translations[language].pages.attacks}</h2>
          <span>{tasks.length}</span>
        </div>
        {tasks.map((task) => {
          const module = modules.find((item) => item.id === task.scenario)
          return (
            <button
              type="button"
              key={task.id}
              className={selectedTask?.id === task.id ? 'run-item selected' : 'run-item'}
              onClick={() => onSelectTask(task.id)}
            >
              <span className="run-item-title">
                {module?.[language === 'uk' ? 'titleUk' : 'titleEn'] ?? task.scenario}
              </span>
              <span className="run-item-meta">
                #{task.id} · {task.agentName}
              </span>
              <span className={`run-status status-${task.status}`}>
                {statusLabel(task.status, language)}
              </span>
            </button>
          )
        })}
      </aside>
      <AttackMap language={language} task={selectedTask} events={events} modules={modules} />
    </div>
  )
}
