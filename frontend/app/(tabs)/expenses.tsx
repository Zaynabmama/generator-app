import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Card,
  Text,
  FAB,
  IconButton,
  Portal,
  Dialog,
  Button,
  TextInput,
  Chip,
  SegmentedButtons,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { expensesAPI, dashboardAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    expense_type: 'fuel',
    amount: '',
    description: '',
    notes: '',
  });

  const expenseTypes: any = {
    fuel: { label: 'مازوت', icon: 'gas-station', color: '#FF9800' },
    oil: { label: 'زيت', icon: 'oil', color: '#FFC107' },
    maintenance: { label: 'صيانة', icon: 'wrench', color: '#2196F3' },
    other: { label: 'أخرى', icon: 'currency-usd', color: '#9C27B0' },
  };

  const fetchData = async () => {
    try {
      const params: any = {};
      if (selectedType) params.expense_type = selectedType;

      const [expensesRes, statsRes] = await Promise.all([
        expensesAPI.getAll(params),
        dashboardAPI.getStats(),
      ]);
      setExpenses(expensesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedType]);

  const handleAdd = () => {
    setFormData({
      expense_type: 'fuel',
      amount: '',
      description: '',
      notes: '',
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      Alert.alert('خطأ', 'الرجاء إدخال مبلغ صحيح');
      return;
    }

    if (!formData.description) {
      Alert.alert('خطأ', 'الرجاء إدخال وصف للمصروف');
      return;
    }

    try {
      await expensesAPI.create({
        expense_type: formData.expense_type,
        amount: parseFloat(formData.amount),
        description: formData.description,
        notes: formData.notes,
        expense_date: new Date().toISOString(),
      });

      setDialogVisible(false);
      await fetchData();
    } catch (error: any) {
      Alert.alert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = (expense: any) => {
    setExpenseToDelete(expense);
    setDeleteDialogVisible(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await expensesAPI.delete(expenseToDelete.id);
      setDeleteDialogVisible(false);
      setExpenseToDelete(null);
      await fetchData();
    } catch (error: any) {
      Alert.alert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحذف');
    }
  };

  const renderExpense = ({ item }: any) => {
    const typeInfo = expenseTypes[item.expense_type] || expenseTypes.other;
    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.expenseInfo}>
              <View style={styles.typeRow}>
                <MaterialCommunityIcons
                  name={typeInfo.icon}
                  size={24}
                  color={typeInfo.color}
                />
                <Text style={[styles.typeLabel, { color: typeInfo.color }]}>
                  {typeInfo.label}
                </Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.date}>
                {new Date(item.expense_date).toLocaleDateString('en-GB')}
              </Text>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
              <IconButton
                icon="delete"
                iconColor="#F44336"
                size={20}
                onPress={() => handleDelete(item)}
              />
            </View>
          </View>
          {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المصاريف</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={undefined}
        stickyHeaderIndices={[0]}
      >
        {/* Monthly Summary */}
        <View>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>ملخص الشهر الحالي</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: '#FFC107' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={28} color="#000" />
                  <Text style={styles.statValue}>
                    {stats?.total_monthly_kwh?.toFixed(0) || 0}
                  </Text>
                  <Text style={styles.statLabel}>كيلوواط</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: '#FF9800' }]}>
                  <MaterialCommunityIcons name="gas-station" size={28} color="#fff" />
                  <Text style={[styles.statValue, { color: '#fff' }]}>
                    ${stats?.monthly_fuel_expense?.toFixed(2) || '0.00'}
                  </Text>
                  <Text style={[styles.statLabel, { color: '#fff' }]}>مازوت</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: '#795548' }]}>
                  <MaterialCommunityIcons name="oil" size={28} color="#fff" />
                  <Text style={[styles.statValue, { color: '#fff' }]}>
                    ${stats?.monthly_oil_expense?.toFixed(2) || '0.00'}
                  </Text>
                  <Text style={[styles.statLabel, { color: '#fff' }]}>زيت</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: '#2196F3' }]}>
                  <MaterialCommunityIcons name="wrench" size={28} color="#fff" />
                  <Text style={[styles.statValue, { color: '#fff' }]}>
                    ${stats?.monthly_maintenance_expense?.toFixed(2) || '0.00'}
                  </Text>
                  <Text style={[styles.statLabel, { color: '#fff' }]}>صيانة</Text>
                </View>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>إجمالي المصاريف:</Text>
                <Text style={styles.totalAmount}>
                  ${stats?.monthly_total_expenses?.toFixed(2) || '0.00'}
                </Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>الإيرادات:</Text>
                <Text style={[styles.totalAmount, { color: '#4CAF50' }]}>
                  ${stats?.month_revenue?.toFixed(2) || '0.00'}
                </Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>صافي الربح:</Text>
                <Text
                  style={[
                    styles.totalAmount,
                    {
                      color:
                        (stats?.monthly_net_profit || 0) >= 0
                          ? '#4CAF50'
                          : '#F44336',
                    },
                  ]}
                >
                  ${stats?.monthly_net_profit?.toFixed(2) || '0.00'}
                </Text>
              </View>
            </Card.Content>
          </Card>

          {/* Filter Chips */}
          <View style={styles.filterContainer}>
            <Chip
              selected={selectedType === null}
              onPress={() => setSelectedType(null)}
              style={styles.filterChip}
            >
              الكل
            </Chip>
            {Object.entries(expenseTypes).map(([type, info]: any) => (
              <Chip
                key={type}
                selected={selectedType === type}
                onPress={() => setSelectedType(type)}
                style={styles.filterChip}
                icon={info.icon}
              >
                {info.label}
              </Chip>
            ))}
          </View>
        </View>

        {/* Expenses List */}
        <View style={styles.listContainer}>
          {loading ? (
            <Text style={styles.emptyText}>جاري التحميل...</Text>
          ) : expenses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="cash-remove"
                size={64}
                color="#666"
              />
              <Text style={styles.emptyText}>لا توجد مصاريف مسجلة</Text>
              <Text style={styles.emptySubtext}>
                اضغط زر + لإضافة مصروف جديد
              </Text>
            </View>
          ) : (
            expenses.map((item) => (
              <View key={item.id}>{renderExpense({ item })}</View>
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={handleAdd}
        label="إضافة مصروف"
      />

      {/* Add Expense Dialog */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>إضافة مصروف جديد</Dialog.Title>
          <Dialog.Content>
            <ScrollView>
              <Text style={styles.dialogLabel}>نوع المصروف:</Text>
              <View style={styles.typeGrid}>
                {Object.entries(expenseTypes).map(([type, info]: any) => (
                  <Chip
                    key={type}
                    selected={formData.expense_type === type}
                    onPress={() => setFormData({ ...formData, expense_type: type })}
                    style={styles.typeChip}
                    icon={info.icon}
                    testID={`expense-type-${type}`}
                  >
                    {info.label}
                  </Chip>
                ))}
              </View>

              <TextInput
                label="المبلغ ($) *"
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text })}
                mode="outlined"
                keyboardType="numeric"
                style={styles.dialogInput}
              />

              <TextInput
                label="الوصف *"
                value={formData.description}
                onChangeText={(text) =>
                  setFormData({ ...formData, description: text })
                }
                mode="outlined"
                style={styles.dialogInput}
                placeholder="مثال: تعبئة مازوت للمولد الكبير"
              />

              <TextInput
                label="ملاحظات (اختياري)"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.dialogInput}
              />
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>إلغاء</Button>
            <Button onPress={handleSave} mode="contained">
              حفظ
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>تأكيد الحذف</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#ccc' }}>
              هل أنت متأكد من حذف هذا المصروف؟
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>إلغاء</Button>
            <Button onPress={confirmDelete} textColor="#F44336">
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
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    margin: 16,
    backgroundColor: '#1E1E1E',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#000',
    marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  totalLabel: {
    fontSize: 14,
    color: '#ccc',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: '#121212',
    paddingBottom: 8,
  },
  filterChip: {
    marginRight: 0,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  expenseInfo: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  amountBox: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F44336',
  },
  notes: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
  },
  dialogLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    marginRight: 0,
  },
  dialogInput: {
    marginBottom: 12,
  },
});
