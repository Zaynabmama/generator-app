import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  SegmentedButtons,
  ActivityIndicator,
  Searchbar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { customersAPI, readingsAPI, invoicesAPI } from '@/src/services/api';
import { showAlert } from '@/src/utils/alert';
import { usePricing } from '@/src/hooks/use-pricing';

// Invoices usually bill for the month just finished — e.g. an invoice
// created in September covers August's consumption — but this is only a
// starting point; the user can adjust it (e.g. when entering readings near
// month-end for the current month instead).
const getBillingMonth = () => {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
};

const shiftMonth = (monthStr: string, delta: number) => {
  const [year, month] = monthStr.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthDisplay = (monthStr: string) => monthStr.split('-').reverse().join('/');

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ readingId?: string }>();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(!!params.readingId);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [step, setStep] = useState(1); // 1: Select customer, 2: Enter reading, 3: Review
  // Set when arriving from a previously-saved (not yet invoiced) reading —
  // the reading already exists, so submit shouldn't create another one.
  const [existingReadingId, setExistingReadingId] = useState<string | null>(null);

  const [readingData, setReadingData] = useState({
    previous_reading: '',
    current_reading: '',
    notes: '',
  });

  const [invoicePreview, setInvoicePreview] = useState<any>(null);
  const [invoiceMonth, setInvoiceMonth] = useState(getBillingMonth());

  // Pricing — configurable from the settings screen
  const { kwhRate: CONSUMPTION_RATE, monthlyFee: MONTHLY_FEE } = usePricing();

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (params.readingId) {
      loadFromExistingReading(params.readingId);
    }
  }, [params.readingId]);

  const loadFromExistingReading = async (readingId: string) => {
    try {
      const readingRes = await readingsAPI.getOne(readingId);
      const reading = readingRes.data;
      const customerRes = await customersAPI.getOne(reading.customer_id);
      const customer = customerRes.data;

      setExistingReadingId(readingId);
      setSelectedCustomer(customer);
      setReadingData({
        previous_reading: String(reading.previous_reading),
        current_reading: String(reading.current_reading),
        notes: reading.notes || '',
      });

      const rate =
        customer.kwh_rate && customer.kwh_rate > 0 ? customer.kwh_rate : CONSUMPTION_RATE;
      const consumption = reading.current_reading - reading.previous_reading;
      const consumptionCharge = consumption * rate;
      const totalAmount = consumptionCharge + MONTHLY_FEE;

      setInvoicePreview({
        customer,
        consumption,
        kwhRate: rate,
        consumptionCharge,
        monthlyFee: MONTHLY_FEE,
        totalAmount,
        previousBalance: customer.current_balance || 0,
      });

      setStep(3);
    } catch (error) {
      console.error('Error loading pending reading:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل القراءة');
      router.back();
    } finally {
      setInitializing(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await customersAPI.getAll();
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.area?.toLowerCase().includes(query)
    );
  }, [customers, customerSearch]);

  const handleCustomerSelect = async (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setSelectedCustomer(customer);
    setCustomerSearch('');

    // Fetch latest reading to auto-populate previous_reading
    if (customerId && customer) {
      try {
        const response = await readingsAPI.getLatest(customerId);
        if (response.data.has_reading) {
          setReadingData((prev) => ({
            ...prev,
            previous_reading: response.data.current_reading.toString(),
          }));
        } else {
          setReadingData((prev) => ({
            ...prev,
            previous_reading: '',
          }));
        }
      } catch (error) {
        console.error('Error fetching latest reading:', error);
      }
    }
  };

  const calculateInvoice = () => {
    if (!selectedCustomer) return;

    const prevReading = parseFloat(readingData.previous_reading) || 0;
    const currReading = parseFloat(readingData.current_reading) || 0;
    const consumption = currReading - prevReading;

    if (consumption < 0) {
      showAlert('خطأ', 'القراءة الحالية يجب أن تكون أكبر من القراءة السابقة');
      return;
    }

    // A customer with their own kWh price (set on their profile) overrides the general rate
    const rate =
      selectedCustomer.kwh_rate && selectedCustomer.kwh_rate > 0
        ? selectedCustomer.kwh_rate
        : CONSUMPTION_RATE;

    const consumptionCharge = consumption * rate;
    const totalAmount = consumptionCharge + MONTHLY_FEE;

    setInvoicePreview({
      customer: selectedCustomer,
      consumption,
      kwhRate: rate,
      consumptionCharge,
      monthlyFee: MONTHLY_FEE,
      totalAmount,
      previousBalance: selectedCustomer.current_balance || 0,
    });

    setStep(3);
  };

  const handleSubmit = async () => {
    if (!invoicePreview) return;

    setLoading(true);
    try {
      // Reuse the reading if it was already saved earlier (from "pending readings"),
      // otherwise create it now.
      let readingId = existingReadingId;
      if (!readingId) {
        const readingResponse = await readingsAPI.create({
          customer_id: selectedCustomer.id,
          previous_reading: parseFloat(readingData.previous_reading),
          current_reading: parseFloat(readingData.current_reading),
          reading_date: new Date().toISOString(),
          notes: readingData.notes,
        });
        readingId = readingResponse.data.id;
      }

      // Create invoice
      const invoiceResponse = await invoicesAPI.create({
        customer_id: selectedCustomer.id,
        reading_id: readingId,
        month: invoiceMonth,
        consumption_charge: invoicePreview.consumptionCharge,
        monthly_fee: invoicePreview.monthlyFee,
        total_amount: invoicePreview.totalAmount,
        previous_balance: invoicePreview.previousBalance,
        amount_paid: 0,
        notes: '',
      });

      // Redirect to invoice detail with auto-WhatsApp flag
      const invoiceId = invoiceResponse.data.id;
      router.replace(`/invoices/${invoiceId}?autoWhatsApp=1`);
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  // Just records the meter reading without creating/sending an invoice yet —
  // for when the price isn't decided or the invoice shouldn't go out right away.
  const handleSaveReadingOnly = async () => {
    if (!readingData.previous_reading || !readingData.current_reading) {
      showAlert('خطأ', 'الرجاء إدخال القراءتين');
      return;
    }

    const consumption =
      parseFloat(readingData.current_reading) - parseFloat(readingData.previous_reading);

    if (consumption < 0) {
      showAlert('خطأ', 'القراءة الحالية يجب أن تكون أكبر من القراءة السابقة');
      return;
    }

    setLoading(true);
    try {
      await readingsAPI.create({
        customer_id: selectedCustomer.id,
        previous_reading: parseFloat(readingData.previous_reading),
        current_reading: parseFloat(readingData.current_reading),
        reading_date: new Date().toISOString(),
        notes: readingData.notes,
      });
      showAlert('نجاح', 'تم حفظ القراءة. يمكنك إصدار الفاتورة لاحقاً من "القراءات المعلقة"');
      router.back();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء حفظ القراءة');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.sectionTitle}>اختر المشترك</Text>
        {customers.length > 0 ? (
          !selectedCustomer && (
            <>
              <Searchbar
                placeholder="ابحث بالاسم أو رقم الهاتف أو المنطقة"
                onChangeText={setCustomerSearch}
                value={customerSearch}
                style={styles.searchbar}
              />
              <View style={styles.customerListWrapper}>
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        onPress={() => handleCustomerSelect(customer.id)}
                        style={styles.customerListItem}
                      >
                        <Text style={styles.customerListName}>{customer.name}</Text>
                        <Text style={styles.customerListDetail}>
                          {customer.area} · {customer.phone}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>لا توجد نتائج مطابقة</Text>
                  )}
                </ScrollView>
              </View>
            </>
          )
        ) : (
          <Text style={styles.noDataText}>لا يوجد مشتركين</Text>
        )}

        {selectedCustomer && (
          <View style={styles.customerInfo}>
            <Button
              mode="text"
              onPress={() => setSelectedCustomer(null)}
              style={styles.changeCustomerButton}
              textColor="#4CAF50"
              compact
            >
              تغيير المشترك
            </Button>

            <Text style={styles.infoLabel}>الاسم:</Text>
            <Text style={styles.infoValue}>{selectedCustomer.name}</Text>

            <Text style={styles.infoLabel}>المنطقة:</Text>
            <Text style={styles.infoValue}>{selectedCustomer.area}</Text>

            <Text style={styles.infoLabel}>رقم العداد:</Text>
            <Text style={styles.infoValue}>{selectedCustomer.meter_number}</Text>

            {selectedCustomer.current_balance > 0 && (
              <>
                <Text style={styles.infoLabel}>الرصيد المتبقي:</Text>
                <Text style={[styles.infoValue, { color: '#F44336' }]}>
                  ${selectedCustomer.current_balance.toFixed(2)}
                </Text>
              </>
            )}

            {selectedCustomer.kwh_rate > 0 && (
              <>
                <Text style={styles.infoLabel}>سعر الكيلوواط الخاص به:</Text>
                <Text style={[styles.infoValue, { color: '#4CAF50' }]}>
                  ${selectedCustomer.kwh_rate.toFixed(2)} (بدلاً من السعر العام)
                </Text>
              </>
            )}

            <Button
              mode="contained"
              onPress={() => setStep(2)}
              style={styles.nextButton}
            >
              التالي
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const renderStep2 = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.sectionTitle}>قراءة العداد</Text>

        {readingData.previous_reading && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              ✓ تم تحميل القراءة السابقة تلقائياً من آخر فاتورة
            </Text>
          </View>
        )}

        <TextInput
          label="القراءة السابقة *"
          value={readingData.previous_reading}
          onChangeText={(text) =>
            setReadingData({ ...readingData, previous_reading: text })
          }
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
          right={
            readingData.previous_reading ? (
              <TextInput.Icon icon="check-circle" color="#4CAF50" />
            ) : undefined
          }
        />

        <TextInput
          label="القراءة الحالية *"
          value={readingData.current_reading}
          onChangeText={(text) =>
            setReadingData({ ...readingData, current_reading: text })
          }
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
        />

        {readingData.previous_reading && readingData.current_reading && (
          <View style={styles.consumptionBox}>
            <Text style={styles.consumptionLabel}>الاستهلاك:</Text>
            <Text style={styles.consumptionValue}>
              {(
                parseFloat(readingData.current_reading) -
                parseFloat(readingData.previous_reading)
              ).toLocaleString()}{' '}
              kWh
            </Text>
          </View>
        )}

        <TextInput
          label="ملاحظات"
          value={readingData.notes}
          onChangeText={(text) =>
            setReadingData({ ...readingData, notes: text })
          }
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
        />

        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={() => setStep(1)}
            style={styles.backButton}
          >
            رجوع
          </Button>
          <Button
            mode="contained"
            onPress={calculateInvoice}
            style={styles.nextButton}
          >
            حساب الفاتورة
          </Button>
        </View>

        {!existingReadingId && (
          <Button
            mode="outlined"
            onPress={handleSaveReadingOnly}
            loading={loading}
            disabled={loading}
            style={styles.saveReadingButton}
            textColor="#4CAF50"
            icon="content-save-outline"
          >
            حفظ القراءة فقط (إصدار الفاتورة لاحقاً)
          </Button>
        )}
      </Card.Content>
    </Card>
  );

  const renderStep3 = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.sectionTitle}>معاينة الفاتورة</Text>

        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>المشترك:</Text>
          <Text style={styles.previewValue}>{invoicePreview?.customer.name}</Text>

          <Text style={styles.previewTitle}>الشهر:</Text>
          <View style={styles.monthSelectorRow}>
            <Button
              mode="outlined"
              onPress={() => setInvoiceMonth((m) => shiftMonth(m, -1))}
              compact
              style={styles.monthStepButton}
            >
              الشهر السابق
            </Button>
            <Text style={styles.monthValue}>{formatMonthDisplay(invoiceMonth)}</Text>
            <Button
              mode="outlined"
              onPress={() => setInvoiceMonth((m) => shiftMonth(m, 1))}
              compact
              style={styles.monthStepButton}
            >
              الشهر التالي
            </Button>
          </View>

          <View style={styles.divider} />

          <Text style={styles.previewTitle}>رسم الاستهلاك:</Text>
          <Text style={styles.previewValue}>
            {invoicePreview?.consumption.toLocaleString()} kWh × ${invoicePreview?.kwhRate.toFixed(2)} ={' '}
            ${invoicePreview?.consumptionCharge.toFixed(2)}
          </Text>

          <Text style={styles.previewTitle}>رسم الاشتراك الشهري:</Text>
          <Text style={styles.previewValue}>
            ${invoicePreview?.monthlyFee.toFixed(2)}
          </Text>

          <View style={styles.divider} />

          <Text style={styles.previewTitle}>المبلغ الإجمالي:</Text>
          <Text style={[styles.previewValue, styles.totalAmount]}>
            ${invoicePreview?.totalAmount.toFixed(2)}
          </Text>

          {invoicePreview?.previousBalance > 0 && (
            <>
              <Text style={styles.previewTitle}>الرصيد السابق:</Text>
              <Text style={[styles.previewValue, { color: '#FF9800' }]}>
                ${invoicePreview?.previousBalance.toFixed(2)}
              </Text>

              <Text style={styles.previewTitle}>الإجمالي المطلوب:</Text>
              <Text style={[styles.previewValue, styles.totalAmount]}>
                ${(invoicePreview?.totalAmount + invoicePreview?.previousBalance).toFixed(2)}
              </Text>
            </>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={() => setStep(2)}
            style={styles.backButton}
          >
            رجوع
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
          >
            إنشاء الفاتورة
          </Button>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Button
            mode="text"
            onPress={() => router.back()}
            icon="arrow-right"
            textColor="#4CAF50"
          >
            رجوع
          </Button>
          <Text style={styles.headerTitle}>إنشاء فاتورة جديدة</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.stepsContainer}>
          <View style={[styles.stepIndicator, step >= 1 && styles.stepActive]}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={[styles.stepIndicator, step >= 2 && styles.stepActive]}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={[styles.stepIndicator, step >= 3 && styles.stepActive]}>
            <Text style={styles.stepNumber}>3</Text>
          </View>
        </View>

        {initializing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>جاري تحميل القراءة...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView}>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
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
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActive: {
    backgroundColor: '#4CAF50',
  },
  stepNumber: {
    color: '#fff',
    fontWeight: 'bold',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#333',
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
    backgroundColor: '#1E1E1E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  searchbar: {
    backgroundColor: '#2A2A2A',
    marginBottom: 12,
  },
  customerListWrapper: {
    maxHeight: 320,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  customerListItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
  },
  customerListName: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 2,
  },
  customerListDetail: {
    fontSize: 13,
    color: '#999',
  },
  noDataText: {
    color: '#999',
    textAlign: 'center',
    padding: 16,
  },
  customerInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  changeCustomerButton: {
    alignSelf: 'flex-end',
    marginBottom: -8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  consumptionBox: {
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  infoBanner: {
    padding: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    borderRadius: 8,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#4CAF50',
    textAlign: 'center',
  },
  consumptionLabel: {
    fontSize: 14,
    color: '#999',
  },
  consumptionValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 4,
  },
  previewBox: {
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  previewValue: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  monthStepButton: {
    flex: 1,
  },
  monthValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  divider: {
    height: 1,
    backgroundColor: '#444',
    marginVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 1,
    marginTop: 16,
  },
  saveReadingButton: {
    marginTop: 16,
    borderColor: '#4CAF50',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
});