import type { Agent, Language, Module, Page } from './models'

export const pages: Page[] = ['main', 'scenarios', 'attacks', 'agents', 'creds']

export function currentPage(): Page {
  const path = window.location.pathname.slice(1).replace(/\/$/, '')
  if (path === 'tasks') return 'attacks'
  if (path === 'connect') return 'agents'
  return pages.find((page) => page === path) ?? 'main'
}

export function currentLanguage(): Language {
  return new URLSearchParams(window.location.search).get('lang') === 'uk' ? 'uk' : 'en'
}

export function agentSupports(agent: Agent, module: Module): boolean {
  const os = agent.info?.os ?? ''
  return module.platform === 'linux' ? os === 'Linux' : os.startsWith('Microsoft Windows')
}

export function statusLabel(status: string, language: Language): string {
  if (language === 'en') return status
  return (
    (
      {
        queued: 'У черзі',
        running: 'Виконується',
        completed: 'Завершено',
        failed: 'Помилка',
      } as Record<string, string>
    )[status] ?? status
  )
}
