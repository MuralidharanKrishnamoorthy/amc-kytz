const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** The badge text, also used by search: "7 days" / "Today" / "Expired 3 days ago". */
export function daysLeftText(value) {
  if (value < 0) return `Expired ${days(Math.abs(value))} ago`;
  if (value === 0) return 'Today';
  return days(value);
}

/** Days-left badge, coloured by urgency. */
export default function DaysLeft({ value }) {
  const tone = value <= 7 ? 'danger' : value <= 30 ? 'warning' : 'neutral';
  return <span className={`badge badge-${tone}`}>{daysLeftText(value)}</span>;
}
