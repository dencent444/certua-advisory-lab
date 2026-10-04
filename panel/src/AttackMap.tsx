type Language = 'en' | 'uk'

export default function AttackMap({ language }: { language: Language }) {
  const uk = language === 'uk'

  return (
    <section className="attack-map" aria-label={uk ? 'Схема атаки' : 'Attack graph'}>
      <div className="attack-board-empty">
        <span className="empty-line" aria-hidden="true" />
        <strong>{uk ? 'Немає схеми атаки' : 'No attack graph'}</strong>
        <p>{uk ? 'Схема з’явиться тут, коли будуть дані про атаку.' : 'A graph will appear here when attack data is available.'}</p>
      </div>
    </section>
  )
}
