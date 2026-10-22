export default function StatCard({ label, value, hint, tone }) {
  return (
    <section className="card stat">
      <h2 className="stat-label">{label}</h2>
      <p className={`stat-value${tone ? ` tone-${tone}` : ''}`}>{value}</p>
      <p className="stat-hint">{hint}</p>
    </section>
  );
}
