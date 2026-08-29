import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  SegmentedButtons,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { customersAPI, readingsAPI, invoicesAPI } from '@/src/services/api';
import { Picker } from '@react-native-picker/picker';
import { showAlert } from '@/src/utils/alert';
import { usePricing } from '@/src/hooks/use-pricing';

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [step, setStep] = useState(1); // 1: Select customer, 2: Enter reading, 3: Review

  const [readingData, setReadingData] = useState({
    previous_reading: '',
    current_reading: '',
    notes: '',
  });

  const [invoicePreview, setInvoicePreview] = useState<any>(null);

  // Pricing — configurable from the settings screen
  const { kwhRate: CONSUMPTION_RATE, monthlyFee: MONTHLY_FEE } = usePricing();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await customersAPI.getAll();
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleCustomerSelect = async (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setSelectedCustomer(customer);
    
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

    const consumptionCharge = consumption * CONSUMPTION_RATE;
    const totalAmount = consumptionCharge + MONTHLY_FEE;

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    setInvoicePreview({
      customer: selectedCustomer,
      consumption,
      consumptionCharge,
      monthlyFee: MONTHLY_FEE,
      totalAmount,
      previousBalance: selectedCustomer.current_balance || 0,
      month,
    });

    setStep(3);
  };

  const handleSubmit = async () => {
    if (!invoicePreview) return;

    setLoading(true);
    try {
      // Create reading first
      const readingResponse = await readingsAPI.create({
        customer_id: selectedCustomer.id,
        previous_reading: parseFloat(readingData.previous_reading),
        current_reading: parseFloat(readingData.current_reading),
        reading_date: new Date().toISOString(),
        notes: readingData.notes,
      });

      // Create invoice
      const invoiceResponse = await invoicesAPI.create({
        customer_id: selectedCustomer.id,
        reading_id: readingResponse.data.id,
        month: invoicePreview.month,
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

  const renderStep1 = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.sectionTitle}>اختر المشترك</Text>
        {customers.length > 0 ? (
          <View style={styles.pickerContainer}>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={selectedCustomer?.id || ''}
                onValueChange={handleCustomerSelect}
                style={styles.picker}
                dropdownIconColor="#fff"
              >
                <Picker.Item label="اختر مشترك..." value="" />
                {customers.map((customer) => (
                  <Picker.Item
                    key={customer.id}
                    label={`${customer.name} - ${customer.area}`}
                    value={customer.id}
                  />
                ))}
              </Picker>
            </View>
          </View>
        ) : (
          <Text style={styles.noDataText}>لا يوجد مشتركين</Text>
        )}

        {selectedCustomer && (
          <View style={styles.customerInfo}>
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
          <Text style={styles.previewValue}>{invoicePreview?.month}</Text>

          <View style={styles.divider} />

          <Text style={styles.previewTitle}>رسم الاستهلاك:</Text>
          <Text style={styles.previewValue}>
            {invoicePreview?.consumption.toLocaleString()} kWh × ${CONSUMPTION_RATE.toFixed(2)} ={' '}
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

        <ScrollView style={styles.scrollView}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
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
  pickerContainer: {
    marginBottom: 16,
  },
  pickerWrapper: {
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666',
  },
  picker: {
    color: '#fff',
    height: 50,
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
  submitButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
});