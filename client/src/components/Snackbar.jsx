import { useEffect } from 'react';

const AUTO_HIDE_MS = 4000;

/**
 * Short confirmation at the bottom of the screen (e.g. "AMC updated.").
 * Hides itself after a few seconds; × closes it straight away.
 */
export default function Snackbar({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span className="snackbar-icon" aria-hidden="true">
        ✓
      </span>
      <span>{message}</span>
      <button type="button" className="snackbar-close" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
