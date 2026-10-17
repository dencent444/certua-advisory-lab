import type { AttackRef, Language, Module } from './models'

const copy: Record<string, [string, string, string, string]> = {
  queued: [
    'Queued',
    'Saved in PostgreSQL; waiting for the agent.',
    'У черзі',
    'Збережено в PostgreSQL; очікування агента.',
  ],
  dispatched: [
    'Dispatched',
    'Server sent the signed task to the agent.',
    'Видано агенту',
    'Сервер передав підписане завдання агенту.',
  ],
  task_verified: [
    'Task verified',
    'Agent checked the task signature.',
    'Завдання перевірено',
    'Агент перевірив підпис завдання.',
  ],
  key_ready: [
    'Key ready',
    'Agent loaded its local WireGuard key.',
    'Ключ готовий',
    'Агент завантажив локальний ключ WireGuard.',
  ],
  peer_enrolled: [
    'Peer enrolled',
    'Server registered the agent WireGuard peer.',
    'Пір зареєстровано',
    'Сервер зареєстрував піра WireGuard.',
  ],
  tunnel_ready: [
    'Tunnel ready',
    'Local proxy can reach the private module endpoint.',
    'Тунель готовий',
    'Локальний проксі дістається приватної адреси модуля.',
  ],
  module_downloaded: [
    'Module fetched',
    'run.sh downloaded through the tunnel.',
    'Модуль завантажено',
    'run.sh завантажено через тунель.',
  ],
  hash_verified: [
    'Hash verified',
    'Downloaded run.sh matched the expected SHA-256.',
    'Хеш перевірено',
    'SHA-256 файлу run.sh збігся з очікуваним.',
  ],
  execution_started: [
    'Runner started',
    'Agent launched the verified module wrapper and dependency check.',
    'Обгортку запущено',
    'Агент запустив перевірену обгортку модуля та перевірку залежностей.',
  ],
  execution_finished: [
    'Runner returned',
    'The wrapper returned; final report is pending.',
    'Обгортка завершилась',
    'Обгортка завершилась; очікується підсумковий звіт.',
  ],
  config_prepared: [
    'Config confirmed',
    'Final evidence confirms test config creation.',
    'Конфігурацію підтверджено',
    'Звіт підтверджує створення тестової конфігурації.',
  ],
  stage_downloaded: [
    'Second stage fetched',
    'Final evidence confirms second-stage download.',
    'Другий етап завантажено',
    'Звіт підтверджує завантаження другого етапу.',
  ],
  stage_executed: [
    'Second stage executed',
    'Final evidence confirms test payload execution.',
    'Другий етап виконано',
    'Звіт підтверджує виконання тестового коду.',
  ],
  survey_reported: [
    'File survey returned',
    'Counts and byte volume received; file contents were not sent.',
    'Звіт про файли отримано',
    'Отримано кількість та обсяг; вміст файлів не надсилався.',
  ],
  completed: [
    'Completed',
    'Server stored the agent result. This is not an EDR verdict.',
    'Завершено',
    'Сервер зберіг результат агента. Це не вердикт EDR.',
  ],
  failed: [
    'Failed',
    'Inspect the last event to locate the stopped step.',
    'Помилка',
    'Остання подія вказує, на якому кроці процес зупинився.',
  ],
  module_missing: [
    'Module unavailable',
    'Server could not read the requested module.',
    'Модуль недоступний',
    'Сервер не зміг прочитати модуль.',
  ],
  signature_failed: [
    'Signature rejected',
    'Agent rejected the task signature.',
    'Підпис відхилено',
    'Агент відхилив підпис завдання.',
  ],
  peer_enrollment_failed: [
    'Peer registration failed',
    'Agent could not register or verify its WireGuard peer.',
    'Не вдалося зареєструвати піра',
    'Агент не зміг зареєструвати або перевірити піра WireGuard.',
  ],
  tunnel_failed: [
    'Tunnel unavailable',
    'Local WireGuard proxy did not become ready.',
    'Тунель недоступний',
    'Локальний проксі WireGuard не запустився.',
  ],
  module_fetch_failed: [
    'Module fetch failed',
    'Agent could not download run.sh through the private endpoint.',
    'Не вдалося завантажити модуль',
    'Агент не зміг завантажити run.sh з приватної адреси.',
  ],
  hash_mismatch: [
    'Hash mismatch',
    'Downloaded module did not match its expected SHA-256.',
    'Хеш не збігся',
    'SHA-256 завантаженого модуля не збігся з очікуваним.',
  ],
  execution_failed: [
    'Execution failed',
    'Module returned a nonzero exit status.',
    'Помилка виконання',
    'Модуль завершився з ненульовим кодом.',
  ],
  dependency_missing: [
    'Dependency missing',
    'Preflight stopped the scenario before its actions ran.',
    'Немає залежності',
    'Попередня перевірка зупинила сценарій до його дій.',
  ],
  siem_watching: [
    'SIEM observer started',
    'The companion observer is checking alerts for this host and run window.',
    'SIEM-спостерігач запущений',
    'Окремий спостерігач перевіряє алерти для хоста й часу запуску.',
  ],
  siem_alert: [
    'SIEM alert matched',
    'At least one alert matched the host and run window; inspect the rule below.',
    'Знайдено SIEM-алерт',
    'Принаймні один алерт збігся за хостом і часом; перевірте правило нижче.',
  ],
  siem_no_alert: [
    'No SIEM alert found',
    'The observation window ended after a successful SIEM query.',
    'SIEM-алертів не знайдено',
    'Період спостереження завершився після успішного запиту до SIEM.',
  ],
  siem_error: [
    'SIEM query failed',
    'The observer could not verify the alert state and will retry.',
    'Помилка запиту до SIEM',
    'Спостерігач не зміг перевірити алерти та повторить спробу.',
  ],
}

// Phase events use the module manifest so each UAC chain keeps its own stage names.
export function eventLabel(code: string, language: Language, modules: Module[] = []): string {
  const failed = code.endsWith('_failed')
  const base = failed ? code.slice(0, -7) : code
  if (code.startsWith('phase_')) {
    const stage = modules
      .flatMap((module) => module.flow ?? [])
      .find((item) => 'phase_' + item.id === base)
    if (stage)
      return (
        (language === 'uk' ? stage.titleUk : stage.titleEn) +
        (failed ? (language === 'uk' ? ' · помилка' : ' · failed') : '')
      )
  }
  if (failed && copy[base])
    return copy[base][language === 'uk' ? 2 : 0] + (language === 'uk' ? ' · помилка' : ' · failed')
  return copy[code]?.[language === 'uk' ? 2 : 0] ?? code
}
export function eventDetail(code: string, language: Language, modules: Module[]): string {
  const base = code.endsWith('_failed') ? code.slice(0, -7) : code
  if (code.startsWith('phase_')) {
    const stage = modules
      .flatMap((module) => module.flow ?? [])
      .find((item) => 'phase_' + item.id === base)
    if (stage) return language === 'uk' ? stage.noteUk : stage.noteEn
  }
  return copy[base]?.[language === 'uk' ? 3 : 1] ?? code
}
const metricNames: Record<string, [string, string]> = {
  machineIdPresent: ['Machine ID present', 'Machine ID наявний'],
  blobBytes: ['Blob bytes', 'Байтів у блоці'],
  ptrace: ['ptrace', 'ptrace'],
  os: ['OS', 'ОС'],
  arch: ['Architecture', 'Архітектура'],
  labRequest: ['Lab request', 'Запит до лабораторії'],
  phpCli: ['PHP CLI', 'PHP CLI'],
  artifactBytes: ['Artifact bytes', 'Байтів в артефакті'],
  localResponse: ['Local response', 'Локальна відповідь'],
  routeEntries: ['Route entries', 'Записів маршрутів'],
  cronInstalled: ['Cron installed', 'Cron встановлено'],
  sshConnections: ['SSH connections', 'SSH-з’єднань'],
  specimenBytes: ['Specimen bytes', 'Байтів у зразку'],
  servicesQueried: ['Services queried', 'Перевірено служб'],
  scratchFiles: ['Scratch files', 'Тестових файлів'],
  scratchBytes: ['Scratch bytes', 'Байтів у тестових файлах'],
  shred: ['shred', 'shred'],
  hostFilesTouched: ['Host files touched', 'Змінено файлів хоста'],
  phpBytes: ['PHP bytes', 'Байтів у PHP'],
  deniedStatus: ['Denied status', 'Статус відхилення'],
  allowedStatus: ['Allowed status', 'Статус дозволу'],
  externalRequests: ['External requests', 'Зовнішніх запитів'],
  fixedExchange: ['Fixed exchange', 'Фіксований обмін'],
  loopbackRequests: ['Loopback requests', 'Локальних запитів'],
  listenerClosed: ['Listener closed', 'Прослуховування закрито'],
  allowedActions: ['Allowed actions', 'Дозволених дій'],
  existingCrontab: ['Existing crontab', 'Наявний crontab'],
  cronChanged: ['Crontab changed', 'Crontab змінено'],
  routeLines: ['Route lines', 'Рядків маршрутів'],
  candidate24s: ['/24 candidates', 'Кандидатів /24'],
  candidateLimit: ['Candidate limit', 'Ліміт кандидатів'],
  networkProbes: ['Network probes', 'Мережевих запитів'],
  portsChecked: ['Ports checked', 'Перевірено портів'],
  loopbackOpen: ['Open loopback ports', 'Відкритих локальних портів'],
  authAttempts: ['Auth attempts', 'Спроб входу'],
  remoteHosts: ['Remote hosts', 'Віддалених хостів'],
  overwrittenBytes: ['Overwritten bytes', 'Перезаписано байтів'],
  blockDevicesWritten: ['Block devices written', 'Записано блокових пристроїв'],
  removedFiles: ['Removed files', 'Видалено файлів'],
  wholeDisks: ['Whole disks', 'Цілих дисків'],
  deviceWrites: ['Device writes', 'Записів на пристрої'],
  servicesStopped: ['Services stopped', 'Зупинено служб'],
  xorKeyBytes: ['XOR key bytes', 'Байтів XOR-ключа'],
  loopbackDownloads: ['Loopback downloads', 'Завантажень через loopback'],
  installerExitCode: ['Installer exit code', 'Код завершення інсталятора'],
  ateraInstalled: ['ATERA installed', 'ATERA встановлено'],
  privateKeyUploaded: ['Private key uploaded', 'Приватний ключ передано'],
  opensshServiceChanged: ['OpenSSH service changed', 'Службу OpenSSH змінено'],
  torStarted: ['Tor started', 'Tor запущено'],
}
export function metricLabel(name: string, language: Language): string {
  return metricNames[name]?.[language === 'uk' ? 1 : 0] ?? name
}
export function metricValue(value: string | number | boolean, language: Language): string {
  if (typeof value === 'boolean')
    return value ? (language === 'uk' ? 'так' : 'yes') : language === 'uk' ? 'ні' : 'no'
  if (language === 'uk' && typeof value === 'string')
    return (
      (
        {
          observed: 'спостережено',
          blocked: 'заблоковано',
          unavailable: 'недоступно',
          ok: 'успішно',
          failed: 'помилка',
        } as Record<string, string>
      )[value] ?? value
    )
  return String(value)
}
export function time(value: string, language: Language, precise = false): string {
  return new Date(value).toLocaleTimeString(language === 'uk' ? 'uk-UA' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...(precise ? { fractionalSecondDigits: 3 as const } : {}),
  })
}
export function interval(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

export const genericStages = [
  {
    id: 'dispatch',
    en: 'Dispatch',
    uk: 'Видача',
    codes: ['dispatched', 'task_verified', 'signature_failed'],
  },
  {
    id: 'peer',
    en: 'Peer',
    uk: 'Пір',
    codes: ['key_ready', 'peer_enrolled', 'peer_enrollment_failed'],
  },
  { id: 'tunnel', en: 'Tunnel', uk: 'Тунель', codes: ['tunnel_ready', 'tunnel_failed'] },
  {
    id: 'delivery',
    en: 'Delivery',
    uk: 'Доставка',
    codes: ['module_downloaded', 'hash_verified', 'module_fetch_failed', 'hash_mismatch'],
  },
  {
    id: 'execution',
    en: 'Execution',
    uk: 'Виконання',
    codes: [
      'execution_started',
      'execution_finished',
      'execution_failed',
      'config_prepared',
      'stage_downloaded',
      'stage_executed',
    ],
  },
  { id: 'exposure', en: 'Exposure', uk: 'Доступні файли', codes: ['survey_reported'] },
  { id: 'result', en: 'Result', uk: 'Підсумок', codes: ['completed', 'failed'] },
]

export const uacStages = [
  {
    id: 'dispatch',
    en: 'Test task',
    uk: 'Тестове завдання',
    codes: ['dispatched', 'task_verified', 'signature_failed'],
  },
  {
    id: 'peer',
    en: 'WG peer',
    uk: 'WG-пір',
    codes: ['key_ready', 'peer_enrolled', 'peer_enrollment_failed'],
  },
  { id: 'tunnel', en: 'VPN link', uk: 'VPN-зв’язок', codes: ['tunnel_ready', 'tunnel_failed'] },
  {
    id: 'delivery',
    en: 'curl / VPN',
    uk: 'curl через VPN',
    codes: ['module_downloaded', 'hash_verified', 'module_fetch_failed', 'hash_mismatch'],
  },
  {
    id: 'execution',
    en: 'timesyncd-check',
    uk: 'timesyncd-check',
    codes: [
      'execution_started',
      'execution_finished',
      'execution_failed',
      'config_prepared',
      'stage_downloaded',
      'stage_executed',
    ],
  },
  { id: 'exposure', en: 'Readable files', uk: 'Доступні файли', codes: ['survey_reported'] },
  { id: 'result', en: 'Lab report', uk: 'Звіт лабораторії', codes: ['completed', 'failed'] },
]

export const uacAttack: Record<string, AttackRef> = {
  delivery: { id: 'T1105', mode: 'context' },
  execution: { id: 'T1059.004', mode: 'emulated' },
  exposure: { id: 'T1005', mode: 'context' },
}

export function attackUrl(id: string): string {
  return `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`
}

export const uacNotes: Record<string, [string, string]> = {
  dispatch: [
    'The agent receives and verifies a signed lab task. CERT-UA describes a fake technical assignment during recruitment; that social step is context, not an action on this host.',
    'Агент отримує й перевіряє підписане лабораторне завдання. CERT-UA описує фальшиве технічне завдання під час найму; цей соціальний етап тут не виконується.',
  ],
  peer: [
    'The agent registers its WireGuard public key with the lab VPS. This is the lab transport, not the modified SopraVPN client.',
    'Агент реєструє публічний ключ WireGuard на лабораторному VPS. Це транспорт лабораторії, а не модифікований клієнт SopraVPN.',
  ],
  tunnel: [
    'A real WireGuard session reaches the VPS private endpoint. The host routes stay unchanged.',
    'Реальний тунель WireGuard з’єднується з приватною адресою VPS. Маршрути хоста не змінюються.',
  ],
  delivery: [
    'The agent downloads a hash-checked module through the VPN; the module then uses curl to fetch a harmless second stage.',
    'Агент завантажує модуль із перевіркою хешу через VPN; модуль потім отримує безпечний другий етап через curl.',
  ],
  execution: [
    'The module writes an inert sopraconfLinux.conf and runs the test stage from a temporary path ending in usr/libexec/timesyncd-check. No modified SopraVPN binary or AES decryption runs.',
    'Модуль створює інертний sopraconfLinux.conf і запускає тестовий етап із тимчасового шляху, що закінчується на usr/libexec/timesyncd-check. Модифікований SopraVPN та AES-розшифрування не запускаються.',
  ],
  exposure: [
    'The test stage counts readable file metadata. This is a hypothetical impact estimate: CERT-UA did not disclose the Linux follow-on payload.',
    'Тестовий етап рахує метадані доступних файлів. Це гіпотетична оцінка впливу: CERT-UA не розкрив Linux-код наступного етапу.',
  ],
  result: [
    'The server stores task evidence. Completion shows execution of this lab chain, not whether an EDR detected it.',
    'Сервер зберігає звіт. Завершення підтверджує виконання лабораторного ланцюга, а не виявлення засобом EDR.',
  ],
}
