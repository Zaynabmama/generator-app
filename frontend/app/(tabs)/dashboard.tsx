import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Card, Title, Paragraph, Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dashboardAPI } from '@/src/services/api';
import { useAuthStore } from '@/src/store/authStore';

export default function DashboardScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await dashboardAPI.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View>
            <Title style={styles.headerTitle}>لوحة التحكم</Title>
            <Text style={styles.headerSubtitle}>أبوعباس للإنارة</Text>
          </View>
          <View style={styles.headerActions}>
            <Button
              mode="outlined"
              onPress={() => router.push('/settings')}
              icon="cog"
              compact
              textColor="#4CAF50"
            >
              الإعدادات
            </Button>
            <Button
              mode="outlined"
              onPress={handleLogout}
              icon="logout"
              compact
              textColor="#FF5252"
            >
              خروج
            </Button>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text>جاري التحميل...</Text>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <TouchableOpacity
                style={styles.statCardWrapper}
                onPress={() => router.push('/(tabs)/customers')}
                activeOpacity={0.7}
                testID="stat-customers-card"
              >
                <Card style={[styles.statCard, { backgroundColor: '#1E88E5' }]}>
                  <Card.Content>
                    <MaterialCommunityIcons name="account-group" size={32} color="#fff" />
                    <Title style={styles.statNumber}>{stats?.total_customers || 0}</Title>
                    <Paragraph style={styles.statLabel}>إجمالي المشتركين</Paragraph>
                  </Card.Content>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCardWrapper}
                onPress={() => router.push('/(tabs)/generators')}
                activeOpacity={0.7}
                testID="stat-generators-card"
              >
                <Card style={[styles.statCard, { backgroundColor: '#43A047' }]}>
                  <Card.Content>
                    <MaterialCommunityIcons name="engine" size={32} color="#fff" />
                    <Title style={styles.statNumber}>{stats?.total_generators || 0}</Title>
                    <Paragraph style={styles.statLabel}>عدد المولدات</Paragraph>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            </View>

            <View style={styles.statsGrid}>
              <TouchableOpacity
                style={styles.statCardWrapper}
                onPress={() => router.push({ pathname: '/(tabs)/invoices', params: { filter: 'unpaid' } })}
                activeOpacity={0.7}
                testID="stat-unpaid-card"
              >
                <Card style={[styles.statCard, { backgroundColor: '#FB8C00' }]}>
                  <Card.Content>
                    <MaterialCommunityIcons name="alert-circle" size={32} color="#fff" />
                    <Title style={styles.statNumber}>{stats?.unpaid_invoices || 0}</Title>
                    <Paragraph style={styles.statLabel}>فواتير غير مدفوعة</Paragraph>
                  </Card.Content>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCardWrapper}
                onPress={() => router.push({ pathname: '/(tabs)/invoices', params: { filter: 'overdue' } })}
                activeOpacity={0.7}
                testID="stat-overdue-card"
              >
                <Card style={[styles.statCard, { backgroundColor: '#E53935' }]}>
                  <Card.Content>
                    <MaterialCommunityIcons name="clock-alert" size={32} color="#fff" />
                    <Title style={styles.statNumber}>{stats?.overdue_count || 0}</Title>
                    <Paragraph style={styles.statLabel}>فواتير متأخرة</Paragraph>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            </View>

            {/* Monthly Consumption & Expenses */}
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>ملخص الشهر الحالي</Title>
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>إجمالي الكيلوواط:</Text>
                  <Text style={[styles.financeValue, { color: '#FFC107' }]}>
                    {stats?.total_monthly_kwh?.toFixed(0) || 0} kWh
                  </Text>
                </View>
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>مصروف المازوت:</Text>
                  <Text style={[styles.financeValue, { color: '#FF9800' }]}>
                    ${stats?.monthly_fuel_expense?.toFixed(2) || '0.00'}
                  </Text>
                </View>
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>مصروف الزيت:</Text>
                  <Text style={[styles.financeValue, { color: '#795548' }]}>
                    ${stats?.monthly_oil_expense?.toFixed(2) || '0.00'}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Financial Overview */}
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>الملخص المالي</Title>
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>إيرادات الشهر الحالي:</Text>
                  <Text style={[styles.financeValue, { color: '#4CAF50' }]}>
                    ${stats?.month_revenue?.toFixed(2) || '0.00'}
                  </Text>
                </View>
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>إجمالي المصاريف:</Text>
                  <Text style={[styles.financeValue, { color: '#F44336' }]}>
                    ${stats?.monthly_total_expenses?.toFixed(2) || '0.00'}
                  </Text>
                </View>

                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>صافي الربح:</Text>
                  <Text
                    style={[
                      styles.financeValue,
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
                
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>إجمالي الديون:</Text>
                  <Text style={[styles.financeValue, { color: '#F44336' }]}>
                    ${stats?.total_debt?.toFixed(2) || '0.00'}
                  </Text>
                </View>
                
                <Text style={styles.monthText}>
                  الشهر: {stats?.current_month}
                </Text>
              </Card.Content>
            </Card>

            {/* Quick Actions */}
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>إجراءات سريعة</Title>
                
                <Button
                  mode="contained"
                  icon="account-plus"
                  onPress={() => router.push('/customers/add')}
                  style={styles.actionButton}
                >
                  إضافة مشترك جديد
                </Button>
                
                <Button
                  mode="contained"
                  icon="receipt-text"
                  onPress={() => router.push('/invoices/create')}
                  style={styles.actionButton}
                >
                  إنشاء فاتورة جديدة
                </Button>

                <Button
                  mode="contained"
                  icon="table-edit"
                  onPress={() => router.push('/invoices/bulk-readings')}
                  style={styles.actionButton}
                >
                  إدخال قراءات جماعي
                </Button>

                <Button
                  mode="contained"
                  icon="clipboard-clock-outline"
                  onPress={() => router.push('/invoices/pending-readings')}
                  style={styles.actionButton}
                >
                  القراءات المعلقة
                </Button>

                <Button
                  mode="contained"
                  icon="whatsapp"
                  onPress={() => router.push('/invoices/bulk-send')}
                  style={styles.actionButton}
                >
                  إرسال جماعي عبر WhatsApp
                </Button>

                <Button
                  mode="contained"
                  icon="chart-line"
                  onPress={() => router.push('/(tabs)/reports')}
                  style={styles.actionButton}
                >
                  عرض التقارير
                </Button>
              </Card.Content>
            </Card>
          </View>
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
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  statCardWrapper: {
    flex: 1,
  },
  statCard: {
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
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
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  financeLabel: {
    fontSize: 16,
    color: '#ccc',
  },
  financeValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  monthText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  actionButton: {
    marginBottom: 12,
  },
});