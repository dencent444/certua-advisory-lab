import { useEffect, useRef } from 'react'
import type { Language, Page } from './models'
import { pages } from './navigation'
import { translations } from './translations'
import { NavIcon } from './ui'

type Props = {
  page: Page
  language: Language
  onNavigate: (page: Page) => void
  onChangeLanguage: (language: Language) => void
}

export default function Header({ page, language, onNavigate, onChangeLanguage }: Props) {
  const navigationRef = useRef<HTMLElement>(null)
  const t = translations[language]

  useEffect(() => {
    navigationRef.current
      ?.querySelector<HTMLElement>('.nav-link.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [page, language])

  function signOut() {
    void fetch('/api/logout', { method: 'POST' }).finally(() =>
      window.location.assign(`/login?lang=${language}`),
    )
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          className="brand"
          href={`/main${window.location.search}`}
          onClick={(event) => {
            event.preventDefault()
            onNavigate('main')
          }}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            <strong>CERT-UA</strong>
            <small>ADVISORY LAB</small>
          </span>
        </a>
        <nav className="navigation" ref={navigationRef} aria-label={t.navLabel}>
          {pages.map((item) => (
            <a
              key={item}
              href={`/${item}${window.location.search}`}
              className={page === item ? 'nav-link active' : 'nav-link'}
              aria-current={page === item ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault()
                onNavigate(item)
              }}
            >
              <NavIcon page={item} />
              <span>{t.pages[item]}</span>
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <div className="language-switch" aria-label="Language / Мова">
            <button
              type="button"
              className={language === 'en' ? 'selected' : ''}
              aria-pressed={language === 'en'}
              onClick={() => onChangeLanguage('en')}
            >
              EN
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              className={language === 'uk' ? 'selected' : ''}
              aria-pressed={language === 'uk'}
              onClick={() => onChangeLanguage('uk')}
            >
              УКР
            </button>
          </div>
          <button className="logout-button" type="button" onClick={signOut}>
            {t.logout}
          </button>
        </div>
      </div>
    </header>
  )
}
