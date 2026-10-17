import { useEffect, useState } from 'react'
import Agents from './Agents'
import Context from './Context'
import Header from './Header'
import LaunchDialog from './LaunchDialog'
import Overview from './Overview'
import Runs from './Runs'
import Scenarios from './Scenarios'
import ServerActivity from './ServerActivity'
import Settings from './Settings'
import { useAgentConnections } from './hooks/useAgentConnections'
import type { Language, Module, Page, Task, TaskEvent, Verbosity } from './models'
import { agentSupports, currentLanguage, currentPage } from './navigation'
import { translations } from './translations'

function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const [language, setLanguage] = useState<Language>(currentLanguage)
  const [agentView, setAgentView] = useState<'list' | 'connect'>(
    window.location.pathname.startsWith('/connect') ? 'connect' : 'list',
  )
  const {
    connection,
    checkingPort,
    agents: connectedAgents,
    setAgents: setConnectedAgents,
    agentsState,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    disconnectingAgentId,
    agentActionError,
    loadConnection,
    saveSiemHost,
    disconnectAgent,
  } = useAgentConnections(page, agentView, language)
  const [modules, setModules] = useState<Module[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskCounts, setTaskCounts] = useState<{ active: number; completed: number } | null>(null)
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [scenarioQuery, setScenarioQuery] = useState('')
  const [scenarioPlatform, setScenarioPlatform] = useState<'all' | 'linux' | 'windows'>('all')
  const [launchAgentId, setLaunchAgentId] = useState('')
  const [launchError, setLaunchError] = useState('')
  const [launchOpen, setLaunchOpen] = useState(false)
  const [verbosity, setVerbosity] = useState<Verbosity>('detailed')
  const [launching, setLaunching] = useState(false)
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([])
  const [eventsTaskId, setEventsTaskId] = useState<string | null>(null)

  const query = scenarioQuery.trim().toLocaleLowerCase()
  const filteredModules = modules.filter(
    (module) =>
      (scenarioPlatform === 'all' || module.platform === scenarioPlatform) &&
      (!query ||
        [
          module.id,
          module.clusterId,
          module.titleEn,
          module.titleUk,
          module.descriptionEn,
          module.descriptionUk,
        ].some((value) => value?.toLocaleLowerCase().includes(query))),
  )
  const t = translations[language]

  function navigate(nextPage: Page) {
    if (nextPage === 'agents' && page !== 'agents') setAgentView('list')
    if (nextPage === page) return
    window.history.pushState(null, '', `/${nextPage}${window.location.search}`)
    setPage(nextPage)
  }

  function changeLanguage(nextLanguage: Language) {
    if (nextLanguage === language) return
    const url = new URL(window.location.href)
    url.searchParams.set('lang', nextLanguage)
    window.history.replaceState(null, '', url)
    setLanguage(nextLanguage)
  }

  useEffect(() => {
    const legacyPage = window.location.pathname.replace(/\/$/, '')
    if (legacyPage === '/tasks' || legacyPage === '/connect')
      window.history.replaceState(
        null,
        '',
        `${legacyPage === '/tasks' ? '/attacks' : '/agents'}${window.location.search}`,
      )
    const handlePopState = () => {
      setPage(currentPage())
      setAgentView(window.location.pathname.startsWith('/connect') ? 'connect' : 'list')
      setLanguage(currentLanguage())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = `${t.pages[page]} · Panel`
  }, [language, page, t])

  useEffect(() => {
    if (page !== 'main' && page !== 'scenarios' && page !== 'attacks') return
    let active = true
    async function refresh() {
      try {
        const [moduleResponse, taskResponse, agentResponse] = await Promise.all([
          fetch('/api/modules', { cache: 'no-store' }),
          fetch('/api/tasks', { cache: 'no-store' }),
          fetch('/api/agents', { cache: 'no-store' }),
        ])
        if (!moduleResponse.ok || !taskResponse.ok || !agentResponse.ok)
          throw new Error('request failed')
        const [moduleData, taskData, agentData] = await Promise.all([
          moduleResponse.json(),
          taskResponse.json(),
          agentResponse.json(),
        ])
        if (active) {
          setModules(moduleData.modules ?? [])
          setTasks(taskData.tasks ?? [])
          setTaskCounts(taskData.counts ?? null)
          setConnectedAgents(agentData.agents ?? [])
          setDataState('ready')
        }
      } catch {
        if (active) setDataState('error')
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [page, language])

  const currentTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
  const visibleTaskEvents = eventsTaskId === currentTask?.id ? taskEvents : []
  useEffect(() => {
    if (page !== 'attacks' || !currentTask?.id) {
      setTaskEvents([])
      setEventsTaskId(null)
      return
    }
    let active = true
    async function refreshEvents() {
      try {
        const response = await fetch(`/api/task-events?task=${currentTask?.id}`, {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('event request failed')
        const data = (await response.json()) as { events: TaskEvent[] }
        if (active) {
          setTaskEvents(Array.isArray(data.events) ? data.events : [])
          setEventsTaskId(currentTask?.id ?? null)
        }
      } catch {
        if (active) setTaskEvents([])
      }
    }
    setTaskEvents([])
    setEventsTaskId(null)
    void refreshEvents()
    const timer = window.setInterval(() => {
      void refreshEvents()
    }, 2500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [page, currentTask?.id])

  // Keep the run visible while the server completes the first refresh.
  async function launchModule() {
    const selected =
      filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
    const agent = connectedAgents.find((item) => item.id === launchAgentId)
    if (!selected || !agent || !agentSupports(agent, selected)) return
    const moduleId = selected.id
    setLaunchError('')
    setLaunching(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId, agentId: launchAgentId, verbosity }),
      })
      if (!response.ok) throw new Error('launch failed')
      const created = (await response.json()) as { id: number }
      const id = String(created.id)
      setSelectedTaskId(id)
      setTasks((current) => [
        {
          id,
          agentId: launchAgentId,
          agentName:
            connectedAgents.find((agent) => agent.id === launchAgentId)?.name ?? launchAgentId,
          scenario: moduleId,
          status: 'queued',
          verbosity,
          createdAt: new Date().toISOString(),
          result: {},
        },
        ...current,
      ])
      setLaunchOpen(false)
      navigate('attacks')
      void fetch('/api/tasks', { cache: 'no-store' })
        .then(async (taskResponse) => {
          if (taskResponse.ok) {
            const data = await taskResponse.json()
            setTasks(data.tasks ?? [])
            setTaskCounts(data.counts ?? null)
          }
        })
        .catch(() => {})
    } catch {
      setLaunchError(
        language === 'uk' ? 'Не вдалося запустити модуль.' : 'Could not launch module.',
      )
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="app-shell">
      <Header
        page={page}
        language={language}
        onNavigate={navigate}
        onChangeLanguage={changeLanguage}
      />

      <div
        className={`workspace workspace-${page}${page === 'agents' && agentView === 'connect' ? ' workspace-connect' : ''}`}
      >
        <main className={page === 'attacks' ? 'main-pane attack-pane' : 'main-pane'}>
          {page === 'main' && (
            <Overview
              language={language}
              dataState={dataState}
              agents={connectedAgents}
              modules={modules}
              tasks={tasks}
              taskCounts={taskCounts}
              onNavigate={navigate}
              onOpenTask={(id) => {
                setSelectedTaskId(id)
                navigate('attacks')
              }}
            />
          )}
          {page === 'creds' && <Settings language={language} />}
          {page === 'scenarios' && (
            <Scenarios
              language={language}
              dataState={dataState}
              modules={filteredModules}
              agents={connectedAgents}
              selectedModuleId={selectedModuleId}
              launchAgentId={launchAgentId}
              launchError={launchError}
              onSelectAgent={setLaunchAgentId}
              onOpenLaunch={() => {
                setLaunchError('')
                setLaunchOpen(true)
              }}
            />
          )}
          {page === 'agents' && (
            <Agents
              language={language}
              view={agentView}
              onChangeView={setAgentView}
              agents={connectedAgents}
              agentsState={agentsState}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              connection={connection}
              checkingPort={checkingPort}
              onCheckPort={() => {
                void loadConnection(true)
              }}
            />
          )}
          {page === 'attacks' && (
            <Runs
              language={language}
              dataState={dataState}
              modules={modules}
              tasks={tasks}
              selectedTask={currentTask}
              events={visibleTaskEvents}
              onSelectTask={setSelectedTaskId}
              onBrowseScenarios={() => navigate('scenarios')}
            />
          )}
        </main>

        {(page === 'scenarios' ||
          page === 'creds' ||
          (page === 'agents' && agentView === 'list')) && (
          <aside className="context-pane" aria-label={t.contextLabel}>
            <Context
              page={page}
              language={language}
              dataState={dataState}
              modules={modules}
              filteredModules={filteredModules}
              selectedModuleId={selectedModuleId}
              scenarioQuery={scenarioQuery}
              scenarioPlatform={scenarioPlatform}
              onQueryChange={setScenarioQuery}
              onPlatformChange={setScenarioPlatform}
              onSelectModule={setSelectedModuleId}
              selectedAgent={selectedAgent}
              disconnectingAgentId={disconnectingAgentId}
              agentActionError={agentActionError}
              onSaveSiemHost={(event, id) => {
                void saveSiemHost(event, id)
              }}
              onDisconnectAgent={(id) => {
                void disconnectAgent(id)
              }}
            />
          </aside>
        )}
        {page !== 'attacks' && (
          <ServerActivity page={page} agentView={agentView} language={language} />
        )}
      </div>
      {launchOpen && (
        <LaunchDialog
          language={language}
          module={
            filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
          }
          agent={connectedAgents.find((agent) => agent.id === launchAgentId)}
          verbosity={verbosity}
          error={launchError}
          launching={launching}
          onVerbosityChange={setVerbosity}
          onClose={() => setLaunchOpen(false)}
          onLaunch={() => {
            void launchModule()
          }}
        />
      )}
    </div>
  )
}

export default App
