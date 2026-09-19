// Shared between the single-invoice send (invoices/[id].tsx) and bulk send
// (invoices/bulk-send.tsx) so the message customers receive is identical
// regardless of which screen sent it.

export const BUSINESS_INFO = {
  name: 'أبو عباس للإنارة',
  phones: '76/942194 - 70/572160',
};

export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  // Remove leading 0
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  // Add country code if not present (Iraq: 964, Lebanon: 961)
  // For Lebanon numbers starting with 3,70,71,76,78,79,81
  if (!cleaned.startsWith('961') && !cleaned.startsWith('964')) {
    cleaned = '961' + cleaned; // Default to Lebanon
  }
  return cleaned;
}

const formatPaymentDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB');

export function buildInvoiceMessage(customer: any, invoice: any, reading: any, payments: any[] = []): string {
  const consumption = reading.current_reading - reading.previous_reading;
  const monthName = invoice.month.split('-').reverse().join('/');
  const totalDue = invoice.total_amount + invoice.previous_balance;

  const paymentsSection =
    payments.length > 0
      ? `\nسجل الدفعات:\n${payments
          .map((p) => `- ${formatPaymentDate(p.payment_date)}: $${p.amount.toFixed(2)}`)
          .join('\n')}\n`
      : '';

  return `*${BUSINESS_INFO.name}*
اشتراك ${customer.area}
${BUSINESS_INFO.phones}

*إيصال رقم: ${invoice.invoice_number || '00000'}*

اسم المشترك: ${customer.name}
شهر: ${monthName}

━━━━━━━━━━━━━━━
العداد السابق: ${reading.previous_reading}
العداد الحالي: ${reading.current_reading}
حجم المصروف: ${consumption} kWh
اشتراك شهري: $${invoice.monthly_fee.toFixed(2)}
━━━━━━━━━━━━━━━

المبلغ المتوجب: $${invoice.total_amount.toFixed(2)}
الرصيد السابق: $${invoice.previous_balance.toFixed(2)}
*المجموع: $${totalDue.toFixed(2)}*
واصل: $${invoice.amount_paid.toFixed(2)}
*الباقي: $${invoice.remaining_amount.toFixed(2)}*
${paymentsSection}
تدفع في المحل من 1 لغاية 5 الشهر`;
}

export function buildInvoiceWhatsAppWebUrl(customer: any, invoice: any, reading: any, payments: any[] = []): string {
  const phone = formatPhoneForWhatsApp(customer.phone);
  const message = buildInvoiceMessage(customer, invoice, reading, payments);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
