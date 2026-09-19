// Shared "YYYY-MM" month helpers used wherever an invoice's billing month is
// picked or stepped through (invoice creation, bulk send).

// Invoices usually bill for the month just finished — e.g. an invoice
// created in September covers August's consumption — but this is only a
// starting point; the user can adjust it from there.
export const getBillingMonth = () => {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
};

export const shiftMonth = (monthStr: string, delta: number) => {
  const [year, month] = monthStr.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

export const formatMonthDisplay = (monthStr: string) => monthStr.split('-').reverse().join('/');
