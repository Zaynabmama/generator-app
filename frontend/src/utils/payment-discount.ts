// Shared by the payment dialogs on the invoices tab (app/(tabs)/invoices.tsx)
// and the invoice details screen (app/invoices/[id].tsx) so a discount
// behaves the same from either place.

const roundCents = (n: number) => Math.round(n * 100) / 100;

// What's left to pay once the discount is taken off — the dialog's default amount.
export function amountAfterDiscount(remaining: number, discount: string): string {
  return String(Math.max(roundCents(remaining - (parseFloat(discount) || 0)), 0));
}

// Typing a discount keeps the payment amount in step with it, unless the user
// already typed an amount of their own, which is left alone.
export function syncAmountWithDiscount(
  remaining: number,
  amount: string,
  oldDiscount: string,
  newDiscount: string
): string {
  const isDefault =
    (parseFloat(amount) || 0) === parseFloat(amountAfterDiscount(remaining, oldDiscount));
  return isDefault ? amountAfterDiscount(remaining, newDiscount) : amount;
}

// Returns an error message to show, or null if the payment can be submitted.
export function validatePayment(remaining: number, amount: string, discount: string): string | null {
  const amountValue = parseFloat(amount) || 0;
  const discountValue = parseFloat(discount) || 0;
  if (amountValue <= 0 && discountValue <= 0) return 'الرجاء إدخال مبلغ أو حسم';
  if (roundCents(discountValue) > roundCents(remaining)) return 'الحسم أكبر من المبلغ المتبقي';
  return null;
}
