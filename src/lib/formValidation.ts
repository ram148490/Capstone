/**
 * Lightweight shared form validation used by every modal form in the app.
 *
 * Each form builds a list of FieldChecks and calls validateForm(). The first
 * failing check produces a clear, human-readable error message that the form
 * renders in an inline error banner and uses to block submission.
 */

export interface FieldCheck {
  /** Human label shown in the error message, e.g. "Average check size". */
  label: string;
  value: string | number | null | undefined;
  /** Reject empty / whitespace-only / null values. */
  required?: boolean;
  /** Numeric field: reject values < 0. */
  nonNegative?: boolean;
  /** Numeric field: reject values <= 0. */
  positive?: boolean;
  /** Optional inclusive upper bound for numeric fields. */
  max?: number;
}

const isBlank = (v: FieldCheck['value']): boolean =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'number' && Number.isNaN(v));

/**
 * Returns the first validation error message, or null when every check passes.
 */
export function validateForm(checks: FieldCheck[]): string | null {
  for (const c of checks) {
    if (c.required && isBlank(c.value)) {
      return `${c.label} is required.`;
    }

    const needsNumberCheck =
      (c.nonNegative || c.positive || c.max !== undefined) && !isBlank(c.value);

    if (needsNumberCheck) {
      const n = typeof c.value === 'number' ? c.value : Number(c.value);
      if (Number.isNaN(n)) {
        return `${c.label} must be a valid number.`;
      }
      if (c.positive && n <= 0) {
        return `${c.label} must be greater than zero.`;
      }
      if (c.nonNegative && n < 0) {
        return `${c.label} cannot be negative.`;
      }
      if (c.max !== undefined && n > c.max) {
        return `${c.label} cannot be greater than ${c.max}.`;
      }
    }
  }
  return null;
}
