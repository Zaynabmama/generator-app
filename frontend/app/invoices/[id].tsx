import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  ActivityIndicator,
  IconButton,
  Portal,
  Dialog,
  TextInput as PaperInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { invoicesAPI, customersAPI, readingsAPI, generatorsAPI, paymentsAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { showAlert } from '@/src/utils/alert';
import { sanitizeDecimal } from '@/src/utils/numeric-input';
import { BUSINESS_INFO, buildInvoiceWhatsAppWebUrl, formatPhoneForWhatsApp, buildInvoiceMessage } from '@/src/utils/whatsapp-invoice';

export default function InvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id: string; autoWhatsApp?: string }>();
  const { id, autoWhatsApp } = params;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [reading, setReading] = useState<any>(null);
  const [generator, setGenerator] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentDialogVisible, setPaymentDialogVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [autoSendTriggered, setAutoSendTriggered] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  // Auto-open WhatsApp after invoice created
  useEffect(() => {
    if (autoWhatsApp === '1' && !autoSendTriggered && invoice && customer && reading) {
      setAutoSendTriggered(true);
      setTimeout(() => {
        handleWhatsAppSend();
      }, 800);
    }
  }, [autoWhatsApp, invoice, customer, reading, autoSendTriggered]);

  const fetchData = async () => {
    try {
      const invoiceRes = await invoicesAPI.getOne(id!);
      setInvoice(invoiceRes.data);

      const [customerRes, readingRes, paymentsRes] = await Promise.all([
        customersAPI.getOne(invoiceRes.data.customer_id),
        readingsAPI.getOne(invoiceRes.data.reading_id),
        paymentsAPI.getAll({ invoice_id: id }),
      ]);
      setCustomer(customerRes.data);
      setReading(readingRes.data);
      setPayments(paymentsRes.data);

      if (customerRes.data.generator_id) {
        try {
          const genRes = await generatorsAPI.getOne(customerRes.data.generator_id);
          setGenerator(genRes.data);
        } catch (e) {
          console.log('Generator fetch skipped');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  const generateInvoiceHTML = () => {
    if (!invoice || !customer || !reading) return '';

    const consumption = reading.current_reading - reading.previous_reading;
    const monthName = invoice.month.split('-').reverse().join('/');
    const totalDue = invoice.total_amount + invoice.previous_balance;

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A5; margin: 10mm; }
          body {
            font-family: 'Arial', 'Tahoma', sans-serif;
            direction: rtl;
            margin: 0;
            padding: 0;
            color: #000;
          }
          .invoice {
            border: 3px solid #000;
            padding: 0;
            width: 100%;
            max-width: 500px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            border-bottom: 2px solid #000;
          }
          .header-right {
            width: 50%;
            padding: 8px;
            text-align: center;
            border-left: 2px solid #000;
          }
          .header-center {
            width: 30%;
            padding: 8px;
            text-align: center;
            border-left: 2px solid #000;
          }
          .header-left {
            width: 20%;
            padding: 8px;
            text-align: center;
          }
          .business-name {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .area-name {
            font-size: 14px;
            margin-bottom: 4px;
          }
          .phones {
            font-size: 12px;
          }
          .invoice-num-title {
            font-size: 20px;
            font-weight: bold;
          }
          .invoice-num {
            font-size: 22px;
            color: #c00;
            font-weight: bold;
            border: 2px solid #c00;
            padding: 4px 8px;
            display: inline-block;
            margin-top: 4px;
          }
          .receipt-label {
            font-size: 24px;
            font-weight: bold;
          }
          .content {
            display: flex;
          }
          .left-col {
            width: 30%;
            border-left: 2px solid #000;
          }
          .right-col {
            width: 70%;
          }
          .row {
            display: flex;
            border-bottom: 2px solid #000;
            min-height: 40px;
          }
          .row:last-child {
            border-bottom: none;
          }
          .cell-label {
            padding: 8px;
            font-weight: bold;
            font-size: 14px;
            border-left: 2px solid #000;
            min-width: 100px;
            display: flex;
            align-items: center;
          }
          .cell-value {
            padding: 8px;
            font-size: 14px;
            flex: 1;
            display: flex;
            align-items: center;
          }
          .left-row {
            padding: 8px;
            border-bottom: 2px solid #000;
            text-align: center;
            min-height: 35px;
          }
          .left-row:last-child {
            border-bottom: none;
          }
          .left-label {
            font-size: 12px;
            font-weight: bold;
          }
          .left-value {
            font-size: 18px;
            font-weight: bold;
            margin-top: 4px;
          }
          .footer {
            padding: 8px;
            border-top: 2px solid #000;
            text-align: center;
            font-size: 12px;
          }
          .split-row {
            display: flex;
          }
          .split-cell {
            flex: 1;
            padding: 8px;
            border-left: 2px solid #000;
            text-align: center;
          }
          .split-cell:last-child {
            border-left: none;
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <!-- Header -->
          <div class="header">
            <div class="header-right">
              <div class="business-name">${BUSINESS_INFO.name}</div>
              <div class="area-name">اشتراك ${customer.area}</div>
              <div class="phones">${BUSINESS_INFO.phones}</div>
            </div>
            <div class="header-center">
              <div class="receipt-label">إيصال</div>
              <div class="invoice-num">${invoice.invoice_number || '00000'}</div>
            </div>
            <div class="header-left">
              <div class="left-label">العداد الحالي</div>
              <div class="left-value">${reading.current_reading}</div>
            </div>
          </div>

          <!-- Content -->
          <div class="content">
            <div class="right-col">
              <div class="row">
                <div class="cell-label">اسم المشترك:</div>
                <div class="cell-value">${customer.name}</div>
              </div>
              <div class="row">
                <div class="cell-label">المبلغ المتوجب:</div>
                <div class="cell-value">$${invoice.total_amount.toFixed(2)}</div>
                <div class="cell-label" style="border-right: 2px solid #000;">قديم:</div>
                <div class="cell-value">$${invoice.previous_balance.toFixed(2)}</div>
              </div>
              <div class="row">
                <div class="cell-label">المجموع:</div>
                <div class="cell-value">$${totalDue.toFixed(2)}</div>
              </div>
              <div class="row">
                <div class="cell-label">واصل:</div>
                <div class="cell-value">$${invoice.amount_paid.toFixed(2)}</div>
                <div class="cell-label" style="border-right: 2px solid #000;">في:</div>
                <div class="cell-value">${new Date().toLocaleDateString('en-GB')}</div>
              </div>
              <div class="row">
                <div class="cell-label">باقي:</div>
                <div class="cell-value">$${invoice.remaining_amount.toFixed(2)}</div>
              </div>
              <div class="row">
                <div class="cell-label">وذلك عن شهر:</div>
                <div class="cell-value">${monthName}</div>
              </div>
            </div>

            <div class="left-col">
              <div class="left-row">
                <div class="left-label">العداد السابق</div>
                <div class="left-value">${reading.previous_reading}</div>
              </div>
              <div class="left-row">
                <div class="left-label">حجم المصروف</div>
                <div class="left-value">${consumption}</div>
              </div>
              <div class="left-row">
                <div class="left-label">اشتراك شهري</div>
                <div class="left-value">$${invoice.monthly_fee.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            تدفع في المحل من 1 لغاية 5 الشهر بفصل الاشتراك بعد هذا التاريخ
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const generatePDF = async () => {
    try {
      setSending(true);
      const html = generateInvoiceHTML();
      
      if (Platform.OS === 'web') {
        // On web, open in new window for print
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => win.print(), 500);
        }
        return null;
      }
      
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      return uri;
    } catch (error) {
      console.error('PDF error:', error);
      showAlert('خطأ', 'حدث خطأ أثناء إنشاء PDF: ' + String(error));
      return null;
    } finally {
      setSending(false);
    }
  };

  const handlePrintPDF = async () => {
    try {
      setSending(true);
      const html = generateInvoiceHTML();
      
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => win.print(), 500);
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.error('Print error:', error);
      showAlert('خطأ', 'حدث خطأ أثناء الطباعة: ' + String(error));
    } finally {
      setSending(false);
    }
  };

  const handleSharePDF = async () => {
    try {
      setSending(true);
      
      if (Platform.OS === 'web') {
        const html = generateInvoiceHTML();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => win.print(), 500);
        }
        setSending(false);
        return;
      }
      
      const html = generateInvoiceHTML();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable && uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'مشاركة الفاتورة',
          UTI: 'com.adobe.pdf',
        });
      } else {
        showAlert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز');
      }
    } catch (error) {
      console.error('Share error:', error);
      showAlert('خطأ', 'حدث خطأ أثناء المشاركة: ' + String(error));
    } finally {
      setSending(false);
    }
  };

  const handlePayment = () => {
    setPaymentAmount(invoice.remaining_amount.toString());
    setPaymentDialogVisible(true);
  };

  const submitPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      showAlert('خطأ', 'الرجاء إدخال مبلغ صحيح');
      return;
    }

    try {
      setSending(true);
      await invoicesAPI.addPayment(invoice.id, {
        amount: parseFloat(paymentAmount),
        payment_date: new Date().toISOString(),
        notes: '',
      });

      showAlert('نجاح', 'تم تسجيل الدفعة بنجاح');
      setPaymentDialogVisible(false);
      setPaymentAmount('');
      await fetchData();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء تسجيل الدفعة');
    } finally {
      setSending(false);
    }
  };

  const confirmDeleteInvoice = async () => {
    try {
      setSending(true);
      await invoicesAPI.delete(invoice.id);
      setDeleteDialogVisible(false);
      router.back();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحذف');
    } finally {
      setSending(false);
    }
  };

  const handleWhatsAppSend = async () => {
    if (!customer || !invoice) return;

    const phone = formatPhoneForWhatsApp(customer.phone);
    const message = buildInvoiceMessage(customer, invoice, reading, payments);
    const encodedMessage = encodeURIComponent(message);
    const webUrl = buildInvoiceWhatsAppWebUrl(customer, invoice, reading, payments);

    if (Platform.OS === 'web') {
      // Open immediately, synchronously with the click — anything awaited first
      // (like generatePDF's print window) gets this popup blocked by the browser.
      // generatePDF() also can't produce a file to attach on web anyway (returns null).
      window.open(webUrl, '_blank');
      return;
    }

    setSending(true);
    try {
      // First generate PDF
      const uri = await generatePDF();
      const whatsappUrl = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;

      // Try to open WhatsApp app first
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(webUrl);
      }

      // Also share PDF
      if (uri && await Sharing.isAvailableAsync()) {
        setTimeout(async () => {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'إرسال الفاتورة PDF',
          });
        }, 1500);
      }
    } catch (error) {
      console.error('WhatsApp error:', error);
      showAlert('خطأ', 'حدث خطأ أثناء إرسال WhatsApp');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invoice || !customer || !reading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>لم يتم العثور على الفاتورة</Text>
        </View>
      </SafeAreaView>
    );
  }

  const consumption = reading.current_reading - reading.previous_reading;
  const monthName = invoice.month.split('-').reverse().join('/');
  const totalDue = invoice.total_amount + invoice.previous_balance;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-right"
          iconColor="#4CAF50"
          size={24}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>تفاصيل الفاتورة</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Invoice Preview */}
        <Card style={styles.card}>
          <Card.Content style={styles.invoiceContainer}>
            <View style={styles.businessHeader}>
              <View style={styles.headerBox}>
                <Text style={styles.businessName}>{BUSINESS_INFO.name}</Text>
                <Text style={styles.areaName}>اشتراك {customer.area}</Text>
                <Text style={styles.phones}>{BUSINESS_INFO.phones}</Text>
              </View>
              <View style={styles.receiptBox}>
                <Text style={styles.receiptLabel}>إيصال</Text>
                <View style={styles.invoiceNumBox}>
                  <Text style={styles.invoiceNum}>{invoice.invoice_number || '00000'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.metersRow}>
              <View style={styles.meterCol}>
                <Text style={styles.meterLabel}>العداد السابق</Text>
                <Text style={styles.meterValue}>{reading.previous_reading}</Text>
              </View>
              <View style={styles.meterCol}>
                <Text style={styles.meterLabel}>العداد الحالي</Text>
                <Text style={styles.meterValue}>{reading.current_reading}</Text>
              </View>
              <View style={styles.meterCol}>
                <Text style={styles.meterLabel}>حجم المصروف</Text>
                <Text style={styles.meterValue}>{consumption}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>اسم المشترك:</Text>
              <Text style={styles.detailValue}>{customer.name}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>شهر:</Text>
              <Text style={styles.detailValue}>{monthName}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>اشتراك شهري:</Text>
              <Text style={styles.detailValue}>${invoice.monthly_fee.toFixed(2)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>المبلغ المتوجب:</Text>
              <Text style={styles.detailValue}>${invoice.total_amount.toFixed(2)}</Text>
            </View>

            {invoice.previous_balance > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>الرصيد السابق:</Text>
                <Text style={[styles.detailValue, { color: '#FF9800' }]}>
                  ${invoice.previous_balance.toFixed(2)}
                </Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>المجموع:</Text>
              <Text style={[styles.detailValue, styles.total]}>
                ${totalDue.toFixed(2)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>واصل:</Text>
              <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
                ${invoice.amount_paid.toFixed(2)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>الباقي:</Text>
              <Text style={[styles.detailValue, styles.remaining]}>
                ${invoice.remaining_amount.toFixed(2)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {payments.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>سجل الدفعات</Text>
              {payments.map((payment) => (
                <View key={payment.id} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {new Date(payment.payment_date).toLocaleDateString('en-GB')}
                  </Text>
                  <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
                    ${payment.amount.toFixed(2)}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          {invoice.status !== 'paid' && (
            <Button
              mode="contained"
              icon="cash-plus"
              onPress={handlePayment}
              loading={sending}
              disabled={sending}
              style={[styles.actionButton, { backgroundColor: '#2196F3' }]}
              contentStyle={styles.buttonContent}
              testID="record-payment-btn"
            >
              تسجيل دفعة
            </Button>
          )}

          <Button
            mode="contained"
            icon="whatsapp"
            onPress={handleWhatsAppSend}
            loading={sending}
            disabled={sending}
            style={[styles.actionButton, { backgroundColor: '#25D366' }]}
            contentStyle={styles.buttonContent}
            testID="send-whatsapp-btn"
          >
            إرسال عبر WhatsApp
          </Button>

          <Button
            mode="contained"
            icon="file-pdf-box"
            onPress={handleSharePDF}
            loading={sending}
            disabled={sending}
            style={[styles.actionButton, { backgroundColor: '#E53935' }]}
            contentStyle={styles.buttonContent}
            testID="share-pdf-btn"
          >
            مشاركة PDF
          </Button>

          <Button
            mode="contained"
            icon="printer"
            onPress={handlePrintPDF}
            loading={sending}
            disabled={sending}
            style={styles.actionButton}
            contentStyle={styles.buttonContent}
            testID="print-btn"
          >
            طباعة
          </Button>

          <Button
            mode="outlined"
            icon="delete"
            onPress={() => setDeleteDialogVisible(true)}
            disabled={sending}
            style={[styles.actionButton, { borderColor: '#F44336' }]}
            contentStyle={styles.buttonContent}
            textColor="#F44336"
            testID="delete-invoice-detail-btn"
          >
            حذف الفاتورة
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={paymentDialogVisible}
          onDismiss={() => setPaymentDialogVisible(false)}
        >
          <Dialog.Title>تسجيل دفعة</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              المشترك: {customer?.name}
            </Text>
            <Text style={styles.dialogText}>
              المبلغ المتبقي: ${invoice?.remaining_amount.toFixed(2)}
            </Text>
            <PaperInput
              label="مبلغ الدفعة"
              value={paymentAmount}
              onChangeText={(text) => setPaymentAmount(sanitizeDecimal(text))}
              keyboardType="numeric"
              mode="outlined"
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentDialogVisible(false)}>إلغاء</Button>
            <Button onPress={submitPayment} loading={sending}>تسجيل</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>تأكيد حذف الفاتورة</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#ccc' }}>
              هل أنت متأكد من حذف الفاتورة #{invoice?.invoice_number}؟
            </Text>
            <Text style={{ color: '#F44336', marginTop: 12, fontSize: 12 }}>
              ⚠️ سيتم حذف جميع الدفعات المرتبطة بها
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>إلغاء</Button>
            <Button
              onPress={confirmDeleteInvoice}
              textColor="#F44336"
              loading={sending}
              testID="confirm-delete-invoice-detail-btn"
            >
              حذف
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
  },
  card: {
    margin: 16,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  invoiceContainer: {
    padding: 8,
  },
  businessHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 12,
    marginBottom: 12,
  },
  headerBox: {
    flex: 1,
    alignItems: 'center',
    borderLeftWidth: 2,
    borderLeftColor: '#000',
    paddingHorizontal: 8,
  },
  businessName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  areaName: {
    fontSize: 14,
    color: '#000',
    marginTop: 4,
  },
  phones: {
    fontSize: 12,
    color: '#000',
    marginTop: 4,
  },
  receiptBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  receiptLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  invoiceNumBox: {
    borderWidth: 2,
    borderColor: '#c00',
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  invoiceNum: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#c00',
  },
  metersRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 12,
    marginBottom: 12,
  },
  meterCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#666',
  },
  meterLabel: {
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
  },
  meterValue: {
    fontSize: 18,
    color: '#000',
    fontWeight: 'bold',
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  detailLabel: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: 'bold',
  },
  total: {
    fontSize: 18,
    color: '#c00',
  },
  remaining: {
    fontSize: 18,
    color: '#c00',
    fontWeight: 'bold',
  },
  divider: {
    height: 2,
    backgroundColor: '#000',
    marginVertical: 8,
  },
  buttonsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 4,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  dialogText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  dialogInput: {
    marginTop: 12,
  },
});
