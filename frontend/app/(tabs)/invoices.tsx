import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Text,
  FAB,
  Chip,
  Searchbar,
  IconButton,
  Portal,
  Dialog,
  Button,
  TextInput as PaperInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { invoicesAPI, customersAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [paymentDialogVisible, setPaymentDialogVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const fetchData = async () => {
    try {
      const params: any = {};
      if (selectedStatus) params.status = selectedStatus;

      const [invoicesRes, customersRes] = await Promise.all([
        invoicesAPI.getAll(params),
        customersAPI.getAll(),
      ]);

      let filteredInvoices = invoicesRes.data;

      // Filter by customer name if searching
      if (searchQuery) {
        const matchingCustomers = customersRes.data.filter((c: any) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const customerIds = matchingCustomers.map((c: any) => c.id);
        filteredInvoices = filteredInvoices.filter((inv: any) =>
          customerIds.includes(inv.customer_id)
        );
      }

      setInvoices(filteredInvoices);
      setCustomers(customersRes.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchQuery, selectedStatus]);

  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    return customer?.name || 'غير محدد';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#4CAF50';
      case 'partial':
        return '#FFC107';
      case 'unpaid':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'مدفوعة';
      case 'partial':
        return 'مدفوعة جزئياً';
      case 'unpaid':
        return 'غير مدفوعة';
      default:
        return status;
    }
  };

  const handlePayment = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.remaining_amount.toString());
    setPaymentDialogVisible(true);
  };

  const submitPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      Alert.alert('خطأ', 'الرجاء إدخال مبلغ صحيح');
      return;
    }

    try {
      await invoicesAPI.addPayment(selectedInvoice.id, {
        amount: parseFloat(paymentAmount),
        payment_date: new Date().toISOString(),
        notes: '',
      });

      Alert.alert('نجاح', 'تم تسجيل الدفعة بنجاح');
      setPaymentDialogVisible(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    }
  };

  const renderInvoice = ({ item }: any) => (
    <TouchableOpacity onPress={() => router.push(`/invoices/${item.id}`)}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.invoiceInfo}>
              <Text style={styles.customerName}>
                {getCustomerName(item.customer_id)}
              </Text>
              <Text style={styles.month}>الشهر: {item.month}</Text>
            </View>
            <Chip
              style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) }]}
              textStyle={{ color: '#fff' }}
            >
              {getStatusText(item.status)}
            </Chip>
          </View>

          <View style={styles.divider} />

          <View style={styles.amountRow}>
            <Text style={styles.label}>المبلغ الإجمالي:</Text>
            <Text style={styles.amount}>
              ${item.total_amount.toFixed(2)}
            </Text>
          </View>

          {item.previous_balance > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.label}>الرصيد السابق:</Text>
              <Text style={[styles.amount, { color: '#FF9800' }]}>
                ${item.previous_balance.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.amountRow}>
            <Text style={styles.label}>المدفوع:</Text>
            <Text style={[styles.amount, { color: '#4CAF50' }]}>
              ${item.amount_paid.toFixed(2)}
            </Text>
          </View>

          {item.remaining_amount > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.label}>المتبقي:</Text>
              <Text style={[styles.amount, { color: '#F44336', fontWeight: 'bold' }]}>
                ${item.remaining_amount.toFixed(2)}
              </Text>
            </View>
          )}

          {item.is_overdue && (
            <View style={styles.overdueContainer}>
              <MaterialCommunityIcons name="alert" size={16} color="#F44336" />
              <Text style={styles.overdueText}>متأخرة عن الموعد</Text>
            </View>
          )}

          {item.status !== 'paid' && (
            <Button
              mode="contained"
              onPress={() => handlePayment(item)}
              style={styles.payButton}
              icon="cash"
            >
              تسجيل دفعة
            </Button>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="البحث باسم المشترك"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <View style={styles.filterContainer}>
        <Chip
          selected={selectedStatus === null}
          onPress={() => setSelectedStatus(null)}
          style={styles.filterChip}
        >
          الكل
        </Chip>
        <Chip
          selected={selectedStatus === 'unpaid'}
          onPress={() => setSelectedStatus('unpaid')}
          style={styles.filterChip}
        >
          غير مدفوعة
        </Chip>
        <Chip
          selected={selectedStatus === 'partial'}
          onPress={() => setSelectedStatus('partial')}
          style={styles.filterChip}
        >
          جزئية
        </Chip>
        <Chip
          selected={selectedStatus === 'paid'}
          onPress={() => setSelectedStatus('paid')}
          style={styles.filterChip}
        >
          مدفوعة
        </Chip>
      </View>

      <FlatList
        data={invoices}
        renderItem={renderInvoice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchData}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد فواتير</Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/invoices/create')}
        label="فاتورة جديدة"
      />

      <Portal>
        <Dialog
          visible={paymentDialogVisible}
          onDismiss={() => setPaymentDialogVisible(false)}
        >
          <Dialog.Title>تسجيل دفعة</Dialog.Title>
          <Dialog.Content>
            {selectedInvoice && (
              <>
                <Text style={styles.dialogText}>
                  المشترك: {getCustomerName(selectedInvoice.customer_id)}
                </Text>
                <Text style={styles.dialogText}>
                  المبلغ المتبقي: ${selectedInvoice.remaining_amount.toFixed(2)}
                </Text>
                <PaperInput
                  label="مبلغ الدفعة"
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="numeric"
                  mode="outlined"
                  style={styles.input}
                />
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentDialogVisible(false)}>إلغاء</Button>
            <Button onPress={submitPayment}>تسجيل</Button>
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
  searchContainer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  searchbar: {
    backgroundColor: '#2A2A2A',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#1E1E1E',
  },
  filterChip: {
    marginRight: 0,
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  month: {
    fontSize: 14,
    color: '#999',
  },
  statusChip: {
    height: 28,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
  },
  amount: {
    fontSize: 16,
    color: '#fff',
  },
  overdueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 4,
  },
  overdueText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '600',
  },
  payButton: {
    marginTop: 12,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
  },
  dialogText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  input: {
    marginTop: 12,
  },
});