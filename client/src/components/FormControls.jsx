import { useEffect, useId, useRef } from 'react';

export function Field({ label, error, children, className = '' }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, error ? `${id}-error` : undefined)}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ id, describedBy, error, value, onChange, ...rest }) {
  return (
    <input
      id={id}
      className="input"
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Select({ id, describedBy, error, value, onChange, options, placeholder, ...rest }) {
  return (
    <select
      id={id}
      className="input"
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * "Select all" checkbox for a group: ticked when every item is selected,
 * partly ticked (–) when only some are.
 */
export function GroupCheckbox({ label, selected, total, onChange }) {
  const ref = useRef(null);
  const all = total > 0 && selected === total;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && !all;
  }, [selected, all]);
  return (
    <label className="check check-group">
      <input ref={ref} type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      <span className="muted small">
        {selected}/{total}
      </span>
    </label>
  );
}

/** Errors for a whole row of a repeated section, e.g. assets.0.* */
export function RowErrors({ errors }) {
  const messages = Object.values(errors).filter(Boolean);
  if (!messages.length) return null;
  return <p className="field-error row-error">{messages.join(' · ')}</p>;
}
