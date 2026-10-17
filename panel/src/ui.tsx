import type { ReactNode } from 'react'
import type { Page } from './models'

export function NavIcon({ page }: { page: Page }) {
  const icons: Record<Page, ReactNode> = {
    main: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    scenarios: (
      <>
        <path d="M7 3.5h8l3 3V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
        <path d="M15 3.5v4h3M9 12h6M9 16h6" />
      </>
    ),
    attacks: <path d="m8 5 11 7-11 7V5Z" />,
    agents: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M9 21h6M12 17v4" />
      </>
    ),
    creds: (
      <>
        <path d="M10.5 2h3l.5 2.2 1.8.8 2-.9 2.1 2.1-.9 2 .8 1.8L23 10.5v3l-2.2.5-.8 1.8.9 2-2.1 2.1-2-.9-1.8.8-.5 2.2h-3l-.5-2.2-1.8-.8-2 .9-2.1-2.1.9-2-.8-1.8L3 13.5v-3l2.2-.5.8-1.8-.9-2L7.2 4l2 .9 1.8-.8.5-2.1Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  }
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[page]}
    </svg>
  )
}

export function Surface({
  title,
  meta,
  children,
  className = '',
}: {
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

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-line" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}
