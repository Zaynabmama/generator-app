import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, Chip, Searchbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { customersAPI, readingsAPI } from '@/src/services/api';
import { showAlert } from '@/src/utils/alert';
import { sanitizeDecimal } from '@/src/utils/numeric-input';

const AREAS = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

// Keep concurrent requests bounded so a large batch doesn't hammer the
// backend (or hit the browser's per-host connection limit) all at once.
async function saveInBatches<T>(items: T[], batchSize: number, save: (item: T) => Promise<void>) {
  const results: { item: T; ok: boolean }[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(save));
    settled.forEach((r, j) => results.push({ item: batch[j], ok: r.status === 'fulfilled' }));
  }
  return results;
}

export default function BulkReadingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [latestByCustomer, setLatestByCustomer] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [customersRes, readingsRes] = await Promise.all([
        customersAPI.getAll(),
        readingsAPI.getAll(),
      ]);

      setCustomers(customersRes.data.filter((c: any) => !c.is_suspended));

      // Backend returns readings sorted newest-first, so the first one seen
      // per customer is their latest.
      const latest: Record<string, number> = {};
      for (const reading of readingsRes.data) {
        if (!(reading.customer_id in latest)) {
          latest[reading.customer_id] = reading.current_reading;
        }
      }
      setLatestByCustomer(latest);
    } catch (error) {
      console.error('Error fetching bulk readings data:', error);
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

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesArea = !selectedArea || c.area === selectedArea;
      const matchesSearch =
        !query ||
        c.name?.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.meter_number?.toLowerCase().includes(query);
      return matchesArea && matchesSearch;
    });
  }, [customers, searchQuery, selectedArea]);

  const filledCount = useMemo(
    () => Object.values(inputs).filter((v) => v.trim() !== '').length,
    [inputs]
  );

  const setCurrentReading = (customerId: string, text: string) => {
    setInputs((prev) => ({ ...prev, [customerId]: sanitizeDecimal(text) }));
  };

  // A customer with no reading history yet has no "previous reading" on
  // record — but their meter number is the counter's starting value from
  // when they were signed up, so use that as the baseline instead of 0.
  const getPreviousReading = (customer: any) => {
    if (customer.id in latestByCustomer) return latestByCustomer[customer.id];
    return parseFloat(customer.meter_number) || 0;
  };

  const handleSaveAll = async () => {
    const filledRows = filteredCustomers
      .map((c) => ({ customer: c, text: inputs[c.id]?.trim() }))
      .filter((r) => r.text);

    if (filledRows.length === 0) {
      showAlert('تنبيه', 'لم تُدخل أي قراءة بعد');
      return;
    }

    const validRows: typeof filledRows = [];
    const invalidRows: typeof filledRows = [];
    filledRows.forEach((row) => {
      const current = parseFloat(row.text!);
      const previous = getPreviousReading(row.customer);
      (isNaN(current) || current < previous ? invalidRows : validRows).push(row);
    });

    if (validRows.length === 0) {
      showAlert(
        'خطأ',
        `كل القراءات المُدخلة غير صالحة (القراءة الحالية أقل من السابقة): ${invalidRows
          .map((r) => r.customer.name)
          .join('، ')}`
      );
      return;
    }

    setSaving(true);
    try {
      const results = await saveInBatches(validRows, 10, async ({ customer, text }) => {
        await readingsAPI.create({
          customer_id: customer.id,
          previous_reading: getPreviousReading(customer),
          current_reading: parseFloat(text!),
          reading_date: new Date().toISOString(),
          notes: '',
        });
      });

      const failed = results.filter((r) => !r.ok);
      const savedCount = results.length - failed.length;

      const messages = [`تم حفظ ${savedCount} قراءة بنجاح`];
      if (invalidRows.length > 0) {
        messages.push(
          `تم تخطي ${invalidRows.length} (القراءة أقل من السابقة): ${invalidRows
            .map((r) => r.customer.name)
            .join('، ')}`
        );
      }
      if (failed.length > 0) {
        messages.push(
          `فشل حفظ ${failed.length}: ${failed.map((r) => r.item.customer.name).join('، ')}`
        );
      }
      showAlert(
        invalidRows.length > 0 || failed.length > 0 ? 'تم الحفظ جزئياً' : 'نجاح',
        messages.join('\n')
      );

      // Clear the inputs that were successfully saved and refresh "previous" values
      const savedIds = new Set(
        results.filter((r) => r.ok).map((r) => r.item.customer.id)
      );
      setInputs((prev) => {
        const next = { ...prev };
        savedIds.forEach((id) => delete next[id]);
        return next;
      });
      await fetchData();
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.headerTitle}>إدخال قراءات جماعي</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="البحث بالاسم أو رقم الهاتف أو العداد"
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
        {AREAS.map((area) => (
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {filteredCustomers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => {
              const previous = getPreviousReading(customer);
              const currentText = inputs[customer.id] || '';
              const current = parseFloat(currentText);
              const hasValidConsumption = currentText.trim() !== '' && !isNaN(current);
              const consumption = hasValidConsumption ? current - previous : null;

              return (
                <View key={customer.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.customerName}>{customer.name}</Text>
                    <Text style={styles.customerDetail}>
                      {customer.area} · عداد {customer.meter_number}
                    </Text>
                    <Text style={styles.previousReading}>السابقة: {previous}</Text>
                  </View>
                  <View style={styles.rowInput}>
                    <TextInput
                      value={currentText}
                      onChangeText={(text) => setCurrentReading(customer.id, text)}
                      mode="outlined"
                      keyboardType="numeric"
                      dense
                      placeholder="القراءة الحالية"
                      style={styles.input}
                    />
                    {consumption !== null && (
                      <Text
                        style={[
                          styles.consumptionText,
                          consumption < 0 && styles.consumptionInvalid,
                        ]}
                      >
                        {consumption.toLocaleString()} kWh
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleSaveAll}
          loading={saving}
          disabled={saving || filledCount === 0}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
        >
          {filledCount > 0 ? `حفظ القراءات (${filledCount})` : 'حفظ القراءات'}
        </Button>
      </View>
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
  searchContainer: {
    padding: 16,
    paddingBottom: 0,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  customerDetail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  previousReading: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
  rowInput: {
    width: 140,
    alignItems: 'flex-end',
  },
  input: {
    width: '100%',
    backgroundColor: '#2A2A2A',
  },
  consumptionText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
  },
  consumptionInvalid: {
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
  footer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonContent: {
    paddingVertical: 6,
  },
});
