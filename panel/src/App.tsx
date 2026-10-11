import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import AttackMap, { type TaskEvent } from './AttackMap'

type Page = 'main' | 'creds' | 'scenarios' | 'agents' | 'attacks'
type Language = 'en' | 'uk'
type Agent = { id: string; name: string; lastSeen: string; info: { os?: string; arch?: string; cpu?: number; memoryMiB?: number; uptimeSeconds?: number } }
type ServerLog = { time: string; level: string; message: string }
type Module = { id: string; clusterId?: string; platform: string; titleEn: string; titleUk: string; descriptionEn: string; descriptionUk: string; sourceUrl?: string; sourceLabel?: string; limitationsEn?: string; limitationsUk?: string; requires?: string[]; flow?: { id: string; titleEn: string; titleUk: string; noteEn: string; noteUk: string }[] }
type Survey = { files: number; bytes: number; truncated: boolean; categories: Record<string, { files: number; bytes: number }> }
type Task = { id: string; agentId: string; agentName: string; scenario: string; status: string; verbosity: 'standard' | 'detailed' | 'trace'; createdAt: string; result: { ok?: boolean; error?: string; evidence?: { config?: boolean; tunnel?: boolean; download?: boolean; executed?: boolean; stageSha256?: string; observedAt?: string; survey?: Survey; phases?: Record<string, boolean>; metrics?: Record<string, string | number | boolean>; preflight?: { ok: boolean; missing: string } } } }
type ConnectionData = {
  port: number
  probe: { state: string; host: string; checkedAt: string; source: string }
  tunnel: { state: string; url: string }
  agentCommand: string
  linuxAgentCommand: string
  agents: Agent[]
  agentPullReady: boolean
}

const pages: Page[] = ['main', 'scenarios', 'attacks', 'agents', 'creds']

const translations = {
  en: {
    pages: { main: 'Overview', creds: 'Settings', scenarios: 'Scenarios', agents: 'Agents', attacks: 'Runs' },
    hiddenPassword: 'Password hidden',
    account: 'Panel account', changeCredentials: 'Change credentials', currentPassword: 'Current password', newPassword: 'New password',
    saveCredentials: 'Save credentials', credsUnavailable: 'Account unavailable', credsInvalid: 'Check the current password and try again.',
    passwordLength: 'New password must contain at least 16 characters.', logout: 'Sign out',
    agent: 'Agent', status: 'Status',
    agentList: 'Agent list', lastSeen: 'Last seen',
    description: 'Description', noScenario: 'No scenarios', noScenarioHint: 'Scenarios will appear here after they are added.',
    launch: 'LAUNCH', launchButton: 'Start scenario',
    availableScenarios: 'Available scenarios',
    storage: 'Storage', storageHint: 'One panel account is stored in PostgreSQL. Changing it signs out all sessions.',
    agentDetails: 'Agent details',
    noAgents: 'No connected agents',
    agentsUnavailable: 'Agent list unavailable', agentsUnavailableHint: 'Could not load agents from the server.',
    online: 'Online', agentId: 'Agent ID',
    os: 'OS', architecture: 'Architecture', cpuThreads: 'CPU threads', memory: 'Memory', uptime: 'Uptime (s)', disconnect: 'Disconnect', disconnectError: 'Could not disconnect the agent.',
    contextLabel: 'Additional information', navLabel: 'Sections',
    logsLoading: 'Loading server logs', logsEmpty: 'No server logs for this section', logsError: 'Server logs unavailable',
    server: 'SERVER', username: 'Username',
    networkAccess: 'Agent endpoint', port: 'Agent port', publicHost: 'Public host', portState: 'Port check',
    checkPort: 'Check again', checking: 'Checking…', pinggy: 'Agent HTTPS endpoint', pinggyHint: 'The tunnel accepts agent traffic only.',
    tunnelStates: { waiting: 'Waiting for port check', starting: 'Starting tunnel', active: 'Tunnel active', error: 'Retrying tunnel', not_needed: 'Direct port available' },
    agentCommandTitle: 'Agent command', agentCommandHint: 'Installs a background agent that checks in every 10 seconds.', linux: 'Linux · Bash', windows: 'Windows · PowerShell', waitingForAddress: 'Waiting for server address…',
    copy: 'Copy', copied: 'Copied', connectedAgents: 'Connected agents',
    probeStates: { unknown: 'Not checked', open: 'Reachable', closed: 'Closed', filtered: 'Filtered', blocked: 'Blocked', unavailable: 'Check unavailable' },
  },
  uk: {
    pages: { main: 'Огляд', creds: 'Налаштування', scenarios: 'Сценарії', agents: 'Агенти', attacks: 'Запуски' },
    hiddenPassword: 'Пароль приховано',
    account: 'Обліковий запис панелі', changeCredentials: 'Змінити дані входу', currentPassword: 'Поточний пароль', newPassword: 'Новий пароль',
    saveCredentials: 'Зберегти дані', credsUnavailable: 'Запис недоступний', credsInvalid: 'Перевірте поточний пароль і повторіть спробу.',
    passwordLength: 'Новий пароль має містити щонайменше 16 символів.', logout: 'Вийти',
    agent: 'Агент', status: 'Статус',
    agentList: 'Список агентів', lastSeen: 'Останній зв’язок',
    description: 'Опис', noScenario: 'Немає сценаріїв', noScenarioHint: 'Сценарії з’являться тут після додавання.',
    launch: 'ЗАПУСК', launchButton: 'Запустити сценарій',
    availableScenarios: 'Доступні сценарії',
    storage: 'Зберігання', storageHint: 'Один обліковий запис панелі зберігається в PostgreSQL. Зміна завершує всі сесії.',
    agentDetails: 'Деталі агента',
    noAgents: 'Немає підключених агентів',
    agentsUnavailable: 'Список агентів недоступний', agentsUnavailableHint: 'Не вдалося завантажити агентів із сервера.',
    online: 'У мережі', agentId: 'ID агента',
    os: 'ОС', architecture: 'Архітектура', cpuThreads: 'Потоки CPU', memory: 'Пам’ять', uptime: 'Час роботи (с)', disconnect: 'Відключити', disconnectError: 'Не вдалося відключити агента.',
    contextLabel: 'Додаткова інформація', navLabel: 'Розділи',
    logsLoading: 'Завантаження журналу', logsEmpty: 'Для цього розділу немає записів сервера', logsError: 'Журнал сервера недоступний',
    server: 'СЕРВЕР', username: 'Ім’я користувача',
    networkAccess: 'Адреса агентів', port: 'Порт агентів', publicHost: 'Публічна адреса', portState: 'Перевірка порту',
    checkPort: 'Перевірити знову', checking: 'Перевірка…', pinggy: 'HTTPS-адреса агентів', pinggyHint: 'Тунель приймає лише трафік агентів.',
    tunnelStates: { waiting: 'Очікування перевірки порту', starting: 'Запуск тунелю', active: 'Тунель активний', error: 'Повторна спроба', not_needed: 'Прямий порт доступний' },
    agentCommandTitle: 'Команда агента', agentCommandHint: 'Встановлює фоновий агент, який надсилає сигнал кожні 10 секунд.', linux: 'Linux · Bash', windows: 'Windows · PowerShell', waitingForAddress: 'Очікування адреси сервера…',
    copy: 'Копіювати', copied: 'Скопійовано', connectedAgents: 'Підключені агенти',
    probeStates: { unknown: 'Не перевірено', open: 'Доступний', closed: 'Закритий', filtered: 'Фільтрується', blocked: 'Заблокований', unavailable: 'Перевірка недоступна' },
  },
} as const

function currentPage(): Page {
  const path = window.location.pathname.slice(1).replace(/\/$/, '')
  if (path === 'tasks') return 'attacks'
  if (path === 'connect') return 'agents'
  return pages.find((page) => page === path) ?? 'main'
}

function currentLanguage(): Language {
  return new URLSearchParams(window.location.search).get('lang') === 'uk' ? 'uk' : 'en'
}

function agentSupports(agent: Agent, module: Module): boolean {
  const os = agent.info?.os ?? ''
  return module.platform === 'linux' ? os === 'Linux' : os.startsWith('Microsoft Windows')
}

function statusLabel(status: string, language: Language): string {
  if (language === 'en') return status
  return ({ queued: 'У черзі', running: 'Виконується', completed: 'Завершено', failed: 'Помилка' } as Record<string, string>)[status] ?? status
}

function Surface({ title, meta, children, className = '' }: {
  title: string
  meta?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`surface ${className}`}>
      <div className="surface-heading">
        <h2>{title}</h2>
        {meta && <span className="surface-meta">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-line" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function App() {
  const navigationRef = useRef<HTMLElement>(null)
  const [page, setPage] = useState<Page>(currentPage)
  const [language, setLanguage] = useState<Language>(currentLanguage)
  const [agentView, setAgentView] = useState<'list' | 'connect'>(window.location.pathname.startsWith('/connect') ? 'connect' : 'list')
  const [accountName, setAccountName] = useState('')
  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [credentialError, setCredentialError] = useState('')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [logs, setLogs] = useState<ServerLog[]>([])
  const [logsState, setLogsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [connection, setConnection] = useState<ConnectionData | null>(null)
  const [checkingPort, setCheckingPort] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentPlatform, setAgentPlatform] = useState<'linux' | 'windows'>('linux')
  const [connectedAgents, setConnectedAgents] = useState<Agent[]>([])
  const [agentsState, setAgentsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [disconnectingAgentId, setDisconnectingAgentId] = useState<string | null>(null)
  const [agentActionError, setAgentActionError] = useState('')
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
  const [verbosity, setVerbosity] = useState<'standard' | 'detailed' | 'trace'>('detailed')
  const [launching, setLaunching] = useState(false)
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([])
  const [eventsTaskId, setEventsTaskId] = useState<string | null>(null)

  const selectedAgent = connectedAgents.find((agent) => agent.id === selectedAgentId) ?? connectedAgents[0]
  const query = scenarioQuery.trim().toLocaleLowerCase()
  const filteredModules = modules.filter((module) => (scenarioPlatform === 'all' || module.platform === scenarioPlatform) && (!query || [module.id, module.clusterId, module.titleEn, module.titleUk, module.descriptionEn, module.descriptionUk].some((value) => value?.toLocaleLowerCase().includes(query))))
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
    if (legacyPage === '/tasks' || legacyPage === '/connect') window.history.replaceState(null, '', `${legacyPage === '/tasks' ? '/attacks' : '/agents'}${window.location.search}`)
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
    navigationRef.current?.querySelector<HTMLElement>('.nav-link.active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [page, language])

  useEffect(() => {
    if (page !== 'creds') return
    void fetch('/api/creds', { cache: 'no-store' }).then(async (response) => {
      if (response.status === 401) {
        window.location.assign(`/login?lang=${language}`)
        return
      }
      if (!response.ok) throw new Error('account request failed')
      const data = await response.json() as { username: string }
      setAccountName(data.username)
      setUsername(data.username)
    }).catch(() => setCredentialError(t.credsUnavailable))
  }, [page, language, t.credsUnavailable])

  useEffect(() => {
    if (page === 'attacks') { setLogs([]); setLogsState('ready'); return }
    const controller = new AbortController()
    // Logs come from the server for the active tab; the browser only refreshes their view.
    async function loadLogs() {
      try {
        const tab = page === 'agents' && agentView === 'connect' ? 'connect' : page
        const response = await fetch(`/api/logs?tab=${tab}&lang=${language}`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('log request failed')
        const data = await response.json() as { entries: ServerLog[] }
        setLogs(Array.isArray(data.entries) ? data.entries : [])
        setLogsState('ready')
      } catch {
        if (!controller.signal.aborted) setLogsState('error')
      }
    }
    setLogs([])
    setLogsState('loading')
    void loadLogs()
    const timer = window.setInterval(() => { void loadLogs() }, 5000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [page, agentView, language])

  async function loadConnection(check: boolean) {
    if (check) setCheckingPort(true)
    try {
      const response = await fetch(`/api/connection${check ? '?check=1' : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('connection request failed')
      setConnection(await response.json() as ConnectionData)
    } catch {
      setConnection(null)
    } finally {
      if (check) setCheckingPort(false)
    }
  }

  async function disconnectAgent(id: string) {
    setDisconnectingAgentId(id)
    setAgentActionError('')
    try {
      const response = await fetch('/api/agents/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('disconnect failed')
      setConnectedAgents((agents) => agents.filter((agent) => agent.id !== id))
      setConnection((current) => current ? { ...current, agents: current.agents.filter((agent) => agent.id !== id) } : current)
      setSelectedAgentId(null)
    } catch {
      setAgentActionError(t.disconnectError)
    } finally {
      setDisconnectingAgentId(null)
    }
  }

  useEffect(() => {
    if (page !== 'agents' || agentView !== 'connect') return
    void loadConnection(false)
    const timer = window.setInterval(() => { void loadConnection(false) }, 5000)
    return () => window.clearInterval(timer)
  }, [page, agentView])

  useEffect(() => {
    if (page !== 'agents') return
    const controller = new AbortController()
    async function loadAgents() {
      try {
        const response = await fetch('/api/agents', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('agent request failed')
        const data = await response.json() as { agents: Agent[] }
        setConnectedAgents(Array.isArray(data.agents) ? data.agents : [])
        setAgentsState('ready')
      } catch {
        if (!controller.signal.aborted) setAgentsState('error')
      }
    }
    setAgentsState('loading')
    void loadAgents()
    const timer = window.setInterval(() => { void loadAgents() }, 5000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [page])

  useEffect(() => {
    if (page !== 'main' && page !== 'scenarios' && page !== 'attacks') return
    let active = true
    async function refresh() {
      try {
        const [moduleResponse, taskResponse, agentResponse] = await Promise.all([
          fetch('/api/modules', { cache: 'no-store' }), fetch('/api/tasks', { cache: 'no-store' }),
          fetch('/api/agents', { cache: 'no-store' }),
        ])
        if (!moduleResponse.ok || !taskResponse.ok || !agentResponse.ok) throw new Error('request failed')
        const [moduleData, taskData, agentData] = await Promise.all([moduleResponse.json(), taskResponse.json(), agentResponse.json()])
        if (active) {
          setModules(moduleData.modules ?? [])
          setTasks(taskData.tasks ?? [])
          setTaskCounts(taskData.counts ?? null)
          setConnectedAgents(agentData.agents ?? [])
          setDataState('ready')
        }
      } catch { if (active) setDataState('error') }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [page, language])

  const currentTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
  const visibleTaskEvents = eventsTaskId === currentTask?.id ? taskEvents : []
  useEffect(() => {
    if (page !== 'attacks' || !currentTask?.id) { setTaskEvents([]); setEventsTaskId(null); return }
    let active = true
    async function refreshEvents() {
      try {
        const response = await fetch(`/api/task-events?task=${currentTask?.id}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('event request failed')
        const data = await response.json() as { events: TaskEvent[] }
        if (active) { setTaskEvents(Array.isArray(data.events) ? data.events : []); setEventsTaskId(currentTask?.id ?? null) }
      } catch { if (active) setTaskEvents([]) }
    }
    setTaskEvents([])
    setEventsTaskId(null)
    void refreshEvents()
    const timer = window.setInterval(() => { void refreshEvents() }, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [page, currentTask?.id])

  // Keep the run visible while the server completes the first refresh.
  async function launchModule() {
    const selected = filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
    const agent = connectedAgents.find((item) => item.id === launchAgentId)
    if (!selected || !agent || !agentSupports(agent, selected)) return
    const moduleId = selected.id
    setLaunchError('')
    setLaunching(true)
    try {
      const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId, agentId: launchAgentId, verbosity }) })
      if (!response.ok) throw new Error('launch failed')
      const created = await response.json() as { id: number }
      const id = String(created.id)
      setSelectedTaskId(id)
      setTasks((current) => [{ id, agentId: launchAgentId, agentName: connectedAgents.find((agent) => agent.id === launchAgentId)?.name ?? launchAgentId,
        scenario: moduleId, status: 'queued', verbosity, createdAt: new Date().toISOString(), result: {} }, ...current])
      setLaunchOpen(false)
      navigate('attacks')
      void fetch('/api/tasks', { cache: 'no-store' }).then(async (taskResponse) => {
        if (taskResponse.ok) {
          const data = await taskResponse.json()
          setTasks(data.tasks ?? [])
          setTaskCounts(data.counts ?? null)
        }
      }).catch(() => {})
    } catch { setLaunchError(language === 'uk' ? 'Не вдалося запустити модуль.' : 'Could not launch module.') }
    finally { setLaunching(false) }
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedUsername = username.trim()
    if (!trimmedUsername || !currentPassword) return
    if (password.length < 16) {
      setCredentialError(t.passwordLength)
      return
    }
    setSavingCredentials(true)
    setCredentialError('')
    try {
      const response = await fetch('/api/creds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, currentPassword, newPassword: password }),
      })
      if (!response.ok) throw new Error('credential update failed')
      window.location.assign(`/login?lang=${language}`)
    } catch {
      setCredentialError(t.credsInvalid)
      setSavingCredentials(false)
    }
  }

  function renderMain() {
    return (
      <div className="stack overview-stack">
        <div className="overview-heading"><div><span className="eyebrow">{language === 'uk' ? 'РОБОЧИЙ ПРОСТІР' : 'WORKSPACE'}</span><h1>{t.pages.main}</h1></div><button type="button" className="primary-button" onClick={() => navigate('scenarios')}>{language === 'uk' ? 'Запустити симуляцію' : 'Run a simulation'}</button></div>
        <div className="overview-metrics" aria-label={language === 'uk' ? 'Поточний стан' : 'Current state'}>
          <button type="button" onClick={() => navigate('agents')}><span>{language === 'uk' ? 'Агенти онлайн' : 'Agents online'}</span><strong>{dataState === 'ready' ? connectedAgents.length : '—'}</strong></button>
          <button type="button" onClick={() => navigate('scenarios')}><span>{t.pages.scenarios}</span><strong>{dataState === 'ready' ? modules.length : '—'}</strong></button>
          <button type="button" onClick={() => navigate('attacks')}><span>{language === 'uk' ? 'Активні запуски' : 'Active runs'}</span><strong>{dataState === 'ready' ? taskCounts?.active ?? '—' : '—'}</strong></button>
          <button type="button" onClick={() => navigate('attacks')}><span>{language === 'uk' ? 'Завершені запуски' : 'Completed runs'}</span><strong>{dataState === 'ready' ? taskCounts?.completed ?? '—' : '—'}</strong></button>
        </div>
        <Surface title={language === 'uk' ? 'Останні запуски' : 'Recent runs'}>
          {dataState === 'ready' && tasks.length ? tasks.slice(0, 6).map((task) => <button className="overview-run" key={task.id} type="button" onClick={() => { setSelectedTaskId(task.id); navigate('attacks') }}><span><strong>{modules.find((module) => module.id === task.scenario)?.[language === 'uk' ? 'titleUk' : 'titleEn'] ?? task.scenario}</strong><small>{task.agentName} · {new Date(task.createdAt).toLocaleString(language === 'uk' ? 'uk-UA' : 'en-GB')}</small></span><em className={`run-status status-${task.status}`}>{statusLabel(task.status, language)}</em></button>) : <EmptyState title={dataState === 'error' ? (language === 'uk' ? 'Дані недоступні' : 'Data unavailable') : dataState === 'loading' ? (language === 'uk' ? 'Завантаження' : 'Loading') : (language === 'uk' ? 'Запусків ще немає' : 'No runs yet')} text={dataState === 'error' ? (language === 'uk' ? 'Не вдалося отримати дані з сервера.' : 'Could not load data from the server.') : dataState === 'ready' ? (language === 'uk' ? 'Виберіть сценарій та підключеного агента для першої симуляції.' : 'Choose a scenario and connected agent to run the first simulation.') : ''} />}
        </Surface>
      </div>
    )
  }

  function renderCreds() {
    return (
      <div className="stack">
        <Surface title={t.account} meta="01 / 01">
          <div className="record-list" aria-live="polite">
            <div className="record-row">
              <span className="row-index">01</span>
              <strong>{accountName || '—'}</strong>
              <span className="masked-password" aria-label={t.hiddenPassword}>••••••••</span>
            </div>
          </div>
        </Surface>
        <Surface title={t.changeCredentials} meta={t.server}>
          <form className="credential-form account-form" onSubmit={(event) => { void saveCredential(event) }}>
            <div className="field">
              <label htmlFor="username">{t.username}</label>
              <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="current-password">{t.currentPassword}</label>
              <input id="current-password" name="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="new-password">{t.newPassword}</label>
              <input id="new-password" name="new-password" type="password" autoComplete="new-password" minLength={16} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <button className="primary-button" type="submit" disabled={savingCredentials}>{t.saveCredentials} <span aria-hidden="true">↗</span></button>
          </form>
          {credentialError && <p className="form-error" role="alert">{credentialError}</p>}
        </Surface>
      </div>
    )
  }

  function renderAgents() {
    return (
      <div className="stack"><div className="section-tabs" aria-label={t.pages.agents}>
        <button type="button" aria-pressed={agentView === 'list'} className={agentView === 'list' ? 'selected' : ''} onClick={() => setAgentView('list')}>{t.connectedAgents}</button>
        <button type="button" aria-pressed={agentView === 'connect'} className={agentView === 'connect' ? 'selected' : ''} onClick={() => setAgentView('connect')}>{language === 'uk' ? 'Додати агента' : 'Add agent'}</button>
      </div>{agentView === 'connect' ? renderConnect() : <Surface title={t.agentList} meta={agentsState === 'ready' ? String(connectedAgents.length) : '—'}>
        <div className="table-head" aria-hidden="true"><span>{t.agent}</span><span>{t.lastSeen}</span><span>{t.status}</span></div>
        {agentsState === 'error' ? <EmptyState title={t.agentsUnavailable} text={t.agentsUnavailableHint} /> : connectedAgents.length ? (
          <div>
            {connectedAgents.map((agent) => (
              <button className={selectedAgent?.id === agent.id ? 'data-row selected' : 'data-row'} key={agent.id} type="button" aria-pressed={selectedAgent?.id === agent.id} onClick={() => setSelectedAgentId(agent.id)}>
                <strong>{agent.name}</strong><span>{new Date(agent.lastSeen).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB')}</span><em>{t.online}</em>
              </button>
            ))}
          </div>
        ) : <EmptyState title={t.noAgents} text={language === 'uk' ? 'Додайте агента через сусідню вкладку.' : 'Add an agent from the next tab.'} />}
      </Surface>}</div>
    )
  }

  function renderScenarios() {
    const selectedModule = filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
    return (
      <div className="stack scenario-stack">
        <Surface title={t.description} className="description-surface">
          {selectedModule ? <div className="module-description">
            <strong>{language === 'uk' ? selectedModule.titleUk : selectedModule.titleEn}</strong>
            <p>{language === 'uk' ? selectedModule.descriptionUk : selectedModule.descriptionEn}</p>
            {!!selectedModule.requires?.length && <p>{language === 'uk' ? 'Потрібні команди: ' : 'Required commands: '}{selectedModule.requires.join(', ')}. {language === 'uk' ? 'Агент перевірить їх до симуляції.' : 'The agent checks them before the simulation.'}</p>}
            {selectedModule.sourceUrl && <a href={selectedModule.sourceUrl} target="_blank" rel="noreferrer">{selectedModule.sourceLabel ?? 'Source'} ↗</a>}
            {(language === 'uk' ? selectedModule.limitationsUk : selectedModule.limitationsEn) && <p>{language === 'uk' ? selectedModule.limitationsUk : selectedModule.limitationsEn}</p>}
          </div> : <EmptyState title={dataState === 'error' ? (language === 'uk' ? 'Каталог недоступний' : 'Catalog unavailable') : dataState === 'loading' ? (language === 'uk' ? 'Завантаження' : 'Loading') : t.noScenario} text={dataState === 'error' ? (language === 'uk' ? 'Не вдалося отримати сценарії з сервера.' : 'Could not load scenarios from the server.') : dataState === 'ready' ? t.noScenarioHint : ''} />}
        </Surface>
        {selectedModule && <div className="launch-bar">
          <div><span className="section-label">{t.launch}</span><p>{language === 'uk' ? 'Виберіть підключеного агента для цієї ОС' : 'Select a connected agent for this OS'}</p>
            <select value={selectedModule && connectedAgents.some((agent) => agent.id === launchAgentId && agentSupports(agent, selectedModule)) ? launchAgentId : ''} onChange={(event) => setLaunchAgentId(event.target.value)}>
              <option value="">{language === 'uk' ? 'Вибрати агента' : 'Select agent'}</option>
              {selectedModule && connectedAgents.filter((agent) => agentSupports(agent, selectedModule)).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>{launchError && <p className="form-error" role="alert">{launchError}</p>}</div>
          <button className="primary-button" type="button" disabled={!selectedModule || !connectedAgents.some((agent) => agent.id === launchAgentId && agentSupports(agent, selectedModule))} onClick={() => { setLaunchError(''); setLaunchOpen(true) }}>{t.launchButton} <span aria-hidden="true">↗</span></button>
        </div>}
      </div>
    )
  }

  function renderConnect() {
    const command = agentPlatform === 'linux' ? connection?.linuxAgentCommand : connection?.agentCommand
    return (
      <div className="stack">
        <Surface title={t.networkAccess} meta={connection ? `${connection.port}/TCP` : '—'}>
          <div className="network-summary">
            <div><span>{t.port}</span><strong>{connection?.port ?? '—'}</strong></div>
            <div><span>{t.publicHost}</span><strong>{connection?.probe.host || '—'}</strong></div>
            <div><span>{t.portState}</span><strong className={connection?.probe.state === 'open' ? 'state-open' : 'state-warning'}>{t.probeStates[connection?.probe.state as keyof typeof t.probeStates] ?? t.probeStates.unknown}</strong></div>
          </div>
          <div className="network-actions">
            <button className="outline-button" type="button" disabled={checkingPort} onClick={() => { void loadConnection(true) }}>
              {checkingPort ? t.checking : t.checkPort}
            </button>
          </div>
          {connection?.probe.state !== 'open' && (
            <div className="pinggy-block">
              <div><strong>{t.pinggy}</strong><span>{t.tunnelStates[connection?.tunnel.state as keyof typeof t.tunnelStates] ?? t.tunnelStates.waiting} · {t.pinggyHint}</span></div>
              {connection?.tunnel.url && <code className="agent-endpoint-url">{connection.tunnel.url}</code>}
            </div>
          )}
          <div className="pinggy-block">
            <div><strong>{t.agentCommandTitle}</strong><span>{t.agentCommandHint}</span></div>
            <div className="command-platforms" role="group" aria-label={t.agentCommandTitle}>
              <button className={agentPlatform === 'linux' ? 'selected' : ''} type="button" aria-pressed={agentPlatform === 'linux'} onClick={() => { setAgentPlatform('linux'); setCopied(false) }}>{t.linux}</button>
              <button className={agentPlatform === 'windows' ? 'selected' : ''} type="button" aria-pressed={agentPlatform === 'windows'} onClick={() => { setAgentPlatform('windows'); setCopied(false) }}>{t.windows}</button>
            </div>
            <div className="command-row">
              <code>{command || t.waitingForAddress}</code>
              <button type="button" disabled={!command} onClick={() => {
                if (!command || !navigator.clipboard) return
                void navigator.clipboard.writeText(command).then(() => setCopied(true)).catch(() => setCopied(false))
              }}>{copied ? t.copied : t.copy}</button>
            </div>
          </div>
        </Surface>
      </div>
    )
  }

  function renderRuns() {
    if (!tasks.length) {
      const title = dataState === 'error' ? (language === 'uk' ? 'Запуски недоступні' : 'Runs unavailable')
        : dataState === 'loading' ? (language === 'uk' ? 'Завантаження' : 'Loading')
          : (language === 'uk' ? 'Запусків ще немає' : 'No runs yet')
      const text = dataState === 'error' ? (language === 'uk' ? 'Не вдалося отримати запуски з сервера.' : 'Could not load runs from the server.')
        : dataState === 'ready' ? (language === 'uk' ? 'Виберіть сценарій та агента для першої симуляції.' : 'Choose a scenario and agent for the first simulation.') : ''
      return <div className="runs-empty">
        <EmptyState title={title} text={text} />
        {dataState === 'ready' && <button type="button" className="primary-button" onClick={() => navigate('scenarios')}>{language === 'uk' ? 'Відкрити сценарії' : 'Browse scenarios'}</button>}
      </div>
    }
    return <div className="runs-layout">
      <aside className="runs-list" aria-label={language === 'uk' ? 'Список запусків' : 'Runs list'}>
        <div className="runs-list-heading"><h2>{t.pages.attacks}</h2><span>{tasks.length}</span></div>
        {tasks.map((task) => <button type="button" key={task.id} className={currentTask?.id === task.id ? 'run-item selected' : 'run-item'} onClick={() => setSelectedTaskId(task.id)}>
          <span className="run-item-title">{modules.find((module) => module.id === task.scenario)?.[language === 'uk' ? 'titleUk' : 'titleEn'] ?? task.scenario}</span>
          <span className="run-item-meta">#{task.id} · {task.agentName}</span>
          <span className={`run-status status-${task.status}`}>{statusLabel(task.status, language)}</span>
        </button>)}
      </aside>
      <AttackMap language={language} task={currentTask} events={visibleTaskEvents} modules={modules} />
    </div>
  }

  function renderContext() {
    if (page === 'scenarios') {
      const selectedVisibleModule = filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0]
      return (
        <Surface title={t.availableScenarios} meta={dataState === 'ready' ? `${filteredModules.length} / ${modules.length}` : '—'} className="context-surface scenario-list">
          <div className="scenario-filters"><input type="search" value={scenarioQuery} onChange={(event) => setScenarioQuery(event.target.value)} placeholder={language === 'uk' ? 'Пошук UAC або назви' : 'Search UAC or title'} aria-label={language === 'uk' ? 'Пошук сценаріїв' : 'Search scenarios'} /><div className="scenario-platforms" aria-label={language === 'uk' ? 'Операційна система' : 'Operating system'}>{(['all', 'linux', 'windows'] as const).map((platform) => <button key={platform} type="button" className={scenarioPlatform === platform ? 'selected' : ''} aria-pressed={scenarioPlatform === platform} onClick={() => setScenarioPlatform(platform)}>{platform === 'all' ? (language === 'uk' ? 'Усі' : 'All') : platform === 'linux' ? 'Linux' : 'Windows'}</button>)}</div></div>
          {filteredModules.length ? <div className="scenario-rows">{filteredModules.map((module) => <button className={selectedVisibleModule?.id === module.id ? 'data-row selected' : 'data-row'} key={module.id} type="button" onClick={() => setSelectedModuleId(module.id)}><strong>{language === 'uk' ? module.titleUk : module.titleEn}</strong><span>{module.id} · {module.platform}</span></button>)}</div> : <EmptyState title={dataState === 'error' ? (language === 'uk' ? 'Каталог недоступний' : 'Catalog unavailable') : dataState === 'loading' ? (language === 'uk' ? 'Завантаження' : 'Loading') : modules.length ? (language === 'uk' ? 'Нічого не знайдено' : 'No matches') : t.noScenario} text={dataState === 'error' ? (language === 'uk' ? 'Не вдалося отримати список.' : 'Could not load the list.') : dataState === 'ready' && modules.length ? (language === 'uk' ? 'Змініть пошук або фільтр ОС.' : 'Change the search or OS filter.') : dataState === 'ready' ? t.noScenarioHint : ''} />}
        </Surface>
      )
    }

    if (page === 'creds') {
      return (
        <Surface title={t.storage} meta={t.server} className="context-surface">
          <div className="context-note"><span className="note-marker" aria-hidden="true" /><p>{t.storageHint}</p></div>
        </Surface>
      )
    }

    if (page === 'agents') {
      return (
        <Surface title={t.agentDetails} className="context-surface">
          {selectedAgent ? <div className="detail-lines">
            <div className="detail-line"><span>{t.agent}</span><strong>{selectedAgent.name}</strong></div>
            <div className="detail-line"><span>{t.agentId}</span><strong>{selectedAgent.id}</strong></div>
            <div className="detail-line"><span>{t.lastSeen}</span><strong>{new Date(selectedAgent.lastSeen).toLocaleString(language === 'uk' ? 'uk-UA' : 'en-GB')}</strong></div>
            <div className="detail-line"><span>{t.status}</span><strong>{t.online}</strong></div>
            <div className="detail-line"><span>{t.os}</span><strong>{selectedAgent.info?.os || '—'}</strong></div>
            <div className="detail-line"><span>{t.architecture}</span><strong>{selectedAgent.info?.arch || '—'}</strong></div>
            <div className="detail-line"><span>{t.cpuThreads}</span><strong>{selectedAgent.info?.cpu ?? '—'}</strong></div>
            <div className="detail-line"><span>{t.memory}</span><strong>{selectedAgent.info?.memoryMiB != null ? `${selectedAgent.info.memoryMiB} MiB` : '—'}</strong></div>
            <div className="detail-line"><span>{t.uptime}</span><strong>{selectedAgent.info?.uptimeSeconds ?? '—'}</strong></div>
            <button className="outline-button disconnect-agent" type="button" disabled={disconnectingAgentId === selectedAgent.id} onClick={() => { void disconnectAgent(selectedAgent.id) }}>{t.disconnect}</button>
            {agentActionError && <p className="form-error" role="alert">{agentActionError}</p>}
          </div> : <EmptyState title={t.noAgents} text={language === 'uk' ? 'Додайте агента через сусідню вкладку.' : 'Add an agent from the next tab.'} />}
        </Surface>
      )
    }

    return null
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={`/main${window.location.search}`} onClick={(event) => { event.preventDefault(); navigate('main') }}><span className="brand-mark" aria-hidden="true">C</span><span>certua-advisory-lab</span></a>
          <nav className="navigation" ref={navigationRef} aria-label={t.navLabel}>
            {pages.map((item) => (
              <a key={item} href={`/${item}${window.location.search}`} className={page === item ? 'nav-link active' : 'nav-link'} aria-current={page === item ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(item) }}>{t.pages[item]}</a>
            ))}
          </nav>
          <div className="header-tools">
            <div className="language-switch" aria-label="Language / Мова">
              <button type="button" className={language === 'en' ? 'selected' : ''} aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>EN</button>
              <span aria-hidden="true">/</span>
              <button type="button" className={language === 'uk' ? 'selected' : ''} aria-pressed={language === 'uk'} onClick={() => changeLanguage('uk')}>УКР</button>
            </div>
            <button className="logout-button" type="button" onClick={() => {
              void fetch('/api/logout', { method: 'POST' }).finally(() => window.location.assign(`/login?lang=${language}`))
            }}>{t.logout}</button>
          </div>
        </div>
      </header>

      <div className={`workspace workspace-${page}${page === 'agents' && agentView === 'connect' ? ' workspace-connect' : ''}`}>
        <main className={page === 'attacks' ? 'main-pane attack-pane' : 'main-pane'}>
          {page === 'main' && renderMain()}
          {page === 'creds' && renderCreds()}
          {page === 'scenarios' && renderScenarios()}
          {page === 'agents' && renderAgents()}
          {page === 'attacks' && renderRuns()}
        </main>

        {(page === 'scenarios' || page === 'creds' || (page === 'agents' && agentView === 'list')) && <aside className="context-pane" aria-label={t.contextLabel}>{renderContext()}</aside>}
        {page !== 'attacks' && <details className="server-activity"><summary>{language === 'uk' ? 'Активність сервера' : 'Server activity'} <span>{logsState === 'ready' ? logs.length : '—'}</span></summary><div className="server-activity-list" aria-live="polite">{logsState === 'loading' && <p>{t.logsLoading}</p>}{logsState === 'error' && <p>{t.logsError}</p>}{logsState === 'ready' && logs.length === 0 && <p>{t.logsEmpty}</p>}{logsState === 'ready' && logs.map((entry, index) => <div className="server-activity-row" key={`${entry.time}-${index}`}><time>{new Date(entry.time).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB')}</time><span className={entry.level === 'WARN' ? 'activity-warn' : ''}>{entry.level}</span><p>{entry.message}</p></div>)}</div></details>}
      </div>
      {launchOpen && <div className="launch-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setLaunchOpen(false) }}>
        <div className="launch-dialog" role="dialog" aria-modal="true" aria-labelledby="launch-title">
          <div className="launch-dialog-head"><span className="attack-kicker">{language === 'uk' ? 'НОВИЙ ЗАПУСК' : 'NEW RUN'}</span><button type="button" aria-label={language === 'uk' ? 'Закрити' : 'Close'} onClick={() => setLaunchOpen(false)}>×</button></div>
          <h2 id="launch-title">{language === 'uk' ? 'Запустити симуляцію' : 'Start simulation'}</h2>
          <p>{(filteredModules.find((module) => module.id === selectedModuleId) ?? filteredModules[0])?.id} · {connectedAgents.find((agent) => agent.id === launchAgentId)?.name}</p>
          <label htmlFor="launch-verbosity">{language === 'uk' ? 'Деталізація журналу' : 'Log verbosity'}</label>
          <select id="launch-verbosity" value={verbosity} onChange={(event) => setVerbosity(event.target.value as typeof verbosity)}>
            <option value="standard">{language === 'uk' ? 'Стандартна — ключові події' : 'Standard — key events'}</option>
            <option value="detailed">{language === 'uk' ? 'Детальна — етапи агента' : 'Detailed — agent steps'}</option>
            <option value="trace">{language === 'uk' ? 'Трасування — перевірки й етапи' : 'Trace — checks and steps'}</option>
          </select>
          {launchError && <p className="launch-dialog-error" role="alert">{launchError}</p>}
          <div className="launch-dialog-actions"><button type="button" className="outline-button" onClick={() => setLaunchOpen(false)}>{language === 'uk' ? 'Скасувати' : 'Cancel'}</button><button type="button" className="primary-button" disabled={launching} onClick={() => { void launchModule() }}>{launching ? (language === 'uk' ? 'Запуск…' : 'Starting…') : (language === 'uk' ? 'Запустити симуляцію' : 'Run simulation')}</button></div>
        </div>
      </div>}
    </div>
  )
}

export default App
