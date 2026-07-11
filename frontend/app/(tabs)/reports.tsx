import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  Card,
  Title,
  Text,
  SegmentedButtons,
  DataTable,
  Button,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { reportsAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ReportsScreen() {
  const [reportType, setReportType] = useState('debts');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [debtReport, setDebtReport] = useState<any>(null);
  const [financialReport, setFinancialReport] = useState<any>(null);
  const [consumptionReport, setConsumptionReport] = useState<any>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [debts, financial, consumption] = await Promise.all([
        reportsAPI.getDebts(),
        reportsAPI.getFinancial(),
        reportsAPI.getConsumption(),
      ]);
      setDebtReport(debts.data);
      setFinancialReport(financial.data);
      setConsumptionReport(consumption.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const renderDebtReport = () => {
    if (!debtReport) return null;

    return (
      <View>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.summaryRow}>
              <MaterialCommunityIcons name="cash-remove" size={32} color="#F44336" />
              <View style={styles.summaryText}>
                <Title style={styles.summaryTitle}>إجمالي الديون</Title>
                <Text style={styles.summaryAmount}>
                  {debtReport.total_debt?.toLocaleString() || 0} دينار
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {debtReport.debt_by_area && Object.keys(debtReport.debt_by_area).length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>الديون حسب المنطقة</Title>
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>المنطقة</DataTable.Title>
                  <DataTable.Title numeric>المبلغ</DataTable.Title>
                </DataTable.Header>
                {Object.entries(debtReport.debt_by_area).map(([area, amount]: any) => (
                  <DataTable.Row key={area}>
                    <DataTable.Cell>{area}</DataTable.Cell>
                    <DataTable.Cell numeric>
                      {amount.toLocaleString()} د
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable>
            </Card.Content>
          </Card>
        )}

        {debtReport.debtor_list && debtReport.debtor_list.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>المتأخرون عن الدفع</Title>
              {debtReport.debtor_list.slice(0, 10).map((debtor: any, index: number) => (
                <View key={index} style={styles.debtorRow}>
                  <View style={styles.debtorInfo}>
                    <Text style={styles.debtorName}>{debtor.customer_name}</Text>
                    <Text style={styles.debtorPhone}>{debtor.customer_phone}</Text>
                    <Text style={styles.debtorArea}>{debtor.area}</Text>
                  </View>
                  <View style={styles.debtorAmount}>
                    <Text style={styles.debtAmount}>
                      {debtor.debt_amount.toLocaleString()} د
                    </Text>
                    {debtor.is_overdue && (
                      <Text style={styles.overdueTag}>متأخر</Text>
                    )}
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}
      </View>
    );
  };

  const renderFinancialReport = () => {
    if (!financialReport) return null;

    return (
      <View>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.summaryRow}>
              <MaterialCommunityIcons name="chart-line" size={32} color="#4CAF50" />
              <View style={styles.summaryText}>
                <Title style={styles.summaryTitle}>صافي الربح</Title>
                <Text
                  style={[
                    styles.summaryAmount,
                    {
                      color:
                        financialReport.net_profit >= 0 ? '#4CAF50' : '#F44336',
                    },
                  ]}
                >
                  {financialReport.net_profit?.toLocaleString() || 0} دينار
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>الملخص المالي</Title>
            
            <View style={styles.financeRow}>
              <View style={styles.financeItem}>
                <MaterialCommunityIcons name="cash-plus" size={24} color="#4CAF50" />
                <Text style={styles.financeLabel}>الإيرادات</Text>
                <Text style={[styles.financeAmount, { color: '#4CAF50' }]}>
                  {financialReport.total_revenue?.toLocaleString() || 0} د
                </Text>
              </View>

              <View style={styles.financeItem}>
                <MaterialCommunityIcons name="cash-minus" size={24} color="#F44336" />
                <Text style={styles.financeLabel}>المصروفات</Text>
                <Text style={[styles.financeAmount, { color: '#F44336' }]}>
                  {financialReport.total_expenses?.toLocaleString() || 0} د
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {financialReport.expenses_by_type &&
          Object.keys(financialReport.expenses_by_type).length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>المصروفات حسب النوع</Title>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title>النوع</DataTable.Title>
                    <DataTable.Title numeric>المبلغ</DataTable.Title>
                  </DataTable.Header>
                  {Object.entries(financialReport.expenses_by_type).map(
                    ([type, amount]: any) => (
                      <DataTable.Row key={type}>
                        <DataTable.Cell>
                          {type === 'fuel'
                            ? 'مازوت'
                            : type === 'maintenance'
                            ? 'صيانة'
                            : 'أخرى'}
                        </DataTable.Cell>
                        <DataTable.Cell numeric>
                          {amount.toLocaleString()} د
                        </DataTable.Cell>
                      </DataTable.Row>
                    )
                  )}
                </DataTable>
              </Card.Content>
            </Card>
          )}
      </View>
    );
  };

  const renderConsumptionReport = () => {
    if (!consumptionReport) return null;

    return (
      <View>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.summaryRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={32} color="#FFC107" />
              <View style={styles.summaryText}>
                <Title style={styles.summaryTitle}>إجمالي الاستهلاك</Title>
                <Text style={styles.summaryAmount}>
                  {consumptionReport.total_consumption?.toLocaleString() || 0} kWh
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {consumptionReport.consumption_by_area &&
          Object.keys(consumptionReport.consumption_by_area).length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>الاستهلاك حسب المنطقة</Title>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title>المنطقة</DataTable.Title>
                    <DataTable.Title numeric>الاستهلاك (kWh)</DataTable.Title>
                  </DataTable.Header>
                  {Object.entries(consumptionReport.consumption_by_area).map(
                    ([area, consumption]: any) => (
                      <DataTable.Row key={area}>
                        <DataTable.Cell>{area}</DataTable.Cell>
                        <DataTable.Cell numeric>
                          {consumption.toLocaleString()}
                        </DataTable.Cell>
                      </DataTable.Row>
                    )
                  )}
                </DataTable>
              </Card.Content>
            </Card>
          )}

        {consumptionReport.consumption_by_generator &&
          Object.keys(consumptionReport.consumption_by_generator).length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>الاستهلاك حسب المولد</Title>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title>المولد</DataTable.Title>
                    <DataTable.Title numeric>الاستهلاك (kWh)</DataTable.Title>
                  </DataTable.Header>
                  {Object.entries(consumptionReport.consumption_by_generator).map(
                    ([genId, consumption]: any) => (
                      <DataTable.Row key={genId}>
                        <DataTable.Cell>{genId}</DataTable.Cell>
                        <DataTable.Cell numeric>
                          {consumption.toLocaleString()}
                        </DataTable.Cell>
                      </DataTable.Row>
                    )
                  )}
                </DataTable>
              </Card.Content>
            </Card>
          )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>التقارير</Title>
      </View>

      <View style={styles.segmentContainer}>
        <SegmentedButtons
          value={reportType}
          onValueChange={setReportType}
          buttons={[
            { value: 'debts', label: 'الديون' },
            { value: 'financial', label: 'المالية' },
            { value: 'consumption', label: 'الاستهلاك' },
          ]}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text>جاري التحميل...</Text>
          </View>
        ) : (
          <>
            {reportType === 'debts' && renderDebtReport()}
            {reportType === 'financial' && renderFinancialReport()}
            {reportType === 'consumption' && renderConsumptionReport()}
          </>
        )}
      </ScrollView>
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
  },
  segmentContainer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  cardTitle: {
    fontSize: 18,
    marginBottom: 16,
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  financeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  financeItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  financeLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  financeAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  debtorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  debtorInfo: {
    flex: 1,
  },
  debtorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  debtorPhone: {
    fontSize: 14,
    color: '#999',
    marginBottom: 2,
  },
  debtorArea: {
    fontSize: 12,
    color: '#666',
  },
  debtorAmount: {
    alignItems: 'flex-end',
  },
  debtAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 4,
  },
  overdueTag: {
    fontSize: 10,
    color: '#fff',
    backgroundColor: '#F44336',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
