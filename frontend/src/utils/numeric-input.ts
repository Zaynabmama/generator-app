// keyboardType only hints at which on-screen keyboard to show — it doesn't
// stop a physical keyboard (or paste) from entering letters, which matters
// since this app is mostly used from a desktop browser. These strip
// anything that isn't a valid number as the user types.

// Digits only — for whole-number fields like phone numbers and meter numbers.
export function sanitizeDigits(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

// Digits with at most one decimal point — for amounts, rates, and readings.
export function sanitizeDecimal(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, '')
  );
}
