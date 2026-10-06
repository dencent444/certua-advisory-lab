import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import AttackMap, { eventLabel, metricLabel, metricValue, type TaskEvent } from './AttackMap'

type Page = 'main' | 'creds' | 'tasks' | 'scenarios' | 'agents' | 'connect' | 'attacks'
type Language = 'en' | 'uk'
type Theme = 'red' | 'green' | 'blue' | 'purple' | 'white'

const themes: { id: Theme; labelEn: string; labelUk: string; color: string }[] = [
  { id: 'red', labelEn: 'Red', labelUk: 'Червоний', color: '#ff3047' },
  { id: 'green', labelEn: 'Green', labelUk: 'Зелений', color: '#00e676' },
  { id: 'blue', labelEn: 'Blue', labelUk: 'Синій', color: '#00a2ff' },
  { id: 'purple', labelEn: 'Purple', labelUk: 'Фіолетовий', color: '#b347ff' },
  { id: 'white', labelEn: 'White', labelUk: 'Білий', color: '#cbd5e1' },
]

function currentTheme(): Theme {
  const saved = localStorage.getItem('certua_theme') as Theme
  return ['red', 'green', 'blue', 'purple', 'white'].includes(saved) ? saved : 'red'
}
type Instance = { id: string; name: string; address: string }
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

const pages: Page[] = ['main', 'creds', 'tasks', 'scenarios', 'agents', 'connect', 'attacks']
const directoryPages: Exclude<Page, 'main'>[] = ['creds', 'tasks', 'scenarios', 'agents', 'connect', 'attacks']

const translations = {
  en: {
    pages: { main: 'Main', creds: 'Creds', tasks: 'Tasks', scenarios: 'Scenarios', agents: 'Agents', connect: 'Connect', attacks: 'Attacks' },
    directory: { creds: 'Credentials', tasks: 'Task list', scenarios: 'Advisories and launch', agents: 'Agent list', connect: 'Test instances', attacks: 'Attack graph' },
    sections: 'Sections', add: 'Add', hiddenPassword: 'Password hidden',
    account: 'Panel account', changeCredentials: 'Change credentials', currentPassword: 'Current password', newPassword: 'New password',
    saveCredentials: 'Save credentials', credsUnavailable: 'Account unavailable', credsInvalid: 'Check the current password and try again.',
    passwordLength: 'New password must contain at least 16 characters.', logout: 'Sign out',
    taskList: 'Task list', task: 'Task', agent: 'Agent', status: 'Status',
    agentList: 'Agent list', lastSeen: 'Last seen',
    description: 'Description', noScenario: 'No scenarios', noScenarioHint: 'Scenarios will appear here after they are added.',
    launch: 'LAUNCH', launchHint: 'Start a scenario on a connected agent.', launchButton: 'Start scenario',
    availableScenarios: 'Available scenarios',
    storage: 'Storage', storageHint: 'One panel account is stored in PostgreSQL. Changing it signs out all sessions.',
    taskDetails: 'Task details', agentDetails: 'Agent details',
    state: 'Status', noTasks: 'No tasks', noTasksHint: 'Tasks will appear here after they are created.',
    noAgents: 'No connected agents', noAgentsHint: 'Run an agent command from Connect to register one.',
    agentsUnavailable: 'Agent list unavailable', agentsUnavailableHint: 'Could not load agents from the server.',
    noTaskSelected: 'No task selected', noAgentSelected: 'No agent selected', online: 'Online', agentId: 'Agent ID',
    os: 'OS', architecture: 'Architecture', cpuThreads: 'CPU threads', memory: 'Memory', uptime: 'Uptime (s)', disconnect: 'Disconnect', disconnectError: 'Could not disconnect the agent.',
    session: 'SERVER PANEL', logsCaption: 'Server response for this section', logsLabel: 'Server log', contextLabel: 'Additional information', navLabel: 'Sections',
    logsLoading: 'Loading server logs', logsEmpty: 'No server logs for this section', logsError: 'Server logs unavailable',
    logs: 'Logs', local: 'LOCAL', server: 'SERVER', username: 'Username', password: 'Password',
    addInstance: 'Add instance', instanceName: 'Instance name', instanceAddress: 'Address', instanceList: 'Test instances',
    noInstances: 'No instances added', noInstancesHint: 'Add a name and address using the form above.',
    connectDetails: 'Connection details', notConnected: 'Not connected', connectHint: 'Instance connection is not available yet.',
    connectAction: 'Connect', networkAccess: 'Agent endpoint', port: 'Agent port', publicHost: 'Public host', portState: 'Port check',
    checkPort: 'Check again', checking: 'Checking…', pinggy: 'Agent HTTPS endpoint', pinggyHint: 'The tunnel accepts agent traffic only.',
    tunnelStates: { waiting: 'Waiting for port check', starting: 'Starting tunnel', active: 'Tunnel active', error: 'Retrying tunnel', not_needed: 'Direct port available' },
    agentCommandTitle: 'Agent command', agentCommandHint: 'Installs a background agent that checks in every 10 seconds.', linux: 'Linux · Bash', windows: 'Windows · PowerShell', waitingForAddress: 'Waiting for server address…',
    copy: 'Copy', copied: 'Copied', connectedAgents: 'Connected agents', noConnectedAgents: 'No connected agents', pullLater: 'Run the agent command above to connect one.',
    probeStates: { unknown: 'Not checked', open: 'Reachable', closed: 'Closed', filtered: 'Filtered', blocked: 'Blocked', unavailable: 'Check unavailable' },
  },
  uk: {
    pages: { main: 'Головна', creds: 'Дані доступу', tasks: 'Завдання', scenarios: 'Сценарії', agents: 'Агенти', connect: 'Підключення', attacks: 'Атаки' },
    directory: { creds: 'Облікові дані', tasks: 'Список завдань', scenarios: 'Публікації та запуск', agents: 'Список агентів', connect: 'Тестові інстанси', attacks: 'Схема атаки' },
    sections: 'Розділи', add: 'Додати', hiddenPassword: 'Пароль приховано',
    account: 'Обліковий запис панелі', changeCredentials: 'Змінити дані входу', currentPassword: 'Поточний пароль', newPassword: 'Новий пароль',
    saveCredentials: 'Зберегти дані', credsUnavailable: 'Запис недоступний', credsInvalid: 'Перевірте поточний пароль і повторіть спробу.',
    passwordLength: 'Новий пароль має містити щонайменше 16 символів.', logout: 'Вийти',
    taskList: 'Список завдань', task: 'Завдання', agent: 'Агент', status: 'Статус',
    agentList: 'Список агентів', lastSeen: 'Останній зв’язок',
    description: 'Опис', noScenario: 'Немає сценаріїв', noScenarioHint: 'Сценарії з’являться тут після додавання.',
    launch: 'ЗАПУСК', launchHint: 'Запустіть сценарій на підключеному агенті.', launchButton: 'Запустити сценарій',
    availableScenarios: 'Доступні сценарії',
    storage: 'Зберігання', storageHint: 'Один обліковий запис панелі зберігається в PostgreSQL. Зміна завершує всі сесії.',
    taskDetails: 'Деталі завдання', agentDetails: 'Деталі агента',
    state: 'Стан', noTasks: 'Немає завдань', noTasksHint: 'Завдання з’являться тут після створення.',
    noAgents: 'Немає підключених агентів', noAgentsHint: 'Запустіть команду агента з розділу «Підключення».',
    agentsUnavailable: 'Список агентів недоступний', agentsUnavailableHint: 'Не вдалося завантажити агентів із сервера.',
    noTaskSelected: 'Завдання не обрано', noAgentSelected: 'Агента не обрано', online: 'У мережі', agentId: 'ID агента',
    os: 'ОС', architecture: 'Архітектура', cpuThreads: 'Потоки CPU', memory: 'Пам’ять', uptime: 'Час роботи (с)', disconnect: 'Відключити', disconnectError: 'Не вдалося відключити агента.',
    session: 'СЕРВЕРНА ПАНЕЛЬ', logsCaption: 'Відповідь сервера для цього розділу', logsLabel: 'Журнал сервера', contextLabel: 'Додаткова інформація', navLabel: 'Розділи',
    logsLoading: 'Завантаження журналу', logsEmpty: 'Для цього розділу немає записів сервера', logsError: 'Журнал сервера недоступний',
    logs: 'Журнал', local: 'ЛОКАЛЬНО', server: 'СЕРВЕР', username: 'Ім’я користувача', password: 'Пароль',
    addInstance: 'Додати інстанс', instanceName: 'Назва інстансу', instanceAddress: 'Адреса', instanceList: 'Тестові інстанси',
    noInstances: 'Інстансів поки немає', noInstancesHint: 'Додайте назву й адресу через форму вище.',
    connectDetails: 'Деталі підключення', notConnected: 'Не підключено', connectHint: 'Підключення інстансів поки недоступне.',
    connectAction: 'Підключити', networkAccess: 'Адреса агентів', port: 'Порт агентів', publicHost: 'Публічна адреса', portState: 'Перевірка порту',
    checkPort: 'Перевірити знову', checking: 'Перевірка…', pinggy: 'HTTPS-адреса агентів', pinggyHint: 'Тунель приймає лише трафік агентів.',
    tunnelStates: { waiting: 'Очікування перевірки порту', starting: 'Запуск тунелю', active: 'Тунель активний', error: 'Повторна спроба', not_needed: 'Прямий порт доступний' },
    agentCommandTitle: 'Команда агента', agentCommandHint: 'Встановлює фоновий агент, який надсилає сигнал кожні 10 секунд.', linux: 'Linux · Bash', windows: 'Windows · PowerShell', waitingForAddress: 'Очікування адреси сервера…',
    copy: 'Копіювати', copied: 'Скопійовано', connectedAgents: 'Підключені агенти', noConnectedAgents: 'Підключених агентів немає', pullLater: 'Запустіть команду агента вище, щоб підключити його.',
    probeStates: { unknown: 'Не перевірено', open: 'Доступний', closed: 'Закритий', filtered: 'Фільтрується', blocked: 'Заблокований', unavailable: 'Перевірка недоступна' },
  },
} as const

function currentPage(): Page {
  const path = window.location.pathname.slice(1).replace(/\/$/, '')
  return pages.find((page) => page === path) ?? 'main'
}

function currentLanguage(): Language {
  return new URLSearchParams(window.location.search).get('lang') === 'uk' ? 'uk' : 'en'
}

function newId(): string {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${bytes} B`
}

function agentSupports(agent: Agent, module: Module): boolean {
  const os = agent.info?.os ?? ''
  return module.platform === 'linux' ? os === 'Linux' : os.startsWith('Microsoft Windows')
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
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('certua_theme', theme)
  }, [theme])
  const [accountName, setAccountName] = useState('')
  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [credentialError, setCredentialError] = useState('')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [instanceName, setInstanceName] = useState('')
  const [instanceAddress, setInstanceAddress] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [launchAgentId, setLaunchAgentId] = useState('')
  const [launchError, setLaunchError] = useState('')
  const [launchOpen, setLaunchOpen] = useState(false)
  const [verbosity, setVerbosity] = useState<'standard' | 'detailed' | 'trace'>('detailed')
  const [launching, setLaunching] = useState(false)
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([])
  const [eventsTaskId, setEventsTaskId] = useState<string | null>(null)

  const selectedAgent = connectedAgents.find((agent) => agent.id === selectedAgentId)
  const t = translations[language]

  function navigate(nextPage: Page) {
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
    const handlePopState = () => {
      setPage(currentPage())
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
    const controller = new AbortController()
    // Logs come from the server for the active tab; the browser only refreshes their view.
    async function loadLogs() {
      try {
        const response = await fetch(`/api/logs?tab=${page}&lang=${language}`, { signal: controller.signal, cache: 'no-store' })
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
  }, [page, language])

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
    if (page !== 'connect') return
    void loadConnection(false)
    const timer = window.setInterval(() => { void loadConnection(false) }, 5000)
    return () => window.clearInterval(timer)
  }, [page])

  useEffect(() => {
    if (page !== 'main' && page !== 'agents') return
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
    if (page !== 'scenarios' && page !== 'tasks' && page !== 'attacks') return
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
          setConnectedAgents(agentData.agents ?? [])
        }
      } catch { if (active) setLaunchError(language === 'uk' ? 'Дані модулів недоступні.' : 'Module data unavailable.') }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [page, language])

  const currentTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
  const visibleTaskEvents = eventsTaskId === currentTask?.id ? taskEvents : []
  useEffect(() => {
    if ((page !== 'tasks' && page !== 'attacks') || !currentTask?.id) { setTaskEvents([]); setEventsTaskId(null); return }
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

  // Open the new task in Attacks immediately, then replace the optimistic row with server data.
  async function launchModule() {
    const selected = modules.find((module) => module.id === selectedModuleId) ?? modules[0]
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
        if (taskResponse.ok) setTasks((await taskResponse.json()).tasks ?? [])
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

  function addInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = instanceName.trim()
    const address = instanceAddress.trim()
    if (!name || !address) return
    const instance = { id: newId(), name, address }
    setInstances((items) => [...items, instance])
    setSelectedInstanceId(instance.id)
    setInstanceName('')
    setInstanceAddress('')
  }

  function renderMain() {
    return (
      <Surface title={t.sections} meta="06 / 06" className="section-directory">
        {directoryPages.map((item, index) => (
          <button className="directory-row" key={item} onClick={() => navigate(item)}>
            <span className="directory-number">0{index + 1}</span>
            <span className="directory-copy">
              <strong>{t.pages[item]}</strong>
              <small>{t.directory[item]}</small>
            </span>
            <span className="directory-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </Surface>
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

  function renderTasks() {
    return (
      <Surface title={t.taskList} meta={String(tasks.length).padStart(2, '0')}>
        <div className="table-head" aria-hidden="true"><span>{t.task}</span><span>{t.agent}</span><span>{t.status}</span></div>
        {tasks.length ? tasks.map((task) => <button className={selectedTaskId === task.id ? 'data-row selected' : 'data-row'} type="button" key={task.id} onClick={() => setSelectedTaskId(task.id)}>
          <strong>{task.scenario} #{task.id}</strong><span>{task.agentName}</span><em>{task.status}</em>
        </button>) : <EmptyState title={t.noTasks} text={t.noTasksHint} />}
      </Surface>
    )
  }

  function renderAgents() {
    return (
      <Surface title={t.agentList} meta={String(connectedAgents.length).padStart(2, '0')}>
        <div className="table-head" aria-hidden="true"><span>{t.agent}</span><span>{t.lastSeen}</span><span>{t.status}</span></div>
        {agentsState === 'error' ? <EmptyState title={t.agentsUnavailable} text={t.agentsUnavailableHint} /> : connectedAgents.length ? (
          <div>
            {connectedAgents.map((agent) => (
              <button className={selectedAgentId === agent.id ? 'data-row selected' : 'data-row'} key={agent.id} type="button" aria-pressed={selectedAgentId === agent.id} onClick={() => setSelectedAgentId(agent.id)}>
                <strong>{agent.name}</strong><span>{new Date(agent.lastSeen).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB')}</span><em>{t.online}</em>
              </button>
            ))}
          </div>
        ) : <EmptyState title={t.noAgents} text={t.noAgentsHint} />}
      </Surface>
    )
  }

  function renderScenarios() {
    const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0]
    return (
      <div className="stack scenario-stack">
        <Surface title={t.description} className="description-surface">
          {selectedModule ? <div className="module-description">
            <strong>{language === 'uk' ? selectedModule.titleUk : selectedModule.titleEn}</strong>
            <p>{language === 'uk' ? selectedModule.descriptionUk : selectedModule.descriptionEn}</p>
            {!!selectedModule.requires?.length && <p>{language === 'uk' ? 'Потрібні команди: ' : 'Required commands: '}{selectedModule.requires.join(', ')}. {language === 'uk' ? 'Агент перевірить їх до симуляції.' : 'The agent checks them before the simulation.'}</p>}
            {selectedModule.sourceUrl && <a href={selectedModule.sourceUrl} target="_blank" rel="noreferrer">{selectedModule.sourceLabel ?? 'Source'} ↗</a>}
            {(language === 'uk' ? selectedModule.limitationsUk : selectedModule.limitationsEn) && <p>{language === 'uk' ? selectedModule.limitationsUk : selectedModule.limitationsEn}</p>}
          </div> : <EmptyState title={t.noScenario} text={t.noScenarioHint} />}
        </Surface>
        <div className="launch-bar">
          <div><span className="section-label">{t.launch}</span><p>{language === 'uk' ? 'Виберіть підключеного агента для цієї ОС' : 'Select a connected agent for this OS'}</p>
            <select value={selectedModule && connectedAgents.some((agent) => agent.id === launchAgentId && agentSupports(agent, selectedModule)) ? launchAgentId : ''} onChange={(event) => setLaunchAgentId(event.target.value)}>
              <option value="">{language === 'uk' ? 'Вибрати агента' : 'Select agent'}</option>
              {selectedModule && connectedAgents.filter((agent) => agentSupports(agent, selectedModule)).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>{launchError && <p className="form-error" role="alert">{launchError}</p>}</div>
          <button className="primary-button" type="button" disabled={!selectedModule || !connectedAgents.some((agent) => agent.id === launchAgentId && agentSupports(agent, selectedModule))} onClick={() => { setLaunchError(''); setLaunchOpen(true) }}>{t.launchButton} <span aria-hidden="true">↗</span></button>
        </div>
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
        <Surface title={t.addInstance} meta={t.local}>
          <form className="credential-form" onSubmit={addInstance}>
            <div className="field">
              <label htmlFor="instance-name">{t.instanceName}</label>
              <input id="instance-name" name="instance-name" autoComplete="off" value={instanceName} onChange={(event) => setInstanceName(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="instance-address">{t.instanceAddress}</label>
              <input id="instance-address" name="instance-address" autoComplete="off" value={instanceAddress} onChange={(event) => setInstanceAddress(event.target.value)} required />
            </div>
            <button className="primary-button" type="submit">{t.add} <span aria-hidden="true">↗</span></button>
          </form>
        </Surface>
        <Surface title={t.instanceList} meta={String(instances.length).padStart(2, '0')}>
          {instances.length ? (
            <div className="instance-list" aria-live="polite">
              {instances.map((instance, index) => (
                <button className={selectedInstanceId === instance.id ? 'instance-row selected' : 'instance-row'} type="button" aria-pressed={selectedInstanceId === instance.id} key={instance.id} onClick={() => setSelectedInstanceId(instance.id)}>
                  <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="instance-copy"><strong>{instance.name}</strong><small>{instance.address}</small></span>
                  <span className="instance-state">{t.notConnected}</span>
                </button>
              ))}
            </div>
          ) : <EmptyState title={t.noInstances} text={t.noInstancesHint} />}
        </Surface>
      </div>
    )
  }

  function renderContext() {
    if (page === 'scenarios') {
      return (
        <Surface title={t.availableScenarios} meta={`${modules.length} · ${new Set(modules.map((module) => module.clusterId ?? module.id.split('-').slice(0, 2).join('-'))).size} UAC`} className="context-surface scenario-list">
          {modules.length ? modules.map((module) => <button className={selectedModuleId === module.id || (!selectedModuleId && module.id === modules[0].id) ? 'data-row selected' : 'data-row'} key={module.id} type="button" onClick={() => setSelectedModuleId(module.id)}><strong>{language === 'uk' ? module.titleUk : module.titleEn}</strong></button>) : <EmptyState title={t.noScenario} text={t.noScenarioHint} />}
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

    if (page === 'connect') {
      return (
        <Surface title={t.connectedAgents} meta={String(connection?.agents.length ?? 0).padStart(2, '0')} className="context-surface">
          {connection?.agents.length ? (
            <div className="agent-list">{connection.agents.map((agent) => <div key={agent.id}>{agent.name}</div>)}</div>
          ) : <EmptyState title={t.noConnectedAgents} text={t.pullLater} />}
        </Surface>
      )
    }

    if (page === 'tasks') {
      const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
      return (
        <Surface title={t.taskDetails} className="context-surface">
          {selectedTask ? <div className="detail-lines">
            <div className="detail-line"><span>{t.task}</span><strong>{selectedTask.scenario} #{selectedTask.id}</strong></div>
            <div className="detail-line"><span>{t.agent}</span><strong>{selectedTask.agentName}</strong></div>
            <div className="detail-line"><span>{t.status}</span><strong>{selectedTask.status}</strong></div>
            {selectedTask.result.evidence?.preflight?.ok === false && <div className="detail-line"><span>{language === 'uk' ? 'Відсутні залежності' : 'Missing dependencies'}</span><strong>{selectedTask.result.evidence.preflight.missing}</strong></div>}
            {modules.find((module) => module.id === selectedTask.scenario)?.flow ? modules.find((module) => module.id === selectedTask.scenario)!.flow!.map((stage) => <div className="detail-line" key={stage.id}><span>{language === 'uk' ? stage.titleUk : stage.titleEn}</span><strong>{selectedTask.result.evidence?.phases?.[stage.id] ? '✓' : '—'}</strong></div>) : <>
              <div className="detail-line"><span>{language === 'uk' ? 'Конфігурація' : 'Config'}</span><strong>{selectedTask.result.evidence?.config ? '✓' : '—'}</strong></div>
              <div className="detail-line"><span>WireGuard</span><strong>{selectedTask.result.evidence?.tunnel ? '✓' : '—'}</strong></div>
              <div className="detail-line"><span>curl</span><strong>{selectedTask.result.evidence?.download ? '✓' : '—'}</strong></div>
              <div className="detail-line"><span>{language === 'uk' ? 'Запуск' : 'Execution'}</span><strong>{selectedTask.result.evidence?.executed ? '✓' : '—'}</strong></div>
            </>}
            {selectedTask.result.evidence?.metrics && Object.entries(selectedTask.result.evidence.metrics).map(([name, value]) => <div className="detail-line" key={name}><span>{metricLabel(name, language)}</span><strong>{metricValue(value, language)}</strong></div>)}
            {selectedTask.result.evidence?.observedAt && <div className="detail-line"><span>{t.lastSeen}</span><strong>{selectedTask.result.evidence.observedAt}</strong></div>}
            {selectedTask.result.evidence?.survey && <>
              <p className="impact-label">{language === 'uk' ? 'Потенційно доступні файли, якщо запуск не було заблоковано' : 'Potentially accessible files if execution was not blocked'}</p>
              <div className="detail-line"><span>{language === 'uk' ? 'Усього' : 'Total'}</span><strong>{selectedTask.result.evidence.survey.files.toLocaleString()} · {formatBytes(selectedTask.result.evidence.survey.bytes)}</strong></div>
              {Object.entries(selectedTask.result.evidence.survey.categories).map(([category, values]) => (
                <div className="detail-line" key={category}><span>{({ credentials: language === 'uk' ? 'Ключі й конфіги' : 'Keys & configs', messengers: language === 'uk' ? 'Месенджери' : 'Messengers', browsers: language === 'uk' ? 'Браузери' : 'Browsers', documents: language === 'uk' ? 'Документи' : 'Documents', source: language === 'uk' ? 'Вихідний код' : 'Source code', other: language === 'uk' ? 'Інше' : 'Other' } as Record<string, string>)[category] ?? category}</span><strong>{values.files.toLocaleString()} · {formatBytes(values.bytes)}</strong></div>
              ))}
              <p className="impact-label">{selectedTask.result.evidence.survey.truncated ? (language === 'uk' ? 'Сканування обмежено часом або кількістю файлів.' : 'Survey limited by time or file count.') : (language === 'uk' ? 'Лише метадані; вміст не передавався.' : 'Metadata only; contents were not transferred.')}</p>
              <p className="impact-label">{language === 'uk' ? 'Завершення завдання не є вердиктом EDR.' : 'Task completion is not an EDR verdict.'}</p>
            </>}
          </div> : <EmptyState title={t.noTaskSelected} text={t.noTasksHint} />}
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
          </div> : <EmptyState title={t.noAgentSelected} text={t.noAgentsHint} />}
        </Surface>
      )
    }

    return (
      <Surface title={t.state} className="context-surface">
        <div className="detail-lines">
          <div className="detail-line"><span>{t.pages.creds}</span><strong>01</strong></div>
          <div className="detail-line"><span>{t.pages.tasks}</span><strong>00</strong></div>
          <div className="detail-line"><span>{t.pages.scenarios}</span><strong>00</strong></div>
          <div className="detail-line"><span>{t.pages.agents}</span><strong>{String(connectedAgents.length).padStart(2, '0')}</strong></div>
          <div className="detail-line"><span>{t.pages.connect}</span><strong>{String(instances.length).padStart(2, '0')}</strong></div>
          <div className="detail-line"><span>{t.pages.attacks}</span><strong>00</strong></div>
        </div>
      </Surface>
    )
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
            <span className="session-label">{t.session}</span>
            <div className="theme-switch" aria-label={language === 'uk' ? 'Колірна тема' : 'Color theme'}>
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`theme-dot ${theme === item.id ? 'active' : ''}`}
                  style={{ '--dot-color': item.color } as React.CSSProperties}
                  title={language === 'uk' ? item.labelUk : item.labelEn}
                  aria-label={language === 'uk' ? item.labelUk : item.labelEn}
                  aria-pressed={theme === item.id}
                  onClick={() => setTheme(item.id)}
                />
              ))}
            </div>
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

      <div className="workspace">
        <aside className="logs-panel" aria-label={t.logsLabel}>
          <div className="logs-heading"><h2>{t.logs}</h2><span>{(page === 'attacks' || page === 'tasks') && currentTask ? `#${currentTask.id}` : t.server}</span></div>
          <div className="logs-list" aria-live="polite">
            {(page === 'attacks' || page === 'tasks') && currentTask ? (
              visibleTaskEvents.length ? [...visibleTaskEvents].reverse().map((entry) => <div className="log-entry" key={entry.id}>
                <div><time>{new Date(entry.time).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span className="log-level">{entry.source}</span></div>
                <span>{eventLabel(entry.code, language, modules)}</span>
              </div>) : <p className="logs-state">{language === 'uk' ? 'Очікування подій завдання.' : 'Waiting for task events.'}</p>
            ) : <>
            {logsState === 'loading' && <p className="logs-state">{t.logsLoading}</p>}
            {logsState === 'error' && <p className="logs-state">{t.logsError}</p>}
            {logsState === 'ready' && logs.length === 0 && <p className="logs-state">{t.logsEmpty}</p>}
            {logsState === 'ready' && logs.map((entry, index) => (
              <div className="log-entry" key={`${entry.time}-${index}`}>
                <div><time>{new Date(entry.time).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</time><span className={entry.level === 'WARN' ? 'log-level warn' : 'log-level'}>{entry.level}</span></div>
                <span>{entry.message}</span>
              </div>
            ))}</>}
          </div>
          <p className="logs-caption">{(page === 'attacks' || page === 'tasks') && currentTask ? (language === 'uk' ? 'Події цього запуску з PostgreSQL.' : 'Events for this run from PostgreSQL.') : t.logsCaption}</p>
        </aside>

        <main className={page === 'attacks' ? 'main-pane attack-pane' : 'main-pane'}>
          {page === 'main' && renderMain()}
          {page === 'creds' && renderCreds()}
          {page === 'tasks' && renderTasks()}
          {page === 'scenarios' && renderScenarios()}
          {page === 'agents' && renderAgents()}
          {page === 'connect' && renderConnect()}
          {page === 'attacks' && <AttackMap language={language} task={currentTask} tasks={tasks} events={visibleTaskEvents} modules={modules} onSelectTask={setSelectedTaskId} />}
        </main>

        {page !== 'attacks' && <aside className="context-pane" aria-label={t.contextLabel}>{renderContext()}</aside>}
      </div>
      {launchOpen && <div className="launch-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setLaunchOpen(false) }}>
        <div className="launch-dialog" role="dialog" aria-modal="true" aria-labelledby="launch-title">
          <div className="launch-dialog-head"><span className="attack-kicker">{language === 'uk' ? 'НОВИЙ ЗАПУСК' : 'NEW RUN'}</span><button type="button" aria-label={language === 'uk' ? 'Закрити' : 'Close'} onClick={() => setLaunchOpen(false)}>×</button></div>
          <h2 id="launch-title">{language === 'uk' ? 'Запустити симуляцію' : 'Start simulation'}</h2>
          <p>{modules.find((module) => module.id === selectedModuleId)?.id ?? modules[0]?.id} · {connectedAgents.find((agent) => agent.id === launchAgentId)?.name}</p>
          <label htmlFor="launch-verbosity">{language === 'uk' ? 'Деталізація журналу' : 'Log verbosity'}</label>
          <select id="launch-verbosity" value={verbosity} onChange={(event) => setVerbosity(event.target.value as typeof verbosity)}>
            <option value="standard">{language === 'uk' ? 'Стандартна — ключові події' : 'Standard — key events'}</option>
            <option value="detailed">{language === 'uk' ? 'Детальна — етапи агента' : 'Detailed — agent steps'}</option>
            <option value="trace">{language === 'uk' ? 'Трасування — перевірки й етапи' : 'Trace — checks and steps'}</option>
          </select>
          {launchError && <p className="launch-dialog-error" role="alert">{launchError}</p>}
          <div className="launch-dialog-actions"><button type="button" className="outline-button" onClick={() => setLaunchOpen(false)}>{language === 'uk' ? 'Скасувати' : 'Cancel'}</button><button type="button" className="primary-button" disabled={launching} onClick={() => { void launchModule() }}>{launching ? (language === 'uk' ? 'Запуск…' : 'Starting…') : (language === 'uk' ? 'Старт атаки →' : 'Start attack →')}</button></div>
        </div>
      </div>}
    </div>
  )
}

export default App
