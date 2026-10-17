export type Page = 'main' | 'creds' | 'scenarios' | 'agents' | 'attacks'
export type Language = 'en' | 'uk'
export type Verbosity = 'standard' | 'detailed' | 'trace'
export type LoadState = 'loading' | 'ready' | 'error'
export type ScenarioPlatform = 'all' | 'linux' | 'windows'
export type AgentView = 'list' | 'connect'
export type AttackRef = { id: string; mode: 'emulated' | 'context' }

export type TaskEvent = {
  id: string
  code: string
  source: string
  level: string
  time: string
  receivedAt?: string
  measured?: boolean
  durationMs?: number | null
  delayMs?: number | null
}

export type Agent = {
  id: string
  name: string
  siemHost?: string
  lastSeen: string
  info: {
    os?: string
    arch?: string
    cpu?: number
    memoryMiB?: number
    uptimeSeconds?: number
  }
}

export type ServerLog = { time: string; level: string; message: string }

export type Module = {
  id: string
  clusterId?: string
  platform: string
  titleEn: string
  titleUk: string
  descriptionEn: string
  descriptionUk: string
  sourceUrl?: string
  sourceLabel?: string
  limitationsEn?: string
  limitationsUk?: string
  requires?: string[]
  flow?: {
    id: string
    titleEn: string
    titleUk: string
    noteEn: string
    noteUk: string
    attack?: AttackRef | null
  }[]
}

export type Survey = {
  files: number
  bytes: number
  truncated: boolean
  categories: Record<string, { files: number; bytes: number }>
}

export type Task = {
  id: string
  agentId: string
  agentName: string
  scenario: string
  status: string
  verbosity: Verbosity
  createdAt: string
  siem?: {
    state: string
    host: string
    checkedAt: string
    error: string
    graceSeconds: number
    alerts: { id: string; time: string; rule: string; severity: string; host: string }[]
  }
  result: {
    ok?: boolean
    error?: string
    evidence?: {
      config?: boolean
      tunnel?: boolean
      download?: boolean
      executed?: boolean
      stageSha256?: string
      observedAt?: string
      survey?: Survey
      phases?: Record<string, boolean>
      metrics?: Record<string, string | number | boolean>
      preflight?: { ok: boolean; missing: string }
    }
  }
}

export type ConnectionData = {
  port: number
  probe: { state: string; host: string; checkedAt: string; source: string }
  tunnel: { state: string; url: string }
  agentCommand: string
  linuxAgentCommand: string
  agents: Agent[]
  agentPullReady: boolean
}
