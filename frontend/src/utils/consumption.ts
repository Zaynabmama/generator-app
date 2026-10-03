// A typical customer uses well under this in a month, so anything above it
// is more likely a typo or a wrong starting reading than real usage. Only
// used to warn — the reading can still be saved and invoiced.
export const HIGH_CONSUMPTION_KWH = 500;

export const HIGH_CONSUMPTION_WARNING = '⚠️ استهلاك مرتفع، تأكد من القراءة';

export function isHighConsumption(consumption: number | null | undefined): boolean {
  return consumption != null && consumption > HIGH_CONSUMPTION_KWH;
}
