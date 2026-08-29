import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { readingsAPI } from '@/src/services/api';
import { showAlert } from '@/src/utils/alert';

export default function PendingReadingsScreen() {
  const router = useRouter();
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const response = await readingsAPI.getPending();
      setReadings(response.data);
    } catch (error) {
      console.error('Error fetching pending readings:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const renderReading = ({ item }: any) => {
    const consumption = item.current_reading - item.previous_reading;
    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text style={styles.customerName}>{item.customer_name}</Text>
            <Text style={styles.area}>{item.customer_area}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>القراءة السابقة:</Text>
            <Text style={styles.value}>{item.previous_reading}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>القراءة الحالية:</Text>
            <Text style={styles.value}>{item.current_reading}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>الاستهلاك:</Text>
            <Text style={[styles.value, styles.consumption]}>
              {consumption.toLocaleString()} kWh
            </Text>
          </View>
          {item.reading_date && (
            <View style={styles.row}>
              <Text style={styles.label}>تاريخ القراءة:</Text>
              <Text style={styles.value}>
                {new Date(item.reading_date).toLocaleDateString('en-GB')}
              </Text>
            </View>
          )}

          <Button
            mode="contained"
            onPress={() => router.push(`/invoices/create?readingId=${item.id}`)}
            style={styles.createButton}
            icon="receipt-text"
          >
            إنشاء فاتورة
          </Button>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Button
          mode="text"
          onPress={() => router.back()}
          icon="arrow-right"
          textColor="#4CAF50"
        >
          رجوع
        </Button>
        <Text style={styles.headerTitle}>القراءات المعلقة</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={readings}
        renderItem={renderReading}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchData}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد قراءات بانتظار إصدار فاتورة</Text>
          </View>
        }
      />
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
    alignItems: 'center',
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  area: {
    fontSize: 13,
    color: '#999',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
  },
  value: {
    fontSize: 15,
    color: '#fff',
  },
  consumption: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  createButton: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
