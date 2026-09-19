import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Text,
  FAB,
  Searchbar,
  Chip,
  IconButton,
  Menu,
  Button,
  Portal,
  Dialog,
  TextInput as PaperInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { customersAPI, generatorsAPI, invoicesAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { showAlert } from '@/src/utils/alert';
import { sanitizeDecimal } from '@/src/utils/numeric-input';

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [generators, setGenerators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  const [paymentDialogVisible, setPaymentDialogVisible] = useState(false);
  const [customerForPayment, setCustomerForPayment] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [payingLoading, setPayingLoading] = useState(false);

  const areas = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

  const fetchData = async () => {
    try {
      setLoading(true);
      const [customersRes, generatorsRes] = await Promise.all([
        customersAPI.getAll(),
        generatorsAPI.getAll(),
      ]);

      setCustomers(customersRes.data);
      setGenerators(generatorsRes.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesArea = !selectedArea || c.area === selectedArea;
      const matchesSearch =
        !query ||
        c.name?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query);
      return matchesArea && matchesSearch;
    });
  }, [customers, searchQuery, selectedArea]);

  const getGeneratorName = (generatorId: string) => {
    const generator = generators.find((g) => g.id === generatorId);
    return generator?.name || 'غير محدد';
  };

  const handleDelete = (id: string, name: string) => {
    setCustomerToDelete({ id, name });
    setDeleteDialogVisible(true);
  };

  const handleSuspend = async (id: string) => {
    try {
      setMenuVisible(null);
      const response = await customersAPI.suspend(id);
      await fetchData();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await customersAPI.delete(customerToDelete.id);
      setDeleteDialogVisible(false);
      setCustomerToDelete(null);
      await fetchData();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحذف');
    }
  };

  // Lets a customer pay against their balance at any time — not just when a
  // new meter reading/invoice has just been created for them. The payment
  // is applied to their oldest unpaid/partial invoice, same as a normal
  // invoice payment would be.
  const handleRecordPayment = (customer: any) => {
    setMenuVisible(null);
    setCustomerForPayment(customer);
    setPaymentAmount(customer.current_balance > 0 ? customer.current_balance.toString() : '');
    setPaymentDialogVisible(true);
  };

  const submitCustomerPayment = async () => {
    if (!customerForPayment) return;
    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      showAlert('خطأ', 'الرجاء إدخال مبلغ صحيح');
      return;
    }

    setPayingLoading(true);
    try {
      const response = await invoicesAPI.getAll({ customer_id: customerForPayment.id });
      // Backend returns invoices newest-first, so the last unpaid one found is the oldest.
      const unpaidInvoices = response.data.filter((inv: any) => inv.status !== 'paid');
      const oldestInvoice = unpaidInvoices[unpaidInvoices.length - 1];

      if (!oldestInvoice) {
        showAlert('تنبيه', 'لا توجد فواتير غير مدفوعة لهذا المشترك لتسجيل الدفعة عليها');
        return;
      }

      await invoicesAPI.addPayment(oldestInvoice.id, {
        amount,
        payment_date: new Date().toISOString(),
        notes: 'دفعة عامة من صفحة المشتركين',
      });

      setPaymentDialogVisible(false);
      await fetchData();

      showAlert('نجاح', 'تم تسجيل الدفعة بنجاح', [
        { text: 'حسناً', style: 'cancel' },
        {
          text: 'عرض الفاتورة وإرسالها',
          onPress: () => router.push(`/invoices/${oldestInvoice.id}`),
        },
      ]);
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء تسجيل الدفعة');
    } finally {
      setPayingLoading(false);
    }
  };

  const renderCustomer = ({ item }: any) => (
    <TouchableOpacity
      onPress={() => router.push(`/customers/${item.id}`)}
      activeOpacity={0.8}
      testID={`customer-card-${item.id}`}
    >
    <Card style={[styles.card, item.is_suspended && styles.suspendedCard]}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.customerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName}>{item.name}</Text>
              {item.is_suspended && (
                <Chip
                  icon="pause-circle"
                  style={styles.suspendedChip}
                  textStyle={{ color: '#fff', fontSize: 11 }}
                  compact
                >
                  معلق
                </Chip>
              )}
            </View>
            <Text style={styles.customerPhone}>{item.phone}</Text>
          </View>
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <IconButton
                icon="dots-vertical"
                onPress={() => setMenuVisible(item.id)}
                testID={`menu-${item.id}`}
              />
            }
          >
            <Menu.Item
              onPress={() => {
                setMenuVisible(null);
                router.push(`/customers/${item.id}`);
              }}
              title="تعديل"
              leadingIcon="pencil"
              testID={`edit-${item.id}`}
            />
            <Menu.Item
              onPress={() => handleSuspend(item.id)}
              title={item.is_suspended ? 'إعادة تفعيل' : 'تعليق العداد'}
              leadingIcon={item.is_suspended ? 'play-circle' : 'pause-circle'}
              testID={`suspend-${item.id}`}
            />
            <Menu.Item
              onPress={() => handleRecordPayment(item)}
              title="تسجيل دفعة"
              leadingIcon="cash-plus"
              testID={`payment-${item.id}`}
            />
            <Menu.Item
              onPress={() => {
                setMenuVisible(null);
                handleDelete(item.id, item.name);
              }}
              title="حذف"
              leadingIcon="delete"
              testID={`delete-${item.id}`}
            />
          </Menu>
        </View>

        <View style={styles.detailsRow}>
          <Chip icon="map-marker" style={styles.chip}>
            {item.area}
          </Chip>
        </View>

        <Text style={styles.detailText}>
          المولد: {getGeneratorName(item.generator_id)}
        </Text>
        <Text style={styles.detailText}>رقم العداد: {item.meter_number}</Text>

        {item.current_balance > 0 && (
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>الرصيد المتبقي:</Text>
            <Text style={styles.balanceAmount}>
              ${item.current_balance.toFixed(2)}
            </Text>
          </View>
        )}

        {item.is_suspended && (
          <View style={styles.suspendedNote}>
            <MaterialCommunityIcons name="information" size={14} color="#FF9800" />
            <Text style={styles.suspendedText}>
              العداد موقّف - الحساب لا يزال محفوظاً
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="البحث بالاسم أو رقم الهاتف"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <View style={styles.filterContainer}>
        <Chip
          selected={selectedArea === null}
          onPress={() => setSelectedArea(null)}
          style={styles.filterChip}
        >
          الكل
        </Chip>
        {areas.map((area) => (
          <Chip
            key={area}
            selected={selectedArea === area}
            onPress={() => setSelectedArea(area)}
            style={styles.filterChip}
          >
            {area}
          </Chip>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchData} />
        }
      >
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {customers.length === 0 ? 'لا توجد بيانات' : 'لا توجد نتائج مطابقة'}
            </Text>
          </View>
        ) : (
          filteredCustomers.map((item) => (
            <React.Fragment key={item.id}>
              {renderCustomer({ item })}
            </React.Fragment>
          ))
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/customers/add')}
        label="إضافة مشترك"
      />

      <Portal>
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>تأكيد الحذف</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#ccc' }}>
              هل أنت متأكد من حذف المشترك &quot;{customerToDelete?.name}&quot;؟
            </Text>
            <Text style={{ color: '#F44336', marginTop: 12, fontSize: 13, fontWeight: 'bold' }}>
              ⚠️ سيتم حذف جميع بيانات المشترك:
            </Text>
            <Text style={{ color: '#ccc', marginTop: 4, fontSize: 12 }}>
              • جميع الفواتير{'\n'}
              • جميع قراءات العدادات{'\n'}
              • جميع الدفعات المسجلة
            </Text>
            <Text style={{ color: '#4CAF50', marginTop: 12, fontSize: 12 }}>
              💡 نصيحة: إذا كنت تريد فقط إيقاف العداد مع الاحتفاظ بالحساب، استخدم &quot;تعليق العداد&quot; بدلاً من الحذف
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>إلغاء</Button>
            <Button
              onPress={confirmDelete}
              textColor="#F44336"
              testID="confirm-delete-btn"
            >
              حذف نهائياً
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog
          visible={paymentDialogVisible}
          onDismiss={() => setPaymentDialogVisible(false)}
        >
          <Dialog.Title>تسجيل دفعة</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#ccc' }}>
              المشترك: {customerForPayment?.name}
            </Text>
            {customerForPayment?.current_balance > 0 && (
              <Text style={{ color: '#999', marginTop: 4, fontSize: 13 }}>
                الرصيد الحالي: ${customerForPayment.current_balance.toFixed(2)}
              </Text>
            )}
            <PaperInput
              label="مبلغ الدفعة"
              value={paymentAmount}
              onChangeText={(text) => setPaymentAmount(sanitizeDecimal(text))}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginTop: 12 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentDialogVisible(false)}>إلغاء</Button>
            <Button onPress={submitCustomerPayment} loading={payingLoading} disabled={payingLoading}>
              تسجيل
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
  suspendedCard: {
    backgroundColor: '#2A1F1F',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  suspendedChip: {
    backgroundColor: '#FF9800',
    height: 24,
  },
  suspendedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 4,
  },
  suspendedText: {
    fontSize: 12,
    color: '#FF9800',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 14,
    color: '#999',
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#2A2A2A',
  },
  detailText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#999',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
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
});