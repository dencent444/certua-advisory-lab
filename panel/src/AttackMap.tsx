import { useState } from 'react'

type Language = 'en' | 'uk'
export type TaskEvent = { id: string; code: string; source: string; level: string; time: string }
type Survey = { files: number; bytes: number; truncated: boolean; categories?: Record<string, { files: number; bytes: number }> }
type AttackTask = { id: string; agentName: string; scenario: string; status: string; verbosity: string; createdAt: string; result: { evidence?: { tunnel?: boolean; download?: boolean; executed?: boolean; survey?: Survey; phases?: Record<string, boolean>; metrics?: Record<string, string | number | boolean>; preflight?: { ok: boolean; missing: string } } } }
type Module = { id: string; titleEn: string; titleUk: string; sourceUrl?: string; sourceLabel?: string; flow?: { id: string; titleEn: string; titleUk: string; noteEn: string; noteUk: string }[] }

const copy: Record<string, [string, string, string, string]> = {
  queued: ['Queued', 'Saved in PostgreSQL; waiting for the agent.', 'У черзі', 'Збережено в PostgreSQL; очікування агента.'],
  dispatched: ['Dispatched', 'Server sent the signed task to the agent.', 'Видано агенту', 'Сервер передав підписане завдання агенту.'],
  task_verified: ['Task verified', 'Agent checked the task signature.', 'Завдання перевірено', 'Агент перевірив підпис завдання.'],
  key_ready: ['Key ready', 'Agent loaded its local WireGuard key.', 'Ключ готовий', 'Агент завантажив локальний ключ WireGuard.'],
  peer_enrolled: ['Peer enrolled', 'Server registered the agent WireGuard peer.', 'Пір зареєстровано', 'Сервер зареєстрував піра WireGuard.'],
  tunnel_ready: ['Tunnel ready', 'Local proxy can reach the private module endpoint.', 'Тунель готовий', 'Локальний проксі дістається приватної адреси модуля.'],
  module_downloaded: ['Module fetched', 'run.sh downloaded through the tunnel.', 'Модуль завантажено', 'run.sh завантажено через тунель.'],
  hash_verified: ['Hash verified', 'Downloaded run.sh matched the expected SHA-256.', 'Хеш перевірено', 'SHA-256 файлу run.sh збігся з очікуваним.'],
  execution_started: ['Runner started', 'Agent launched the verified module wrapper and dependency check.', 'Обгортку запущено', 'Агент запустив перевірену обгортку модуля та перевірку залежностей.'],
  execution_finished: ['Runner returned', 'The wrapper returned; final report is pending.', 'Обгортка завершилась', 'Обгортка завершилась; очікується підсумковий звіт.'],
  config_prepared: ['Config confirmed', 'Final evidence confirms test config creation.', 'Конфігурацію підтверджено', 'Звіт підтверджує створення тестової конфігурації.'],
  stage_downloaded: ['Second stage fetched', 'Final evidence confirms second-stage download.', 'Другий етап завантажено', 'Звіт підтверджує завантаження другого етапу.'],
  stage_executed: ['Second stage executed', 'Final evidence confirms test payload execution.', 'Другий етап виконано', 'Звіт підтверджує виконання тестового коду.'],
  survey_reported: ['File survey returned', 'Counts and byte volume received; file contents were not sent.', 'Звіт про файли отримано', 'Отримано кількість та обсяг; вміст файлів не надсилався.'],
  completed: ['Completed', 'Server stored the agent result. This is not an EDR verdict.', 'Завершено', 'Сервер зберіг результат агента. Це не вердикт EDR.'],
  failed: ['Failed', 'Inspect the last event to locate the stopped step.', 'Помилка', 'Остання подія вказує, на якому кроці процес зупинився.'],
  module_missing: ['Module unavailable', 'Server could not read the requested module.', 'Модуль недоступний', 'Сервер не зміг прочитати модуль.'],
  signature_failed: ['Signature rejected', 'Agent rejected the task signature.', 'Підпис відхилено', 'Агент відхилив підпис завдання.'],
  peer_enrollment_failed: ['Peer registration failed', 'Agent could not register or verify its WireGuard peer.', 'Не вдалося зареєструвати піра', 'Агент не зміг зареєструвати або перевірити піра WireGuard.'],
  tunnel_failed: ['Tunnel unavailable', 'Local WireGuard proxy did not become ready.', 'Тунель недоступний', 'Локальний проксі WireGuard не запустився.'],
  module_fetch_failed: ['Module fetch failed', 'Agent could not download run.sh through the private endpoint.', 'Не вдалося завантажити модуль', 'Агент не зміг завантажити run.sh з приватної адреси.'],
  hash_mismatch: ['Hash mismatch', 'Downloaded module did not match its expected SHA-256.', 'Хеш не збігся', 'SHA-256 завантаженого модуля не збігся з очікуваним.'],
  execution_failed: ['Execution failed', 'Module returned a nonzero exit status.', 'Помилка виконання', 'Модуль завершився з ненульовим кодом.'],
  dependency_missing: ['Dependency missing', 'Preflight stopped the scenario before its actions ran.', 'Немає залежності', 'Попередня перевірка зупинила сценарій до його дій.'],
}

// Phase events use the module manifest so each UAC chain keeps its own stage names.
export function eventLabel(code: string, language: Language, modules: Module[] = []): string {
  if (code.startsWith('phase_')) {
    const stage = modules.flatMap((module) => module.flow ?? []).find((item) => 'phase_' + item.id === code)
    if (stage) return language === 'uk' ? stage.titleUk : stage.titleEn
  }
  return copy[code]?.[language === 'uk' ? 2 : 0] ?? code
}
function eventDetail(code: string, language: Language, modules: Module[]): string {
  if (code.startsWith('phase_')) {
    const stage = modules.flatMap((module) => module.flow ?? []).find((item) => 'phase_' + item.id === code)
    if (stage) return language === 'uk' ? stage.noteUk : stage.noteEn
  }
  return copy[code]?.[language === 'uk' ? 3 : 1] ?? code
}
const metricNames: Record<string, [string, string]> = {
  machineIdPresent: ['Machine ID present', 'Machine ID наявний'], blobBytes: ['Blob bytes', 'Байтів у блоці'],
  ptrace: ['ptrace', 'ptrace'], os: ['OS', 'ОС'], arch: ['Architecture', 'Архітектура'],
  labRequest: ['Lab request', 'Запит до лабораторії'], phpCli: ['PHP CLI', 'PHP CLI'],
  artifactBytes: ['Artifact bytes', 'Байтів в артефакті'], localResponse: ['Local response', 'Локальна відповідь'],
  routeEntries: ['Route entries', 'Записів маршрутів'], cronInstalled: ['Cron installed', 'Cron встановлено'],
  sshConnections: ['SSH connections', 'SSH-з’єднань'], specimenBytes: ['Specimen bytes', 'Байтів у зразку'],
  servicesQueried: ['Services queried', 'Перевірено служб'], scratchFiles: ['Scratch files', 'Тестових файлів'],
  scratchBytes: ['Scratch bytes', 'Байтів у тестових файлах'], shred: ['shred', 'shred'],
  hostFilesTouched: ['Host files touched', 'Змінено файлів хоста'],
  phpBytes: ['PHP bytes', 'Байтів у PHP'], deniedStatus: ['Denied status', 'Статус відхилення'],
  allowedStatus: ['Allowed status', 'Статус дозволу'], externalRequests: ['External requests', 'Зовнішніх запитів'],
  fixedExchange: ['Fixed exchange', 'Фіксований обмін'], loopbackRequests: ['Loopback requests', 'Локальних запитів'],
  listenerClosed: ['Listener closed', 'Прослуховування закрито'], allowedActions: ['Allowed actions', 'Дозволених дій'],
  existingCrontab: ['Existing crontab', 'Наявний crontab'], cronChanged: ['Crontab changed', 'Crontab змінено'],
  routeLines: ['Route lines', 'Рядків маршрутів'], candidate24s: ['/24 candidates', 'Кандидатів /24'],
  candidateLimit: ['Candidate limit', 'Ліміт кандидатів'], networkProbes: ['Network probes', 'Мережевих запитів'],
  portsChecked: ['Ports checked', 'Перевірено портів'], loopbackOpen: ['Open loopback ports', 'Відкритих локальних портів'],
  authAttempts: ['Auth attempts', 'Спроб входу'], remoteHosts: ['Remote hosts', 'Віддалених хостів'],
  overwrittenBytes: ['Overwritten bytes', 'Перезаписано байтів'], blockDevicesWritten: ['Block devices written', 'Записано блокових пристроїв'],
  removedFiles: ['Removed files', 'Видалено файлів'], wholeDisks: ['Whole disks', 'Цілих дисків'],
  deviceWrites: ['Device writes', 'Записів на пристрої'], servicesStopped: ['Services stopped', 'Зупинено служб'],
  xorKeyBytes: ['XOR key bytes', 'Байтів XOR-ключа'], loopbackDownloads: ['Loopback downloads', 'Завантажень через loopback'],
  installerExitCode: ['Installer exit code', 'Код завершення інсталятора'], ateraInstalled: ['ATERA installed', 'ATERA встановлено'],
  privateKeyUploaded: ['Private key uploaded', 'Приватний ключ передано'],
  opensshServiceChanged: ['OpenSSH service changed', 'Службу OpenSSH змінено'], torStarted: ['Tor started', 'Tor запущено'],
}
export function metricLabel(name: string, language: Language): string { return metricNames[name]?.[language === 'uk' ? 1 : 0] ?? name }
export function metricValue(value: string | number | boolean, language: Language): string {
  if (typeof value === 'boolean') return value ? (language === 'uk' ? 'так' : 'yes') : (language === 'uk' ? 'ні' : 'no')
  if (language === 'uk' && typeof value === 'string') return ({ observed: 'спостережено', blocked: 'заблоковано', unavailable: 'недоступно', ok: 'успішно', failed: 'помилка' } as Record<string, string>)[value] ?? value
  return String(value)
}
function time(value: string, language: Language): string { return new Date(value).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

const genericStages = [
  { id: 'dispatch', en: 'Dispatch', uk: 'Видача', codes: ['dispatched', 'task_verified', 'signature_failed'] },
  { id: 'peer', en: 'Peer', uk: 'Пір', codes: ['key_ready', 'peer_enrolled', 'peer_enrollment_failed'] },
  { id: 'tunnel', en: 'Tunnel', uk: 'Тунель', codes: ['tunnel_ready', 'tunnel_failed'] },
  { id: 'delivery', en: 'Delivery', uk: 'Доставка', codes: ['module_downloaded', 'hash_verified', 'module_fetch_failed', 'hash_mismatch'] },
  { id: 'execution', en: 'Execution', uk: 'Виконання', codes: ['execution_started', 'execution_finished', 'execution_failed', 'config_prepared', 'stage_downloaded', 'stage_executed'] },
  { id: 'exposure', en: 'Exposure', uk: 'Доступні файли', codes: ['survey_reported'] },
  { id: 'result', en: 'Result', uk: 'Підсумок', codes: ['completed', 'failed'] },
]

const uacStages = [
  { id: 'dispatch', en: 'Test task', uk: 'Тестове завдання', codes: ['dispatched', 'task_verified', 'signature_failed'] },
  { id: 'peer', en: 'WG peer', uk: 'WG-пір', codes: ['key_ready', 'peer_enrolled', 'peer_enrollment_failed'] },
  { id: 'tunnel', en: 'VPN link', uk: 'VPN-зв’язок', codes: ['tunnel_ready', 'tunnel_failed'] },
  { id: 'delivery', en: 'curl / VPN', uk: 'curl через VPN', codes: ['module_downloaded', 'hash_verified', 'module_fetch_failed', 'hash_mismatch'] },
  { id: 'execution', en: 'timesyncd-check', uk: 'timesyncd-check', codes: ['execution_started', 'execution_finished', 'execution_failed', 'config_prepared', 'stage_downloaded', 'stage_executed'] },
  { id: 'exposure', en: 'Readable files', uk: 'Доступні файли', codes: ['survey_reported'] },
  { id: 'result', en: 'Lab report', uk: 'Звіт лабораторії', codes: ['completed', 'failed'] },
]

const uacNotes: Record<string, [string, string]> = {
  dispatch: ['The agent receives and verifies a signed lab task. CERT-UA describes a fake technical assignment during recruitment; that social step is context, not an action on this host.', 'Агент отримує й перевіряє підписане лабораторне завдання. CERT-UA описує фальшиве технічне завдання під час найму; цей соціальний етап тут не виконується.'],
  peer: ['The agent registers its WireGuard public key with the lab VPS. This is the lab transport, not the modified SopraVPN client.', 'Агент реєструє публічний ключ WireGuard на лабораторному VPS. Це транспорт лабораторії, а не модифікований клієнт SopraVPN.'],
  tunnel: ['A real WireGuard session reaches the VPS private endpoint. The host routes stay unchanged.', 'Реальний тунель WireGuard з’єднується з приватною адресою VPS. Маршрути хоста не змінюються.'],
  delivery: ['The agent downloads a hash-checked module through the VPN; the module then uses curl to fetch a harmless second stage.', 'Агент завантажує модуль із перевіркою хешу через VPN; модуль потім отримує безпечний другий етап через curl.'],
  execution: ['The module writes an inert sopraconfLinux.conf and runs the test stage from a temporary path ending in usr/libexec/timesyncd-check. No modified SopraVPN binary or AES decryption runs.', 'Модуль створює інертний sopraconfLinux.conf і запускає тестовий етап із тимчасового шляху, що закінчується на usr/libexec/timesyncd-check. Модифікований SopraVPN та AES-розшифрування не запускаються.'],
  exposure: ['The test stage counts readable file metadata. This is a hypothetical impact estimate: CERT-UA did not disclose the Linux follow-on payload.', 'Тестовий етап рахує метадані доступних файлів. Це гіпотетична оцінка впливу: CERT-UA не розкрив Linux-код наступного етапу.'],
  result: ['The server stores task evidence. Completion shows execution of this lab chain, not whether an EDR detected it.', 'Сервер зберігає звіт. Завершення підтверджує виконання лабораторного ланцюга, а не виявлення засобом EDR.'],
}

export default function AttackMap({ language, task, tasks, events, modules, onSelectTask }: { language: Language; task: AttackTask | undefined; tasks: AttackTask[]; events: TaskEvent[]; modules: Module[]; onSelectTask: (id: string) => void }) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const uk = language === 'uk'
  if (!task) return <section className="attack-map"><div className="attack-board-empty"><span className="empty-line" /><strong>{uk ? 'Немає запусків' : 'No runs yet'}</strong><p>{uk ? 'Запустіть сценарій, щоб побачити його етапи.' : 'Start a scenario to see its stages.'}</p></div></section>
  const uac = task.scenario === 'uac-0145-linux'
  const module = modules.find((item) => item.id === task.scenario)
  const stages = module?.flow ? [
    ...genericStages.slice(0, 4),
    ...module.flow.map((stage) => ({ id: stage.id, en: stage.titleEn, uk: stage.titleUk, codes: ['phase_' + stage.id] })),
    genericStages.at(-1)!,
  ] : uac ? uacStages : genericStages
  const evidence = task.result?.evidence
  const codes = new Set(events.map((event) => event.code))
  const baseDone = [codes.has('dispatched') || task.status !== 'queued', codes.has('peer_enrolled') || !!evidence?.tunnel || task.status === 'completed',
    codes.has('tunnel_ready') || !!evidence?.tunnel || task.status === 'completed', codes.has('module_downloaded') || !!evidence?.download || task.status === 'completed',
    codes.has('execution_finished') || !!evidence?.executed, codes.has('survey_reported') || !!evidence?.survey,
    codes.has('completed') || task.status === 'completed']
  const done = module?.flow ? [...baseDone.slice(0, 4), ...module.flow.map((stage) => codes.has('phase_' + stage.id) || !!evidence?.phases?.[stage.id]), baseDone[6]] : baseDone
  const pending = done.findIndex((value) => !value)
  const focused = stages.find((stage) => stage.id === focusedId) ?? stages[pending < 0 ? stages.length - 1 : pending]
  const related = events.filter((event) => focused.codes.includes(event.code))
  const survey = evidence?.survey
  const stateLabel = uk ? ({ queued: 'У черзі', running: 'Виконується', completed: 'Завершено', failed: 'Помилка' } as Record<string, string>)[task.status] : task.status
  const verbosityLabel = uk ? ({ standard: 'стандартна', detailed: 'детальна', trace: 'трасування' } as Record<string, string>)[task.verbosity] : task.verbosity
  return <section className="attack-map" aria-label={uk ? 'Схема атаки' : 'Attack graph'}>
    <div className="attack-topline"><div><span className="attack-kicker">{uk ? 'ПЕРЕБІГ СЦЕНАРІЮ' : 'SCENARIO RUN'}</span><h2>{task.scenario} <span>#{task.id}</span></h2></div>
      <div className="attack-controls"><select aria-label={uk ? 'Вибрати запуск' : 'Select run'} value={task.id} onChange={(event) => { onSelectTask(event.target.value); setFocusedId(null) }}>
        {tasks.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.scenario} · {item.status}</option>)}
      </select><span className={'attack-status status-' + task.status}>{stateLabel}</span></div></div>
    <div className="attack-meta"><span>{task.agentName}</span><span>{uk ? 'Деталізація' : 'Verbosity'}: {verbosityLabel ?? 'standard'}</span><span>{time(task.createdAt, language)}</span></div>
    {uac && <div className="attack-uac-context">
      <div className="attack-uac-heading"><span className="attack-kicker">{uk ? 'КОНТЕКСТ CERT-UA · UAC-0145' : 'CERT-UA CONTEXT · UAC-0145'}</span><a href="https://cert.gov.ua/article/6318863" target="_blank" rel="noreferrer">{uk ? 'Публікація ↗' : 'Advisory ↗'}</a></div>
      <div className="attack-uac-chain"><span>{uk ? 'Фальшивий рекрутер' : 'Fake recruiter'}</span><b aria-hidden="true">→</b><span>{uk ? 'VPN-тест / SopraVPN' : 'VPN test / SopraVPN'}</span><b aria-hidden="true">→</b><span>SymmetricKey / PostUp</span><b aria-hidden="true">→</b><span>curl / timesyncd-check</span></div>
      <p>{uk ? 'Це описана CERT-UA схема. Нижче — фактичні події лабораторного запуску; модифікований клієнт і зашифрований код не виконуються.' : 'This is the chain reported by CERT-UA. Below are actual lab events; the modified client and encrypted code are not executed.'}</p>
    </div>}
    {!uac && module?.flow && <div className="attack-uac-context"><div className="attack-uac-heading"><span className="attack-kicker">{uk ? module.titleUk : module.titleEn}</span>{module.sourceUrl && <a href={module.sourceUrl} target="_blank" rel="noreferrer">{module.sourceLabel ?? 'Source'} ↗</a>}</div><p>{uk ? 'Етапи відображають підтверджені дії лабораторного модуля; це не вердикт EDR.' : 'Stages show confirmed lab-module actions; this is not an EDR verdict.'}</p></div>}
    {evidence?.preflight?.ok === false && <div className="attack-uac-context"><span className="attack-kicker">{uk ? 'ПОПЕРЕДНЯ ПЕРЕВІРКА' : 'PREFLIGHT'}</span><p>{uk ? 'Симуляцію не розпочато. Відсутні команди: ' : 'Simulation did not start. Missing commands: '}{evidence.preflight.missing}</p></div>}
    <div className="attack-flow-scroll"><div className="attack-flow" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(132px, 1fr))`, minWidth: `${Math.max(1000, stages.length * 145)}px` }} role="list" aria-label={uk ? 'Етапи атаки' : 'Attack stages'}>{stages.map((stage, index) => {
      const state = done[index] ? 'done' : task.status === 'completed' ? 'unobserved' : index === pending && task.status === 'failed' ? 'failed' : index === pending && (task.status === 'running' || task.status === 'queued') ? 'active' : 'pending'
      const last = events.filter((event) => stage.codes.includes(event.code)).at(-1)
      return <button type="button" role="listitem" key={stage.id} className={'attack-node node-' + state + (focused.id === stage.id ? ' focused' : '')} aria-pressed={focused.id === stage.id} onClick={() => setFocusedId(stage.id)}>
        <span className="attack-node-number">{String(index + 1).padStart(2, '0')}</span><strong>{uk ? stage.uk : stage.en}</strong>
        <span className="attack-node-state">{state === 'done' ? (uk ? 'ПІДТВЕРДЖЕНО' : 'CONFIRMED') : state === 'active' ? (uk ? 'ВИКОНУЄТЬСЯ' : 'IN PROGRESS') : state === 'failed' ? (uk ? 'ЗУПИНЕНО' : 'STOPPED') : state === 'unobserved' ? (uk ? 'НЕ СПОСТЕРІГАЛОСЬ' : 'NOT OBSERVED') : (uk ? 'ОЧІКУЄ' : 'PENDING')}</span>
        <time>{last ? time(last.time, language) : '—'}</time>
      </button>
    })}</div></div>
    <div className="attack-details"><div className="attack-stage-detail"><span className="attack-kicker">{uk ? 'ВИБРАНИЙ ЕТАП' : 'SELECTED STAGE'}</span><h3>{uk ? focused.uk : focused.en}</h3>
      {uac && <p className="attack-stage-note">{uacNotes[focused.id][uk ? 1 : 0]}</p>}
      {module?.flow?.find((stage) => stage.id === focused.id) && <p className="attack-stage-note">{uk ? module.flow.find((stage) => stage.id === focused.id)!.noteUk : module.flow.find((stage) => stage.id === focused.id)!.noteEn}</p>}
      {related.length ? related.map((event) => <div className="attack-stage-event" key={event.id}><time>{time(event.time, language)}</time><span>{eventLabel(event.code, language, modules)}</span></div>) : <p className="attack-muted">{uk ? 'Подій цього етапу ще немає.' : 'No events for this stage yet.'}</p>}</div>
      <div className="attack-impact"><span className="attack-kicker">{module?.flow ? (uk ? 'СПОСТЕРЕЖЕННЯ' : 'OBSERVATIONS') : (uk ? 'МОЖЛИВИЙ ВПЛИВ' : 'POTENTIAL IMPACT')}</span><h3>{survey ? survey.files.toLocaleString() + (uk ? ' файлів' : ' files') : evidence?.metrics ? Object.keys(evidence.metrics).length + (uk ? ' метрик' : ' metrics') : '—'}</h3>
        <p>{survey ? (survey.bytes / 1024 ** 3).toFixed(1) + ' GiB · ' + (survey.truncated ? (uk ? 'нижня межа' : 'lower bound') : (uk ? 'повний обхід' : 'complete survey')) : evidence?.metrics ? (uk ? 'Дані отримано від агента.' : 'Reported by the agent.') : (uk ? 'Очікування звіту агента.' : 'Waiting for the agent report.')}</p>
        {survey?.categories && <div className="attack-categories">{Object.entries(survey.categories).map(([name, values]) => <div key={name}><span>{name}</span><strong>{values.files.toLocaleString()} · {(values.bytes / 1024 ** 2).toFixed(1)} MiB</strong></div>)}</div>}
        {evidence?.metrics && <div className="attack-categories">{Object.entries(evidence.metrics).map(([name, value]) => <div key={name}><span>{metricLabel(name, language)}</span><strong>{metricValue(value, language)}</strong></div>)}</div>}
        <p>{module?.flow ? (uk ? 'Завершення не є вердиктом EDR.' : 'Completion is not an EDR verdict.') : (uk ? 'Лише метадані. Вміст файлів не передавався. Завершення не є вердиктом EDR.' : 'Metadata only. File contents were not sent. Completion is not an EDR verdict.')}</p></div></div>
    <div className="attack-timeline"><div className="attack-timeline-heading"><h3>{uk ? 'Журнал виконання' : 'Execution log'}</h3><span>{events.length} {uk ? 'подій' : 'events'}</span></div>
      {events.length ? events.map((event) => <div className="attack-timeline-row" key={event.id}><time>{time(event.time, language)}</time><span className={'attack-event-source source-' + event.source}>{uk ? ({ server: 'сервер', agent: 'агент', evidence: 'звіт' } as Record<string, string>)[event.source] ?? event.source : event.source}</span>
        <div><strong>{eventLabel(event.code, language, modules)}</strong><p>{eventDetail(event.code, language, modules)}</p><code>{event.code}</code></div></div>) : <p className="attack-muted attack-no-events">{uk ? 'Очікування подій цього запуску.' : 'Waiting for events for this run.'}</p>}
    </div>
  </section>
}
