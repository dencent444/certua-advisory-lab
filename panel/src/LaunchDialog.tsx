import type { Agent, Language, Module, Verbosity } from './models'

type Props = {
  language: Language
  module: Module | undefined
  agent: Agent | undefined
  verbosity: Verbosity
  error: string
  launching: boolean
  onVerbosityChange: (verbosity: Verbosity) => void
  onClose: () => void
  onLaunch: () => void
}

export default function LaunchDialog({
  language,
  module,
  agent,
  verbosity,
  error,
  launching,
  onVerbosityChange,
  onClose,
  onLaunch,
}: Props) {
  return (
    <div
      className="launch-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="launch-dialog" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <div className="launch-dialog-head">
          <span className="attack-kicker">{language === 'uk' ? 'НОВИЙ ЗАПУСК' : 'NEW RUN'}</span>
          <button
            type="button"
            aria-label={language === 'uk' ? 'Закрити' : 'Close'}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h2 id="launch-title">{language === 'uk' ? 'Запустити симуляцію' : 'Start simulation'}</h2>
        <p>
          {module?.id} · {agent?.name}
        </p>
        <label htmlFor="launch-verbosity">
          {language === 'uk' ? 'Деталізація журналу' : 'Log verbosity'}
        </label>
        <select
          id="launch-verbosity"
          value={verbosity}
          onChange={(event) => onVerbosityChange(event.target.value as Verbosity)}
        >
          <option value="standard">
            {language === 'uk' ? 'Стандартна — ключові події' : 'Standard — key events'}
          </option>
          <option value="detailed">
            {language === 'uk' ? 'Детальна — етапи агента' : 'Detailed — agent steps'}
          </option>
          <option value="trace">
            {language === 'uk' ? 'Трасування — перевірки й етапи' : 'Trace — checks and steps'}
          </option>
        </select>
        {error && (
          <p className="launch-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="launch-dialog-actions">
          <button type="button" className="outline-button" onClick={onClose}>
            {language === 'uk' ? 'Скасувати' : 'Cancel'}
          </button>
          <button type="button" className="primary-button" disabled={launching} onClick={onLaunch}>
            {launching
              ? language === 'uk'
                ? 'Запуск…'
                : 'Starting…'
              : language === 'uk'
                ? 'Запустити симуляцію'
                : 'Run simulation'}
          </button>
        </div>
      </div>
    </div>
  )
}
