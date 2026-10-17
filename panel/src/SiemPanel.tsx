import { time } from './attackMapData'
import type { Language, Module, Task } from './models'

type Props = { language: Language; task: Task; module: Module | undefined }

export default function SiemPanel({ language, task, module }: Props) {
  const uk = language === 'uk'
  return (
    <section className="siem-panel" aria-label={uk ? 'Результат SIEM' : 'SIEM result'}>
      <div className="siem-heading">
        <div>
          <span className="attack-kicker">SIEM / SPLUNK</span>
          <h3>{uk ? 'Спостерігач' : 'Observer'}</h3>
        </div>
        <span className={'siem-state state-' + (task.siem?.state ?? 'not_recorded')}>
          {
            (
              {
                waiting: uk ? 'Очікує агента' : 'Waiting for agent',
                watching: uk ? 'Моніторинг' : 'Watching',
                alert: uk ? 'Є алерт' : 'Alert found',
                no_alert: uk ? 'Алертів немає' : 'No alert found',
                error: uk ? 'Перевірка не вдалася' : 'Check failed',
                unconfigured: uk ? 'Не налаштовано' : 'Not configured',
                skipped: uk ? 'Пропущено' : 'Skipped',
                not_recorded: uk ? 'Немає перевірки' : 'Not recorded',
              } as Record<string, string>
            )[task.siem?.state ?? 'not_recorded']
          }
        </span>
      </div>
      <div className="siem-meta">
        <span>
          {uk ? 'Хост' : 'Host'}: {task.siem?.host || task.agentName}
        </span>
        {task.siem?.checkedAt && (
          <span>
            {uk ? 'Перевірено' : 'Checked'}: {time(task.siem.checkedAt, language)}
          </span>
        )}
      </div>
      {task.siem?.state === 'alert' && (
        <>
          <p className="siem-note">
            {uk
              ? 'Збіг за хостом і часом запуску. Перевірте, чи пов’язаний алерт із симуляцією.'
              : 'Matched by host and run time. Confirm whether each alert came from this simulation.'}
          </p>
          <div className="siem-alerts">
            {task.siem.alerts.map((alert) => (
              <div className="siem-alert" key={alert.id}>
                <strong>{alert.rule || (uk ? 'Правило без назви' : 'Unnamed rule')}</strong>
                <span>
                  {alert.severity || '—'} · {alert.time ? time(alert.time, language) : '—'} ·{' '}
                  {alert.id}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {task.siem?.state === 'no_alert' && (
        <div className="siem-advice">
          <p>
            {uk
              ? `Після ${task.siem.graceSeconds} с очікування Splunk не повернув алертів для цього хоста. Це не доводить відсутність телеметрії.`
              : `After ${task.siem.graceSeconds}s of waiting, Splunk returned no alert for this host. This does not prove telemetry is absent.`}
          </p>
          <ol>
            <li>
              {uk
                ? 'Перевірте надходження подій за час запуску та зіставлення імені хоста з налаштованими полями алертів.'
                : 'Check event ingestion around the run and map the asset name to the configured alert fields.'}
            </li>
            <li>
              {module?.platform === 'windows'
                ? uk
                  ? 'Перевірте події створення процесів, завдань і файлів у EDR або Sysmon.'
                  : 'Inspect process, scheduled-task, and file events in EDR or Sysmon.'
                : uk
                  ? 'Перевірте події запуску процесів, мережі та файлів у EDR або auditd/eBPF.'
                  : 'Inspect process, network, and file events in EDR or auditd/eBPF.'}
            </li>
            <li>
              {uk
                ? 'Додайте правило для етапів нижче, перевірте затримку створення алерту й повторіть запуск.'
                : 'Add a detection rule for the stages below, check alert creation latency, and rerun.'}
            </li>
          </ol>
          {module?.flow && (
            <div className="siem-targets">
              {module.flow.slice(0, 4).map((stage) => (
                <span key={stage.id}>{uk ? stage.titleUk : stage.titleEn}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {task.siem?.state === 'error' && (
        <p className="siem-note siem-error">
          {uk
            ? 'Результат невідомий. Перевірте адресу SIEM, права ключа й доступність індексу.'
            : 'Result unknown. Check the SIEM URL, API key privileges, and alert index access.'}{' '}
          {task.siem.error}
        </p>
      )}
      {task.siem?.state === 'unconfigured' && (
        <p className="siem-note">
          {uk
            ? 'Налаштуйте PANEL_SIEM_URL, PANEL_SIEM_API_KEY і PANEL_SIEM_INDEX на сервері панелі перед наступним запуском.'
            : 'Set PANEL_SIEM_URL, PANEL_SIEM_API_KEY, and PANEL_SIEM_INDEX on the panel server before the next run.'}
        </p>
      )}
    </section>
  )
}
