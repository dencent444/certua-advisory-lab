import { useState } from 'react'
import SiemPanel from './SiemPanel'
import {
  attackUrl,
  eventDetail,
  eventLabel,
  genericStages,
  interval,
  metricLabel,
  metricValue,
  time,
  uacAttack,
  uacNotes,
  uacStages,
} from './attackMapData'
import type { AttackRef, Language, Module, Task, TaskEvent } from './models'

export default function AttackMap({
  language,
  task,
  events,
  modules,
}: {
  language: Language
  task: Task | undefined
  events: TaskEvent[]
  modules: Module[]
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const uk = language === 'uk'
  if (!task)
    return (
      <section className="attack-map">
        <div className="attack-board-empty">
          <span className="empty-line" />
          <strong>{uk ? 'Немає запусків' : 'No runs yet'}</strong>
          <p>
            {uk
              ? 'Запустіть сценарій, щоб побачити його етапи.'
              : 'Start a scenario to see its stages.'}
          </p>
        </div>
      </section>
    )
  const uac = task.scenario === 'uac-0145-linux'
  const module = modules.find((item) => item.id === task.scenario)
  const stages = module?.flow
    ? [
        ...genericStages
          .slice(0, 4)
          .map((stage) => ({ ...stage, attack: null as AttackRef | null })),
        ...module.flow.map((stage) => ({
          id: stage.id,
          en: stage.titleEn,
          uk: stage.titleUk,
          codes: ['phase_' + stage.id],
          attack: stage.attack ?? null,
        })),
        { ...genericStages.at(-1)!, attack: null },
      ]
    : uac
      ? uacStages.map((stage) => ({ ...stage, attack: uacAttack[stage.id] ?? null }))
      : genericStages.map((stage) => ({ ...stage, attack: null as AttackRef | null }))
  const evidence = task.result?.evidence
  const codes = new Set(events.map((event) => event.code))
  const baseDone = [
    codes.has('dispatched') || task.status !== 'queued',
    codes.has('peer_enrolled') || !!evidence?.tunnel || task.status === 'completed',
    codes.has('tunnel_ready') || !!evidence?.tunnel || task.status === 'completed',
    codes.has('module_downloaded') || !!evidence?.download || task.status === 'completed',
    codes.has('execution_finished') || !!evidence?.executed,
    codes.has('survey_reported') || !!evidence?.survey,
    codes.has('completed') || task.status === 'completed',
  ]
  const done = module?.flow
    ? [
        ...baseDone.slice(0, 4),
        ...module.flow.map(
          (stage) => codes.has('phase_' + stage.id) || !!evidence?.phases?.[stage.id],
        ),
        baseDone[6],
      ]
    : baseDone
  const pending = done.findIndex((value) => !value)
  const focused =
    stages.find((stage) => stage.id === focusedId) ??
    stages[pending < 0 ? stages.length - 1 : pending]
  const related = events.filter((event) =>
    focused.codes.some((code) => event.code === code || event.code === code + '_failed'),
  )
  const survey = evidence?.survey
  const stateLabel = uk
    ? (
        {
          queued: 'У черзі',
          running: 'Виконується',
          completed: 'Завершено',
          failed: 'Помилка',
        } as Record<string, string>
      )[task.status]
    : task.status
  const verbosityLabel = uk
    ? (
        { standard: 'стандартна', detailed: 'детальна', trace: 'трасування' } as Record<
          string,
          string
        >
      )[task.verbosity]
    : task.verbosity
  return (
    <section className="attack-map" aria-label={uk ? 'Схема атаки' : 'Attack graph'}>
      <div className="attack-topline">
        <div>
          <span className="attack-kicker">{uk ? 'ПЕРЕБІГ СЦЕНАРІЮ' : 'SCENARIO RUN'}</span>
          <h2>
            {module ? (uk ? module.titleUk : module.titleEn) : task.scenario}{' '}
            <span>#{task.id}</span>
          </h2>
        </div>
        <div className="attack-controls">
          <span className={'attack-status status-' + task.status}>{stateLabel}</span>
        </div>
      </div>
      <div className="attack-meta">
        <span>{task.agentName}</span>
        <span>
          {uk ? 'Деталізація' : 'Verbosity'}: {verbosityLabel ?? 'standard'}
        </span>
        <span>{time(task.createdAt, language)}</span>
      </div>
      <SiemPanel language={language} task={task} module={module} />
      {uac && (
        <div className="attack-uac-context">
          <div className="attack-uac-heading">
            <span className="attack-kicker">
              {uk ? 'КОНТЕКСТ CERT-UA · UAC-0145' : 'CERT-UA CONTEXT · UAC-0145'}
            </span>
            <a href="https://cert.gov.ua/article/6318863" target="_blank" rel="noreferrer">
              {uk ? 'Публікація ↗' : 'Advisory ↗'}
            </a>
          </div>
          <div className="attack-uac-chain">
            <span>
              {uk ? 'Фальшивий рекрутер' : 'Fake recruiter'}
              <a href={attackUrl('T1684.001')} target="_blank" rel="noreferrer">
                ATT&CK T1684.001 ↗
              </a>
            </span>
            <b aria-hidden="true">→</b>
            <span>
              {uk ? 'VPN-тест / SopraVPN' : 'VPN test / SopraVPN'}
              <a href={attackUrl('T1204.002')} target="_blank" rel="noreferrer">
                ATT&CK T1204.002 ↗
              </a>
            </span>
            <b aria-hidden="true">→</b>
            <span>
              SymmetricKey / PostUp
              <a href={attackUrl('T1059.004')} target="_blank" rel="noreferrer">
                ATT&CK T1059.004 ↗
              </a>
            </span>
            <b aria-hidden="true">→</b>
            <span>
              curl / timesyncd-check
              <a href={attackUrl('T1105')} target="_blank" rel="noreferrer">
                ATT&CK T1105 ↗
              </a>
            </span>
          </div>
          <p>
            {uk
              ? 'Це описана CERT-UA схема. Нижче — фактичні події лабораторного запуску; модифікований клієнт і зашифрований код не виконуються.'
              : 'This is the chain reported by CERT-UA. Below are actual lab events; the modified client and encrypted code are not executed.'}
          </p>
        </div>
      )}
      {!uac && module?.flow && (
        <div className="attack-uac-context">
          <div className="attack-uac-heading">
            <span className="attack-kicker">{uk ? module.titleUk : module.titleEn}</span>
            {module.sourceUrl && (
              <a href={module.sourceUrl} target="_blank" rel="noreferrer">
                {module.sourceLabel ?? 'Source'} ↗
              </a>
            )}
          </div>
          <p>
            {uk
              ? 'Етапи відображають підтверджені дії лабораторного модуля; це не вердикт EDR.'
              : 'Stages show confirmed lab-module actions; this is not an EDR verdict.'}
          </p>
        </div>
      )}
      {evidence?.preflight?.ok === false && (
        <div className="attack-uac-context">
          <span className="attack-kicker">{uk ? 'ПОПЕРЕДНЯ ПЕРЕВІРКА' : 'PREFLIGHT'}</span>
          <p>
            {uk
              ? 'Симуляцію не розпочато. Відсутні команди: '
              : 'Simulation did not start. Missing commands: '}
            {evidence.preflight.missing}
          </p>
        </div>
      )}
      <div className="flow-scroll-hint">{uk ? 'Прокрутіть етапи →' : 'Scroll stages →'}</div>
      <div className="attack-flow-scroll">
        <div
          className="attack-flow"
          style={{
            gridTemplateColumns: `repeat(${stages.length}, minmax(132px, 1fr))`,
            minWidth: `${Math.max(1000, stages.length * 145)}px`,
          }}
          role="list"
          aria-label={uk ? 'Етапи атаки' : 'Attack stages'}
        >
          {stages.map((stage, index) => {
            const failed = stage.codes.some((code) => codes.has(code + '_failed'))
            const state = failed
              ? 'failed'
              : done[index]
                ? 'done'
                : task.status === 'completed'
                  ? 'unobserved'
                  : index === pending && task.status === 'failed'
                    ? 'failed'
                    : index === pending && (task.status === 'running' || task.status === 'queued')
                      ? 'active'
                      : 'pending'
            const last = events
              .filter((event) =>
                stage.codes.some((code) => event.code === code || event.code === code + '_failed'),
              )
              .at(-1)
            return (
              <button
                type="button"
                role="listitem"
                key={stage.id}
                className={
                  'attack-node node-' + state + (focused.id === stage.id ? ' focused' : '')
                }
                aria-pressed={focused.id === stage.id}
                onClick={() => setFocusedId(stage.id)}
              >
                <span className="attack-node-number">{String(index + 1).padStart(2, '0')}</span>
                <strong>{uk ? stage.uk : stage.en}</strong>
                <span
                  className={
                    'attack-technique ' +
                    (stage.attack?.mode === 'context'
                      ? 'is-context'
                      : stage.attack
                        ? 'is-emulated'
                        : 'is-lab')
                  }
                >
                  {stage.attack ? `ATT&CK ${stage.attack.id}` : 'LAB'}
                </span>
                <span className="attack-node-state">
                  {state === 'done'
                    ? uk
                      ? 'ПІДТВЕРДЖЕНО'
                      : 'CONFIRMED'
                    : state === 'active'
                      ? uk
                        ? 'ВИКОНУЄТЬСЯ'
                        : 'IN PROGRESS'
                      : state === 'failed'
                        ? uk
                          ? 'ЗУПИНЕНО'
                          : 'STOPPED'
                        : state === 'unobserved'
                          ? uk
                            ? 'НЕ СПОСТЕРІГАЛОСЬ'
                            : 'NOT OBSERVED'
                          : uk
                            ? 'ОЧІКУЄ'
                            : 'PENDING'}
                </span>
                <time>{last ? time(last.time, language, last.measured) : '—'}</time>
              </button>
            )
          })}
        </div>
      </div>
      <div className="attack-details">
        <div className="attack-stage-detail">
          <span className="attack-kicker">{uk ? 'ВИБРАНИЙ ЕТАП' : 'SELECTED STAGE'}</span>
          <h3>{uk ? focused.uk : focused.en}</h3>
          <div className="attack-technique-detail">
            {focused.attack ? (
              <>
                <a href={attackUrl(focused.attack.id)} target="_blank" rel="noreferrer">
                  MITRE ATT&CK {focused.attack.id} ↗
                </a>
                <span>
                  {focused.attack.mode === 'context'
                    ? uk
                      ? 'Контекст: техніку не виконано повністю'
                      : 'Context: technique not fully executed'
                    : uk
                      ? 'Імітовано безпечною дією'
                      : 'Emulated with a bounded action'}
                </span>
              </>
            ) : (
              <span>
                {uk ? 'Крок лабораторії · без відповідника ATT&CK' : 'Lab step · no ATT&CK mapping'}
              </span>
            )}
          </div>
          {uac && <p className="attack-stage-note">{uacNotes[focused.id][uk ? 1 : 0]}</p>}
          {module?.flow?.find((stage) => stage.id === focused.id) && (
            <p className="attack-stage-note">
              {uk
                ? module.flow.find((stage) => stage.id === focused.id)!.noteUk
                : module.flow.find((stage) => stage.id === focused.id)!.noteEn}
            </p>
          )}
          {related.length ? (
            related.map((event) => (
              <div className="attack-stage-event" key={event.id}>
                <time>{time(event.time, language, event.measured)}</time>
                <span>
                  {eventLabel(event.code, language, modules)}
                  {event.delayMs != null &&
                    ` · ${uk ? 'пауза' : 'pause'} ${interval(event.delayMs)}`}
                </span>
              </div>
            ))
          ) : (
            <p className="attack-muted">
              {uk ? 'Подій цього етапу ще немає.' : 'No events for this stage yet.'}
            </p>
          )}
        </div>
        <div className="attack-impact">
          <span className="attack-kicker">
            {module?.flow
              ? uk
                ? 'СПОСТЕРЕЖЕННЯ'
                : 'OBSERVATIONS'
              : uk
                ? 'МОЖЛИВИЙ ВПЛИВ'
                : 'POTENTIAL IMPACT'}
          </span>
          <h3>
            {survey
              ? survey.files.toLocaleString() + (uk ? ' файлів' : ' files')
              : evidence?.metrics
                ? Object.keys(evidence.metrics).length + (uk ? ' метрик' : ' metrics')
                : '—'}
          </h3>
          <p>
            {survey
              ? (survey.bytes / 1024 ** 3).toFixed(1) +
                ' GiB · ' +
                (survey.truncated
                  ? uk
                    ? 'нижня межа'
                    : 'lower bound'
                  : uk
                    ? 'повний обхід'
                    : 'complete survey')
              : evidence?.metrics
                ? uk
                  ? 'Дані отримано від агента.'
                  : 'Reported by the agent.'
                : uk
                  ? 'Очікування звіту агента.'
                  : 'Waiting for the agent report.'}
          </p>
          {survey?.categories && (
            <div className="attack-categories">
              {Object.entries(survey.categories).map(([name, values]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>
                    {values.files.toLocaleString()} · {(values.bytes / 1024 ** 2).toFixed(1)} MiB
                  </strong>
                </div>
              ))}
            </div>
          )}
          {evidence?.metrics && (
            <div className="attack-categories">
              {Object.entries(evidence.metrics).map(([name, value]) => (
                <div key={name}>
                  <span>{metricLabel(name, language)}</span>
                  <strong>{metricValue(value, language)}</strong>
                </div>
              ))}
            </div>
          )}
          <p>
            {module?.flow
              ? uk
                ? 'Завершення не є вердиктом EDR.'
                : 'Completion is not an EDR verdict.'
              : uk
                ? 'Лише метадані. Вміст файлів не передавався. Завершення не є вердиктом EDR.'
                : 'Metadata only. File contents were not sent. Completion is not an EDR verdict.'}
          </p>
        </div>
      </div>
      <div className="attack-timeline">
        <div className="attack-timeline-heading">
          <h3>{uk ? 'Журнал виконання' : 'Execution log'}</h3>
          <span>
            {events.length} {uk ? 'подій' : 'events'}
          </span>
        </div>
        {events.length ? (
          events.map((event) => (
            <div className="attack-timeline-row" key={event.id}>
              <time
                title={
                  event.measured && event.receivedAt
                    ? `${uk ? 'Отримано сервером' : 'Server received'} ${time(event.receivedAt, language, true)}`
                    : undefined
                }
              >
                {time(event.time, language, event.measured)}
              </time>
              <span className={'attack-event-source source-' + event.source}>
                {uk
                  ? ((
                      {
                        server: 'сервер',
                        agent: 'агент',
                        evidence: 'звіт',
                        siem: 'SIEM',
                      } as Record<string, string>
                    )[event.source] ?? event.source)
                  : event.source}
              </span>
              <div>
                <strong>{eventLabel(event.code, language, modules)}</strong>
                <p>{eventDetail(event.code, language, modules)}</p>
                {event.delayMs != null && (
                  <span className="attack-event-timing">
                    {uk ? 'Пауза' : 'Pause'} {interval(event.delayMs)} · {uk ? 'дія' : 'action'}{' '}
                    {interval(event.durationMs ?? 0)}
                  </span>
                )}
                <code>{event.code}</code>
              </div>
            </div>
          ))
        ) : (
          <p className="attack-muted attack-no-events">
            {uk ? 'Очікування подій цього запуску.' : 'Waiting for events for this run.'}
          </p>
        )}
      </div>
    </section>
  )
}
